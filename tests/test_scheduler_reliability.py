"""
Scheduler reliability: recurring failure recovery, atomic per-occurrence claims across instances,
header-only tick authentication and the cheap "anything due?" check.
MongoDB is an in-memory fake with the operators the scheduler uses; no real database is touched.
"""
import copy
import http.server
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_scheduler
import mongodb_manager
import server

IST = ai_scheduler.IST_TZ
CRON = 'cron-secret-for-tests-0123456789'
WORKER = 'worker-secret-for-tests-0123456789'


# ------------------------------------------------------------------ fake MongoDB
def _cmp(val, cond):
    if isinstance(cond, dict) and any(k.startswith('$') for k in cond):
        for op, arg in cond.items():
            if op == '$ne' and val == arg: return False
            if op == '$lt' and not (val is not None and val < arg): return False
            if op == '$lte' and not (val is not None and val <= arg): return False
            if op == '$in' and val not in arg: return False
        return True
    return val == cond


def match(doc, flt):
    for k, v in flt.items():
        if k == '$or':
            if not any(match(doc, sub) for sub in v):
                return False
        elif not _cmp(doc.get(k), v):
            return False
    return True


class Coll:
    def __init__(self):
        self.docs, self.lock = {}, threading.Lock()

    def find_one(self, flt, projection=None):
        with self.lock:
            return next((copy.deepcopy(d) for d in self.docs.values() if match(d, flt)), None)

    def find_one_and_update(self, flt, update, return_document=False):
        with self.lock:   # MongoDB applies findOneAndUpdate atomically per document
            d = next((d for d in self.docs.values() if match(d, flt)), None)
            if d is None:
                return None
            before = copy.deepcopy(d)
            d.update(copy.deepcopy(update['$set']))
            return copy.deepcopy(d) if return_document else before

    def replace_one(self, flt, doc, upsert=False):
        with self.lock:
            self.docs[flt['_id']] = copy.deepcopy(doc)


class DB(dict):
    def __missing__(self, name):
        self[name] = Coll()
        return self[name]


def at(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=IST).astimezone(timezone.utc)


MONDAY_1830 = at(2026, 9, 28, 18, 30)   # 2026-09-28 is a Monday


def weekly_task(**kw):
    t = {'id': 'sch-w', 'name': 'Monday mock', 'scheduleType': 'weekly', 'weekdays': [0], 'dailyTime': '18:30',
         'enabled': True, 'status': 'scheduled', 'isLiveEvent': True, 'liveDurationMinutes': 60,
         'testSource': 'existing_test', 'existingTestId': 't-1', 'executionCount': 0,
         'nextRunAt': ai_scheduler.format_iso_utc(MONDAY_1830)}
    t.update(kw)
    return t


def instance_data(task):
    return {'ai_scheduled_tasks': [copy.deepcopy(task)],
            'tests': [{'id': 't-1', 'title': 'Weekly Mock', 'totalQuestions': 3, 'status': 'Draft'}],
            'questions': [], 'ai_generation_jobs': []}


