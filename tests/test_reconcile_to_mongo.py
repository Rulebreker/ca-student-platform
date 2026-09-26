"""scripts/reconcile_to_mongo.py against an in-memory fake MongoDB (never a real database)."""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

import mongodb_manager
import reconcile_to_mongo as rec
from tests.test_mongo_persistence import FakeDB, FakeReplaceOne

FIREBASE = {
    'users': {
        'usr-s1': {'id': 'usr-s1', 'email': 'rohan@x.in', 'name': 'Rohan', 'password': 'sha256:s:h', 'totalXp': 40,
                   'updatedAt': '2026-09-20T00:00:00Z'},
        'usr-s2': {'id': 'usr-s2', 'email': 'priya@x.in', 'name': 'Priya', 'password': 'plain123'},
    },
    'tests': {'t-fb': {'id': 't-fb', 'title': 'Only in Firebase'}},
    'payment_sessions': {'ps-1': {'paymentSessionId': 'ps-1', 'status': 'approved', 'updatedAt': '2026-09-21T00:00:00Z'}},
    'revoked_users': {'usr-gone': True},
}
SEED = {
    'users': {
        'rohan@x.in': {'id': 'usr-s1', 'email': 'rohan@x.in', 'name': 'Rohan (old)', 'totalXp': 10, 'updatedAt': '2026-09-01T00:00:00Z'},
        'a@x.in': {'id': 'usr-t1', 'email': 'a@x.in', 'name': 'Teacher A'},
        'b@x.in': {'id': 'usr-t1', 'email': 'b@x.in', 'name': 'Teacher B'},
    },
    'tests': [{'id': 't-seed', 'title': 'Only in seed'}],
    'xp_reset_settings': {'enabled': False, 'intervalDays': 90},
}


class TestReconcile(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        # MongoDB today: a user damaged by the old PATCH bug (token only), a pending payment session
        self.db['users'].replace_one({'_id': 'usr-s1'}, {'_id': 'usr-s1', 'token': 'tok-latest'})
        self.db['payment_sessions'].replace_one({'_id': 'ps-1'}, {'_id': 'ps-1', 'paymentSessionId': 'ps-1', 'status': 'pending',
                                                                  'updatedAt': '2026-09-10T00:00:00Z'})
        self.db['tests'].replace_one({'_id': 't-mongo'}, {'_id': 't-mongo', 'id': 't-mongo', 'title': 'Only in Mongo'})
        self.patches = [patch.object(mongodb_manager, 'get_database', return_value=self.db),
                        patch.object(mongodb_manager, 'ReplaceOne', FakeReplaceOne, create=True)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def run_plan(self):
        return rec.reconcile(rec.load_mongo(self.db), FIREBASE, SEED)

    def test_damaged_user_is_repaired_field_by_field(self):
        plan, report = self.run_plan()
        u = plan['users']['usr-s1']
        self.assertEqual((u['email'], u['name'], u['totalXp'], u['token']), ('rohan@x.in', 'Rohan', 40, 'tok-latest'))
        self.assertEqual(report['collections']['users']['repairedPartialMongo'], 1)

    def test_records_from_every_source_are_kept(self):
        plan, _ = self.run_plan()
        self.assertEqual(set(plan['tests']), {'t-fb', 't-seed'}, "Mongo-only test already correct, others inserted")
        self.assertIn('usr-gone', plan['revoked_users'])
        self.assertEqual(plan['xp_reset_settings']['__singleton__']['intervalDays'], 90)

    def test_newer_copy_wins(self):
        plan, _ = self.run_plan()
        self.assertEqual(plan['payment_sessions']['ps-1']['status'], 'approved')

    def test_ambiguous_duplicate_ids_are_not_written(self):
        plan, report = self.run_plan()
        self.assertNotIn('usr-t1', plan['users'])
        self.assertTrue(any(d['key'] == 'usr-t1' for d in report['needsDecision']))

    def test_dry_run_writes_nothing_and_apply_backs_up_then_upserts_without_deleting(self):
        plan, _ = self.run_plan()
        before = {c: dict(self.db[c].docs) for c in ('users', 'tests', 'payment_sessions')}
        self.assertEqual(before['users'], {'usr-s1': {'_id': 'usr-s1', 'token': 'tok-latest'}}, "reconcile() itself never writes")
        backup = os.path.join(tempfile.mkdtemp(), 'backup.json')
        n = rec.apply_plan(self.db, plan, backup)
        self.assertGreater(n, 0)
        saved = json.load(open(backup, encoding='utf-8'))
        self.assertEqual(saved['users'][0]['token'], 'tok-latest', "backup holds the pre-apply MongoDB state")
        self.assertIn('t-mongo', self.db['tests'].docs, "nothing is deleted")
        self.assertEqual(self.db['users'].docs['usr-s1']['email'], 'rohan@x.in')
        plan2, _ = self.run_plan()
        self.assertEqual(sum(len(w) for w in plan2.values()), 0, "second run is a no-op")

    def test_plaintext_passwords_are_reported(self):
        _, report = self.run_plan()
        self.assertEqual(report['plaintextPasswordsAfterMerge'], 1)


if __name__ == '__main__':
    unittest.main()
