"""
Exam level model: canonical ids, mandatory registration level, profile change, backend content scoping
(MCQ tests, test papers, paper download), premium flag, scheduler filter + duplicate, and the syllabus
guard that keeps generated content on its chapter's level. In-process server, temporary store, no DB.
"""
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
from datetime import timedelta
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_job_manager
import ai_scheduler
import exam_levels
import mongodb_manager
import server
import syllabus_hierarchy

TOK = {r: 'sess_' + c * 43 for r, c in (('admin', 'A'), ('fnd', 'F'), ('inter', 'I'), ('final', 'L'))}


def user(uid, email, role, tok, ca_level=None, **extra):
    u = {'id': uid, 'name': uid, 'email': email, 'username': uid, 'role': role, 'isActive': True,
         'password': server.hash_password('Passw0rd!x'), 'token': tok, 'sessionTokens': [tok]}
    if ca_level:
        u['caLevel'] = ca_level
    u.update(extra)
    return u


def seed():
    tests = [
        {'id': 't-fnd', 'title': 'Foundation mock', 'examLevelId': 'foundation', 'examLevel': 'CA Foundation', 'status': 'Published', 'isPublished': True, 'allowedPlans': ['free', 'core']},
        {'id': 't-fnd-subj', 'title': 'Foundation by subject', 'subjectId': 'sub-1', 'status': 'Published', 'isPublished': True},
        {'id': 't-int', 'title': 'Inter mock', 'examLevel': 'CA Intermediate', 'status': 'Published', 'isPublished': True, 'requiredTier': 'core'},
        {'id': 't-int-premium', 'title': 'Inter premium', 'examLevelId': 'intermediate', 'status': 'Published', 'isPublished': True, 'allowedPlans': ['plus', 'elite']},
        {'id': 't-final', 'title': 'Final mock', 'examLevel': 'CA Final', 'status': 'Published', 'isPublished': True, 'allowedPlans': ['elite']},
        {'id': 't-unknown', 'title': 'Legacy without level', 'status': 'Published', 'isPublished': True},
    ]
    papers = [
        {'id': 'p-fnd', 'title': 'Fnd paper', 'examLevel': 'CA Foundation', 'status': 'Published', 'questionPdfId': 'qp_fnd.pdf'},
        {'id': 'p-int', 'title': 'Inter paper', 'examLevel': 'CA Intermediate', 'status': 'Published', 'questionPdfId': 'qp_int.pdf'},
        {'id': 'p-final', 'title': 'Final paper', 'examLevelId': 'final', 'status': 'Published', 'questionPdfId': 'qp_final.pdf'},
    ]
    return {
        'users': {
            'admin@x.test': user('usr-admin', 'admin@x.test', 'admin', TOK['admin']),
            'fnd@x.test': user('usr-fnd', 'fnd@x.test', 'student', TOK['fnd'], 'CA FOUNDATION', totalXp=321),
            'inter@x.test': user('usr-inter', 'inter@x.test', 'student', TOK['inter'], 'CA INTER'),
            'final@x.test': user('usr-final', 'final@x.test', 'student', TOK['final'], 'CA FINAL'),
        },
        'subscriptions': {'usr-fnd': {'userId': 'usr-fnd', 'status': 'active', 'planTier': 'core', 'planId': 'core_monthly',
                                      'expiresAt': '2099-01-01T00:00:00+00:00'}},
        'revoked_users': [], 'revoked_tokens': [], 'test_attempts': [], 'tests': tests, 'questions': [],
        'papers': papers, 'assignments': list(papers), 'ai_scheduled_tasks': [], 'subjects': [],
    }


