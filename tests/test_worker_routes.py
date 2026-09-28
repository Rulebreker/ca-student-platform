"""
Local Qwen Worker routes (heartbeat / scheduler tick / claim / progress) over HTTP, offline.

MongoDB mode uses an in-memory MongoDB stand-in (atomic conditional updates, slowed reads to widen race
windows); local mode uses the JSON store. Checks: fast answers without whole-collection reloads, auth,
exclusive claims under concurrency, heartbeat during a running job, no secret in logs.
"""
import copy
import http.server
import io
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stdout
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_job_manager
import mongodb_manager
import server

SECRET = 'test-worker-secret-' + 'x' * 24


# ------------------------------------------------------------------ in-memory MongoDB stand-in
def _match_value(value, cond):
    if isinstance(cond, dict) and cond and all(str(k).startswith('$') for k in cond):
        for op, arg in cond.items():
            if op == '$in' and value not in arg:
                return False
            if op == '$ne' and value == arg:
                return False
            if op == '$lt' and not (value is not None and value < arg):
                return False
            if op == '$lte' and not (value is not None and value <= arg):
                return False
        return True
    return value == cond


def _matches(doc, flt):
    for key, cond in (flt or {}).items():
        if key == '$or':
            if not any(_matches(doc, c) for c in cond):
                return False
        elif not _match_value(doc.get(key), cond):
            return False
    return True


class _Result:
    def __init__(self, matched):
        self.matched_count = matched


class _Cursor(list):
    def sort(self, key, direction=None):
        if isinstance(key, list):
            key, direction = key[0]
        return _Cursor(sorted(self, key=lambda d: d.get(key) or 0, reverse=direction == -1))

    def limit(self, n):
        return _Cursor(self[:n] if n else self)


class FakeCollection:
    def __init__(self, db, name):
        self.db, self.name, self.docs = db, name, {}

    def find(self, flt=None, projection=None):
        with self.db.lock:
            out = [copy.deepcopy(d) for d in self.docs.values() if _matches(d, flt or {})]
        time.sleep(self.db.read_delay)   # the snapshot travels back over the network: widens race windows
        self.db.reads.append(self.name)
        if projection:
            keep = {k for k, v in projection.items() if v}
            if keep:
                out = [{k: v for k, v in d.items() if k in keep or k == '_id'} for d in out]
        return _Cursor(out)

    def find_one(self, flt=None, projection=None):
        found = self.find(flt, projection)
        return found[0] if found else None

    def replace_one(self, flt, doc, upsert=False):
        with self.db.lock:
            self.docs[doc['_id']] = copy.deepcopy(doc)

    def update_one(self, flt, update, upsert=False):
        with self.db.lock:   # atomic like MongoDB's single-document update
            doc = next((d for d in self.docs.values() if _matches(d, flt)), None)
            if doc is None:
                if not upsert:
                    return _Result(0)
                doc = self.docs.setdefault(flt['_id'], {'_id': flt['_id']})
            doc.update(copy.deepcopy(update.get('$set', {})))
            return _Result(1)

    def delete_one(self, flt):
        with self.db.lock:
            self.docs.pop(flt.get('_id'), None)

    def bulk_write(self, ops, ordered=False):
        for op in ops:
            self.replace_one(op.flt, op.doc)

    def estimated_document_count(self):
        return len(self.docs)


class FakeReplaceOne:
    def __init__(self, flt, doc, upsert=False):
        self.flt, self.doc = flt, doc


class FakeDB(dict):
    def __init__(self):
        super().__init__()
        self.lock = threading.RLock()
        self.reads = []
        self.read_delay = 0.0

    def __getitem__(self, name):
        if name not in self:
            dict.__setitem__(self, name, FakeCollection(self, name))
        return dict.__getitem__(self, name)

    __getattr__ = __getitem__

    def command(self, *a, **k):
        return {'ok': 1}


def make_job(title, **extra):
    data = {'ai_generation_jobs': []}
    ok, err, job = ai_job_manager.create_generation_job({'title': title, 'subject': 'Business Economics',
                                                         'topic': 'Theory of Demand and Supply', 'chapter': 'Theory of Demand and Supply',
                                                         'count': 4}, data)
    assert ok, err
    job.update(extra)
    return job