# ------------------------------------------------------------------ 1. failure recovery
class TestFailureRecovery(unittest.TestCase):
    def test_weekly_failure_keeps_next_occurrence_schedulable(self):
        data = instance_data(weekly_task(existingTestId='gone'))
        task = data['ai_scheduled_tasks'][0]
        with patch.object(ai_scheduler, 'get_now_utc', return_value=MONDAY_1830 + timedelta(seconds=5)):
            res = ai_scheduler.process_due_tasks(data, lambda d: None, None)
        self.assertEqual(res['results'][0]['action'], 'dispatch_failed')
        self.assertEqual(task['status'], 'scheduled', 'a failed weekly run must not stop the schedule')
        self.assertEqual(ai_scheduler.parse_iso_utc(task['nextRunAt']).astimezone(IST), datetime(2026, 10, 5, 18, 30, tzinfo=IST))
        self.assertIn('no longer exists', task['lastError'])
        self.assertEqual(task['failureCount'], 1)
        self.assertEqual(task['failureHistory'][-1]['occurrence'], ai_scheduler.format_iso_utc(MONDAY_1830))
        self.assertFalse(ai_scheduler.is_due_to_start(task, MONDAY_1830 + timedelta(days=6)))
        self.assertTrue(ai_scheduler.is_due_to_start(task, at(2026, 10, 5, 18, 30)))
        # and next Monday it really runs once the test exists again
        data['tests'][0]['id'] = 'gone'
        with patch.object(ai_scheduler, 'get_now_utc', return_value=at(2026, 10, 5, 18, 31)):
            res = ai_scheduler.process_due_tasks(data, lambda d: None, None)
        self.assertEqual(res['results'][0]['action'], 'hosted_existing_test')
        self.assertEqual(task['status'], 'live')

    def test_ai_job_failure_on_daily_task_reschedules(self):
        data = {'ai_scheduled_tasks': [{'id': 'd-1', 'name': 'Daily', 'scheduleType': 'recurring', 'dailyTime': '09:00',
                                        'enabled': True, 'status': 'processing', 'activeJobId': 'job-1',
                                        'liveDurationMinutes': 15}]}
        with patch.object(ai_scheduler, 'get_now_utc', return_value=at(2026, 9, 28, 9, 5)):
            ai_scheduler.apply_job_outcome_to_task({'id': 'job-1', 'scheduledTaskId': 'd-1', 'status': 'FAILED', 'error': 'model timeout'}, None, data)
        t = data['ai_scheduled_tasks'][0]
        self.assertEqual((t['status'], t['lastError'], t['activeJobId']), ('scheduled', 'model timeout', None))
        self.assertEqual(ai_scheduler.parse_iso_utc(t['nextRunAt']).astimezone(IST), datetime(2026, 9, 29, 9, 0, tzinfo=IST))

    def test_one_time_failure_stays_failed(self):
        data = instance_data(weekly_task(scheduleType='one_time', existingTestId='gone'))
        task = data['ai_scheduled_tasks'][0]
        with patch.object(ai_scheduler, 'get_now_utc', return_value=MONDAY_1830 + timedelta(seconds=5)):
            ai_scheduler.process_due_tasks(data, lambda d: None, None)
        self.assertEqual(task['status'], 'failed')
        self.assertIn('no longer exists', task['lastError'])

    def test_task_left_failed_by_old_code_resumes(self):
        data = instance_data(weekly_task(status='failed', nextRunAt='2026-09-21T13:00:00Z', lastError='old'))
        task = data['ai_scheduled_tasks'][0]
        with patch.object(ai_scheduler, 'get_now_utc', return_value=at(2026, 9, 27, 12, 0)):
            res = ai_scheduler.process_due_tasks(data, lambda d: None, None)
        self.assertEqual(res['results'][0]['action'], 'recovered_schedule')
        self.assertEqual(task['status'], 'scheduled')
        self.assertEqual(ai_scheduler.parse_iso_utc(task['nextRunAt']).astimezone(IST), datetime(2026, 9, 28, 18, 30, tzinfo=IST),
                         'past occurrence is not replayed; the next real Monday is used')


