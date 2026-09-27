"""
Recovery of scheduled tasks stuck in 'processing' (worker crashed/offline, job lost, or the job's
result never reached the task). Real ai_job_manager + ai_scheduler on an in-memory store; the
concurrency test uses the in-memory MongoDB fake from test_scheduler_reliability.
"""
import copy
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_job_manager as jm
import ai_scheduler
import mongodb_manager
from tests.test_qwen_job_lifecycle import LifecycleBase, make_q
from tests.test_scheduler_reliability import DB


class RecoveryBase(LifecycleBase):
    def setUp(self):
        super().setUp()
        self.now_patch = patch.object(ai_scheduler, 'get_now_utc',
                                      side_effect=lambda: datetime.fromtimestamp(self.clock.now, timezone.utc))
        self.now_patch.start()
        self.time_patch = patch('time.time', side_effect=lambda: self.clock.now)
        self.time_patch.start()

    def tearDown(self):
        self.time_patch.stop()
        self.now_patch.stop()
        super().tearDown()

    def daily_task(self, **kw):
        t = {'id': 'task-d', 'name': 'Daily Econ', 'enabled': True, 'status': 'scheduled', 'scheduleType': 'recurring',
             'dailyTime': '20:00', 'subject': 'Business Economics', 'chapter': 'Theory of Demand and Supply',
             'topic': 'Theory of Demand and Supply', 'questionCount': 4, 'isLiveEvent': False, 'executionCount': 0}
        t.update(kw)
        self.data['ai_scheduled_tasks'].append(t)
        return t

    def dispatch(self, task):
        self.heartbeat()
        ok, err, res = ai_scheduler.dispatch_scheduled_task(task, self.data, self.save, None)
        self.assertTrue(ok, err)
        return res['job']

    def tick(self, transition_fn=None):
        return ai_scheduler.process_due_tasks(self.data, self.save, None, transition_fn=transition_fn)

    def advance(self, seconds):
        self.clock.now += seconds

    def jobs_for(self, task_id):
        return [j for j in self.data['ai_generation_jobs'] if j.get('scheduledTaskId') == task_id]