class WorkerRoutesBase(unittest.TestCase):
    mongo = True

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'store.json')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump({'users': {}, 'ai_generation_jobs': [], 'questions': [], 'tests': [], 'ai_scheduled_tasks': []}, f)
        self.db = FakeDB()
        self.opportunistic = []
        self.full_loads = []
        real_load = mongodb_manager.load_collection_from_mongo
        self.patches = [
            patch.dict(os.environ, {'AI_WORKER_SECRET': SECRET}),
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(server, 'INITIAL_USERS', {}),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(server, 'check_opportunistic_scheduler_tick', lambda: self.opportunistic.append(1)),
            patch.object(mongodb_manager, 'ReplaceOne', FakeReplaceOne, create=True),
            patch.object(mongodb_manager, 'get_database', lambda: self.db if self.mongo else None),
            patch.object(mongodb_manager, 'get_mongo_client', lambda: None),
            patch.object(mongodb_manager, 'is_database_connected', lambda force_check=False: self.mongo),
            patch.object(mongodb_manager, 'load_collection_from_mongo',
                         lambda name: (self.full_loads.append(name), real_load(name))[1]),
            patch('sys.stderr', io.StringIO()),
        ]
        for p in self.patches:
            p.start()
        server._collection_last_synced.clear()
        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.ExcellenceCAHandler)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        for p in reversed(self.patches):
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def call(self, route, body, token=SECRET):
        path = '/api/admin/ai/scheduler/tick' if route == 'tick' else f'/api/admin/ai/worker/{route}'
        headers = {'Content-Type': 'application/json', 'User-Agent': 'ExcellenceCA-LocalQwenWorker/2.0.0'}
        if token is not None:
            headers['X-Worker-Token'] = token
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode(), method='POST', headers=headers)
        t = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                code, out = r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            code, out = e.code, json.loads(e.read() or b'{}')
        return code, out, (time.perf_counter() - t) * 1000

    def put_job(self, job):
        self.db['ai_generation_jobs'].replace_one({'_id': job['id']}, dict(job, _id=job['id']))

    def job(self, job_id):
        return self.db['ai_generation_jobs'].docs.get(job_id)


