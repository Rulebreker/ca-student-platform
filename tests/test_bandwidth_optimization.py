import unittest
import json
import os
import urllib.request
import urllib.parse
import server
import subscription_manager

BASE_URL = 'http://127.0.0.1:8000'
ADMIN_TOKEN = 'token_admin_excellenceca_secret'

class TestBandwidthOptimization(unittest.TestCase):

    def setUp(self):
        self.data = server.load_backend_data()

    def test_01_no_inline_base64_in_payment_channels(self):
        """Ensure payment_channels has zero heavy inline base64 images."""
        channels = self.data.get('payment_channels', [])
        for ch in channels:
            qr = ch.get('qrCodeUrl', '')
            self.assertFalse(
                isinstance(qr, str) and qr.startswith('data:image/'),
                f"Channel {ch.get('id')} still contains inline base64 QR code"
            )

    def test_02_no_inline_base64_in_payment_sessions(self):
        """Ensure payment_sessions has zero heavy inline base64 images."""
        sessions = self.data.get('payment_sessions', [])
        for s in sessions:
            qr = s.get('qrData', '')
            self.assertFalse(
                isinstance(qr, str) and qr.startswith('data:image/'),
                f"Session {s.get('id')} still contains inline base64 qrData"
            )
            cs = s.get('channelSnapshot')
            if isinstance(cs, dict):
                cs_qr = cs.get('qrCodeUrl', '')
                self.assertFalse(
                    isinstance(cs_qr, str) and cs_qr.startswith('data:image/'),
                    f"Session {s.get('id')} channelSnapshot contains inline base64 qrCodeUrl"
                )
            shot = s.get('screenshot', '')
            self.assertFalse(
                isinstance(shot, str) and shot.startswith('data:image/'),
                f"Session {s.get('id')} contains inline base64 screenshot"
            )

    def test_03_no_inline_base64_in_admin_audit_logs(self):
        """Ensure admin_audit_logs does not contain legacy multi-megabyte base64 strings."""
        logs = self.data.get('admin_audit_logs', [])
        for l in logs:
            raw_s = json.dumps(l)
            self.assertNotIn('data:image/', raw_s, f"Audit log {l.get('id')} contains inline base64 data")

    def test_04_sanitize_rtdb_binary_payloads_idempotent(self):
        """Ensure sanitize_rtdb_binary_payloads returns False when data is already clean."""
        dirty = server.sanitize_rtdb_binary_payloads(self.data)
        self.assertFalse(dirty, "Clean data should not be flagged dirty")

    def test_05_admin_subscriptions_api_contract(self):
        """Verify /api/admin/subscriptions returns subscriptions, subscriptionsList, and KPIs."""
        req = urllib.request.Request(
            f"{BASE_URL}/api/admin/subscriptions",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode('utf-8'))
            self.assertTrue(res.get('success'))
            self.assertIn('subscriptions', res)
            self.assertIn('subscriptionsList', res)
            self.assertIn('items', res)
            self.assertIn('stats', res)
            self.assertIn('kpis', res)

    def test_06_admin_payments_api_contract(self):
        """Verify /api/admin/payments responds cleanly and contains sanitized sessions."""
        req = urllib.request.Request(
            f"{BASE_URL}/api/admin/payments",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode('utf-8'))
            self.assertTrue(res.get('success'))
            sessions = res.get('payments', []) or res.get('sessions', [])
            self.assertTrue(isinstance(sessions, list))
            for s in sessions:
                shot = s.get('screenshot') or ''
                self.assertFalse(shot.startswith('data:image/'), "Returned session contains raw base64 screenshot")

    def test_07_tests_catalog_endpoint(self):
        """Verify /api/tests returns test catalog successfully."""
        req = urllib.request.Request(f"{BASE_URL}/api/tests")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode('utf-8'))
            self.assertIn('tests', res)

    def test_08_health_check_fast_response(self):
        """Verify health check responds with 200 and ok status."""
        req = urllib.request.Request(f"{BASE_URL}/api/health")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode('utf-8'))
            self.assertEqual(res.get('status'), 'ok')

if __name__ == '__main__':
    unittest.main()
