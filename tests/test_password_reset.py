"""
Self-service password reset: /api/auth/forgot-password and /api/auth/reset-password.

Runs an in-process server against a temporary data store; MongoDB is replaced by an in-memory fake
(or disconnected), and SMTP by a fake server - no email is sent and no real database is touched.
"""
import contextlib
import copy
import hashlib
import http.server
import io
import json
import os
import shutil
import smtplib
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongodb_manager
import password_reset
import server

FAKE_SMTP_KEY = 'xsmtpsib-FAKE-KEY-for-tests-0123456789'
SMTP_ENV = {
    'BREVO_SMTP_HOST': 'smtp-relay.example.test',
    'BREVO_SMTP_PORT': '587',
    'BREVO_SMTP_LOGIN': 'fake-login@smtp-brevo.test',
    'BREVO_SMTP_KEY': FAKE_SMTP_KEY,
    'BREVO_SENDER_EMAIL': 'noreply@excellenceca.in',
}
OLD_SESSION = 'sess_' + 'A' * 43


def seed():
    return {
        'users': {
            'stu@example.com': {
                'id': 'usr-student-1', 'name': 'Stu Dent', 'email': 'stu@example.com', 'username': 'stu',
                'password': server.hash_password('OldPass1!'), 'role': 'student', 'isActive': True,
                'token': OLD_SESSION, 'sessionTokens': [OLD_SESSION],
            },
            'gone@example.com': {
                'id': 'usr-student-2', 'name': 'Gone', 'email': 'gone@example.com', 'username': 'gone',
                'password': server.hash_password('OldPass1!'), 'role': 'student', 'isActive': False,
            },
        },
        'revoked_users': [], 'revoked_tokens': [], 'test_attempts': [],
    }


# ------------------------------------------------------------------ fakes

class FakeSMTP:
    sent = []
    fail_with = None

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.calls = host, port, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def ehlo(self):
        self.calls.append('ehlo')

    def starttls(self, context=None):
        self.calls.append('starttls')

    def login(self, user, key):
        self.calls.append('login')
        self.credentials = (user, key)
        if FakeSMTP.fail_with:
            raise FakeSMTP.fail_with

    def send_message(self, msg):
        FakeSMTP.sent.append({'msg': msg, 'calls': list(self.calls), 'credentials': self.credentials,
                              'host': self.host, 'port': self.port})


def _matches(doc, flt):
    for k, v in flt.items():
        cur = doc.get(k)
        if isinstance(v, dict) and '$gt' in v:
            if cur is None or not cur > v['$gt']:
                return False
        elif cur != v:
            return False
    return True


class FakeMongoCollection:
    """The subset of pymongo used by password_reset (atomic via a lock, like the server)."""

    def __init__(self):
        self.docs, self.lock, self.indexes = {}, threading.Lock(), []

    def create_index(self, field, **kw):
        self.indexes.append((field, kw))

    def insert_one(self, doc):
        with self.lock:
            assert doc['_id'] not in self.docs
            self.docs[doc['_id']] = copy.deepcopy(doc)

    def find_one(self, flt):
        with self.lock:
            return next((copy.deepcopy(d) for d in self.docs.values() if _matches(d, flt)), None)

    def update_many(self, flt, update):
        with self.lock:
            for d in self.docs.values():
                if _matches(d, flt):
                    d.update(update['$set'])

    def find_one_and_update(self, flt, update, upsert=False, return_document=False):
        with self.lock:
            doc = next((d for d in self.docs.values() if _matches(d, flt)), None)
            before = copy.deepcopy(doc)
            if doc is None:
                if not upsert:
                    return None
                doc = dict(flt)
                doc.update(update.get('$setOnInsert', {}))
                self.docs[doc['_id']] = doc
            doc.update(update.get('$set', {}))
            for k, n in update.get('$inc', {}).items():
                doc[k] = doc.get(k, 0) + n
            return copy.deepcopy(doc) if return_document else before


class FakeMongoDB(dict):
    def __missing__(self, name):
        self[name] = FakeMongoCollection()
        return self[name]


def reset_memory_store():
    for c in password_reset._memory.values():
        c.docs.clear()


# ------------------------------------------------------------------ HTTP harness