# ------------------------------------------------------------------ 2. atomic claim
class TestAtomicClaim(unittest.TestCase):
    def setUp(self):
        self.db = DB()
        self.p = [patch.object(mongodb_manager, 'get_database', return_value=self.db),
                  patch.object(ai_scheduler, 'IS_SERVERLESS', True)]
        for p in self.p:
            p.start()

    def tearDown(self):
        for p in self.p:
            p.stop()

    def seed(self, task):
        self.db['ai_scheduled_tasks'].replace_one({'_id': task['id']}, dict(copy.deepcopy(task), _id=task['id']))

    def test_two_concurrent_instances_only_one_claims(self):
        task = weekly_task(testSource='ai_generate')
        self.seed(task)
        copies = [copy.deepcopy(task) for _ in range(8)]   # eight instances with the same view
        results = []
        barrier = threading.Barrier(len(copies))

        def run(t):
            barrier.wait()
            with patch.object(ai_scheduler, 'get_now_utc', return_value=MONDAY_1830 + timedelta(seconds=3)):
                results.append(ai_scheduler.attempt_claim_task(t, {'ai_scheduled_tasks': [t]},
                                                               claim_fn=mongodb_manager.claim_scheduled_task)[0])
        threads = [threading.Thread(target=run, args=(c,)) for c in copies]
        for th in threads:
            th.start()
        for th in threads:
            th.join()
        self.assertEqual(results.count(True), 1)
        self.assertEqual(self.db['ai_scheduled_tasks'].docs['sch-w']['status'], 'CLAIMING')

    def test_existing_test_hosting_runs_once_per_occurrence(self):
        task = weekly_task()
        self.seed(task)
        a, b = instance_data(task), instance_data(task)     # two instances, same stale 'scheduled' view
        now = MONDAY_1830 + timedelta(seconds=10)
        with patch.object(ai_scheduler, 'get_now_utc', return_value=now):
            ra = ai_scheduler.process_due_tasks(a, lambda d: None, None, claim_fn=mongodb_manager.claim_scheduled_task)
            rb = ai_scheduler.process_due_tasks(b, lambda d: None, None, claim_fn=mongodb_manager.claim_scheduled_task)
        self.assertEqual([r['action'] for r in ra['results']], ['hosted_existing_test'])
        self.assertEqual(rb['results'], [], 'second instance must not host the same occurrence')
        self.assertEqual(a['ai_scheduled_tasks'][0]['executionCount'], 1)
        self.assertEqual(b['ai_scheduled_tasks'][0]['status'], 'scheduled', 'loser leaves its copy untouched')
        self.assertFalse(b['tests'][0].get('isLive'))

    def test_stale_claim_lease_is_recovered(self):
        task = weekly_task(status='CLAIMING', claimedAt=ai_scheduler.format_iso_utc(MONDAY_1830))
        self.seed(task)
        early = MONDAY_1830 + timedelta(seconds=60)
        self.assertFalse(ai_scheduler.is_due_to_start(task, early), 'active lease is respected')
        late = MONDAY_1830 + timedelta(seconds=ai_scheduler.CLAIM_LEASE_SECONDS + 5)
        self.assertTrue(ai_scheduler.is_due_to_start(task, late))
        with patch.object(ai_scheduler, 'get_now_utc', return_value=late):
            ok, _ = ai_scheduler.attempt_claim_task(task, {'ai_scheduled_tasks': [task]}, claim_fn=mongodb_manager.claim_scheduled_task)
        self.assertTrue(ok)

    def test_no_database_on_serverless_means_no_claim(self):
        task = weekly_task()
        with patch.object(ai_scheduler, 'get_now_utc', return_value=MONDAY_1830 + timedelta(seconds=1)):
            ok, err = ai_scheduler.attempt_claim_task(task, {'ai_scheduled_tasks': [task]}, claim_fn=lambda *a: None)
        self.assertFalse(ok)
        self.assertEqual(task['status'], 'scheduled')

    def test_deleted_or_rescheduled_task_cannot_be_claimed(self):
        task = weekly_task()
        self.seed(dict(task, nextRunAt='2026-10-05T13:00:00Z'))   # edited elsewhere
        with patch.object(ai_scheduler, 'get_now_utc', return_value=MONDAY_1830 + timedelta(seconds=1)):
            self.assertFalse(ai_scheduler.attempt_claim_task(task, {'ai_scheduled_tasks': [task]}, claim_fn=mongodb_manager.claim_scheduled_task)[0])
        self.db['ai_scheduled_tasks'].docs.clear()                 # deleted
        with patch.object(ai_scheduler, 'get_now_utc', return_value=MONDAY_1830 + timedelta(seconds=1)):
            self.assertFalse(ai_scheduler.attempt_claim_task(task, {'ai_scheduled_tasks': [task]}, claim_fn=mongodb_manager.claim_scheduled_task)[0])


