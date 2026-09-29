"""
Instance-local datastore cache in load_backend_data(): the JSON file is parsed, normalized and fingerprinted
once per datastore version; every load gets a private copy; any change to the file (the application's own
writes, a MongoDB refresh that changes data, or an external edit) is picked up on the next load; requests
authenticate against the cached read-only datastore instead of loading it a second time.
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongodb_manager
import server
from test_mongo_persistence import FakeDB, FakeReplaceOne

TOKEN = 'sess_' + 'C' * 43
OTHER = 'sess_' + 'D' * 43


def seed():
    return {
        'users': {
            's@x.test': {'id': 'u-s', 'email': 's@x.test', 'username': 'stud', 'role': 'student', 'name': 'S',
                         'isActive': True, 'token': TOKEN, 'sessionTokens': [TOKEN]},
            'o@x.test': {'id': 'u-o', 'email': 'o@x.test', 'username': 'other', 'role': 'student', 'name': 'O',
                         'isActive': True, 'token': OTHER, 'sessionTokens': [OTHER]},
        },
        'tests': [{'id': 't1', 'title': 'One', 'updatedAt': '2026-09-01T00:00:00+00:00'},
                  {'id': 't2', 'title': 'Two', 'updatedAt': '2026-09-01T00:00:00+00:00'}],
        'revoked_users': [], 'revoked_tokens': [],
    }


class CacheBase(unittest.TestCase):
    mongo = False

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'store.json')
        self.write_file(seed())
        self.db = FakeDB()
        self.patches = [
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(server, 'INITIAL_USERS', {}),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(server, 'BASE_DIR', self.tmp),   # no bundled seed next to the test store
            patch.object(mongodb_manager, 'is_database_connected', lambda force_check=False: self.mongo),
            patch.object(mongodb_manager, 'get_database', lambda: self.db if self.mongo else None),
            patch.object(mongodb_manager, 'ReplaceOne', FakeReplaceOne, create=True),
            patch('sys.stderr', io.StringIO()),
        ]
        for p in self.patches:
            p.start()
        server._collection_last_synced.clear()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        server._store_cache.pop(self.store, None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write_file(self, content):
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(content, f)

    def disk(self):
        with open(self.store, encoding='utf-8') as f:
            return json.load(f)

    def stats(self):
        return dict(server._store_cache_stats)

    def delta(self, before):
        now = self.stats()
        return now['hits'] - before['hits'], now['misses'] - before['misses']


class TestCachedReads(CacheBase):
    def test_first_load_parses_then_reads_reuse_the_cache(self):
        s = self.stats()
        with patch.object(server.json, 'load', wraps=json.load) as parse, \
             patch.object(server, '_fingerprint', wraps=server._fingerprint) as fp:
            first = server.load_backend_data()
            parses, fps = parse.call_count, fp.call_count
            for _ in range(5):
                again = server.load_backend_data()
            self.assertEqual(self.delta(s), (5, 1), 'one miss (first load), then cache hits')
            self.assertEqual(parse.call_count, parses, 'no JSON parse on cached reads')
            self.assertEqual(fp.call_count, fps, 'no fingerprinting on cached reads')
        self.assertEqual(again['tests'], first['tests'])
        self.assertGreaterEqual(parses, 1)

    def test_every_load_is_a_private_copy(self):
        a = server.load_backend_data()
        a['tests'][0]['title'] = 'mutated in memory'
        a['users'].clear()
        b = server.load_backend_data()
        self.assertEqual(b['tests'][0]['title'], 'One', 'mutations of one request never leak into another')
        self.assertIn('s@x.test', b['users'])
        self.assertEqual(server._store_view()['tests'][0]['title'], 'One', 'the shared view is untouched')

    def test_external_file_change_is_detected_without_parsing_on_every_read(self):
        server.load_backend_data()
        content = seed()
        content['tests'][0]['title'] = 'Uno'   # same length as 'One': same file size
        tmp_file = self.store + '.new'
        with open(tmp_file, 'w', encoding='utf-8') as f:
            json.dump(content, f)
        os.replace(tmp_file, self.store)        # atomic replace, like the server's own writes
        s = self.stats()
        self.assertEqual(server.load_backend_data()['tests'][0]['title'], 'Uno')
        self.assertEqual(self.delta(s), (0, 1), 'changed file -> reloaded')
        self.write_file(dict(content, tests=[{'id': 't9', 'title': 'Rewritten in place'}]))   # in-place rewrite
        self.assertEqual([t['id'] for t in server.load_backend_data()['tests']], ['t9'])

    def test_missing_file_is_recreated_and_never_served_from_the_old_cache(self):
        server.load_backend_data()
        os.remove(self.store)
        data = server.load_backend_data()   # no file, no bundled seed: default store is created
        self.assertEqual(data.get('tests'), [])
        self.assertTrue(os.path.exists(self.store))
        self.assertEqual(server.load_backend_data().get('tests'), [])


class TestWritesAndInvalidation(CacheBase):
    def test_save_is_immediately_visible_and_persisted(self):
        data = server.load_backend_data()
        data['tests'][0]['title'] = 'Edited'
        data['tests'].append({'id': 't3', 'title': 'Three'})
        data['users']['n@x.test'] = {'id': 'u-n', 'email': 'n@x.test', 'role': 'student', 'name': 'N'}
        server.save_backend_data(data)
        after = server.load_backend_data()
        self.assertEqual([t['title'] for t in after['tests']], ['Edited', 'Two', 'Three'], 'no stale read after a write')
        self.assertIn('n@x.test', after['users'])
        self.assertEqual([t['id'] for t in self.disk()['tests']], ['t1', 't2', 't3'])

        after['tests'] = [t for t in after['tests'] if t['id'] != 't2']   # delete
        after['users']['n@x.test']['name'] = 'N2'                           # update
        server.save_backend_data(after)
        final = server.load_backend_data()
        self.assertEqual([t['id'] for t in final['tests']], ['t1', 't3'])
        self.assertEqual(final['users']['n@x.test']['name'], 'N2')

    def test_unchanged_save_keeps_the_cache(self):
        server.load_backend_data()
        server.save_backend_data(server.load_backend_data())   # normalized content already on disk after 1st write
        server.load_backend_data()
        s = self.stats()
        server.save_backend_data(server.load_backend_data())
        server.load_backend_data()
        self.assertEqual(self.delta(s)[1], 0, 'nothing written -> cache kept')

    def test_lost_update_protection_with_stale_cached_copies(self):
        first, second = server.load_backend_data(), server.load_backend_data()   # both from the cache
        first['tests'][0]['title'] = 'One (edited)'
        server.save_backend_data(first)
        second['tests'][1]['title'] = 'Two (edited)'
        server.save_backend_data(second)          # stale copy: t1 unchanged here
        self.assertEqual([t['title'] for t in self.disk()['tests']], ['One (edited)', 'Two (edited)'])
        self.assertEqual([t['title'] for t in server.load_backend_data()['tests']], ['One (edited)', 'Two (edited)'])

    def test_concurrent_requests_do_not_corrupt_shared_state(self):
        server.load_backend_data()
        barrier, errors = threading.Barrier(8), []

        def work(i):
            try:
                barrier.wait()
                for _ in range(20):
                    d = server.load_backend_data()
                    next(t for t in d['tests'] if t['id'] == 't1')['title'] = f'scratch {i}'   # private copy only
                    self.assertIsNotNone(server.authenticate_token(TOKEN))
                d = server.load_backend_data()
                d['tests'].append({'id': f'n{i}', 'title': f'New {i}'})
                server.save_backend_data(d)
            except Exception as e:   # pragma: no cover - reported below
                errors.append(e)

        threads = [threading.Thread(target=work, args=(i,)) for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        final = server.load_backend_data()
        t1 = next(t for t in final['tests'] if t['id'] == 't1')
        self.assertEqual(t1['title'], 'One', 'no request saw or saved another request\'s scratch change')
        self.assertEqual(sorted(t['id'] for t in final['tests']), sorted(['t1', 't2'] + [f'n{i}' for i in range(8)]))


class TestAuthentication(CacheBase):
    def test_authentication_uses_the_cached_datastore_without_a_load(self):
        server.load_backend_data()
        with patch.object(server, 'load_backend_data', wraps=server.load_backend_data) as load:
            user = server.authenticate_token(TOKEN)
            self.assertEqual(load.call_count, 0, 'no datastore load/copy for authentication')
        self.assertEqual(user['id'], 'u-s')
        user['name'] = 'changed by caller'
        self.assertEqual(server.authenticate_token(TOKEN)['name'], 'S', 'returned user is a private copy')

    def test_explicit_datastore_can_be_passed(self):
        data = server.load_backend_data()
        self.assertEqual(server.authenticate_token(TOKEN, data)['id'], 'u-s')
        self.assertIsNone(server.authenticate_token('sess_' + 'Z' * 43, data))

    def test_revoked_and_deactivated_sessions_are_rejected_immediately(self):
        self.assertIsNotNone(server.authenticate_token(TOKEN))
        data = server.load_backend_data()
        data['users']['s@x.test']['isActive'] = False
        data['revoked_tokens'].append(OTHER)
        server.save_backend_data(data)
        self.assertIsNone(server.authenticate_token(TOKEN), 'deactivated account: no stale cached session')
        self.assertIsNone(server.authenticate_token(OTHER), 'revoked token: no stale cached session')

    def test_session_issued_elsewhere_is_found_via_mongo_refresh(self):
        self.mongo = True
        new_token = 'sess_' + 'N' * 43
        self.db['users'].replace_one({'_id': 'u-new'}, {'_id': 'u-new', 'id': 'u-new', 'email': 'new@x.test',
                                                         'role': 'student', 'isActive': True, 'sessionTokens': [new_token]})
        self.assertEqual(server.authenticate_token(new_token)['id'], 'u-new')


class TestOneLoadPerRequest(CacheBase):
    """Over HTTP: an authenticated read request loads the datastore once (authentication reuses the cache)."""

    def test_authenticated_requests_load_the_datastore_once(self):
        import http.server
        import urllib.request
        loads = []
        real_load = server.load_backend_data
        extra = [patch.object(server, 'check_opportunistic_scheduler_tick', lambda: None),
                 patch.object(server, 'load_backend_data', lambda *a, **k: (loads.append(a or k), real_load(*a, **k))[1])]
        for p in extra:
            p.start()
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.ExcellenceCAHandler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            base = f'http://127.0.0.1:{httpd.server_address[1]}'
            for path in ('/api/papers', '/api/tests', '/api/xp/transactions'):
                loads.clear()
                req = urllib.request.Request(base + path, headers={'Authorization': f'Bearer {TOKEN}'})
                with urllib.request.urlopen(req, timeout=10) as r:
                    self.assertEqual(r.status, 200, path)
                self.assertEqual(len(loads), 1, f'{path}: exactly one datastore load (was: auth + handler)')
        finally:
            httpd.shutdown()
            httpd.server_close()
            for p in reversed(extra):
                p.stop()


class TestMongoRefresh(CacheBase):
    mongo = True

    def test_refresh_with_changes_updates_the_datastore_and_the_cache(self):
        server.load_backend_data()
        self.db['tests'].replace_one({'_id': 't1'}, {'_id': 't1', 'id': 't1', 'title': 'From Mongo',
                                                     'updatedAt': '2026-09-29T00:00:00+00:00'})
        refreshed = server.load_backend_data(refresh_collections=['tests'], min_interval=0.0)
        self.assertEqual(refreshed['tests'][0]['title'], 'From Mongo')
        self.assertEqual(server.load_backend_data()['tests'][0]['title'], 'From Mongo', 'visible to the next plain load')

    def test_refresh_without_changes_keeps_the_cache(self):
        for t in seed()['tests']:
            self.db['tests'].replace_one({'_id': t['id']}, dict(t, _id=t['id']))
        server.load_backend_data(refresh_collections=['tests'], min_interval=0.0)   # first refresh may normalize the file
        server.load_backend_data()
        s = self.stats()
        server.load_backend_data(refresh_collections=['tests'], min_interval=0.0)
        server.load_backend_data()
        self.assertEqual(self.delta(s), (2, 0), 'unchanged refresh: no rewrite, no reload')

    def test_write_through_still_only_sends_changed_documents(self):
        data = server.load_backend_data(refresh_collections=['tests'], min_interval=0.0)
        data['tests'][1]['title'] = 'Two (edited)'
        server.save_backend_data(data)
        self.assertEqual(set(self.db['tests'].docs), {'t2'}, 'only the changed document reached MongoDB')

    def test_ai_collections_stay_out_of_the_cached_datastore(self):
        content = seed()
        content['ai_generation_jobs'] = [{'id': 'job-old', 'status': 'COMPLETED'}]
        content['ai_source_documents'] = [{'id': 'doc-old'}]
        self.write_file(content)
        self.assertEqual([server.load_backend_data()[k] for k in ('ai_generation_jobs', 'ai_source_documents')], [[], []])
        view = server._store_view()
        self.assertEqual([view[k] for k in ('ai_generation_jobs', 'ai_source_documents')], [[], []])


if __name__ == '__main__':
    unittest.main()