class ServerHarness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'backend_data.json')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(seed(), f)
        FakeSMTP.sent, FakeSMTP.fail_with = [], None
        reset_memory_store()
        server.REVOKED_TOKENS.discard(OLD_SESSION)
        self.patches = [
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(server, 'check_opportunistic_scheduler_tick', lambda: None),
            patch.object(server, 'sync_to_database', lambda *a, **k: True),
            patch.object(mongodb_manager, 'is_database_connected', return_value=False),
            patch.object(mongodb_manager, 'get_database', return_value=None),
            patch.object(password_reset, 'FORGOT_MIN_RESPONSE_SECONDS', 0.0),
            patch.object(password_reset.smtplib, 'SMTP', FakeSMTP),
            patch.dict(os.environ, SMTP_ENV),
        ]
        for p in self.patches:
            p.start()
        server._collection_last_synced.clear()
        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.ExcellenceCAHandler)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.out, self.err = io.StringIO(), io.StringIO()
        self._redirects = contextlib.ExitStack()
        self._redirects.enter_context(contextlib.redirect_stdout(self.out))
        self._redirects.enter_context(contextlib.redirect_stderr(self.err))

    def tearDown(self):
        self._redirects.close()
        self.httpd.shutdown()
        self.httpd.server_close()
        for p in reversed(self.patches):
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def post(self, path, body, headers=None):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode('utf-8'), method='POST',
                                     headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode('utf-8'))

    def get_raw(self, path):
        with urllib.request.urlopen(self.base + path, timeout=20) as r:
            return r.status, r.read()

    def data(self):
        with open(self.store, encoding='utf-8') as f:
            return json.load(f)

    def logs(self):
        return self.out.getvalue() + self.err.getvalue()

    def request_link(self, email='stu@example.com', ip='10.0.0.1'):
        st, res = self.post('/api/auth/forgot-password', {'email': email}, {'x-real-ip': ip})
        self.assertEqual(st, 200, res)
        self.assertTrue(FakeSMTP.sent, 'no email sent')
        msg = FakeSMTP.sent[-1]['msg']
        text = msg.get_body(preferencelist=('plain',)).get_content()
        url = next(line.strip() for line in text.splitlines() if 'reset-password?token=' in line)
        return url, url.split('token=', 1)[1]

    def reset(self, token, pw='NewPass9!', confirm=None, ip='10.0.0.2'):
        return self.post('/api/auth/reset-password',
                         {'token': token, 'newPassword': pw, 'confirmPassword': pw if confirm is None else confirm},
                         {'x-real-ip': ip})


