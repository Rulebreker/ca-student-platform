"""
Scheduled MCQ tasks: deletions stick across serverless instances, weekly schedules, and hosting an
existing test at the scheduled time. Two instances share one in-memory fake MongoDB (never a real DB).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_scheduler
import mongodb_manager
import server
from tests.test_mongo_persistence import FakeDB, FakeReplaceOne

IST = ai_scheduler.IST_TZ


def task_doc(task_id, **kw):
    doc = {'id': task_id, 'name': f'Task {task_id}', 'scheduleType': 'recurring', 'dailyTime': '09:00',
           'enabled': True, 'status': 'scheduled', 'nextRunAt': '2099-01-01T00:00:00Z',
           'updatedAt': '2026-09-01T00:00:00Z'}
    doc.update(kw)
    return doc


def make_seed():
    return {'users': {}, 'test_attempts': [], 'revoked_users': [], 'revoked_tokens': [],
            'tests': [{'id': 't-weekly', 'title': 'Weekly Mock', 'totalQuestions': 2, 'isPublished': False, 'status': 'Draft'}],
            'questions': [{'id': 'q1', 'testId': 't-weekly'}, {'id': 'q2', 'testId': 't-weekly'}],
            'ai_scheduled_tasks': [task_doc('s-1'), task_doc('s-2')], 'deleted_scheduled_tasks': []}


class TestScheduledTaskDeletion(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.tmp = tempfile.mkdtemp()
        for name in ('a', 'b'):
            with open(os.path.join(self.tmp, f'{name}.json'), 'w', encoding='utf-8') as f:
                json.dump(make_seed(), f)
        self.patches = [
            patch.object(mongodb_manager, 'get_database', return_value=self.db),
            patch.object(mongodb_manager, 'is_database_connected', return_value=True),
            patch.object(mongodb_manager, 'ReplaceOne', FakeReplaceOne, create=True),
            patch.object(server, 'sync_historical_xp', lambda d: None),
        ]
        for p in self.patches:
            p.start()
        for t in make_seed()['ai_scheduled_tasks']:   # both tasks already live in MongoDB
            self.db['ai_scheduled_tasks'].replace_one({'_id': t['id']}, dict(t, _id=t['id']))

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def instance(self, name):
        server._collection_last_synced.clear()
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, f'{name}.json')):
            return server.load_backend_data(refresh_collections=['ai_scheduled_tasks'], min_interval=0.0)

    def save(self, name, data):
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, f'{name}.json')):
            server.save_backend_data(data)

    def delete_on(self, name, task_id):
        data = self.instance(name)
        self.assertTrue(ai_scheduler.delete_scheduled_task(task_id, data))
        self.assertEqual(server.record_deletions(data, 'ai_scheduled_tasks', [task_id]), [])
        self.save(name, data)
        return data

    def ids(self, data):
        return sorted(t['id'] for t in ai_scheduler.get_scheduled_tasks(data))

    def test_deleted_task_does_not_come_back_on_another_instance(self):
        self.delete_on('a', 's-1')
        self.assertNotIn('s-1', self.db['ai_scheduled_tasks'].docs)
        self.assertIn('ai_scheduled_tasks:s-1', self.db['deleted_documents'].docs)
        b = self.instance('b')            # b's own disk copy still has s-1
        self.assertEqual(self.ids(b), ['s-2'])

    def test_stale_instance_cannot_write_a_deleted_task_back(self):
        b = self.instance('b')
        self.delete_on('a', 's-1')
        stale = next(t for t in b['ai_scheduled_tasks'] if t['id'] == 's-1')
        stale['status'] = 'failed'        # e.g. a scheduler tick on b updates its stale copy ...
        self.save('b', b)                 # ... write-through
        server.sync_to_database('ai_scheduled_tasks/s-1', stale, method='PUT', sync=True)   # ... direct PUT
        self.assertNotIn('s-1', self.db['ai_scheduled_tasks'].docs)

    def test_legacy_tombstone_list_is_honoured(self):
        # deletions recorded before this fix exist only in deleted_scheduled_tasks
        self.db['deleted_scheduled_tasks'].replace_one({'_id': 's-2'}, {'_id': 's-2', 'value': True})
        b = self.instance('b')
        self.assertEqual(self.ids(b), ['s-1'])
        server.sync_to_database('ai_scheduled_tasks/s-2', task_doc('s-2'), method='PUT', sync=True)
        self.assertIn('s-2', self.db['ai_scheduled_tasks'].docs, 'already in Mongo from setUp')
        self.assertTrue(mongodb_manager.is_tombstoned('ai_scheduled_tasks', 's-2'))

    def test_scheduler_tick_on_stale_instance_does_not_run_deleted_task(self):
        b = self.instance('b')
        self.delete_on('a', 's-1')
        server._collection_last_synced.clear()
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, 'b.json')):
            fresh = server.load_backend_data(refresh_collections=['ai_scheduled_tasks'], min_interval=0.0)
        self.assertNotIn('s-1', [t['id'] for t in fresh['ai_scheduled_tasks']])


class TestWeeklySchedule(unittest.TestCase):
    def at(self, y, m, d, hh, mm):
        return datetime(y, m, d, hh, mm, tzinfo=IST).astimezone(timezone.utc)

    def test_next_run_on_selected_weekdays(self):
        # 2026-09-28 is a Monday
        task = {'scheduleType': 'weekly', 'weekdays': [0], 'dailyTime': '18:30', 'enabled': True, 'status': 'scheduled'}
        nxt = ai_scheduler.calculate_next_run(task, self.at(2026, 9, 27, 12, 0))          # Sunday
        self.assertEqual(ai_scheduler.parse_iso_utc(nxt).astimezone(IST), datetime(2026, 9, 28, 18, 30, tzinfo=IST))
        nxt = ai_scheduler.calculate_next_run(task, self.at(2026, 9, 28, 18, 30))         # exactly then -> next week
        self.assertEqual(ai_scheduler.parse_iso_utc(nxt).astimezone(IST), datetime(2026, 10, 5, 18, 30, tzinfo=IST))
        task['weekdays'] = [0, 3]                                                           # Mon + Thu
        nxt = ai_scheduler.calculate_next_run(task, self.at(2026, 9, 28, 19, 0))
        self.assertEqual(ai_scheduler.parse_iso_utc(nxt).astimezone(IST), datetime(2026, 10, 1, 18, 30, tzinfo=IST))

    def test_save_validates_weekly_and_source(self):
        data = make_seed()
        with self.assertRaises(ValueError):
            ai_scheduler.save_scheduled_task({'name': 'x', 'scheduleType': 'weekly', 'weekdays': [], 'dailyTime': '10:00'}, data)
        with self.assertRaises(ValueError):
            ai_scheduler.save_scheduled_task({'name': 'x', 'scheduleType': 'weekly', 'weekdays': [0], 'dailyTime': '10:00',
                                              'testSource': 'existing_test', 'existingTestId': 'nope'}, data)
        t = ai_scheduler.save_scheduled_task({'name': 'Monday mock', 'scheduleType': 'weekly', 'weekdays': [0, 9, '3', 0],
                                              'dailyTime': '18:30', 'testSource': 'existing_test', 'existingTestId': 't-weekly',
                                              'liveDurationMinutes': 600}, data)
        self.assertEqual(t['weekdays'], [0, 3])
        self.assertEqual((t['existingTestId'], t['existingTestTitle']), ('t-weekly', 'Weekly Mock'))
        self.assertEqual(t['liveDurationMinutes'], 600, 'long live windows allowed (up to 24h)')
        self.assertIn(ai_scheduler.parse_iso_utc(t['nextRunAt']).astimezone(IST).weekday(), (0, 3))

    def test_existing_test_goes_live_then_expires_and_next_week_is_scheduled(self):
        data = make_seed()
        task = ai_scheduler.save_scheduled_task({'name': 'Monday mock', 'scheduleType': 'weekly', 'weekdays': [0],
                                                 'dailyTime': '18:30', 'testSource': 'existing_test',
                                                 'existingTestId': 't-weekly', 'liveDurationMinutes': 60}, data)
        synced = []
        sync = lambda path, doc, method='PUT', sync=False: synced.append(path) or True
        monday = self.at(2026, 9, 28, 18, 30)
        task['nextRunAt'] = ai_scheduler.format_iso_utc(monday)
        with patch.object(ai_scheduler, 'get_now_utc', return_value=monday + timedelta(seconds=20)):
            res = ai_scheduler.process_due_tasks(data, lambda d: None, sync)
        self.assertEqual(res['results'][0]['action'], 'hosted_existing_test')
        test = data['tests'][0]
        self.assertTrue(test['isLive'] and test['isPublished'])
        self.assertEqual(test['status'], 'Live')
        self.assertEqual(task['status'], 'live')
        self.assertEqual(task['lastTestId'], 't-weekly')
        self.assertIn('tests/t-weekly', synced)
        self.assertEqual(data.get('ai_generation_jobs', []), [], 'no AI job for an existing test')

        with patch.object(ai_scheduler, 'get_now_utc', return_value=monday + timedelta(minutes=61)):
            ai_scheduler.process_due_tasks(data, lambda d: None, sync)
        self.assertFalse(test['isLive'])
        self.assertEqual(test['status'], 'Expired')
        self.assertEqual(task['status'], 'scheduled')
        self.assertEqual(ai_scheduler.parse_iso_utc(task['nextRunAt']).astimezone(IST), datetime(2026, 10, 5, 18, 30, tzinfo=IST))

        # next Monday it goes live again
        with patch.object(ai_scheduler, 'get_now_utc', return_value=self.at(2026, 10, 5, 18, 31)):
            ai_scheduler.process_due_tasks(data, lambda d: None, sync)
        self.assertTrue(test['isLive'])
        self.assertEqual(task['executionCount'], 2)

    def test_missing_existing_test_fails_clearly_and_keeps_schedule(self):
        data = make_seed()
        task = ai_scheduler.save_scheduled_task({'name': 'x', 'scheduleType': 'weekly', 'weekdays': [0], 'dailyTime': '18:30',
                                                 'testSource': 'existing_test', 'existingTestId': 't-weekly'}, data)
        data['tests'] = []
        ok, err, _ = ai_scheduler.dispatch_scheduled_task(task, data, lambda d: None, None)
        self.assertFalse(ok)
        self.assertIn('no longer exists', err)
        self.assertEqual(task['status'], 'scheduled', 'weekly schedule continues (status, not only nextRunAt)')
        self.assertIn('no longer exists', task['lastError'])
        self.assertIsNotNone(task['nextRunAt'])

    def test_daily_schedule_unchanged(self):
        task = {'scheduleType': 'recurring', 'dailyTime': '09:00', 'enabled': True, 'status': 'scheduled'}
        nxt = ai_scheduler.calculate_next_run(task, self.at(2026, 9, 28, 10, 0))
        self.assertEqual(ai_scheduler.parse_iso_utc(nxt).astimezone(IST), datetime(2026, 9, 29, 9, 0, tzinfo=IST))


if __name__ == '__main__':
    unittest.main()