class TestWorkerRoutesMongo(WorkerRoutesBase):
    def test_heartbeat_success_marks_worker_online_without_loading_collections(self):
        out_log = io.StringIO()
        with redirect_stdout(out_log):
            code, out, ms = self.call('heartbeat', {'workerId': 'w-1', 'status': 'idle', 'ollamaHealthy': True, 'latencyMs': 9.5})
        self.assertEqual(code, 200)
        self.assertTrue(out['success'])
        self.assertTrue(out['worker']['online'])
        self.assertIsNone(out['jobLeaseValid'])
        stored = mongodb_manager.load_collection_from_mongo('ai_worker_status')
        self.assertEqual((stored['workerId'], stored['lastLatencyMs']), ('w-1', 9.5))
        self.assertNotIn('ai_generation_jobs', self.db.reads, "a heartbeat never reads the job history")
        self.assertEqual(self.opportunistic, [], "no scheduler work inside a heartbeat")
        log = out_log.getvalue()
        self.assertRegex(log, r'\[WORKER_API\] route=heartbeat worker=w-1 status=200 total_ms=\d+ steps=')
        self.assertNotIn(SECRET, log)

    def test_invalid_or_missing_worker_token_is_rejected_with_json(self):
        for route in ('heartbeat', 'claim', 'progress', 'complete', 'fail', 'tick'):
            code, out, _ = self.call(route, {'workerId': 'w-1'}, token='wrong-secret')
            self.assertEqual(code, 403, route)
            self.assertIn('error', out)
        code, _, _ = self.call('heartbeat', {'workerId': 'w-1'}, token=None)
        self.assertEqual(code, 403)
        self.assertEqual(self.db['ai_worker_status'].docs, {}, "nothing written for a rejected worker")

    def test_scheduler_tick_is_quick_when_nothing_is_due(self):
        code, out, ms = self.call('tick', {'workerId': 'w-1'})
        self.assertEqual(code, 200)
        self.assertTrue(out['success'])
        self.assertEqual(out.get('skipped'), 'nothing_due')
        # only the tiny legacy auto-pilot config (read while no scheduled tasks exist); never jobs/tests/questions
        self.assertLessEqual(set(self.full_loads), {'ai_autopilot_config'}, "no heavy collection is downloaded when nothing is due")

    def test_claim_success_takes_oldest_job_with_chapter_questions_only(self):
        older = make_job('Older', createdTs=time.time() - 60)
        newer = make_job('Newer')
        for j in (older, newer):
            self.put_job(j)
        self.put_job(make_job('Old finished', status='COMPLETED', createdTs=1.0))
        for i in range(3):
            self.db['questions'].replace_one({}, {'_id': f'q{i}', 'id': f'q{i}', 'subject': 'Business Economics',
                                                  'chapterId': 'ch-fnd-eco-2', 'text': f'Bank stem {i}?', 'explanation': 'x' * 50})
        self.db['questions'].replace_one({}, {'_id': 'other', 'id': 'other', 'subject': 'Accounting', 'chapterId': 'ch-x', 'text': 'Other?'})
        code, out, _ = self.call('claim', {'workerId': 'w-1'})
        self.assertEqual(code, 200)
        self.assertEqual(out['job']['id'], older['id'], "FIFO")
        self.assertEqual(sorted(q['text'] for q in out['job']['existingQuestions']), ['Bank stem 0?', 'Bank stem 1?', 'Bank stem 2?'])
        stored = self.job(older['id'])
        self.assertEqual((stored['status'], stored['workerId'], stored['claimCount']), ('CLAIMED', 'w-1', 1))
        self.assertEqual(self.job(newer['id'])['status'], 'QUEUED')
        self.assertNotIn('ai_generation_jobs', self.full_loads)
        self.assertNotIn('questions', self.full_loads, "never the whole question bank")

    def test_no_job_available(self):
        self.put_job(make_job('Done', status='COMPLETED'))
        code, out, _ = self.call('claim', {'workerId': 'w-1'})
        self.assertEqual((code, out['success'], out['job']), (200, True, None))

    def test_two_simultaneous_claims_give_the_job_to_exactly_one_worker(self):
        self.db.read_delay = 0.05   # both requests read the QUEUED job before either writes
        for rnd in range(5):
            job = make_job(f'Race {rnd}')
            self.put_job(job)
            barrier, got = threading.Barrier(2), {}

            def claim(worker):
                barrier.wait()
                got[worker] = self.call('claim', {'workerId': worker})

            threads = [threading.Thread(target=claim, args=(w,)) for w in ('w-a', 'w-b')]
            [t.start() for t in threads]
            [t.join() for t in threads]
            winners = [w for w, (c, o, _) in got.items() if c == 200 and (o.get('job') or {}).get('id') == job['id']]
            self.assertEqual(len(winners), 1, got)
            self.assertEqual(self.job(job['id'])['workerId'], winners[0])
            self.assertEqual(self.job(job['id'])['claimCount'], 1)
            loser = next(w for w in got if w != winners[0])
            self.assertEqual(got[loser][0], 200)
            self.assertIsNone(got[loser][1]['job'], "the loser gets no job (none left), not the same one")
            self.db['ai_generation_jobs'].update_one({'_id': job['id']}, {'$set': {'status': 'FAILED'}})

    def test_heartbeat_while_a_job_runs_renews_lease_and_never_overwrites_progress(self):
        job = make_job('Running')
        self.put_job(job)
        self.call('claim', {'workerId': 'w-1'})
        lease0 = self.job(job['id'])['leaseExpiresTs']
        time.sleep(0.01)
        code, out, _ = self.call('heartbeat', {'workerId': 'w-1', 'status': 'busy', 'currentJobId': job['id'], 'ollamaHealthy': True})
        self.assertEqual((code, out['jobLeaseValid']), (200, True))
        self.assertGreater(self.job(job['id'])['leaseExpiresTs'], lease0)
        self.assertEqual(out['worker']['currentJobTitle'], 'Running')

        self.db.read_delay = 0.03
        stop, hb = threading.Event(), []

        def heartbeats():
            while not stop.is_set():
                hb.append(self.call('heartbeat', {'workerId': 'w-1', 'status': 'busy', 'currentJobId': job['id'], 'ollamaHealthy': True})[0])

        t = threading.Thread(target=heartbeats)
        t.start()
        for i in range(1, 5):
            q = {'id': f'q-{i}', 'text': f'Question {i}?'}
            code, out, _ = self.call('progress', {'workerId': 'w-1', 'jobId': job['id'], 'stage': 'batch_complete', 'newQuestions': [q]})
            self.assertEqual(code, 200, out)
        stop.set()
        t.join()
        self.assertGreater(len(hb), 2)
        self.assertTrue(all(c == 200 for c in hb))
        self.assertEqual([q['id'] for q in self.job(job['id'])['generatedQuestions']], ['q-1', 'q-2', 'q-3', 'q-4'],
                         "concurrent heartbeats never overwrite progress")

    def test_heartbeat_for_cancelled_or_foreign_job_reports_lease_invalid(self):
        job = make_job('Cancelled')
        self.put_job(job)
        self.call('claim', {'workerId': 'w-1'})
        code, out, _ = self.call('heartbeat', {'workerId': 'w-2', 'currentJobId': job['id'], 'ollamaHealthy': True})
        self.assertIs(out['jobLeaseValid'], False)
        self.db['ai_generation_jobs'].update_one({'_id': job['id']}, {'$set': {'status': 'FAILED'}})
        code, out, _ = self.call('heartbeat', {'workerId': 'w-1', 'currentJobId': job['id'], 'ollamaHealthy': True})
        self.assertIs(out['jobLeaseValid'], False)
        code, out, _ = self.call('progress', {'workerId': 'w-1', 'jobId': job['id'], 'stage': 'generating', 'newQuestions': [{'id': 'q'}]})
        self.assertEqual(code, 409)
        self.assertEqual(self.job(job['id'])['status'], 'FAILED', "a late worker write never revives a cancelled job")

    def test_complete_hosts_test_and_questions(self):
        job = make_job('Complete me')
        self.put_job(job)
        self.call('claim', {'workerId': 'w-1'})
        qs = [{'id': f'q-{i}', 'text': f'Question {i}?', 'question': f'Question {i}?', 'optionA': 'a', 'optionB': 'b',
               'optionC': 'c', 'optionD': 'd', 'correctOption': 'A'} for i in range(1, 5)]
        code, out, _ = self.call('complete', {'workerId': 'w-1', 'jobId': job['id'], 'questions': qs, 'metrics': {}})
        self.assertEqual(code, 200, out)
        stored = self.job(job['id'])
        self.assertEqual(stored['status'], 'COMPLETED')
        self.assertIn(stored['testId'], self.db['tests'].docs)
        self.assertEqual(len([q for q in self.db['questions'].docs.values() if q.get('testId') == stored['testId']]), 4)

    def test_malformed_body_is_a_400(self):
        req = urllib.request.Request(self.base + '/api/admin/ai/worker/heartbeat', data=b'{not json', method='POST',
                                     headers={'Content-Type': 'application/json', 'X-Worker-Token': SECRET})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=10)
        self.assertEqual(ctx.exception.code, 400)


class TestWorkerRoutesLocalStore(WorkerRoutesBase):
    """Local development without MongoDB keeps working through the JSON store."""
    mongo = False

    def test_heartbeat_claim_progress_locally(self):
        job = make_job('Local job')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump({'users': {}, 'ai_generation_jobs': [job], 'questions': [], 'tests': [], 'ai_scheduled_tasks': []}, f)
        code, out, _ = self.call('heartbeat', {'workerId': 'w-1', 'ollamaHealthy': True})
        self.assertEqual((code, out['worker']['online']), (200, True))
        code, out, _ = self.call('claim', {'workerId': 'w-1'})
        self.assertEqual(out['job']['id'], job['id'])
        code, out, _ = self.call('heartbeat', {'workerId': 'w-1', 'currentJobId': job['id'], 'ollamaHealthy': True})
        self.assertIs(out['jobLeaseValid'], True)
        code, out, _ = self.call('progress', {'workerId': 'w-1', 'jobId': job['id'], 'stage': 'generating', 'newQuestions': [{'id': 'q1'}]})
        self.assertEqual(code, 200)
        code, out, _ = self.call('claim', {'workerId': 'w-2'})
        self.assertIsNone(out['job'])


if __name__ == '__main__':
    unittest.main()