class TestForgotPassword(ServerHarness):
    def test_existing_account_gets_single_use_link_and_only_hash_is_stored(self):
        url, raw = self.request_link()
        self.assertTrue(url.startswith('https://excellenceca.in/reset-password?token='))
        sent = FakeSMTP.sent[-1]
        self.assertEqual(sent['msg']['To'], 'stu@example.com')
        docs = list(password_reset._memory[password_reset.RESETS_COLLECTION].docs.values())
        self.assertEqual(len(docs), 1)
        doc = docs[0]
        self.assertEqual(doc['tokenHash'], hashlib.sha256(raw.encode()).hexdigest())
        self.assertEqual(doc['userId'], 'usr-student-1')
        self.assertIsNone(doc['usedAt'])
        self.assertNotIn(raw, json.dumps(doc, default=str))
        ttl = doc['expiresAt'] - doc['createdAt']
        self.assertEqual(ttl, timedelta(minutes=30))
        self.assertNotIn(raw, json.dumps(self.data()), 'raw token must not reach the data store')

    def test_unknown_and_known_accounts_get_identical_responses(self):
        st1, known = self.post('/api/auth/forgot-password', {'email': 'STU@example.com '})
        st2, unknown = self.post('/api/auth/forgot-password', {'email': 'nobody@example.com'})
        st3, inactive = self.post('/api/auth/forgot-password', {'email': 'gone@example.com'})
        self.assertEqual((st1, st2, st3), (200, 200, 200))
        self.assertEqual(known, unknown)
        self.assertEqual(known, inactive)
        self.assertEqual(known['message'], password_reset.GENERIC_FORGOT_MESSAGE)
        self.assertEqual(len(FakeSMTP.sent), 1, 'only the existing, active account gets an email')

    def test_invalid_email_is_rejected(self):
        for bad in ('', 'not-an-email', 'a@b', 'x' * 300 + '@example.com'):
            st, res = self.post('/api/auth/forgot-password', {'email': bad})
            self.assertEqual(st, 400, bad)
        self.assertEqual(FakeSMTP.sent, [])

    def test_new_request_invalidates_previous_link(self):
        _, first = self.request_link()
        _, second = self.request_link()
        st, res = self.reset(first)
        self.assertEqual((st, res.get('code')), (400, 'RESET_TOKEN_USED'))
        st, res = self.reset(second)
        self.assertEqual(st, 200, res)

    def test_rate_limit_per_email(self):
        limit = password_reset.FORGOT_LIMIT_PER_EMAIL[0]
        for i in range(limit):
            st, _ = self.post('/api/auth/forgot-password', {'email': 'nobody@example.com'}, {'x-real-ip': f'10.1.0.{i}'})
            self.assertEqual(st, 200)
        st, res = self.post('/api/auth/forgot-password', {'email': 'nobody@example.com'}, {'x-real-ip': '10.1.9.9'})
        self.assertEqual(st, 429)
        self.assertNotIn('exist', res['error'].lower())

    def test_rate_limit_per_ip(self):
        limit = password_reset.FORGOT_LIMIT_PER_IP[0]
        for i in range(limit):
            st, _ = self.post('/api/auth/forgot-password', {'email': f'n{i}@example.com'}, {'x-real-ip': '10.2.0.1'})
            self.assertEqual(st, 200)
        st, _ = self.post('/api/auth/forgot-password', {'email': 'other@example.com'}, {'x-real-ip': '10.2.0.1'})
        self.assertEqual(st, 429)

    def test_email_failure_keeps_generic_response_and_leaks_nothing(self):
        FakeSMTP.fail_with = smtplib.SMTPAuthenticationError(535, f'bad key {FAKE_SMTP_KEY}'.encode())
        st, res = self.post('/api/auth/forgot-password', {'email': 'stu@example.com'})
        self.assertEqual((st, res['message']), (200, password_reset.GENERIC_FORGOT_MESSAGE))
        body = json.dumps(res)
        for secret in (FAKE_SMTP_KEY, 'SMTP', 'Brevo'):
            self.assertNotIn(secret, body)
        self.assertNotIn(FAKE_SMTP_KEY, self.logs())
        self.assertIn('SMTPAuthenticationError', self.logs())
        self.assertNotIn('reset-password?token=', self.logs())


class TestResetPassword(ServerHarness):
    def test_successful_reset_changes_password_and_ends_all_sessions(self):
        self.assertIsNotNone(server.authenticate_token(OLD_SESSION))
        _, raw = self.request_link()
        st, res = self.reset(raw)
        self.assertEqual(st, 200, res)
        self.assertEqual(res['message'], password_reset.RESET_SUCCESS_MESSAGE)
        u = self.data()['users']['stu@example.com']
        self.assertTrue(u['password'].startswith('sha256:'), 'existing hashing scheme is reused')
        self.assertTrue(server.verify_password('NewPass9!', u['password']))
        self.assertFalse(server.verify_password('OldPass1!', u['password']))
        self.assertEqual(u['sessionTokens'], [])
        self.assertIn(OLD_SESSION, self.data()['revoked_tokens'])
        self.assertIsNone(server.authenticate_token(OLD_SESSION))
        # the new password logs in
        st, login = self.post('/api/auth/login', {'identifier': 'stu@example.com', 'password': 'NewPass9!'})
        self.assertEqual(st, 200, login)

    def test_token_is_single_use(self):
        _, raw = self.request_link()
        self.assertEqual(self.reset(raw)[0], 200)
        st, res = self.reset(raw, pw='Another8#')
        self.assertEqual((st, res['code']), (400, 'RESET_TOKEN_USED'))

    def test_expired_token(self):
        _, raw = self.request_link()
        doc = password_reset._memory[password_reset.RESETS_COLLECTION].docs[password_reset.hash_reset_token(raw)]
        doc['expiresAt'] = datetime.now(timezone.utc) - timedelta(seconds=1)
        st, res = self.reset(raw)
        self.assertEqual((st, res['code']), (400, 'RESET_TOKEN_EXPIRED'))
        self.assertTrue(server.verify_password('OldPass1!', self.data()['users']['stu@example.com']['password']))

    def test_invalid_tokens(self):
        for bad in ('', 'short', 'x' * 43, 'bad token with spaces!!!!!!!!!!!', None):
            st, res = self.reset(bad)
            self.assertEqual((st, res.get('code')), (400, 'RESET_TOKEN_INVALID'), bad)

    def test_password_mismatch_and_policy_do_not_consume_the_token(self):
        _, raw = self.request_link()
        st, res = self.reset(raw, pw='NewPass9!', confirm='NewPass9?')
        self.assertEqual((st, res['code']), (400, 'PASSWORD_MISMATCH'))
        for weak in ('short1', 'onlyletters', '12345678', 'password123'):
            st, res = self.reset(raw, pw=weak)
            self.assertEqual((st, res['code']), (400, 'PASSWORD_POLICY'), weak)
        st, res = self.reset(raw, pw='', confirm='')
        self.assertEqual((st, res['code']), (400, 'PASSWORD_REQUIRED'))
        self.assertEqual(self.reset(raw)[0], 200, 'token still valid after rejected attempts')

    def test_reset_attempts_are_rate_limited(self):
        limit = password_reset.RESET_LIMIT_PER_IP[0]
        for _ in range(limit):
            self.assertEqual(self.reset('x' * 43, ip='10.3.0.1')[0], 400)
        st, _ = self.reset('x' * 43, ip='10.3.0.1')
        self.assertEqual(st, 429)

    def test_deactivated_account_cannot_use_an_old_link(self):
        _, raw = self.request_link()
        d = self.data()
        d['users']['stu@example.com']['isActive'] = False
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(d, f)
        server._collection_last_synced.clear()
        st, res = self.reset(raw)
        self.assertEqual((st, res['code']), (400, 'RESET_TOKEN_INVALID'))

    def test_raw_token_and_reset_url_never_logged_or_returned(self):
        url, raw = self.request_link()
        st, res = self.reset(raw)
        self.assertEqual(st, 200)
        self.assertNotIn(raw, json.dumps(res))
        # visiting the link on the local server logs the request line with the token redacted
        st, page = self.get_raw('/reset-password?token=' + raw)
        self.assertEqual(st, 200)
        self.assertIn(b'view-reset-password', page)
        logs = self.logs()
        self.assertNotIn(raw, logs)
        self.assertNotIn(url, logs)
        self.assertIn('token=[redacted]', logs)
        self.assertNotIn(FAKE_SMTP_KEY, logs)

    def test_password_pages_are_served(self):
        for path in ('/forgot-password', '/reset-password'):
            st, page = self.get_raw(path)
            self.assertEqual(st, 200)
            self.assertIn(b'js/password-reset.js', page)


