"""
Generation job lifecycle for the Local Qwen Worker architecture (ai_job_manager + ai_scheduler).
Pure in-memory data store; no server, no Ollama, no database.
"""
import os
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_job_manager as jm
import ai_scheduler
import ai_provider_manager

PARAMS = {
    'title': 'Demand & Supply Drill', 'subject': 'Business Economics', 'topic': 'Theory of Demand and Supply',
    'chapter': 'Theory of Demand and Supply', 'examLevel': 'CA Foundation', 'difficulty': 'ICAI Exam Standard',
    'count': 4, 'marksPerCorrect': 2.0, 'negativeMarksPerWrong': 0.5, 'platformXp': 10,
}


def make_q(i, job_id='job'):
    return {'id': f'q-{job_id}-{i}', 'text': f'Question {i} about demand?', 'question': f'Question {i} about demand?',
            'optionA': 'a', 'optionB': 'b', 'optionC': 'c', 'optionD': 'd', 'correctOption': 'A',
            'subject': 'Business Economics', 'chapterId': 'ch-fnd-eco-2', 'negativeMarks': 0.5}


class Clock:
    def __init__(self):
        self.now = 1_800_000_000.0

    def __call__(self):
        return self.now


class LifecycleBase(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.patch = patch.object(jm, '_now_ts', self.clock)
        self.patch.start()
        self.data = {'tests': [], 'questions': [], 'ai_generation_jobs': [], 'ai_generation_logs': [], 'ai_scheduled_tasks': []}
        self.saves = 0

    def tearDown(self):
        self.patch.stop()

    def save(self, data):
        self.saves += 1

    def heartbeat(self, worker_id='w1', job_id=None, latency=12.5, ollama=True):
        return jm.update_worker_heartbeat({'workerId': worker_id, 'currentJobId': job_id, 'latencyMs': latency,
                                           'ollamaHealthy': ollama, 'model': 'qwen3:8b'}, self.data, self.save)

    def create(self, **overrides):
        ok, err, job = jm.create_generation_job(dict(PARAMS, **overrides), self.data, self.save)
        self.assertTrue(ok, err)
        return job


class TestJobCreationAndClaim(LifecycleBase):
    def test_create_resolves_canonical_chapter(self):
        job = self.create()
        self.assertEqual(job['status'], 'QUEUED')
        self.assertEqual(job['chapterId'], 'ch-fnd-eco-2')
        self.assertEqual(job['subject'], 'Business Economics')
        self.assertEqual(job['negativeMarksPerWrong'], 0.5)

    def test_create_rejects_unknown_chapter(self):
        ok, err, job = jm.create_generation_job(dict(PARAMS, chapter='Nope Xyzzy', topic='Nope Xyzzy'), self.data, self.save)
        self.assertFalse(ok)
        self.assertIn('could not be resolved', err)

    def test_claim_is_exclusive_and_fifo(self):
        first = self.create(title='A')
        self.clock.now += 20
        second = self.create(title='B')
        c1 = jm.claim_pending_job_for_worker('w1', self.data, self.save)
        c2 = jm.claim_pending_job_for_worker('w2', self.data, self.save)
        c3 = jm.claim_pending_job_for_worker('w3', self.data, self.save)
        self.assertEqual((c1['id'], c2['id']), (first['id'], second['id']))
        self.assertIsNone(c3, "no job may be handed to a second worker while leased")
        self.assertEqual(c1['status'], 'CLAIMED')
        self.assertIn('existingQuestions', c1)

    def test_claimed_job_counts_as_active(self):
        job = self.create()
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        active = jm.get_active_generation_job(self.data, self.save)
        self.assertEqual(active['id'], job['id'])
        self.assertEqual(active['status'], 'CLAIMED')

    def test_restarted_worker_with_same_id_resumes_its_job(self):
        job = self.create()
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        again = jm.claim_pending_job_for_worker('w1', self.data, self.save)
        self.assertEqual(again['id'], job['id'])
        self.assertEqual(again['claimCount'], 1)


class TestLeaseAndProgress(LifecycleBase):
    def setUp(self):
        super().setUp()
        self.job = self.create()
        jm.claim_pending_job_for_worker('w1', self.data, self.save)

    def job_now(self):
        return next(j for j in self.data['ai_generation_jobs'] if j['id'] == self.job['id'])

    def test_progress_saves_questions_and_maps_stage(self):
        ok, err, code = jm.update_job_progress_from_worker(self.job['id'], 'w1', {
            'stage': 'batch_complete', 'status': 'Verified 2 of 4', 'progressPct': 50,
            'newQuestions': [make_q(1), make_q(2)]}, self.data, self.save)
        self.assertEqual((ok, code), (True, 200))
        j = self.job_now()
        self.assertEqual(j['status'], 'GENERATING')
        self.assertEqual(j['generatedCount'], 2)
        jm.update_job_progress_from_worker(self.job['id'], 'w1', {'stage': 'validating', 'newQuestions': [make_q(2)]}, self.data, self.save)
        self.assertEqual(self.job_now()['status'], 'VALIDATING')
        self.assertEqual(self.job_now()['generatedCount'], 2, "re-sent questions are not duplicated")

    def test_other_worker_is_rejected(self):
        ok, err, code = jm.update_job_progress_from_worker(self.job['id'], 'w2', {'stage': 'generating'}, self.data, self.save)
        self.assertEqual((ok, code), (False, 409))
        ok, err, res, code = jm.complete_job_from_worker(self.job['id'], 'w2', [make_q(1)], {}, self.data, self.save)
        self.assertEqual((ok, code), (False, 409))

    def test_heartbeat_keeps_long_batch_alive(self):
        # a single Qwen batch runs for 5 minutes with no progress, but heartbeats keep arriving every 15s
        for _ in range(20):
            self.clock.now += 15
            res = self.heartbeat(job_id=self.job['id'])
            self.assertTrue(res['jobLeaseValid'])
        self.assertEqual(jm.get_active_generation_job(self.data, self.save)['id'], self.job['id'])
        self.assertEqual(jm.get_job_status(self.job['id'], self.data, self.save)['status'], 'CLAIMED')

    def test_heartbeat_from_wrong_worker_reports_lease_invalid(self):
        res = self.heartbeat(worker_id='w2', job_id=self.job['id'])
        self.assertIs(res['jobLeaseValid'], False)

    def test_expired_lease_requeues_with_saved_questions_then_finalises(self):
        jm.update_job_progress_from_worker(self.job['id'], 'w1', {'stage': 'batch_complete', 'newQuestions': [make_q(1), make_q(2)]}, self.data, self.save)
        self.clock.now += jm.JOB_LEASE_SECONDS + 1
        j = jm.get_job_status(self.job['id'], self.data, self.save)
        self.assertEqual(j['status'], 'QUEUED', "orphaned job is re-queued, not failed")
        self.assertEqual(len(j['generatedQuestions']), 2)
        # old worker comes back: its lease is gone
        ok, err, code = jm.update_job_progress_from_worker(self.job['id'], 'w1', {'stage': 'generating'}, self.data, self.save)
        self.assertEqual(code, 409)
        # second worker resumes, then also dies -> MAX_CLAIMS reached -> verified questions hosted as PARTIAL
        c = jm.claim_pending_job_for_worker('w2', self.data, self.save)
        self.assertEqual(len(c['generatedQuestions']), 2)
        self.clock.now += jm.JOB_LEASE_SECONDS + 1
        j = jm.get_job_status(self.job['id'], self.data, self.save)
        self.assertEqual(j['status'], 'PARTIAL')
        self.assertEqual(len(self.data['tests']), 1)

    def test_expired_lease_without_questions_ends_expired(self):
        self.clock.now += jm.JOB_LEASE_SECONDS + 1
        jm.get_job_status(self.job['id'], self.data, self.save)
        jm.claim_pending_job_for_worker('w2', self.data, self.save)
        self.clock.now += jm.JOB_LEASE_SECONDS + 1
        self.assertEqual(jm.get_job_status(self.job['id'], self.data, self.save)['status'], 'EXPIRED')
        self.assertIsNone(jm.get_active_generation_job(self.data, self.save), "no infinite loading")

    def test_complete_hosts_test_with_all_questions(self):
        qs = [make_q(i) for i in range(1, 5)]
        ok, err, res, code = jm.complete_job_from_worker(self.job['id'], 'w1', qs, {'durationSeconds': 200}, self.data, self.save)
        self.assertTrue(ok, err)
        j = self.job_now()
        self.assertEqual(j['status'], 'COMPLETED')
        test = self.data['tests'][0]
        self.assertEqual(test['totalQuestions'], 4)
        self.assertEqual(test['negativeMarksPerWrong'], 0.5)
        self.assertEqual(test['chapterId'], 'ch-fnd-eco-2')
        self.assertEqual([q['number'] for q in self.data['questions']], [1, 2, 3, 4])
        self.assertTrue(all(q['testId'] == test['id'] for q in self.data['questions']))
        self.assertEqual(self.data['ai_generation_logs'][0]['status'], 'COMPLETED')
        # idempotent retry from the same worker
        ok2, _, res2, _ = jm.complete_job_from_worker(self.job['id'], 'w1', qs, {}, self.data, self.save)
        self.assertTrue(ok2)
        self.assertEqual(len(self.data['tests']), 1)
        self.assertEqual(len(self.data['questions']), 4)

    def test_fail_after_partial_progress_hosts_partial(self):
        jm.update_job_progress_from_worker(self.job['id'], 'w1', {'stage': 'batch_complete', 'newQuestions': [make_q(1), make_q(2)]}, self.data, self.save)
        ok, err, code = jm.fail_job_from_worker(self.job['id'], 'w1', 'Ollama crashed', self.data, self.save)
        self.assertTrue(ok)
        self.assertEqual(self.job_now()['status'], 'PARTIAL')

    def test_fail_without_questions_is_failed(self):
        ok, err, code = jm.fail_job_from_worker(self.job['id'], 'w1', 'Ollama is not reachable', self.data, self.save)
        self.assertEqual(self.job_now()['status'], 'FAILED')
        self.assertIsNone(jm.get_active_generation_job(self.data, self.save))

    def test_admin_cancel_invalidates_worker_lease(self):
        jm.cancel_generation_job(self.job['id'], self.data, self.save)
        self.assertEqual(self.job_now()['status'], 'FAILED')
        self.assertIs(self.heartbeat(job_id=self.job['id'])['jobLeaseValid'], False)


class TestQueueTimeout(LifecycleBase):
    def test_unclaimed_job_expires(self):
        job = self.create()
        self.clock.now += jm.QUEUE_TIMEOUT_SECONDS + 1
        self.assertEqual(jm.get_job_status(job['id'], self.data, self.save)['status'], 'EXPIRED')

    def test_legacy_job_without_created_ts_expires(self):
        self.data['ai_generation_jobs'].append({'id': 'job-legacy', 'status': 'QUEUED', 'count': 2,
                                                'createdAt': '2026-01-01T00:00:00+00:00'})
        self.assertEqual(jm.get_job_status('job-legacy', self.data, self.save)['status'], 'EXPIRED')


class TestWorkerStatusAndTestConnection(LifecycleBase):
    def test_latency_none_is_safe_everywhere(self):
        self.heartbeat(latency=None)
        w = jm.get_worker_status(self.data)
        self.assertIsNone(w['lastLatencyMs'])
        res = ai_provider_manager.test_provider_connection('local_qwen', self.data)
        self.assertTrue(res['success'])
        self.assertIsNone(res['latency_ms'])
        cards = ai_provider_manager.get_sanitized_providers(self.data)
        self.assertEqual([c['id'] for c in cards], ['local_qwen'])

    def test_worker_latency_is_recorded_from_latencyMs(self):
        self.heartbeat(latency=17.26)
        self.assertEqual(jm.get_worker_status(self.data)['lastLatencyMs'], 17.3)
        self.assertEqual(ai_provider_manager.test_provider_connection('local_qwen', self.data)['latency_ms'], 17.3)

    def test_offline_and_ollama_down(self):
        with patch.object(ai_provider_manager, 'IS_SERVERLESS', True):
            res = ai_provider_manager.test_provider_connection('local_qwen', self.data)
            self.assertFalse(res['success'])
            self.assertEqual(res['status'], 'Worker Offline')
            self.heartbeat(ollama=False)
            res = ai_provider_manager.test_provider_connection('local_qwen', self.data)
            self.assertEqual(res['status'], 'Ollama Offline')
            self.clock.now += 61
            with patch('time.time', return_value=self.clock.now):
                self.assertFalse(jm.get_worker_status(self.data)['workerOnline'])

    def test_removed_cloud_provider_is_reported_not_crashing(self):
        res = ai_provider_manager.test_provider_connection('gemini_1', self.data)
        self.assertFalse(res['success'])
        self.assertIn('no longer supported', res['error'])


class TestAutoPilotWorkerDriven(LifecycleBase):
    def make_task(self, **kw):
        task = {'id': 'task-1', 'name': 'Daily Econ', 'enabled': True, 'status': 'scheduled', 'scheduleType': 'recurring',
                'subject': 'Business Economics', 'chapter': 'Theory of Demand and Supply', 'topic': 'Theory of Demand and Supply',
                'questionCount': 4, 'isLiveEvent': False, 'dailyTime': '20:00', 'negativeMarksPerWrong': 0.5}
        task.update(kw)
        self.data['ai_scheduled_tasks'].append(task)
        return task

    def test_dispatch_requires_online_worker(self):
        task = self.make_task()
        with patch('time.time', return_value=self.clock.now):
            ok, err, res = ai_scheduler.dispatch_scheduled_task(task, self.data, self.save, None)
        self.assertFalse(ok)
        self.assertEqual(task['status'], 'failed')
        self.assertEqual(self.data['ai_generation_jobs'], [])

    def test_dispatch_queues_job_and_completion_updates_task(self):
        task = self.make_task(isLiveEvent=True, liveDurationMinutes=30)
        with patch('time.time', return_value=self.clock.now):
            self.heartbeat()
            ok, err, res = ai_scheduler.dispatch_scheduled_task(task, self.data, self.save, None)
        self.assertTrue(ok, err)
        job = res['job']
        self.assertEqual(job['status'], 'QUEUED')
        self.assertEqual(job['scheduledTaskId'], 'task-1')
        self.assertEqual(task['status'], 'processing')
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        jm.complete_job_from_worker(job['id'], 'w1', [make_q(i, 'ap') for i in range(1, 5)], {}, self.data, self.save)
        self.assertEqual(task['status'], 'live')
        self.assertEqual(task['lastTestId'], self.data['tests'][0]['id'])
        self.assertTrue(self.data['tests'][0]['isLive'])

    def test_failed_job_marks_task_failed_and_reschedules(self):
        task = self.make_task()
        with patch('time.time', return_value=self.clock.now):
            self.heartbeat()
            ok, err, res = ai_scheduler.dispatch_scheduled_task(task, self.data, self.save, None)
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        jm.fail_job_from_worker(res['job']['id'], 'w1', 'Ollama is not reachable', self.data, self.save)
        self.assertEqual(task['status'], 'failed')
        self.assertIn('Ollama', task['lastError'])
        self.assertTrue(task['nextRunAt'])


class TestWorkerAuthentication(unittest.TestCase):
    def test_only_dedicated_worker_secret_is_accepted(self):
        import server
        with patch.dict(os.environ, {'AI_WORKER_SECRET': 'w-secret-123'}):
            self.assertTrue(server.is_authorized_ai_worker('w-secret-123'))
            self.assertFalse(server.is_authorized_ai_worker('token_admin_excellenceca_secret'))
            self.assertFalse(server.is_authorized_ai_worker('wrong'))
            self.assertFalse(server.is_authorized_ai_worker(None))
        with patch.dict(os.environ, {'AI_WORKER_SECRET': ''}):
            self.assertFalse(server.is_authorized_ai_worker('token_admin_excellenceca_secret'), "fails closed without a secret")

    def test_scheduler_tick_requires_auth(self):
        import server
        with patch.dict(os.environ, {'AI_WORKER_SECRET': 'w-secret-123', 'CRON_SECRET': 'cron-xyz'}):
            self.assertTrue(server.is_authorized_scheduler_tick('w-secret-123'))
            self.assertTrue(server.is_authorized_scheduler_tick('cron-xyz'))
            self.assertFalse(server.is_authorized_scheduler_tick(None))
            self.assertFalse(server.is_authorized_scheduler_tick('random-token'))


if __name__ == '__main__':
    unittest.main()