# ------------------------------------------------------------------ 4. cheap due check
class TestCheapDueCheck(unittest.TestCase):
    def test_mongo_due_query(self):
        db = DB()
        now = MONDAY_1830
        cutoff = ai_scheduler.lease_cutoff_iso(now)
        with patch.object(mongodb_manager, 'get_database', return_value=db):
            now_iso = ai_scheduler.format_iso_utc(now)
            db['ai_scheduled_tasks'].replace_one({'_id': 'a'}, {'_id': 'a', 'status': 'scheduled', 'nextRunAt': '2026-10-05T13:00:00Z'})
            self.assertFalse(mongodb_manager.scheduler_has_due_work(now_iso, cutoff))
            db['ai_scheduled_tasks'].replace_one({'_id': 'a'}, {'_id': 'a', 'status': 'scheduled', 'nextRunAt': now_iso})
            self.assertTrue(mongodb_manager.scheduler_has_due_work(now_iso, cutoff))
            db['ai_scheduled_tasks'].replace_one({'_id': 'a'}, {'_id': 'a', 'status': 'live', 'expiresAt': '2026-09-28T12:00:00Z'})
            self.assertTrue(mongodb_manager.scheduler_has_due_work(now_iso, cutoff))
            db['ai_scheduled_tasks'].replace_one({'_id': 'a'}, {'_id': 'a', 'status': 'scheduled', 'enabled': False, 'nextRunAt': now_iso})
            self.assertFalse(mongodb_manager.scheduler_has_due_work(now_iso, cutoff))

    def test_tick_skips_expensive_refresh_when_nothing_is_due(self):
        with patch.object(server, 'scheduler_work_due', return_value=False), \
                patch.object(server, 'load_backend_data') as load, \
                patch.object(ai_scheduler, 'process_due_tasks') as process:
            res = server.run_due_scheduler_tasks()
        self.assertEqual((res['skipped'], res['executedCount']), ('nothing_due', 0))
        load.assert_not_called()
        process.assert_not_called()

    def test_tick_runs_when_due(self):
        with patch.object(server, 'scheduler_work_due', return_value=True), \
                patch.object(server, 'load_backend_data', return_value={}) as load, \
                patch.object(ai_scheduler, 'process_due_tasks', return_value={'success': True, 'executedCount': 1}) as process:
            server.run_due_scheduler_tasks()
        load.assert_called_once()
        self.assertIs(process.call_args.kwargs['claim_fn'], server.claim_scheduled_task_occurrence)

    def test_enabled_legacy_autopilot_is_due_only_when_it_would_run(self):
        cfg = {'enabled': True, 'dailyTime': '20:00', 'timezoneOffsetHours': 5.5, 'lastRunDate': None}
        evening, morning = at(2026, 9, 28, 20, 5), at(2026, 9, 28, 9, 0)
        self.assertTrue(ai_scheduler.has_due_work({'ai_scheduled_tasks': [], 'ai_autopilot_config': cfg}, evening))
        self.assertFalse(ai_scheduler.has_due_work({'ai_scheduled_tasks': [], 'ai_autopilot_config': cfg}, morning))
        self.assertFalse(ai_scheduler.has_due_work({'ai_scheduled_tasks': [], 'ai_autopilot_config': dict(cfg, lastRunDate='2026-09-28')}, evening))
        busy = {'ai_scheduled_tasks': [weekly_task(nextRunAt='2026-10-05T13:00:00Z')], 'ai_autopilot_config': cfg}
        self.assertFalse(ai_scheduler.has_due_work(busy, evening), 'legacy never runs while scheduled tasks exist')

    def test_unknown_database_state_never_skips(self):
        with patch.object(mongodb_manager, 'is_database_connected', return_value=True), \
                patch.object(mongodb_manager, 'scheduler_has_due_work', return_value=None):
            self.assertTrue(server.scheduler_work_due())


# ------------------------------------------------------------------ 3. tick authentication
class TestTickAuth(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'backend_data.json')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump({'users': {}, 'ai_scheduled_tasks': [], 'tests': []}, f)
        self.patches = [
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(server, 'check_opportunistic_scheduler_tick', lambda: None),
            patch.object(mongodb_manager, 'is_database_connected', return_value=False),
            patch.object(mongodb_manager, 'get_database', return_value=None),
            patch.dict(os.environ, {'CRON_SECRET': CRON, 'AI_WORKER_SECRET': WORKER}),
            patch('sys.stderr', io.StringIO()),
        ]
        for p in self.patches:
            p.start()
        self.httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.ExcellenceCAHandler)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        for p in reversed(self.patches):
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def tick(self, method='GET', headers=None, query=''):
        req = urllib.request.Request(f"{self.base}/api/admin/ai/scheduler/tick{query}", method=method,
                                     headers=headers or {}, data=b'{}' if method == 'POST' else None)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_cron_secret_header_works(self):
        for method in ('GET', 'POST'):
            st, res = self.tick(method, {'Authorization': f'Bearer {CRON}'})
            self.assertEqual(st, 200, res)
            self.assertTrue(res['success'])

    def test_worker_header_still_works(self):
        st, _ = self.tick('POST', {'X-Worker-Token': WORKER})
        self.assertEqual(st, 200)

    def test_wrong_or_missing_secret_is_refused(self):
        self.assertEqual(self.tick('GET', {'Authorization': 'Bearer nope'})[0], 403)
        self.assertEqual(self.tick('GET')[0], 403)

    def test_query_string_token_is_rejected(self):
        st, res = self.tick('GET', query=f'?token={CRON}')
        self.assertEqual(st, 401)
        self.assertIn('Authorization', res['error'])
        # even together with a valid header, a secret in the URL is refused
        self.assertEqual(self.tick('GET', {'Authorization': f'Bearer {CRON}'}, query=f'?token={CRON}')[0], 401)
        self.assertEqual(self.tick('POST', query=f'?token={WORKER}')[0], 401)


if __name__ == '__main__':
    unittest.main()