class TestCanonicalModel(unittest.TestCase):
    def test_one_canonical_value_for_all_variants(self):
        for v in ('CA FOUNDATION', 'CA Foundation', 'foundation', 'CA_FOUNDATION', 'FND'):
            self.assertEqual(exam_levels.canonical_id(v), 'foundation', v)
        for v in ('CA INTER', 'CA INTERMEDIATE', 'CA Intermediate', 'intermediate', 'INTER'):
            self.assertEqual(exam_levels.canonical_id(v), 'intermediate', v)
        for v in ('', None, 'a', 'foundation-ish', 'Super Administrator'):
            self.assertIsNone(exam_levels.canonical_id(v), v)
        self.assertEqual(exam_levels.record_level_id({'subjectId': 'sub-1'}), 'foundation')
        self.assertIsNone(exam_levels.record_level_id({'title': 'no level'}))

    def test_scope_rules(self):
        self.assertEqual(exam_levels.content_scope({'role': 'student', 'caLevel': 'CA INTER'}), 'intermediate')
        self.assertEqual(exam_levels.content_scope({'role': 'student', 'caLevel': 'CA FINAL'}), 'final')
        self.assertEqual(exam_levels.content_scope({'role': 'student', 'examLevelId': 'final'}), 'final')
        self.assertIsNone(exam_levels.content_scope({'role': 'student', 'caLevel': 'Unknown text'}))
        self.assertIsNone(exam_levels.content_scope({'role': 'admin'}))
        self.assertIsNone(exam_levels.content_scope(None))
        self.assertTrue(exam_levels.in_scope({'title': 'unknown'}, 'foundation'), 'unknown level never guessed away')

    def test_chapter_level_cannot_be_relabelled(self):
        ch_id = next(k for k, v in syllabus_hierarchy.CHAPTER_METADATA_REGISTRY.items() if v.get('examLevelId') == 'foundation')
        meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id=ch_id, exam_level='CA Intermediate')
        self.assertEqual((meta['examLevelId'], meta['examLevel']), ('foundation', 'CA Foundation'))

    def test_generation_keeps_each_levels_chapter_level(self):
        for level in ('foundation', 'intermediate', 'final'):
            subject = next(s for s in syllabus_hierarchy.CANONICAL_SUBJECTS if s.get('levelId') == level and s.get('chapters'))
            chapter = subject['chapters'][0]
            wrong = 'CA Foundation' if level != 'foundation' else 'CA Final'
            ok, err, job = ai_job_manager.create_generation_job({
                'title': f'{level} drill', 'subject': subject['name'], 'topic': chapter['name'], 'chapter': chapter['name'],
                'chapterId': chapter['id'], 'examLevel': wrong, 'count': 2}, {'ai_generation_jobs': []})
            self.assertTrue(ok, err)
            self.assertEqual((job['examLevelId'], job['examLevel']), (level, exam_levels.display_name(level)), level)

    def test_generated_job_keeps_the_chapter_level(self):
        data = {'ai_generation_jobs': []}
        ok, err, job = ai_job_manager.create_generation_job({
            'title': 'x', 'subject': 'Business Economics', 'topic': 'Theory of Demand and Supply',
            'chapter': 'Theory of Demand and Supply', 'examLevel': 'CA Intermediate', 'count': 2}, data)
        self.assertTrue(ok, err)
        self.assertEqual((job['examLevelId'], job['examLevel']), ('foundation', 'CA Foundation'))