class TestStuckProcessing(RecoveryBase):
    def test_1_normal_processing_to_success_is_untouched(self):
        task = self.daily_task()
        job = self.dispatch(task)
        self.advance(300)                           # a few minutes into generation
        self.heartbeat()
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        res = self.tick()
        self.assertEqual([r for r in res['results'] if r.get('taskId') == 'task-d'], [], 'healthy run is not recovered')
        self.assertEqual(task['status'], 'processing')
        jm.complete_job_from_worker(job['id'], 'w1', [make_q(i, 'ok') for i in range(1, 5)], {}, self.data, self.save)
        self.assertEqual(task['status'], 'scheduled')     # non-live daily task -> next day
        self.assertEqual(task['executionCount'], 1)
        self.assertIsNone(task['activeJobId'])
        self.assertEqual(len(self.jobs_for('task-d')), 1)

    def test_2_and_3_worker_gone_job_goes_stale_and_task_recovers(self):
        task = self.daily_task()
        job = self.dispatch(task)
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        self.advance(jm.JOB_LEASE_SECONDS + 10)     # worker crashed: no heartbeat, lease expired
        self.tick()                                   # 1st expiry re-queues the job (claim 1 of 2)
        stored = jm.JobRepository(self.data).get(job['id'])
        self.assertEqual(stored['status'], 'QUEUED')
        self.assertEqual(task['status'], 'processing', 'still recoverable by a worker; not failed yet')
        self.advance(jm.QUEUE_TIMEOUT_SECONDS + 10)   # nobody claims it again
        res = self.tick()
        self.assertEqual(stored['status'], 'EXPIRED')
        self.assertEqual(task['status'], 'scheduled', 'recurring task is free for its next occurrence')
        self.assertIn('No Local Qwen Worker claimed', task['lastError'])
        self.assertEqual(task['failureCount'], 1)
        self.assertGreater(ai_scheduler.parse_iso_utc(task['nextRunAt']).timestamp(), self.clock.now)

    def test_3b_result_never_reached_task_is_applied_later(self):
        task = self.daily_task()
        job = self.dispatch(task)
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        with patch.object(jm, '_notify_scheduler', lambda *a: None):   # outcome lost (e.g. other instance)
            jm.complete_job_from_worker(job['id'], 'w1', [make_q(i, 'lost') for i in range(1, 5)], {}, self.data, self.save)
        self.assertEqual(task['status'], 'processing')
        self.advance(ai_scheduler.TASK_PROCESSING_CHECK_AFTER_SECONDS + 5)
        res = self.tick()
        self.assertIn('applied_missed_outcome', [r['action'] for r in res['results']])
        self.assertEqual(task['status'], 'scheduled')
        self.assertEqual(task['executionCount'], 1)
        self.assertEqual(task['lastTestId'], jm.JobRepository(self.data).get(job['id'])['testId'])
        self.assertEqual(len(self.jobs_for('task-d')), 1, 'no new generation')
        self.assertEqual(task['recoveryHistory'][-1]['action'], 'applied_missed_outcome')

    def test_3c_lost_job_record_after_grace(self):
        task = self.daily_task(status='processing', activeJobId=None,
                               updatedAt=ai_scheduler.format_iso_utc(datetime.fromtimestamp(self.clock.now, timezone.utc)))
        self.advance(ai_scheduler.TASK_PROCESSING_CHECK_AFTER_SECONDS + 5)
        self.tick()
        self.assertEqual(task['status'], 'processing', 'within the grace period nothing happens')
        self.advance(ai_scheduler.MISSING_JOB_GRACE_SECONDS)
        res = self.tick()
        self.assertIn('recovered_lost_job', [r['action'] for r in res['results']])
        self.assertEqual(task['status'], 'scheduled')
        self.assertIn('never started a generation job', task['lastError'])

    def test_3d_hung_worker_that_keeps_heartbeating_is_cut_off(self):
        task = self.daily_task()
        job = self.dispatch(task)
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        for _ in range(int(ai_scheduler.PROCESSING_MAX_SECONDS // 600) + 1):
            self.advance(600)
            self.heartbeat(job_id=job['id'])         # lease renewed forever, no result
            self.tick()
        self.assertEqual(jm.JobRepository(self.data).get(job['id'])['status'], 'FAILED')
        self.assertEqual(task['status'], 'scheduled')
        self.assertIn('Cancelled by scheduler recovery', task['lastError'])
        ok, err, _ = jm.update_job_progress_from_worker(job['id'], 'w1', {'stage': 'generating'}, self.data, self.save)
        self.assertFalse(ok, 'late worker updates are refused')
        ok, err, _, code = jm.complete_job_from_worker(job['id'], 'w1', [make_q(1, 'late')], {}, self.data, self.save)
        self.assertEqual((ok, code), (False, 409), 'nothing is hosted twice')

    def test_4_one_time_task_stays_failed_after_recovery(self):
        task = self.daily_task(scheduleType='one_time', status='processing', activeJobId='job-gone',
                               updatedAt=ai_scheduler.format_iso_utc(datetime.fromtimestamp(self.clock.now, timezone.utc)))
        self.advance(ai_scheduler.MISSING_JOB_GRACE_SECONDS + 200)
        self.tick()
        self.assertEqual(task['status'], 'failed')
        self.assertIn('job-gone was lost', task['lastError'])

    def test_4b_weekly_task_next_occurrence_is_schedulable(self):
        task = self.daily_task(scheduleType='weekly', weekdays=[0], dailyTime='18:30', status='processing',
                               activeJobId='job-gone',
                               updatedAt=ai_scheduler.format_iso_utc(datetime.fromtimestamp(self.clock.now, timezone.utc)))
        self.advance(ai_scheduler.MISSING_JOB_GRACE_SECONDS + 200)
        self.tick()
        nxt = ai_scheduler.parse_iso_utc(task['nextRunAt']).astimezone(ai_scheduler.IST_TZ)
        self.assertEqual((task['status'], nxt.weekday(), nxt.strftime('%H:%M')), ('scheduled', 0, '18:30'))
        self.assertTrue(ai_scheduler.is_due_to_start(task, ai_scheduler.parse_iso_utc(task['nextRunAt'])))

    def test_5_recovery_never_generates_and_late_result_cannot_hijack_the_task(self):
        task = self.daily_task(isLiveEvent=True, liveDurationMinutes=30)
        job = self.dispatch(task)
        jm.claim_pending_job_for_worker('w1', self.data, self.save)
        # the job record vanishes from this instance (e.g. pruned) -> recovered as lost
        self.data['ai_generation_jobs'] = [j for j in self.data['ai_generation_jobs'] if j['id'] != job['id']]
        self.advance(ai_scheduler.MISSING_JOB_GRACE_SECONDS + 200)
        self.tick()
        self.assertEqual(task['status'], 'scheduled')
        self.assertEqual(self.jobs_for('task-d'), [], 'recovery itself queued nothing')
        # the old job's outcome arrives later: ignored for the task
        late_job = dict(job, status='COMPLETED', testId='tst-late')
        ai_scheduler.apply_job_outcome_to_task(late_job, {'id': 'tst-late', 'title': 'late'}, self.data)
        self.assertEqual(task['status'], 'scheduled')
        self.assertNotEqual(task.get('lastTestId'), 'tst-late')

    def test_6_concurrent_instances_recover_the_same_task_once(self):
        stuck = {'id': 'task-c', 'name': 'Concurrent', 'enabled': True, 'status': 'processing', 'scheduleType': 'recurring',
                 'dailyTime': '20:00', 'activeJobId': 'job-gone', 'executionCount': 0,
                 'updatedAt': ai_scheduler.format_iso_utc(datetime.fromtimestamp(self.clock.now, timezone.utc))}
        db = DB()
        db['ai_scheduled_tasks'].replace_one({'_id': 'task-c'}, dict(stuck, _id='task-c'))
        self.advance(ai_scheduler.MISSING_JOB_GRACE_SECONDS + 200)
        instances = [{'ai_scheduled_tasks': [copy.deepcopy(stuck)], 'ai_generation_jobs': [], 'tests': []} for _ in range(3)]
        with patch.object(mongodb_manager, 'get_database', return_value=db), patch.object(ai_scheduler, 'IS_SERVERLESS', True):
            outcomes = [ai_scheduler.reconcile_processing_tasks(d, lambda x: None, None,
                                                                transition_fn=mongodb_manager.transition_scheduled_task)
                        for d in instances]
        self.assertEqual(sum(len(o) for o in outcomes), 1, 'exactly one instance recovers the task')
        winners = [d['ai_scheduled_tasks'][0] for d, o in zip(instances, outcomes) if o]
        losers = [d['ai_scheduled_tasks'][0] for d, o in zip(instances, outcomes) if not o]
        self.assertEqual(winners[0]['failureCount'], 1)
        self.assertTrue(all(t['status'] == 'processing' and 'failureCount' not in t for t in losers), 'losers untouched')

    def test_worker_call_on_other_instance_sees_the_current_job(self):
        """Claimed on instance A, completed on instance B whose cached copy still says QUEUED."""
        import server
        task = self.daily_task()
        job = self.dispatch(task)
        stale_b = copy.deepcopy(self.data)                         # instance B cached the QUEUED job
        claimed = jm.claim_pending_job_for_worker('w1', self.data, self.save)   # instance A
        db = DB()
        db['ai_generation_jobs'].replace_one({'_id': job['id']}, dict(jm.JobRepository(self.data).get(job['id']), _id=job['id']))
        db['ai_scheduled_tasks'].replace_one({'_id': 'task-d'}, dict(task, _id='task-d'))
        ok, err, _, code = jm.complete_job_from_worker(job['id'], 'w1', [make_q(i, 'x') for i in range(1, 5)], {}, copy.deepcopy(stale_b), self.save)
        self.assertEqual((ok, code), (False, 409), 'without the refresh the stale copy refuses the result')
        with patch.object(mongodb_manager, 'get_database', return_value=db), \
                patch.object(mongodb_manager, 'is_database_connected', return_value=True):
            server.refresh_job_document(stale_b, job['id'])
        ok, err, _, code = jm.complete_job_from_worker(job['id'], 'w1', [make_q(i, 'x') for i in range(1, 5)], {}, stale_b, self.save)
        self.assertTrue(ok, err)
        b_task = next(t for t in stale_b['ai_scheduled_tasks'] if t['id'] == 'task-d')
        self.assertEqual((b_task['status'], b_task['executionCount']), ('scheduled', 1))

    def test_cheap_check_notices_old_processing_tasks_only(self):
        task = self.daily_task(status='processing', activeJobId='j',
                               updatedAt=ai_scheduler.format_iso_utc(datetime.fromtimestamp(self.clock.now, timezone.utc)),
                               nextRunAt='2099-01-01T00:00:00Z')
        now = lambda: datetime.fromtimestamp(self.clock.now, timezone.utc)
        self.assertFalse(ai_scheduler.has_due_work(self.data, now()), 'fresh dispatch: no full tick')
        self.advance(ai_scheduler.TASK_PROCESSING_CHECK_AFTER_SECONDS + 1)
        self.assertTrue(ai_scheduler.has_due_work(self.data, now()))


if __name__ == '__main__':
    unittest.main()
