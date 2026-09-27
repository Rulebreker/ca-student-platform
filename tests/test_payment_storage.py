"""
Payment proofs, payment record deletion (single + bulk) and UPI channel QR persistence.

Runs an in-process server against a temporary data store and a temporary image directory. The
storage tests use an in-memory fake of the MongoDB `stored_images` collection to prove that an image
saved by one instance is served by another (as on Vercel, where each instance has its own /tmp).
No real database is touched.
"""
import base64
import copy
import http.server
import io
import json
import os
import shutil
import struct
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zlib
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import image_store
import mongodb_manager
import server

ADMIN_TOKEN = 'sess_' + 'A' * 43
STUDENT_TOKEN = 'sess_' + 'S' * 43
OTHER_TOKEN = 'sess_' + 'O' * 43


def png_bytes(color=(0, 0, 0)):
    """A real 2x2 PNG."""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(color) * 2 for _ in range(2))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def data_uri(color=(0, 0, 0)):
    return 'data:image/png;base64,' + base64.b64encode(png_bytes(color)).decode()


def user(uid, email, role, token):
    return {'id': uid, 'name': uid.title(), 'email': email, 'username': uid, 'role': role, 'isActive': True,
            'password': 'sha256:x:y', 'token': token, 'sessionTokens': [token]}


def seed():
    return {
        'users': {
            'admin@example.com': user('usr-admin', 'admin@example.com', 'admin', ADMIN_TOKEN),
            'stu@example.com': user('usr-stu', 'stu@example.com', 'student', STUDENT_TOKEN),
            'other@example.com': user('usr-other', 'other@example.com', 'student', OTHER_TOKEN),
        },
        'revoked_users': [], 'revoked_tokens': [], 'test_attempts': [], 'payment_sessions': [],
        'payment_channels': [],
    }


class FakeImages:
    """In-memory stand-in for the stored_images collection (shared by all 'instances')."""

    def __init__(self):
        self.docs = {}

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt['_id']] = copy.deepcopy(doc)

    def find_one(self, flt):
        d = self.docs.get(flt['_id'])
        return copy.deepcopy(d) if d else None

    def find(self, flt, projection=None):
        return [{'_id': i} for i in flt['_id']['$in'] if i in self.docs]

    def delete_one(self, flt):
        self.docs.pop(flt['_id'], None)


