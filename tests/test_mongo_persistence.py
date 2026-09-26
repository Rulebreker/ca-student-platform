"""
MongoDB Atlas as the shared production store: document round-trips, PATCH semantics, refresh
(merge) into an instance, and write-through from save_backend_data. Uses an in-memory fake of the
small pymongo surface mongodb_manager needs - never a real database.
"""
import copy
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongodb_manager
import server


class FakeReplaceOne:
    def __init__(self, flt, doc, upsert=False):
        self._filter, self._doc, self._upsert = flt, doc, upsert


class FakeCollection:
    def __init__(self):
        self.docs = {}

    def find(self, _flt=None):
        return [copy.deepcopy(d) for d in self.docs.values()]

    def find_one(self, flt):
        d = self.docs.get(flt.get('_id'))
        return copy.deepcopy(d) if d else None

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt['_id']] = copy.deepcopy(doc)

    def update_one(self, flt, update, upsert=False):
        cur = self.docs.setdefault(flt['_id'], {'_id': flt['_id']})
        cur.update(copy.deepcopy(update.get('$set', {})))

    def delete_one(self, flt):
        self.docs.pop(flt['_id'], None)

    def bulk_write(self, ops, ordered=False):
        for op in ops:
            self.replace_one(op._filter, op._doc, upsert=op._upsert)


class FakeDB(dict):
    def __missing__(self, name):
        self[name] = FakeCollection()
        return self[name]

    def list_collection_names(self):
        return list(self.keys())


