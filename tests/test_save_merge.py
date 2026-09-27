"""
Lost-update protection in save_backend_data: two requests that loaded the store before each other's
save both keep their changes (document-level merge onto the current file).
"""
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongodb_manager
import server


class TestSaveMerge(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'store.json')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump({
                'users': {'a@x.test': {'id': 'u-a', 'email': 'a@x.test', 'role': 'student', 'name': 'A'},
                          'b@x.test': {'id': 'u-b', 'email': 'b@x.test', 'role': 'student', 'name': 'B'}},
                'tests': [{'id': 't1', 'title': 'One'}, {'id': 't2', 'title': 'Two'}],
                'revoked_users': [],
            }, f)
        self.patches = [
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(server, 'INITIAL_USERS', {}),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(mongodb_manager, 'is_database_connected', return_value=False),
            patch.object(mongodb_manager, 'get_database', return_value=None),
            patch('sys.stderr', io.StringIO()),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def disk(self):
        with open(self.store, encoding='utf-8') as f:
            return json.load(f)

    def test_two_stale_copies_keep_both_changes(self):
        first, second = server.load_backend_data(), server.load_backend_data()
        first['tests'][0]['title'] = 'One (edited)'
        first['users']['a@x.test']['name'] = 'A2'
        server.save_backend_data(first)
        second['tests'][1]['title'] = 'Two (edited)'
        second['users']['b@x.test']['name'] = 'B2'
        server.save_backend_data(second)          # stale copy: t1 / user a unchanged here
        d = self.disk()
        self.assertEqual([t['title'] for t in d['tests']], ['One (edited)', 'Two (edited)'])
        self.assertEqual((d['users']['a@x.test']['name'], d['users']['b@x.test']['name']), ('A2', 'B2'))

    def test_adds_and_deletes_from_either_side_survive(self):
        first, second = server.load_backend_data(), server.load_backend_data()
        first['tests'] = [t for t in first['tests'] if t['id'] != 't1']      # delete t1
        first['users']['c@x.test'] = {'id': 'u-c', 'email': 'c@x.test', 'role': 'student'}
        first['revoked_users'].append('u-x')
        server.save_backend_data(first)
        second['tests'].append({'id': 't3', 'title': 'Three'})              # add t3 from a stale copy
        second['revoked_users'].append('u-y')
        server.save_backend_data(second)
        d = self.disk()
        self.assertEqual(sorted(t['id'] for t in d['tests']), ['t2', 't3'], 't1 stays deleted, t3 added')
        self.assertIn('c@x.test', d['users'])
        self.assertEqual(sorted(d['revoked_users']), ['u-x', 'u-y'])

    def test_same_copy_saved_twice_can_delete_its_own_addition(self):
        data = server.load_backend_data()
        data['tests'].append({'id': 't9', 'title': 'Nine'})
        server.save_backend_data(data)
        data['tests'] = [t for t in data['tests'] if t['id'] != 't9']
        server.save_backend_data(data)
        self.assertNotIn('t9', [t['id'] for t in self.disk()['tests']])

    def test_concurrent_threads_lose_nothing(self):
        copies = [server.load_backend_data() for _ in range(8)]
        barrier = threading.Barrier(len(copies))

        def work(i, data):
            data['tests'].append({'id': f'n{i}', 'title': f'New {i}'})
            data['users'][f'n{i}@x.test'] = {'id': f'u-n{i}', 'email': f'n{i}@x.test', 'role': 'student'}
            barrier.wait()
            server.save_backend_data(data)

        threads = [threading.Thread(target=work, args=(i, c)) for i, c in enumerate(copies)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        d = self.disk()
        self.assertEqual(sorted(t['id'] for t in d['tests']), sorted(['t1', 't2'] + [f'n{i}' for i in range(8)]))
        self.assertEqual(len(d['users']), 2 + 8)

    def test_dict_without_snapshot_is_written_as_is(self):
        server.save_backend_data({'tests': [{'id': 'only'}], 'users': {}})
        self.assertEqual(self.disk()['tests'], [{'id': 'only'}])


if __name__ == '__main__':
    unittest.main()