class TestEmail(unittest.TestCase):
    def setUp(self):
        FakeSMTP.sent, FakeSMTP.fail_with = [], None

    def test_brevo_smtp_starttls_login_and_message(self):
        out = io.StringIO()
        with patch.dict(os.environ, SMTP_ENV), patch.object(password_reset.smtplib, 'SMTP', FakeSMTP), \
                contextlib.redirect_stdout(out):
            ok = password_reset.send_password_reset_email('stu@example.com', 'Stu <b>Dent</b>',
                                                         'https://excellenceca.in/reset-password?token=abc_DEF-123')
        self.assertTrue(ok)
        sent = FakeSMTP.sent[0]
        self.assertEqual((sent['host'], sent['port']), ('smtp-relay.example.test', 587))
        self.assertEqual(sent['calls'], ['ehlo', 'starttls', 'ehlo', 'login'], 'STARTTLS before login')
        self.assertEqual(sent['credentials'], ('fake-login@smtp-brevo.test', FAKE_SMTP_KEY))
        msg = sent['msg']
        self.assertEqual(msg['From'], 'ExcellenceCA <noreply@excellenceca.in>')
        self.assertEqual(msg['Subject'], 'Reset your ExcellenceCA password')
        text = msg.get_body(preferencelist=('plain',)).get_content()
        html_part = msg.get_body(preferencelist=('html',)).get_content()
        for part in (text, html_part):
            self.assertIn('https://excellenceca.in/reset-password?token=abc_DEF-123', part)
            self.assertIn('30 minutes', part)
            self.assertIn('can only be used once', part)
            self.assertIn('ExcellenceCA Team', part)
        self.assertIn('Reset Password', html_part)
        self.assertIn('Stu &lt;b&gt;Dent&lt;/b&gt;', html_part, 'user name is HTML-escaped')
        self.assertNotIn(FAKE_SMTP_KEY, msg.as_string())
        self.assertEqual(out.getvalue(), '')

    def test_missing_configuration_reports_names_only_and_does_not_connect(self):
        env = dict(SMTP_ENV)
        env['BREVO_SMTP_KEY'] = ''
        out = io.StringIO()
        with patch.dict(os.environ, env), patch.object(password_reset.smtplib, 'SMTP', FakeSMTP), \
                contextlib.redirect_stdout(out):
            status = password_reset.smtp_config_status()
            ok = password_reset.send_email('a@example.com', 's', 't', '<p>h</p>')
        self.assertFalse(ok)
        self.assertEqual(FakeSMTP.sent, [])
        self.assertEqual(status['BREVO_SMTP_KEY'], 'missing')
        self.assertEqual(status['BREVO_SMTP_HOST'], 'configured')
        self.assertEqual(set(status.values()), {'configured', 'missing'})
        for value in SMTP_ENV.values():
            self.assertNotIn(value, out.getvalue())

    def test_smtp_failure_is_logged_without_details(self):
        FakeSMTP.fail_with = smtplib.SMTPAuthenticationError(535, f'Authentication failed: {FAKE_SMTP_KEY}'.encode())
        out = io.StringIO()
        with patch.dict(os.environ, SMTP_ENV), patch.object(password_reset.smtplib, 'SMTP', FakeSMTP), \
                contextlib.redirect_stdout(out):
            ok = password_reset.send_email('a@example.com', 's', 't', '<p>h</p>')
        self.assertFalse(ok)
        self.assertIn('535', out.getvalue())
        self.assertNotIn(FAKE_SMTP_KEY, out.getvalue())
        self.assertNotIn('fake-login', out.getvalue())


