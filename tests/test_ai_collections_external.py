"""
ai_generation_jobs and ai_source_documents live only in MongoDB while it is reachable: they are not loaded
from, fingerprinted in, or written to the per-instance JSON store, yet every AI endpoint, the worker routes
and the scheduler still see them. Runs the real HTTP handler against the in-memory MongoDB stand-in.
"""
import json
import os
import sys
import time
import unittest
import urllib.error
import urllib.request
from datetime import timedelta
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_scheduler
import mongodb_manager
import server
from test_worker_routes import WorkerRoutesBase, make_job

ADMIN_TOKEN = 'sess_' + 'Q' * 43
AI = ('ai_generation_jobs', 'ai_source_documents')


def admin_user():
    return {'id': 'usr-admin', 'email': 'admin@example.com', 'username': 'admin', 'role': 'admin', 'name': 'Admin',
            'isActive': True, 'password': 'sha256:x:y', 'token': ADMIN_TOKEN, 'sessionTokens': [ADMIN_TOKEN]}


def source_doc(doc_id, uploaded_at, **extra):
    d = {'id': doc_id, 'filename': f'{doc_id}.pdf', 'status': 'COMPLETED', 'isActive': True, 'uploadedAt': uploaded_at,
         'chunks': [{'id': f'{doc_id}-c1', 'text': 'Demand and supply', 'isActive': True}]}
    d.update(extra)
    return d


