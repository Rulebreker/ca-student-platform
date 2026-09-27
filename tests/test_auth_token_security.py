"""
Authentication hardening: only server-issued session tokens authenticate.
Predictable identifiers (role names, user ids, emails, usernames, the old static tokens) must never
authenticate - not as admin, not as the user they name.

Unit tests run in-process on an isolated data dict (no server, no database). The HTTP class runs only
when a local server is up and EXCELLENCECA_TEST_ADMIN_EMAIL / _PASSWORD are set.
"""
import json
import os
import sys
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server

ADMIN_TOKEN = server.issue_session_token()
STUDENT_TOKEN = server.issue_session_token()
DATA = {
    'users': {
        'admin@example.com': {'id': 'usr-admin-1', 'email': 'admin@example.com', 'username': 'adminrulebreker',
                              'role': 'admin', 'isActive': True, 'token': ADMIN_TOKEN},
        'rohan@example.com': {'id': 'usr-student-1', 'email': 'rohan@example.com', 'username': 'rohan_sharma',
                              'role': 'student', 'isActive': True, 'token': STUDENT_TOKEN},
        'prof@example.com': {'id': 'usr-teacher-1', 'email': 'prof@example.com', 'username': 'prof_rajesh',
                             'role': 'teacher', 'isActive': True, 'token': 'token_prof_sharma_teacher'},
        'old@example.com': {'id': 'usr-old', 'email': 'old@example.com', 'role': 'student', 'isActive': True,
                            'token': 'token_student_45c8b527756f41d5'},
    },
    'revoked_users': [], 'revoked_tokens': [],
}

PREDICTABLE = [
    'admin', 'Admin', 'administrator', 'adminrulebreker', '@adminrulebreker', 'usr-admin-1', 'admin@example.com',
    'adminrulebreker@rulebrekerdothunter.com', 'token_admin_excellenceca_secret', 'token_admin_anything', 'token_admin_',
    'teacher', 'prof_rajesh', 'usr-teacher-1', 'prof@example.com', 'token_prof_sharma_teacher', 'prof.sharma@excellenceca.com',
    'usr-student-1', 'rohan@example.com', 'rohan_sharma', 'token_rohan_sharma_student',
    'token_student_45c8b527756f41d5',            # a real stored legacy token: legacy format is no longer accepted
    'sess_short', 'sess_' + 'x' * 39,            # malformed session tokens
    '', None, ' ', 'null', 'undefined',
]


class TestAuthenticateToken(unittest.TestCase):
    def setUp(self):
        self.p = patch.object(server, 'load_backend_data', lambda *a, **k: DATA)
        self.p.start()

    def tearDown(self):
        self.p.stop()

    def test_predictable_identifiers_never_authenticate(self):
        for value in PREDICTABLE:
            with self.subTest(value=value):
                self.assertIsNone(server.authenticate_token(value))

    def test_issued_session_tokens_authenticate_their_own_user(self):
        self.assertEqual(server.authenticate_token(ADMIN_TOKEN)['id'], 'usr-admin-1')
        self.assertEqual(server.authenticate_token(STUDENT_TOKEN)['id'], 'usr-student-1')
        self.assertEqual(server.authenticate_token(f'  {STUDENT_TOKEN} ')['id'], 'usr-student-1')

    def test_unknown_but_well_formed_token_is_rejected(self):
        self.assertIsNone(server.authenticate_token(server.issue_session_token()))

    def test_revoked_or_inactive_users_are_rejected(self):
        with patch.dict(DATA, {'revoked_tokens': [STUDENT_TOKEN]}):
            self.assertIsNone(server.authenticate_token(STUDENT_TOKEN))
        with patch.dict(DATA, {'revoked_users': ['usr-student-1']}):
            self.assertIsNone(server.authenticate_token(STUDENT_TOKEN))
        DATA['users']['rohan@example.com']['isActive'] = False
        try:
            self.assertIsNone(server.authenticate_token(STUDENT_TOKEN))
        finally:
            DATA['users']['rohan@example.com']['isActive'] = True

    def test_each_login_adds_a_session_without_ending_other_devices(self):
        u = DATA['users']['rohan@example.com']
        saved = dict(u)
        try:
            laptop = server.start_user_session(u)
            phone = server.start_user_session(u)
            self.assertEqual(server.authenticate_token(laptop)['id'], 'usr-student-1')
            self.assertEqual(server.authenticate_token(phone)['id'], 'usr-student-1')
            self.assertEqual(server.authenticate_token(STUDENT_TOKEN)['id'], 'usr-student-1', "pre-existing session survives")
            oldest = server.user_session_tokens(u)[0]
            for _ in range(server.MAX_SESSIONS_PER_USER):
                server.start_user_session(u)
            self.assertIsNone(server.authenticate_token(oldest), "sessions beyond the limit are evicted oldest-first")
            self.assertEqual(len(server.user_session_tokens(u)), server.MAX_SESSIONS_PER_USER)
        finally:
            u.clear()
            u.update(saved)

    def test_password_reset_ends_every_session(self):
        u = DATA['users']['rohan@example.com']
        saved = dict(u)
        data_revoked = list(DATA['revoked_tokens'])
        try:
            second = server.start_user_session(u)
            server.end_all_user_sessions(u, DATA)
            self.assertIsNone(server.authenticate_token(second))
            self.assertIsNone(server.authenticate_token(STUDENT_TOKEN))
        finally:
            u.clear()
            u.update(saved)
            DATA['revoked_tokens'][:] = data_revoked
            server.REVOKED_TOKENS.difference_update({STUDENT_TOKEN})

    def test_session_lists_are_never_sent_to_clients(self):
        payload = {'user': {'id': 'u', 'sessionTokens': ['a']}, 'users': [{'sessionTokens': ['b'], 'id': 'v'}]}
        self.assertEqual(server.scrub_session_tokens(payload), {'user': {'id': 'u'}, 'users': [{'id': 'v'}]})

    def test_issued_tokens_are_unique_and_well_formed(self):
        tokens = {server.issue_session_token() for _ in range(200)}
        self.assertEqual(len(tokens), 200)
        self.assertTrue(all(server.is_session_token(t) for t in tokens))