class TestTokensAndSharedStorage(unittest.TestCase):
    def test_tokens_are_long_random_and_hashed(self):
        tokens = {password_reset.generate_reset_token() for _ in range(200)}
        self.assertEqual(len(tokens), 200)
        for t in list(tokens)[:20]:
            self.assertGreaterEqual(len(t), 43)          # 32 random bytes
            self.assertTrue(password_reset.is_plausible_token(t))
            h = password_reset.hash_reset_token(t)
            self.assertEqual(len(h), 64)
            self.assertNotIn(t, h)

    def test_mongo_backend_is_atomic_and_single_use(self):
        db = FakeMongoDB()
        with patch.object(mongodb_manager, 'is_database_connected', return_value=True), \
                patch.object(mongodb_manager, 'get_database', return_value=db):
            raw = password_reset.create_password_reset('usr-9')
            doc = db['password_resets'].docs[password_reset.hash_reset_token(raw)]
            self.assertNotIn(raw, json.dumps(doc, default=str))
            self.assertIn(('purgeAt', {'expireAfterSeconds': 0}), db['password_resets'].indexes)
            self.assertEqual(password_reset.check_password_reset(raw), ('ok', 'usr-9'))
            results = []
            threads = [threading.Thread(target=lambda: results.append(password_reset.consume_password_reset(raw)))
                       for _ in range(8)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            self.assertEqual(sum(1 for s, _ in results if s == 'ok'), 1, 'exactly one concurrent consume wins')
            self.assertEqual(password_reset.consume_password_reset(raw)[0], 'used')

    def test_mongo_rate_limiter_is_shared(self):
        db = FakeMongoDB()
        with patch.object(mongodb_manager, 'is_database_connected', return_value=True), \
                patch.object(mongodb_manager, 'get_database', return_value=db):
            allowed = [password_reset.hit_rate_limit('t', 'k', (3, 900)) for _ in range(5)]
        self.assertEqual(allowed, [True, True, True, False, False])
        self.assertEqual(len(db['auth_rate_limits'].docs), 1)
        scope, key_hash, _bucket = next(iter(db['auth_rate_limits'].docs)).split(':')
        self.assertEqual((scope, len(key_hash)), ('t', 40), 'keys (emails, IPs) are stored hashed')

    def test_serverless_without_database_fails_closed(self):
        with patch.object(password_reset, 'IS_SERVERLESS', True), \
                patch.object(mongodb_manager, 'is_database_connected', return_value=False):
            self.assertIsNone(password_reset.create_password_reset('usr-1'))
            self.assertFalse(password_reset.hit_rate_limit('t', 'k', (3, 900)))
            self.assertEqual(password_reset.consume_password_reset('x' * 43), ('invalid', None))

    def test_log_redaction(self):
        self.assertEqual(server.redact_url_tokens('GET /reset-password?token=abc-DEF_1&x=1 HTTP/1.1'),
                         'GET /reset-password?token=[redacted]&x=1 HTTP/1.1')


if __name__ == '__main__':
    unittest.main()