class TestSharedImageStorage(unittest.TestCase):
    """An image saved on one serverless instance is readable on another (the original bug)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.images = FakeImages()
        db = {'stored_images': self.images}
        self.patches = [
            patch.object(mongodb_manager, 'is_database_connected', return_value=True),
            patch.object(mongodb_manager, 'get_database', return_value=db),
            patch.object(image_store, 'IS_SERVERLESS', True),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_image_saved_on_one_instance_is_served_by_another(self):
        with patch.object(image_store, 'CACHE_DIR', os.path.join(self.tmp, 'instance-a')):
            image_store.save_image('qr_abc123.png', png_bytes(), 'qr')
        self.assertIn('qr_abc123.png', self.images.docs)
        with patch.object(image_store, 'CACHE_DIR', os.path.join(self.tmp, 'instance-b')):   # empty /tmp
            self.assertEqual(image_store.load_image('qr_abc123.png'), png_bytes())
            self.assertEqual(image_store.existing_image_ids({'qr_abc123.png', 'qr_gone.png'}), {'qr_abc123.png'})
            self.assertTrue(image_store.delete_image('qr_abc123.png'))
        with patch.object(image_store, 'CACHE_DIR', os.path.join(self.tmp, 'instance-c')):
            self.assertIsNone(image_store.load_image('qr_abc123.png'))

    def test_serverless_without_database_refuses_to_pretend(self):
        with patch.object(mongodb_manager, 'is_database_connected', return_value=False), \
                patch.object(image_store, 'CACHE_DIR', os.path.join(self.tmp, 'x')):
            with self.assertRaises(image_store.StorageUnavailable):
                image_store.save_image('shot_x_1.png', png_bytes(), 'payment_proof')

    def test_ids_cannot_escape_the_store(self):
        for bad in ('../server.py', '..\\x.png', 'a/b.png', 'x.svg', 'x.html', '', 'x' * 200 + '.png'):
            self.assertFalse(image_store.is_valid_image_id(bad), bad)
            self.assertIsNone(image_store.load_image(bad))
        self.assertIsNone(image_store.image_id_from_url('https://evil.example/api/images/x.png'))
        self.assertEqual(image_store.image_id_from_url('/api/images/qr_a.png'), 'qr_a.png')


class Harness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'backend_data.json')
        self.cache = os.path.join(self.tmp, 'images')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(seed(), f)
        self.patches = [
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(image_store, 'CACHE_DIR', self.cache),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(server, 'check_opportunistic_scheduler_tick', lambda: None),
            patch.object(server, 'sync_to_firebase', lambda *a, **k: True),
            patch.object(mongodb_manager, 'is_database_connected', return_value=False),
            patch.object(mongodb_manager, 'get_database', return_value=None),
        ]
        for p in self.patches:
            p.start()
        server._collection_last_synced.clear()
        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.ExcellenceCAHandler)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self._quiet = patch('sys.stderr', io.StringIO())
        self._quiet.start()

    def tearDown(self):
        self._quiet.stop()
        self.httpd.shutdown()
        self.httpd.server_close()
        for p in reversed(self.patches):
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def call(self, path, body=None, token=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        req = urllib.request.Request(self.base + path, headers=headers, method='POST' if body is not None else 'GET',
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if r.headers.get('Content-Type') == 'application/json' else raw), r.headers
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw), e.headers
            except ValueError:
                return e.code, raw, e.headers

    def data(self):
        with open(self.store, encoding='utf-8') as f:
            return json.load(f)

    def add_channel(self, name, upi, plan_id):
        st, res, _ = self.call('/api/admin/payment-channels', {
            'action': 'add', 'channelData': {'title': name, 'upiId': upi, 'payeeName': 'ExcellenceCA',
                                             'targetPlanId': plan_id, 'subscriptionTier': plan_id.split('_')[0]}}, ADMIN_TOKEN)
        self.assertEqual(st, 200, res)
        return res['result']['id']

    def upload_qr(self, channel_id, color):
        st, res, _ = self.call('/api/admin/payment-channels/upload-qr',
                               {'channelId': channel_id, 'fileName': 'qr.png', 'fileData': data_uri(color)}, ADMIN_TOKEN)
        self.assertEqual(st, 200, res)
        return res['qrCodeUrl']

    def pay(self, plan_id='core_monthly', utr='UTR123456', token=STUDENT_TOKEN, color=(10, 20, 30)):
        st, res, _ = self.call('/api/payments/create-session', {'planId': plan_id}, token)
        self.assertEqual(st, 200, res)
        session = res['session']
        st, res, _ = self.call('/api/payments/submit-payment', {'paymentSessionId': session['paymentSessionId'],
                                                               'utr': utr, 'screenshot': data_uri(color)}, token)
        self.assertEqual(st, 200, res)
        return res['session']


class TestPaymentProof(Harness):
    def test_proof_is_stored_listed_and_private(self):
        s = self.pay()
        url = s['screenshot']
        self.assertTrue(url.startswith('/api/images/shot_'), url)
        image_id = image_store.image_id_from_url(url)
        self.assertTrue(os.path.isfile(os.path.join(self.cache, image_id)))
        # record persisted with the reference
        stored = next(p for p in self.data()['payment_sessions'] if p['paymentSessionId'] == s['paymentSessionId'])
        self.assertEqual(stored['screenshot'], url)
        # admin list says the proof is available
        st, res, _ = self.call('/api/admin/payments', token=ADMIN_TOKEN)
        self.assertEqual(st, 200)
        row = next(p for p in res['payments'] if p['paymentSessionId'] == s['paymentSessionId'])
        self.assertEqual(row['proofStatus'], 'available')
        # access control
        self.assertEqual(self.call(url)[0], 401)
        self.assertEqual(self.call(url, token=OTHER_TOKEN)[0], 403)
        st, body, headers = self.call(url, token=STUDENT_TOKEN)
        self.assertEqual((st, body), (200, png_bytes((10, 20, 30))))
        st, body, headers = self.call(url, token=ADMIN_TOKEN)
        self.assertEqual((st, headers['Content-Type']), (200, 'image/png'))
        self.assertIn('no-store', headers['Cache-Control'])
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')

    def test_missing_proof_file_is_reported_not_broken(self):
        s = self.pay()
        os.remove(os.path.join(self.cache, image_store.image_id_from_url(s['screenshot'])))
        st, res, _ = self.call('/api/admin/payments', token=ADMIN_TOKEN)
        row = next(p for p in res['payments'] if p['paymentSessionId'] == s['paymentSessionId'])
        self.assertEqual(row['proofStatus'], 'missing')
        self.assertEqual(self.call(s['screenshot'], token=ADMIN_TOKEN)[0], 404)

    def test_invalid_uploads_are_rejected(self):
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'core_monthly'}, STUDENT_TOKEN)
        sid = res['session']['paymentSessionId']
        svg = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg onload="alert(1)"></svg>').decode()
        html_png = 'data:image/png;base64,' + base64.b64encode(png_bytes() + b'<script>alert(1)</script>').decode()
        big = 'data:image/png;base64,' + base64.b64encode(png_bytes() + b'\0' * (6 * 1024 * 1024)).decode()
        for bad in (svg, html_png, 'data:image/png;base64,' + base64.b64encode(b'MZ\x90\x00exe').decode(), big):
            st, res, _ = self.call('/api/payments/submit-payment', {'paymentSessionId': sid, 'utr': 'UTR999999', 'screenshot': bad}, STUDENT_TOKEN)
            self.assertEqual(st, 400, res)
        self.assertFalse(os.path.isdir(self.cache) and os.listdir(self.cache))

    def test_cannot_submit_proof_for_someone_elses_session(self):
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'core_monthly'}, STUDENT_TOKEN)
        sid = res['session']['paymentSessionId']
        st, res, _ = self.call('/api/payments/submit-payment', {'paymentSessionId': sid, 'utr': 'UTR555555', 'screenshot': data_uri()}, OTHER_TOKEN)
        self.assertEqual(st, 400)
        self.assertFalse(os.path.isdir(self.cache) and os.listdir(self.cache), 'no orphan image stored')

    def test_storage_unavailable_is_an_error_not_a_silent_success(self):
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'core_monthly'}, STUDENT_TOKEN)
        sid = res['session']['paymentSessionId']
        with patch.object(image_store, 'IS_SERVERLESS', True):
            st, res, _ = self.call('/api/payments/submit-payment', {'paymentSessionId': sid, 'utr': 'UTR777777', 'screenshot': data_uri()}, STUDENT_TOKEN)
        self.assertEqual(st, 503, res)
        stored = next(p for p in self.data()['payment_sessions'] if p['paymentSessionId'] == sid)
        self.assertIsNone(stored['screenshot'])

    def test_path_traversal_and_bad_ids(self):
        for p in ('/api/images/..%2Fserver.py', '/api/images/../server.py', '/api/images/x.svg', '/api/images/qr_nope.png'):
            self.assertIn(self.call(p, token=ADMIN_TOKEN)[0], (403, 404), p)


class TestPaymentDeletion(Harness):
    def test_single_delete_removes_record_and_proof(self):
        s = self.pay()
        image_path = os.path.join(self.cache, image_store.image_id_from_url(s['screenshot']))
        self.assertEqual(self.call('/api/admin/payments/delete', {'paymentSessionId': s['paymentSessionId']}, STUDENT_TOKEN)[0], 403)
        st, res, _ = self.call('/api/admin/payments/delete', {'paymentSessionId': s['paymentSessionId']}, ADMIN_TOKEN)
        self.assertEqual(st, 200, res)
        self.assertEqual(res['deletedIds'], [s['paymentSessionId']])
        self.assertEqual(res['deletedProofImages'], 1)
        self.assertFalse(os.path.exists(image_path))
        self.assertEqual(self.data()['payment_sessions'], [])
        self.assertIn(f"payment_sessions:{s['paymentSessionId']}", self.data()['deleted_documents'])
        st, res, _ = self.call('/api/admin/payments', token=ADMIN_TOKEN)
        self.assertEqual(res['payments'], [])

    def test_bulk_delete_only_selected(self):
        a = self.pay(utr='UTRAAAAAA1')
        b = self.pay(utr='UTRBBBBBB2')
        c = self.pay(utr='UTRCCCCCC3')
        st, res, _ = self.call('/api/admin/payments/bulk-delete', {'ids': [a['paymentSessionId'], c['paymentSessionId'], 'psess_missing']}, ADMIN_TOKEN)
        self.assertEqual(st, 200, res)
        self.assertEqual(sorted(res['deletedIds']), sorted([a['paymentSessionId'], c['paymentSessionId']]))
        self.assertEqual(res['notFound'], ['psess_missing'])
        remaining = [p['paymentSessionId'] for p in self.data()['payment_sessions']]
        self.assertEqual(remaining, [b['paymentSessionId']])
        self.assertEqual(self.call(b['screenshot'], token=ADMIN_TOKEN)[0], 200, 'unselected proof untouched')
        # "refresh": a fresh load of the store still has them deleted
        server._collection_last_synced.clear()
        st, res, _ = self.call('/api/admin/payments', token=ADMIN_TOKEN)
        self.assertEqual([p['paymentSessionId'] for p in res['payments']], [b['paymentSessionId']])

    def test_deleted_records_do_not_come_back_from_a_stale_copy(self):
        s = self.pay()
        stale = self.data()
        self.call('/api/admin/payments/delete', {'paymentSessionId': s['paymentSessionId']}, ADMIN_TOKEN)
        tomb = self.data()['deleted_documents']
        stale['deleted_documents'] = tomb          # tombstones arrive through the shared store
        server.apply_tombstones(stale)
        self.assertEqual(stale['payment_sessions'], [])

    def test_bulk_delete_validation(self):
        for body in ({}, {'ids': []}, {'ids': 'x'}, {'ids': [1, 2]}, {'ids': ['x'] * 501}):
            self.assertEqual(self.call('/api/admin/payments/bulk-delete', body, ADMIN_TOKEN)[0], 400, body)
        self.assertEqual(self.call('/api/admin/payments/bulk-delete', {'ids': ['x']}, None)[0], 403)


class TestChannelQr(Harness):
    def test_qr_persists_and_each_channel_serves_its_own(self):
        chan_a = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        chan_b = self.add_channel('Plus UPI', 'plus@bank', 'plus_monthly')
        qr_a = self.upload_qr(chan_a, (255, 0, 0))
        qr_b = self.upload_qr(chan_b, (0, 0, 255))
        self.assertNotEqual(qr_a, qr_b)

        # persisted in the channel records ("refresh" = read the store / the public endpoint again)
        server._collection_last_synced.clear()
        chans = {c['id']: c for c in self.data()['payment_channels']}
        self.assertEqual((chans[chan_a]['qrCodeUrl'], chans[chan_b]['qrCodeUrl']), (qr_a, qr_b))
        st, res, _ = self.call('/api/payments/channels')
        listed = {c['id']: c for c in res['channels']}
        self.assertEqual(listed[chan_a]['qrCodeUrl'], qr_a)
        self.assertFalse(listed[chan_a]['qrMissing'])
        # QR images are public (students scan them) and correct
        self.assertEqual(self.call(qr_a)[1], png_bytes((255, 0, 0)))
        self.assertEqual(self.call(qr_b)[1], png_bytes((0, 0, 255)))

        # the student gets the QR of the channel mapped to the chosen plan
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'core_monthly'}, STUDENT_TOKEN)
        self.assertEqual(res['session']['channelSnapshot']['qrCodeUrl'], qr_a)
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'plus_monthly'}, STUDENT_TOKEN)
        self.assertEqual(res['session']['channelSnapshot']['qrCodeUrl'], qr_b)

    def test_editing_a_channel_keeps_its_uploaded_qr(self):
        chan = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        qr = self.upload_qr(chan, (1, 2, 3))
        # the admin form always sends upiId; this used to replace the uploaded QR with a generated one
        st, res, _ = self.call('/api/admin/payment-channels', {'action': 'edit', 'channelId': chan,
                                                              'channelData': {'title': 'Core UPI renamed', 'upiId': 'core@bank'}}, ADMIN_TOKEN)
        self.assertEqual(st, 200, res)
        self.assertEqual(res['result']['qrCodeUrl'], qr)

    def test_replacing_and_removing_qr_cleans_up_old_image(self):
        chan = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        old = self.upload_qr(chan, (1, 1, 1))
        new = self.upload_qr(chan, (2, 2, 2))
        self.assertEqual(self.call(old)[0], 404, 'replaced QR image removed')
        self.assertEqual(self.call(new)[1], png_bytes((2, 2, 2)))
        st, res, _ = self.call('/api/admin/payment-channels', {'action': 'edit', 'channelId': chan,
                                                              'channelData': {'upiId': 'core@bank', 'qrCodeUrl': ''}}, ADMIN_TOKEN)
        self.assertIn('api.qrserver.com', res['result']['qrCodeUrl'])
        self.assertEqual(self.call(new)[0], 404)

    def test_qr_still_used_by_an_open_session_is_kept(self):
        chan = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        old = self.upload_qr(chan, (1, 1, 1))
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'core_monthly'}, STUDENT_TOKEN)
        self.upload_qr(chan, (2, 2, 2))
        self.assertEqual(self.call(old)[0], 200, 'the student who already opened checkout still sees their QR')

    def test_missing_qr_image_falls_back_to_generated_qr(self):
        chan = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        qr = self.upload_qr(chan, (5, 5, 5))
        os.remove(os.path.join(self.cache, image_store.image_id_from_url(qr)))
        st, res, _ = self.call('/api/payments/channels')
        self.assertTrue(next(c for c in res['channels'] if c['id'] == chan)['qrMissing'])
        st, res, _ = self.call('/api/payments/create-session', {'planId': 'core_monthly'}, STUDENT_TOKEN)
        snap = res['session']['channelSnapshot']
        self.assertIn('api.qrserver.com', snap['qrCodeUrl'])
        self.assertIn('pa%3Dcore%2540bank', snap['qrCodeUrl'])   # QR encodes this channel's UPI id
        self.assertIn('am%3D49.00', snap['qrCodeUrl'])
        self.assertFalse(snap['needsReupload'])

    def test_qr_upload_requires_admin_and_valid_image(self):
        chan = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        body = {'channelId': chan, 'fileName': 'qr.png', 'fileData': data_uri()}
        self.assertEqual(self.call('/api/admin/payment-channels/upload-qr', body, STUDENT_TOKEN)[0], 403)
        self.assertEqual(self.call('/api/admin/payment-channels/upload-qr', body, None)[0], 403)
        svg = dict(body, fileData='data:image/svg+xml;base64,' + base64.b64encode(b'<svg/>').decode())
        self.assertEqual(self.call('/api/admin/payment-channels/upload-qr', svg, ADMIN_TOKEN)[0], 400)
        missing = dict(body, channelId='chan_nope')
        self.assertEqual(self.call('/api/admin/payment-channels/upload-qr', missing, ADMIN_TOKEN)[0], 404)
        with patch.object(image_store, 'IS_SERVERLESS', True):
            st, res, _ = self.call('/api/admin/payment-channels/upload-qr', body, ADMIN_TOKEN)
        self.assertEqual(st, 503, res)
        self.assertIn('api.qrserver.com', next(c for c in self.data()['payment_channels'] if c['id'] == chan)['qrCodeUrl'],
                      'channel unchanged when the image could not be stored')

    def test_channel_qr_reference_must_be_a_stored_image_or_https(self):
        chan = self.add_channel('Core UPI', 'core@bank', 'core_monthly')
        for bad in ('file:///etc/passwd', 'javascript:alert(1)', '../../x.png', 'http://insecure/qr.png'):
            st, res, _ = self.call('/api/admin/payment-channels', {'action': 'edit', 'channelId': chan,
                                                                  'channelData': {'qrCodeUrl': bad}}, ADMIN_TOKEN)
            self.assertEqual(st, 400, bad)


if __name__ == '__main__':
    unittest.main()