class MongoTestBase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.patches = [
            patch.object(mongodb_manager, 'get_database', return_value=self.db),
            patch.object(mongodb_manager, 'is_database_connected', return_value=True),
            patch.object(mongodb_manager, 'ReplaceOne', FakeReplaceOne, create=True),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()


class TestMongoManagerRoundTrips(MongoTestBase):
    def test_patch_updates_fields_instead_of_replacing_document(self):
        mongodb_manager.sync_document_to_mongo('users/usr-1', {'id': 'usr-1', 'email': 'a@x.in', 'name': 'A', 'totalXp': 50}, sync=True)
        mongodb_manager.sync_document_to_mongo('users/usr-1', {'totalXp': 0, 'token': 't2'}, method='PATCH', sync=True)
        doc = self.db['users'].find_one({'_id': 'usr-1'})
        self.assertEqual((doc['email'], doc['name'], doc['totalXp'], doc['token']), ('a@x.in', 'A', 0, 't2'))

    def test_payment_sessions_keyed_by_payment_session_id_and_positional_duplicates_dropped(self):
        self.db['payment_sessions'].replace_one({'_id': 'payment_sessions_0'}, {'_id': 'payment_sessions_0', 'paymentSessionId': 'ps-1', 'status': 'pending'})
        mongodb_manager.sync_document_to_mongo('payment_sessions', [{'paymentSessionId': 'ps-1', 'status': 'approved'}, {'paymentSessionId': 'ps-2', 'status': 'pending'}], sync=True)
        self.assertIn('ps-1', self.db['payment_sessions'].docs)
        loaded = mongodb_manager.load_collection_from_mongo('payment_sessions')
        self.assertEqual(sorted((s['paymentSessionId'], s['status']) for s in loaded), [('ps-1', 'approved'), ('ps-2', 'pending')])

    def test_list_documents_without_key_are_skipped_not_positional(self):
        mongodb_manager.sync_document_to_mongo('notifications', [{'title': 'no id'}, {'id': 'n-1'}], sync=True)
        self.assertEqual(list(self.db['notifications'].docs), ['n-1'])

    def test_keyed_dicts_round_trip_as_dicts(self):
        subs = {'usr-1': {'id': 'sub-9', 'userId': 'usr-1', 'planId': 'core'}, 'usr-2': {'userId': 'usr-2', 'planId': 'plus'}}
        mongodb_manager.sync_document_to_mongo('subscriptions', subs, sync=True)
        self.assertEqual(sorted(self.db['subscriptions'].docs), ['usr-1', 'usr-2'])
        self.assertEqual(mongodb_manager.load_collection_from_mongo('subscriptions')['usr-1']['planId'], 'core')
        plans = {'core_monthly': {'id': 'core_monthly', 'tier': 'core'}}
        mongodb_manager.sync_document_to_mongo('subscription_plans', plans, sync=True)
        self.assertEqual(list(mongodb_manager.load_collection_from_mongo('subscription_plans')), ['core_monthly'])

    def test_string_lists_and_singletons_round_trip(self):
        mongodb_manager.sync_document_to_mongo('revoked_users/usr-9', True, sync=True)
        mongodb_manager.sync_document_to_mongo('revoked_tokens', ['tok-a', 'tok-b'], sync=True)
        self.assertEqual(mongodb_manager.load_collection_from_mongo('revoked_users'), ['usr-9'])
        self.assertEqual(sorted(mongodb_manager.load_collection_from_mongo('revoked_tokens')), ['tok-a', 'tok-b'])
        status = {'workerId': 'w1', 'lastLatencyMs': None, 'lastHeartbeatTs': 5.0, 'system': {}}
        mongodb_manager.sync_document_to_mongo('ai_worker_status', status, sync=True)
        self.assertEqual(mongodb_manager.load_collection_from_mongo('ai_worker_status'), status)

    def test_write_failures_are_reported(self):
        with patch.object(FakeCollection, 'replace_one', side_effect=RuntimeError('network down')):
            self.assertFalse(mongodb_manager.sync_document_to_mongo('tests/t-1', {'id': 't-1'}, sync=True))


SEED = {
    'users': {'rohan@x.in': {'id': 'usr-s1', 'email': 'rohan@x.in', 'role': 'student', 'totalXp': 10, 'password': 'sha256:s:h'}},
    'tests': [{'id': 't-1', 'title': 'Old', 'totalQuestions': 5, 'updatedAt': '2026-09-01T00:00:00+00:00'}],
    'questions': [], 'test_attempts': [], 'xp_transactions': [], 'ai_generation_jobs': [],
    'subscriptions': {}, 'revoked_users': [], 'revoked_tokens': [], 'referrals': [], 'subjects': [{'id': 'sub-1'}],
}


class TestInstancesShareStateThroughMongo(MongoTestBase):
    """Two Vercel instances = two /tmp data files, one MongoDB."""

    def setUp(self):
        super().setUp()
        self.tmp = tempfile.mkdtemp()
        for name in ('a', 'b'):
            with open(os.path.join(self.tmp, f'{name}.json'), 'w', encoding='utf-8') as f:
                json.dump(SEED, f)
        self.extra = [patch.object(server, 'sync_historical_xp', lambda d: None)]
        for p in self.extra:
            p.start()

    def tearDown(self):
        for p in self.extra:
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)
        super().tearDown()

    def instance(self, name, refresh=None):
        server._collection_last_synced.clear()
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, f'{name}.json')):
            return server.load_backend_data(refresh_collections=refresh or server.SHARED_COLLECTIONS, min_interval=0.0)

    def save(self, name, data):
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, f'{name}.json')):
            server.save_backend_data(data)

    def test_changes_on_one_instance_are_visible_on_the_other(self):
        a = self.instance('a')
        a['test_attempts'].append({'id': 'att-1', 'testId': 't-1', 'userId': 'usr-s1', 'finalScore': 8})
        a['xp_transactions'].append({'id': 'xp-1', 'userId': 'usr-s1', 'points': 20})
        a['users']['rohan@x.in']['totalXp'] = 30
        a['subscriptions']['usr-s1'] = {'userId': 'usr-s1', 'planId': 'core', 'status': 'active'}
        a['ai_generation_jobs'].append({'id': 'job-1', 'status': 'QUEUED', 'createdTs': 1.0, 'updatedTs': 1.0})
        self.save('a', a)

        b = self.instance('b')
        self.assertEqual([x['id'] for x in b['test_attempts']], ['att-1'])
        self.assertEqual([x['id'] for x in b['xp_transactions']], ['xp-1'])
        self.assertEqual(b['users']['rohan@x.in']['totalXp'], 30)
        self.assertEqual(b['subscriptions']['usr-s1']['planId'], 'core')
        self.assertEqual(b['ai_generation_jobs'][0]['status'], 'QUEUED')

    def test_write_through_only_writes_changed_documents(self):
        a = self.instance('a')
        self.save('a', a)
        self.assertEqual(self.db['tests'].docs, {}, "unchanged documents are not re-written")
        a['tests'][0]['title'] = 'New'
        self.save('a', a)
        self.assertEqual(list(self.db['tests'].docs), ['t-1'])
        self.assertEqual(self.db['users'].docs, {}, "untouched users are not written")

    def test_stale_instance_does_not_overwrite_newer_document(self):
        a = self.instance('a')
        b = self.instance('b')
        a['tests'][0].update({'title': 'Edited on A', 'updatedAt': '2026-09-10T00:00:00+00:00'})
        self.save('a', a)
        b['users']['rohan@x.in']['totalXp'] = 99   # B changes something else
        self.save('b', b)
        self.assertEqual(self.db['tests'].find_one({'_id': 't-1'})['title'], 'Edited on A', "B's stale test copy is not written")
        b2 = self.instance('b')
        self.assertEqual(b2['tests'][0]['title'], 'Edited on A')

    def test_refresh_keeps_newer_local_copy_and_local_only_documents(self):
        self.db['tests'].replace_one({'_id': 't-1'}, {'_id': 't-1', 'id': 't-1', 'title': 'Older in Mongo', 'updatedAt': '2026-08-01T00:00:00+00:00'})
        self.db['tests'].replace_one({'_id': 't-2'}, {'_id': 't-2', 'id': 't-2', 'title': 'Only in Mongo'})
        a = self.instance('a')
        titles = {t['id']: t['title'] for t in a['tests']}
        self.assertEqual(titles, {'t-1': 'Old', 't-2': 'Only in Mongo'})

    def test_partial_user_documents_never_create_users(self):
        self.db['users'].replace_one({'_id': 'usr-ghost'}, {'_id': 'usr-ghost', 'id': 'usr-ghost', 'token': 'x'})
        a = self.instance('a')
        self.assertFalse(any(u.get('id') == 'usr-ghost' for u in a['users'].values()))
        self.assertNotIn('usr-ghost', a['users'])

    def test_revocations_propagate(self):
        mongodb_manager.sync_document_to_mongo('revoked_users/usr-s1', True, sync=True)
        a = self.instance('a', refresh=['revoked_users', 'users'])
        self.assertIn('usr-s1', a['revoked_users'])
        self.assertIn('usr-s1', server.REVOKED_USERS)
        server.REVOKED_USERS.discard('usr-s1')

    def test_serverless_writes_are_synchronous(self):
        with patch.object(server, 'IS_SERVERLESS', True):
            ok = server.sync_to_database('tests/t-9', {'id': 't-9'}, sync=False)
        self.assertTrue(ok)
        self.assertIn('t-9', self.db['tests'].docs)


if __name__ == '__main__':
    unittest.main()