class AiCollectionsBase(WorkerRoutesBase):
    legacy_ai_in_file = False

    def setUp(self):
        super().setUp()
        store = {'users': {'admin@example.com': admin_user()}, 'questions': [], 'ai_scheduled_tasks': [],
                 'tests': [{'id': 't-1', 'title': 'One', 'updatedAt': '2026-09-01T00:00:00+00:00'}]}
        if self.legacy_ai_in_file:
            store['ai_generation_jobs'] = [dict(make_job('Legacy job'), id='job-legacy')]
            store['ai_source_documents'] = [source_doc('doc-legacy', '2026-01-01T00:00:00+00:00')]
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(store, f)

    def disk(self):
        with open(self.store, encoding='utf-8') as f:
            return json.load(f)

    def admin(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {ADMIN_TOKEN}'})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'{}')

    def put_doc(self, doc):
        self.db['ai_source_documents'].replace_one({'_id': doc['id']}, dict(doc, _id=doc['id']))


class TestAiCollectionsStayInMongo(AiCollectionsBase):
    def test_load_does_not_bring_ai_collections_into_the_datastore(self):
        self.put_job(make_job('In Mongo'))
        self.put_doc(source_doc('doc-1', '2026-09-01T00:00:00+00:00'))
        data = server.load_backend_data()
        for key in AI:
            self.assertEqual(data[key], [], f'{key} is not loaded into the general datastore (empty placeholder only)')
        snapshot = server._load_snapshots[id(data)][1]
        self.assertTrue(all(not snapshot.get(k) for k in AI), 'no AI document is fingerprinted on a normal load')
        self.assertFalse(set(AI) & set(self.full_loads), 'a normal load reads nothing from the AI collections')

    def test_ai_collections_are_read_from_mongo_when_requested_even_within_the_refresh_throttle(self):
        self.put_doc(source_doc('doc-old', '2026-09-01T00:00:00+00:00'))
        self.put_doc(source_doc('doc-new', '2026-09-20T00:00:00+00:00'))
        for _ in range(2):   # second call within the 10 s per-collection throttle: no file copy to fall back on
            code, out = self.admin('GET', '/api/admin/ai/documents')
            self.assertEqual(code, 200)
            self.assertEqual([d['id'] for d in out['documents']], ['doc-new', 'doc-old'], 'newest first')
        self.assertNotIn('ai_source_documents', self.disk())

    def test_source_document_toggle_and_delete_use_mongo(self):
        self.put_doc(source_doc('doc-1', '2026-09-01T00:00:00+00:00'))
        code, out = self.admin('POST', '/api/admin/ai/documents/toggle-active', {'documentId': 'doc-1', 'isActive': False})
        self.assertEqual((code, out['document']['isActive']), (200, False))
        self.assertFalse(self.db['ai_source_documents'].docs['doc-1']['isActive'])
        code, _ = self.admin('POST', '/api/admin/ai/documents/delete', {'documentId': 'doc-1'})
        self.assertEqual(code, 200)
        self.assertNotIn('doc-1', self.db['ai_source_documents'].docs)
        code, _ = self.admin('POST', '/api/admin/ai/documents/delete', {'documentId': 'doc-1'})
        self.assertEqual(code, 404, 'a deleted document is gone (no stale copy in the file)')
        self.assertNotIn('ai_source_documents', self.disk())

    def test_job_creation_status_and_worker_claim(self):
        code, _, _ = self.call('heartbeat', {'workerId': 'w-1', 'status': 'idle', 'ollamaHealthy': True, 'latencyMs': 5})
        self.assertEqual(code, 200)
        code, out = self.admin('POST', '/api/admin/ai/jobs/generate', {
            'title': 'Created now', 'subject': 'Business Economics', 'topic': 'Theory of Demand and Supply',
            'chapter': 'Theory of Demand and Supply', 'count': 4})
        self.assertEqual(code, 200, out)
        job_id = out['job']['id']
        self.assertEqual(self.job(job_id)['status'], 'QUEUED', 'the new job is stored in MongoDB')
        self.assertNotIn('ai_generation_jobs', self.disk(), 'and not in the JSON store')

        code, out = self.admin('GET', f'/api/admin/ai/jobs/status?jobId={job_id}')
        self.assertEqual((code, out['job']['id'], out['job']['status']), (200, job_id, 'QUEUED'))
        code, out = self.admin('GET', '/api/admin/ai/jobs/active')
        self.assertEqual((code, out['hasActiveJob'], out['job']['id']), (200, True, job_id))

        code, out, _ = self.call('claim', {'workerId': 'w-1'})
        self.assertEqual((code, out['job']['id']), (200, job_id))
        self.assertEqual(self.job(job_id)['status'], 'CLAIMED')
        code, out = self.admin('GET', f'/api/admin/ai/jobs/status?jobId={job_id}')
        self.assertEqual(out['job']['status'], 'CLAIMED', 'status reflects the worker claim made in MongoDB')

    def test_status_of_a_finished_job_that_exists_only_in_mongo(self):
        job = make_job('Finished elsewhere', status='FAILED', error='boom', updatedTs=time.time())
        self.put_job(job)
        code, out = self.admin('GET', f"/api/admin/ai/jobs/status?jobId={job['id']}")
        self.assertEqual((code, out['job']['status']), (200, 'FAILED'))
        code, _ = self.admin('GET', '/api/admin/ai/jobs/status?jobId=job-missing')
        self.assertEqual(code, 404)

    def test_cancel_and_reset_reach_jobs_in_mongo(self):
        job = make_job('To cancel')
        self.put_job(job)
        code, out = self.admin('POST', '/api/admin/ai/jobs/cancel', {'jobId': job['id']})
        self.assertEqual(code, 200, out)
        self.assertNotIn(self.job(job['id'])['status'], ('QUEUED', 'CLAIMED', 'GENERATING'))

    def test_save_never_erases_or_reuploads_ai_mongo_data(self):
        for i in range(3):
            self.put_job(make_job(f'Job {i}', status='COMPLETED'))
        writes = []
        coll = self.db['ai_generation_jobs']
        original_replace = coll.replace_one
        coll.replace_one = lambda flt, doc, upsert=False: (writes.append(flt['_id']), original_replace(flt, doc, upsert))[1]
        server._collection_last_synced.clear()
        data = server.load_backend_data(refresh_collections=['ai_generation_jobs', 'tests'])
        self.assertEqual(len(data['ai_generation_jobs']), 3)
        data['tests'][0]['title'] = 'One (edited)'
        data['ai_generation_jobs'] = []             # even if a request drops them in memory
        server.save_backend_data(data)
        self.assertEqual(len(coll.docs), 3, 'MongoDB AI jobs are never deleted by a save')
        self.assertEqual(writes, [], 'unchanged AI documents read from MongoDB are not re-uploaded')
        self.assertEqual(self.disk()['tests'][0]['title'], 'One (edited)', 'non-AI data still persists to the file')
        self.assertEqual(self.db['tests'].docs['t-1']['title'], 'One (edited)', 'and to MongoDB')
        self.assertNotIn('ai_generation_jobs', self.disk())

    def test_scheduler_sees_the_job_a_processing_task_waits_for(self):
        now = ai_scheduler.get_now_utc()
        old = ai_scheduler.format_iso_utc(now - timedelta(hours=1))
        task = {'id': 'sch-1', 'name': 'Nightly', 'scheduleType': 'once', 'enabled': True, 'status': 'processing',
                'activeJobId': 'job-waited', 'updatedAt': old, 'processingSince': old, 'claimedAt': old}
        self.db['ai_scheduled_tasks'].replace_one({'_id': 'sch-1'}, dict(task, _id='sch-1'))
        self.put_job(dict(make_job('Waited for', status='FAILED', error='boom'), id='job-waited'))

        def reconcile(fetch_jobs):
            server._collection_last_synced.clear()
            data = server.load_backend_data(refresh_collections=['ai_scheduled_tasks'])
            if fetch_jobs:
                server.refresh_relevant_jobs(data)   # what run_due_scheduler_tasks does before evaluating tasks
            return ai_scheduler.reconcile_processing_tasks(data, lambda d: None, None, transition_fn=lambda *a: True)

        with patch.object(ai_scheduler, 'MISSING_JOB_GRACE_SECONDS', 60):
            self.assertEqual(reconcile(True)[0]['action'], 'applied_missed_outcome',
                             "the task's job is found in MongoDB, so its real outcome is applied")
            self.db['ai_scheduled_tasks'].replace_one({'_id': 'sch-1'}, dict(task, _id='sch-1'))
            self.assertEqual(reconcile(False)[0]['action'], 'recovered_lost_job',
                             'control: without the MongoDB read the job would look lost')

    def test_cold_start_does_not_pull_ai_collections_into_the_datastore(self):
        seed_dir = os.path.join(self.tmp, 'bundle')
        os.makedirs(seed_dir)
        with open(os.path.join(seed_dir, 'backend_data.json'), 'w', encoding='utf-8') as f:
            json.dump({'users': {'admin@example.com': admin_user()}, 'tests': [],
                       'ai_generation_jobs': [dict(make_job('Seed job'), id='job-seed')],
                       'ai_source_documents': [source_doc('doc-seed', '2026-01-01T00:00:00+00:00')]}, f)
        os.remove(self.store)
        self.put_job(make_job('Live job'))
        self.put_doc(source_doc('doc-live', '2026-09-01T00:00:00+00:00'))
        self.full_loads.clear()
        with patch.object(server, 'BASE_DIR', seed_dir):
            data = server.load_backend_data()
        self.assertFalse(set(AI) & set(self.full_loads), 'cold start downloads no AI collection')
        self.assertFalse(set(AI) & set(self.disk()), 'the new instance file holds no AI collection')
        self.assertEqual([data[k] for k in AI], [[], []], 'the seed copies were not loaded either')
        self.assertIn('admin@example.com', self.disk()['users'], 'the rest of the seed is still used')


class TestExistingFileWithAiCollections(AiCollectionsBase):
    legacy_ai_in_file = True

    def test_old_file_copies_are_ignored_but_never_deleted(self):
        before = self.disk()
        self.put_doc(source_doc('doc-mongo', '2026-09-01T00:00:00+00:00'))
        code, out = self.admin('GET', '/api/admin/ai/documents')
        self.assertEqual([d['id'] for d in out['documents']], ['doc-mongo'], 'MongoDB is authoritative')
        data = server.load_backend_data()
        self.assertEqual([data[k] for k in AI], [[], []], 'the file copies are ignored')
        data['tests'][0]['title'] = 'Edited'
        server.save_backend_data(data)
        after = self.disk()
        self.assertEqual(after['tests'][0]['title'], 'Edited')
        for key in AI:
            self.assertEqual(after[key], before[key], f'{key} in an existing file is kept untouched')


class TestWithoutMongoDbTheFileKeepsAiCollections(AiCollectionsBase):
    mongo = False

    def test_local_development_store_keeps_jobs(self):
        data = server.load_backend_data()
        self.assertIn('ai_generation_jobs', data)
        data['ai_generation_jobs'].append(make_job('Local job'))
        server.save_backend_data(data)
        self.assertEqual([j['title'] for j in self.disk()['ai_generation_jobs']], ['Local job'])


if __name__ == '__main__':
    unittest.main()