class TestSchedulerLevels(unittest.TestCase):
    def base_task(self, **kw):
        t = {'name': 'Daily Fnd', 'scheduleType': 'recurring', 'dailyTime': '09:00', 'examLevel': 'CA Foundation',
             'examLevelId': 'foundation', 'subject': 'Accounting', 'subjectId': 'sub-1', 'questionCount': 5}
        t.update(kw)
        return t

    def test_save_stamps_canonical_level_and_rejects_mismatch(self):
        data = {'ai_scheduled_tasks': [], 'tests': [], 'subjects': []}
        t = ai_scheduler.save_scheduled_task(self.base_task(examLevel='CA FOUNDATION', examLevelId=None), data)
        self.assertEqual((t['examLevelId'], t['examLevel']), ('foundation', 'CA Foundation'))
        inter_subject = next(s for s in syllabus_hierarchy.CANONICAL_SUBJECTS if s.get('levelId') == 'intermediate')
        with self.assertRaises(ValueError):
            ai_scheduler.save_scheduled_task(self.base_task(subjectId=inter_subject['id']), data)

    def test_filter_uses_the_stored_level(self):
        tasks = [{'id': 'a', 'examLevelId': 'foundation'}, {'id': 'b', 'examLevel': 'CA Intermediate'},
                 {'id': 'c', 'subjectId': 'sub-1'}, {'id': 'd', 'examLevel': 'CA Foundation', 'name': 'CA Intermediate prep'}]
        f = lambda lvl: [t['id'] for t in ai_scheduler.filter_tasks_by_exam_level(tasks, lvl)]
        self.assertEqual(f('foundation'), ['a', 'c', 'd'], 'the title text does not matter')
        self.assertEqual(f('CA Intermediate'), ['b'])
        self.assertEqual(f('all'), ['a', 'b', 'c', 'd'])

    def test_duplicate_is_new_paused_and_independent(self):
        data = {'ai_scheduled_tasks': [], 'tests': [], 'subjects': []}
        orig = ai_scheduler.save_scheduled_task(self.base_task(isLiveEvent=True, liveDurationMinutes=45, questionCount=7,
                                                                allowedPlans=['core'], marksPerCorrect=4.0), data)
        orig.update({'executionCount': 9, 'lastRunAt': '2026-09-20T03:30:00Z', 'lastTestId': 'tst-old', 'lastJobId': 'job-old',
                     'failureHistory': [{'at': 'x'}], 'recoveryHistory': [{'at': 'y'}], 'lastError': 'boom', 'sourceDocId': 'doc-7'})
        snapshot = json.dumps(orig, sort_keys=True)
        dup = ai_scheduler.duplicate_scheduled_task(orig['id'], data)
        self.assertNotEqual(dup['id'], orig['id'])
        self.assertEqual(dup['name'], 'Daily Fnd (Copy)')
        self.assertEqual((dup['enabled'], dup['status'], dup['nextRunAt']), (False, 'paused', None))
        for k in ('examLevelId', 'subjectId', 'questionCount', 'liveDurationMinutes', 'allowedPlans', 'marksPerCorrect', 'dailyTime', 'sourceDocId'):
            self.assertEqual(dup[k], orig[k], k)
        for k in ('lastRunAt', 'lastTestId', 'lastJobId', 'lastError'):
            self.assertIsNone(dup.get(k), k)
        self.assertEqual(dup['executionCount'], 0)
        self.assertNotIn('failureHistory', dup)
        self.assertNotIn('recoveryHistory', dup)
        self.assertEqual(json.dumps(orig, sort_keys=True), snapshot, 'original untouched')
        dup['allowedPlans'].append('elite')
        self.assertEqual(orig['allowedPlans'], ['core'], 'no shared objects')
        self.assertEqual(ai_scheduler.duplicate_scheduled_task(orig['id'], data)['name'], 'Daily Fnd (Copy 2)')

    def test_duplicate_does_not_run_and_past_one_time_moves_forward(self):
        data = {'ai_scheduled_tasks': [], 'tests': [], 'subjects': []}
        tomorrow = (ai_scheduler.get_now_utc().astimezone(ai_scheduler.IST_TZ) + timedelta(days=1)).strftime('%Y-%m-%d')
        orig = ai_scheduler.save_scheduled_task(self.base_task(scheduleType='one_time', scheduledDate=tomorrow, scheduledTime='10:00'), data)
        orig['scheduledDate'] = '2026-01-01'   # its date has passed
        dup = ai_scheduler.duplicate_scheduled_task(orig['id'], data)
        self.assertGreater(dup['scheduledDate'], '2026-01-01')
        orig['nextRunAt'] = '2000-01-01T00:00:00Z'   # original due right now
        with patch.object(ai_scheduler, 'dispatch_scheduled_task', return_value=(True, None, {})) as dispatch:
            ai_scheduler.process_due_tasks(data, lambda d: None, None)
        dispatched = [c.args[0]['id'] for c in dispatch.call_args_list]
        self.assertEqual(dispatched, [orig['id']], 'the paused copy never runs alongside the original')