BASE = os.environ.get('EXCELLENCECA_TEST_BASE_URL', 'http://127.0.0.1:8000')


def _http(path, token=None, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 method='POST' if body is not None else 'GET')
    req.add_header('Content-Type', 'application/json')
    if token is not None:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')


def _server_up():
    try:
        urllib.request.urlopen(BASE + '/api/health', timeout=3)
        return True
    except Exception:
        return False


@unittest.skipUnless(_server_up() and os.environ.get('EXCELLENCECA_TEST_ADMIN_EMAIL'), 'needs a local server and admin test credentials')
class TestHttpAuthentication(unittest.TestCase):
    def test_predictable_identifiers_get_no_admin_access(self):
        for value in PREDICTABLE[:-5] + ['adminrulebreker@rulebrekerdothunter.com']:
            with self.subTest(value=value):
                st, _ = _http('/api/admin/users', token=value)
                self.assertEqual(st, 403)
                st, res = _http('/api/auth/verify', token=value)
                self.assertEqual(st, 401)
        # X-Auth-Token header and ?token= query are checked by the same code path
        req =urllib.request.Request(BASE + '/api/admin/users', headers={'X-Auth-Token': 'admin'})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=20)
        self.assertEqual(ctx.exception.code, 403)
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(BASE + '/api/admin/users?token=usr-admin-1', timeout=20)
        self.assertEqual(ctx.exception.code, 403)

    def test_real_admin_login_still_works(self):
        st, res = _http('/api/auth/login', body={'identifier': os.environ['EXCELLENCECA_TEST_ADMIN_EMAIL'],
                                                'password': os.environ['EXCELLENCECA_TEST_ADMIN_PASSWORD']})
        self.assertEqual(st, 200)
        token = res['token']
        self.assertTrue(server.is_session_token(token))
        st, users = _http('/api/admin/users', token=token)
        self.assertEqual(st, 200)
        self.assertTrue(all('token' not in u and 'password' not in u for u in users['users']))
        st, res = _http('/api/auth/verify', token=token)
        self.assertEqual((st, res.get('authenticated')), (200, True))
        self.assertEqual(res['user']['token'], token, "verify returns the caller's own session only")
        self.assertNotIn('sessionTokens', res['user'])

    def test_admin_can_stay_logged_in_on_two_devices(self):
        creds = {'identifier': os.environ['EXCELLENCECA_TEST_ADMIN_EMAIL'], 'password': os.environ['EXCELLENCECA_TEST_ADMIN_PASSWORD']}
        _, first = _http('/api/auth/login', body=creds)
        _, second = _http('/api/auth/login', body=creds)
        self.assertNotEqual(first['token'], second['token'])
        for token in (first['token'], second['token']):
            st, _ = _http('/api/admin/users', token=token)
            self.assertEqual(st, 200)


if __name__ == '__main__':
    unittest.main()