class Harness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.store = os.path.join(self.tmp, 'store.json')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(seed(), f)
        self.patches = [
            patch.object(server, 'DATA_STORE_FILE', self.store),
            patch.object(server, 'sync_historical_xp', lambda d: None),
            patch.object(server, 'check_opportunistic_scheduler_tick', lambda: None),
            patch.object(server, 'sync_to_firebase', lambda *a, **k: True),
            patch.object(server, 'sync_to_database', lambda *a, **k: True),
            patch.object(mongodb_manager, 'is_database_connected', return_value=False),
            patch.object(mongodb_manager, 'get_database', return_value=None),
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

    def call(self, path, body=None, token=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        req = urllib.request.Request(self.base + path, headers=headers, method='POST' if body is not None else 'GET',
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read() or b'{}')
            except ValueError:
                return e.code, {}

    def data(self):
        with open(self.store, encoding='utf-8') as f:
            return json.load(f)

    def reg(self, **kw):
        body = {'username': 'newbie', 'name': 'New', 'email': 'new@x.test', 'phone': '9876543210', 'password': 'Passw0rd!x'}
        body.update(kw)
        return self.call('/api/auth/register', body)


class TestRegistrationAndProfile(Harness):
    def test_level_required_and_validated(self):
        for kw in ({}, {'caLevel': ''}, {'examLevelId': 'xyz'}, {'caLevel': 'foundationish'}, {'examLevelId': 'Super Admin'}):
            st, res = self.reg(**kw)
            self.assertEqual((st, res.get('code')), (400, 'EXAM_LEVEL_REQUIRED'), kw)
        self.assertNotIn('new@x.test', self.data()['users'])

    def test_register_foundation_and_intermediate_and_persist_after_login(self):
        st, res = self.reg(examLevelId='foundation')
        self.assertEqual(st, 200, res)
        self.assertEqual((res['user']['examLevelId'], res['user']['caLevel']), ('foundation', 'CA FOUNDATION'))
        st, res = self.reg(username='inter2', email='inter2@x.test', caLevel='CA INTERMEDIATE')
        self.assertEqual((st, res['user']['examLevelId']), (200, 'intermediate'))
        st, res = self.call('/api/auth/login', {'identifier': 'inter2@x.test', 'password': 'Passw0rd!x'})
        self.assertEqual((st, res['user']['examLevelId']), (200, 'intermediate'))

    def test_register_final(self):
        st, res = self.reg(username='fin1', email='fin1@x.test', examLevelId='final')
        self.assertEqual((st, res['user']['examLevelId'], res['user']['caLevel']), (200, 'final', 'CA FINAL'))
        st, res = self.reg(username='fin2', email='fin2@x.test', caLevel='CA Final')
        self.assertEqual((st, res['user']['examLevelId']), (200, 'final'))

    def test_all_six_profile_transitions(self):
        path = [('foundation', 'intermediate'), ('intermediate', 'final'), ('final', 'foundation'),
                ('foundation', 'final'), ('final', 'intermediate'), ('intermediate', 'foundation')]
        for frm, to in path:
            self.assertEqual(self.data()['users']['fnd@x.test']['examLevelId'] if 'examLevelId' in self.data()['users']['fnd@x.test'] else 'foundation', frm)
            st, res = self.call('/api/user/profile', {'examLevelId': to}, TOK['fnd'])
            self.assertEqual((st, res['user']['examLevelId']), (200, to), (frm, to))
        u = self.data()['users']['fnd@x.test']
        self.assertEqual(u['totalXp'], 321)
        self.assertEqual(self.data()['subscriptions']['usr-fnd']['status'], 'active')
        st, res = self.call('/api/auth/login', {'identifier': 'fnd@x.test', 'password': 'Passw0rd!x'})
        self.assertEqual(res['user']['examLevelId'], 'foundation', 'persists across login')

    def test_legacy_user_migrated_on_login(self):
        st, res = self.call('/api/auth/login', {'identifier': 'inter@x.test', 'password': 'Passw0rd!x'})
        self.assertEqual((st, res['user']['examLevelId'], res['user']['caLevel']), (200, 'intermediate', 'CA INTERMEDIATE'))

    def test_profile_change_keeps_everything_else(self):
        before = self.data()['users']['fnd@x.test']
        st, res = self.call('/api/user/profile', {'examLevelId': 'intermediate'}, TOK['fnd'])
        self.assertEqual((st, res['user']['examLevelId'], res['user']['caLevel']), (200, 'intermediate', 'CA INTERMEDIATE'))
        after = self.data()['users']['fnd@x.test']
        self.assertEqual(after['totalXp'], before['totalXp'])
        self.assertEqual(self.data()['subscriptions']['usr-fnd']['status'], 'active', 'subscription untouched')
        for bad in ('finals', 'xyz', '', 'CA Something'):
            st, res = self.call('/api/user/profile', {'examLevelId': bad}, TOK['fnd'])
            self.assertEqual((st, res.get('code')), (400, 'INVALID_EXAM_LEVEL'), bad)
        st, _ = self.call('/api/user/profile', {'caLevel': 'CA Foundation'}, TOK['fnd'])   # older clients
        self.assertEqual(self.data()['users']['fnd@x.test']['examLevelId'], 'foundation')


class TestContentScoping(Harness):
    def ids(self, token):
        st, res = self.call('/api/tests', token=token)
        self.assertEqual(st, 200)
        return sorted(t['id'] for t in res['tests'])

    def test_listing_is_scoped_on_the_server(self):
        self.assertEqual(self.ids(TOK['fnd']), ['t-fnd', 't-fnd-subj', 't-unknown'])
        self.assertEqual(self.ids(TOK['inter']), ['t-int', 't-int-premium', 't-unknown'])
        self.assertEqual(self.ids(TOK['final']), ['t-final', 't-unknown'], 'CA Final is a full level')
        self.assertEqual(len(self.ids(TOK['admin'])), 6)
        self.assertEqual(len(self.ids(None)), 6, 'visitors browse everything')

    def test_other_level_detail_and_start_are_refused(self):
        st, _ = self.call('/api/tests?testId=t-int', token=TOK['fnd'])
        self.assertEqual(st, 404)
        st, _ = self.call('/api/tests/start', {'testId': 't-int'}, TOK['fnd'])
        self.assertEqual(st, 404)
        st, _ = self.call('/api/tests?testId=t-fnd', token=TOK['fnd'])
        self.assertEqual(st, 200)
        for token, other in ((TOK['final'], 't-fnd'), (TOK['final'], 't-int'), (TOK['inter'], 't-final')):
            self.assertEqual(self.call(f'/api/tests?testId={other}', token=token)[0], 404)
            self.assertEqual(self.call('/api/tests/start', {'testId': other}, token)[0], 404)

    def test_scope_follows_profile_change(self):
        self.call('/api/user/profile', {'examLevelId': 'intermediate'}, TOK['fnd'])
        server._collection_last_synced.clear()
        self.assertEqual(self.ids(TOK['fnd']), ['t-int', 't-int-premium', 't-unknown'])

    def test_premium_flag_and_tier_lock_are_independent(self):
        st, res = self.call('/api/tests', token=TOK['inter'])   # free tier
        by_id = {t['id']: t for t in res['tests']}
        self.assertEqual((by_id['t-int']['isPremium'], by_id['t-int']['isLocked']), (True, True))
        self.assertEqual((by_id['t-int-premium']['isPremium'], by_id['t-int-premium']['isLocked']), (True, True))
        self.assertEqual(by_id['t-unknown']['isPremium'], False)
        st, res = self.call('/api/tests', token=TOK['fnd'])      # core subscriber
        by_id = {t['id']: t for t in res['tests']}
        self.assertEqual((by_id['t-fnd']['isPremium'], by_id['t-fnd']['isLocked']), (False, False), 'free-open test is not premium')

    def test_papers_scoped_and_download_refused(self):
        st, res = self.call('/api/papers', token=TOK['inter'])
        self.assertEqual(sorted(p['id'] for p in res['papers']), ['p-int'])
        st, res = self.call('/api/papers', token=TOK['final'])
        self.assertEqual(sorted(p['id'] for p in res['papers']), ['p-final'])
        st, res = self.call('/api/papers', token=TOK['admin'])
        self.assertEqual(len(res['papers']), 3)
        st, _ = self.call('/api/files/download?fileId=qp_int.pdf&paperId=p-int', token=TOK['final'])
        self.assertEqual(st, 404)
        st, _ = self.call('/api/files/download?fileId=qp_fnd.pdf&paperId=p-fnd', token=TOK['inter'])
        self.assertEqual(st, 404)


class TestAdminContentSafety(Harness):
    def test_test_and_paper_cannot_cross_levels(self):
        inter_subject = next(s for s in syllabus_hierarchy.CANONICAL_SUBJECTS if s.get('levelId') == 'intermediate')
        body = {'title': 'x', 'subject': inter_subject['name'], 'subjectId': inter_subject['id'], 'topic': 't', 'examLevel': 'CA Foundation'}
        st, res = self.call('/api/tests', body, TOK['admin'])
        self.assertEqual(st, 400, res)
        st, res = self.call('/api/tests', dict(body, examLevel='CA Intermediate'), TOK['admin'])
        self.assertEqual(st, 200, res)
        saved = next(t for t in self.data()['tests'] if t.get('title') == 'x')
        self.assertEqual(saved['examLevelId'], 'intermediate')
        st, res = self.call('/api/tests', dict(body, title='y', examLevel=None), TOK['admin'])
        saved = next(t for t in self.data()['tests'] if t.get('title') == 'y')
        self.assertEqual(saved['examLevelId'], 'intermediate', 'subject decides when no level is sent (not Foundation)')
        st, res = self.call('/api/papers', {'title': 'p', 'subjectId': inter_subject['id'], 'subject': inter_subject['name'],
                                            'examLevel': 'CA Final'}, TOK['admin'])
        self.assertEqual(st, 400, res)


class TestAdminScheduleEndpoints(Harness):
    def create(self, **kw):
        body = {'name': 'Sched', 'scheduleType': 'recurring', 'dailyTime': '09:00', 'subject': 'Accounting', 'subjectId': 'sub-1',
                'examLevel': 'CA Foundation', 'examLevelId': 'foundation'}
        body.update(kw)
        st, res = self.call('/api/admin/ai/scheduler/tasks', body, TOK['admin'])
        self.assertEqual(st, 200, res)
        return res['task']

    def test_filter_and_duplicate(self):
        fnd = self.create(name='Fnd daily')
        inter_subject = next(s for s in syllabus_hierarchy.CANONICAL_SUBJECTS if s.get('levelId') == 'intermediate')
        inter = self.create(name='Inter daily', subjectId=inter_subject['id'], subject=inter_subject['name'],
                            examLevel='CA Intermediate', examLevelId='intermediate')
        def listed(level):
            st, res = self.call(f'/api/admin/ai/scheduler/tasks?examLevel={level}', token=TOK['admin'])
            self.assertEqual(st, 200)
            return sorted(t['id'] for t in res['tasks'])
        self.assertEqual(listed('foundation'), [fnd['id']])
        self.assertEqual(listed('intermediate'), [inter['id']])
        final_subject = next(s for s in syllabus_hierarchy.CANONICAL_SUBJECTS if s.get('levelId') == 'final')
        fin = self.create(name='Final weekly', subjectId=final_subject['id'], subject=final_subject['name'],
                          examLevel='CA Final', examLevelId='final')
        self.assertEqual(listed('final'), [fin['id']])
        self.assertEqual(listed('all'), sorted([fnd['id'], inter['id'], fin['id']]))
        st, dres = self.call('/api/admin/ai/scheduler/tasks/duplicate', {'taskId': fin['id']}, TOK['admin'])
        self.assertEqual((st, dres['task']['examLevelId'], dres['task']['enabled']), (200, 'final', False))
        self.assertEqual(self.call('/api/admin/ai/scheduler/tasks?examLevel=nope', token=TOK['admin'])[0], 400)

        st, res = self.call('/api/admin/ai/scheduler/tasks/duplicate', {'taskId': inter['id']}, TOK['admin'])
        self.assertEqual(st, 200, res)
        dup = res['task']
        self.assertNotEqual(dup['id'], inter['id'])
        self.assertEqual((dup['examLevelId'], dup['enabled'], dup['name']), ('intermediate', False, 'Inter daily (Copy)'))
        self.assertEqual(listed('intermediate'), sorted([inter['id'], dup['id']]))
        self.assertEqual(self.call('/api/admin/ai/scheduler/tasks/duplicate', {'taskId': inter['id']}, TOK['inter'])[0], 403)
        self.assertEqual(self.call('/api/admin/ai/scheduler/tasks/duplicate', {'taskId': 'nope'}, TOK['admin'])[0], 404)


if __name__ == '__main__':
    unittest.main()
