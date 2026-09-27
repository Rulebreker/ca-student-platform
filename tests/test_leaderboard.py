"""
Server-backed leaderboard (GET /api/leaderboard): ranking comes from the stored records and the
student's exam level comes from the authenticated account, never from the request.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch

import leaderboard_service
import server
from tests.test_exam_levels import TOK, Harness, user

EXTRA_TOK = {'fnd2': 'sess_' + 'G' * 43, 'final2': 'sess_' + 'H' * 43, 'nolevel': 'sess_' + 'N' * 43}


class LeaderboardHarness(Harness):
    def setUp(self):
        super().setUp()
        seed_users = patch.object(server, 'INITIAL_USERS', {})   # only this test's students are ranked
        seed_users.start()
        self.addCleanup(seed_users.stop)
        d = self.data()
        users = d['users']
        users['fnd@x.test'].pop('totalXp', None)          # XP computed from the records below
        users['fnd@x.test'].update(name='Asha', baseXp=10)
        users['fnd2@x.test'] = user('usr-fnd2', 'fnd2@x.test', 'student', EXTRA_TOK['fnd2'], 'CA FOUNDATION', name='Bina')
        users['inter@x.test'].update(name='Chetan', totalXp=900)
        users['final2@x.test'] = user('usr-final2', 'final2@x.test', 'student', EXTRA_TOK['final2'], None,
                                      examLevelId='final', name='Dev', totalXp=50)
        users['final@x.test'].update(name='Esha', totalXp=50)
        users['nolevel@x.test'] = user('usr-nolevel', 'nolevel@x.test', 'student', EXTRA_TOK['nolevel'], None, name='Zed')
        users['gone@x.test'] = user('usr-gone', 'gone@x.test', 'student', None, 'CA FOUNDATION', name='Gone', isActive=False, totalXp=99999)
        d['tests'][0]['subject'] = 'Accounting'
        d['test_attempts'] = [
            {'id': 'a1', 'userId': 'usr-fnd', 'testId': 't-fnd', 'earnedPoints': 40, 'correctCount': 4},
            {'id': 'a2', 'userId': 'usr-fnd', 'testId': 't-fnd', 'earnedPoints': 70, 'correctCount': 7},   # best attempt counts
            {'id': 'a3', 'userId': 'usr-fnd2', 'testId': 't-fnd-subj', 'earnedPoints': 80, 'correctCount': 8},
        ]
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(d, f)

    def board(self, token, query=''):
        return self.call('/api/leaderboard' + query, token=token)


class TestLeaderboardApi(LeaderboardHarness):
    def test_each_level_sees_only_its_own_students(self):
        st, res = self.board(TOK['fnd'])
        self.assertEqual(st, 200, res)
        self.assertEqual(res['examLevelId'], 'foundation')
        rows = res['rows']
        self.assertEqual([r['id'] for r in rows], ['usr-fnd2', 'usr-fnd'], '80 XP each: more correct answers ranks first')
        self.assertEqual([r['rank'] for r in rows], [1, 2])
        self.assertEqual((rows[1]['totalXp'], rows[1]['correctQuestions']), (80, 7), 'best attempt (70) + baseXp (10)')
        self.assertEqual((rows[0]['totalXp'], rows[0]['correctQuestions']), (80, 8))
        st, res = self.board(TOK['inter'])
        self.assertEqual([r['id'] for r in res['rows']], ['usr-inter'])
        st, res = self.board(TOK['final'])
        self.assertEqual({r['examLevelId'] for r in res['rows']}, {'final'})
        self.assertEqual(sorted(r['id'] for r in res['rows']), ['usr-final', 'usr-final2'])

    def test_student_cannot_pick_another_level(self):
        for q in ('?examLevel=intermediate', '?examLevel=all', '?examLevel=CA%20Final', '?examLevelId=final'):
            st, res = self.board(TOK['fnd'], q)
            self.assertEqual(st, 200)
            self.assertEqual({r['examLevelId'] for r in res['rows']}, {'foundation'}, q)

    def test_auth_and_missing_level(self):
        self.assertEqual(self.board(None)[0], 401)
        self.assertEqual(self.board('sess_' + 'Q' * 43)[0], 401)
        st, res = self.board(EXTRA_TOK['nolevel'])
        self.assertEqual((st, res.get('code')), (409, 'EXAM_LEVEL_REQUIRED'))

    def test_staff_choose_the_level(self):
        st, res = self.board(TOK['admin'], '?examLevel=intermediate')
        self.assertEqual([r['id'] for r in res['rows']], ['usr-inter'])
        st, res = self.board(TOK['admin'])
        self.assertEqual(len(res['rows']), 6, 'all active students with or without a level')
        self.assertNotIn('usr-gone', [r['id'] for r in res['rows']], 'inactive students are not ranked')
        self.assertEqual(self.board(TOK['admin'], '?examLevel=bogus')[0], 400)

    def test_ties_break_on_correct_answers_then_name(self):
        st, res = self.board(TOK['final'])
        self.assertEqual([r['name'] for r in res['rows']], ['Dev', 'Esha'], 'equal XP and answers: by name')
        self.assertEqual([r['rank'] for r in res['rows']], [1, 2])

    def test_rows_expose_no_private_fields(self):
        st, res = self.board(TOK['admin'])
        blob = json.dumps(res)
        for secret in ('password', 'token', 'sessionTokens', '@x.test', 'phone'):
            self.assertNotIn(secret, blob, secret)

    def test_profile_level_change_moves_the_student(self):
        st, _ = self.call('/api/user/profile', {'examLevelId': 'final'}, TOK['fnd'])
        self.assertEqual(st, 200)
        st, res = self.board(TOK['fnd'])
        self.assertEqual(res['examLevelId'], 'final')
        self.assertIn('usr-fnd', [r['id'] for r in res['rows']])
        st, res = self.board(EXTRA_TOK['fnd2'])
        self.assertEqual([r['id'] for r in res['rows']], ['usr-fnd2'], 'no longer on the Foundation board')
        st, res = self.board(TOK['inter'])
        self.assertNotIn('usr-fnd', [r['id'] for r in res['rows']])

    def test_subject_filter(self):
        st, res = self.board(TOK['fnd'], '?subject=Accounting')
        rows = {r['id']: r for r in res['rows']}
        self.assertEqual(rows['usr-fnd']['mcqXp'], 70, 'matched by subject name')
        self.assertEqual(rows['usr-fnd2']['mcqXp'], 80, 'matched through subjectId sub-1')
        st, res = self.board(TOK['fnd'], '?subject=No%20Such%20Subject')
        self.assertEqual({r['mcqXp'] for r in res['rows']}, {0})
        self.assertEqual({r['referralXp'] for r in res['rows']}, {0}, 'referral XP only in the overall view')


class TestSampleAccounts(Harness):
    """Built-in demo students: never ranked or re-created in production; available when explicitly enabled."""

    def setUp(self):
        super().setUp()
        env = patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop('EXCELLENCECA_SAMPLE_DATA', None)
        d = self.data()
        # a demo account already stored (e.g. from the bundled seed) and a real student on a normal domain
        d['users']['old.demo@castudent.in'] = user('usr-student-9001', 'old.demo@castudent.in', 'student', None, 'CA FINAL', totalXp=99999)
        d['users']['real@gmail.com'] = user('usr-real', 'real@gmail.com', 'student', None, 'CA FINAL', totalXp=10)
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(d, f)

    def seeded_sample_ids(self):
        import sample_accounts
        return {u['id'] for u in server.INITIAL_USERS.values() if sample_accounts.is_seed_sample_student(u)}

    def test_production_excludes_samples_and_does_not_recreate_them(self):
        seeded = self.seeded_sample_ids()
        self.assertGreater(len(seeded), 30, 'the repo ships ~36 sample students')
        st, res = self.call('/api/leaderboard', token=TOK['final'])
        ids = [r['id'] for r in res['rows']]
        self.assertEqual(st, 200)
        self.assertIn('usr-real', ids, 'real student ranked normally')
        self.assertIn('usr-final', ids)
        self.assertNotIn('usr-student-9001', ids, 'stored demo account not ranked')
        self.assertFalse(set(ids) & seeded)
        st, res = self.call('/api/leaderboard', token=TOK['admin'])
        self.assertFalse({r['id'] for r in res['rows']} & (seeded | {'usr-student-9001'}), 'not even on the staff board')
        loaded = server.load_backend_data()
        server.save_backend_data(loaded)
        stored = {u.get('id') for u in loaded['users'].values()} | {u.get('id') for u in self.data()['users'].values()}
        self.assertFalse(stored & seeded, 'sample students are not added back on load/save')
        self.assertIn('usr-student-9001', stored, 'nothing is deleted')
        self.assertIn('usr-admin-1', stored, 'staff seed accounts still provisioned')

    def test_development_flag_restores_sample_data(self):
        os.environ['EXCELLENCECA_SAMPLE_DATA'] = '1'
        st, res = self.call('/api/leaderboard', token=TOK['final'])
        ids = {r['id'] for r in res['rows']}
        self.assertIn('usr-student-9001', ids)
        self.assertIn('usr-real', ids)
        self.assertTrue(ids & self.seeded_sample_ids(), 'seed Final sample students ranked in development')
        self.assertTrue({u.get('id') for u in server.load_backend_data()['users'].values()} & self.seeded_sample_ids(),
                        'seeded on load in development')

    def test_explicit_flag_overrides_the_domain(self):
        import sample_accounts
        self.assertFalse(sample_accounts.is_sample_account({'email': 'x@castudent.in', 'isSample': False}))
        self.assertTrue(sample_accounts.is_sample_account({'email': 'x@gmail.com', 'isSample': True}))
        self.assertFalse(sample_accounts.is_sample_account({'email': 'someone@castudent.in.example.com'}))
        self.assertFalse(sample_accounts.is_sample_account({'email': 'real@gmail.com', 'id': 'usr-student-1'}),
                         'a real account is never matched by id alone')


class TestLeaderboardPrivacy(LeaderboardHarness):
    def test_rows_carry_only_public_fields(self):
        d = self.data()
        d['users']['final@x.test'].update(phone='9998887776', address='12 Secret Lane', dob='2001-01-01', city='Pune',
                                          resetToken='rt_hidden', referralCode='REF-HIDDEN', lastLoginIp='10.1.2.3')
        with open(self.store, 'w', encoding='utf-8') as f:
            json.dump(d, f)
        allowed = {'id', 'name', 'username', 'examLevelId', 'caLevel', 'avatar', 'state', 'district', 'city', 'previousRank',
                   'achievementBadges', 'subscriptionTier', 'totalXp', 'mcqXp', 'descriptiveXp', 'referralXp', 'baseXp',
                   'correctQuestions', 'rank'}
        for tok in (TOK['final'], TOK['admin']):
            st, res = self.board(tok)
            self.assertEqual(st, 200)
            for row in res['rows']:
                self.assertEqual(set(row) - allowed, set(), row.get('id'))
            blob = json.dumps(res)
            for secret in ('@x.test', '9998887776', 'Secret Lane', '2001-01-01', 'rt_hidden', 'REF-HIDDEN', '10.1.2.3',
                           'sess_', 'sha256:', 'password', 'sessionTokens', 'token'):
                self.assertNotIn(secret, blob, secret)


class TestLeaderboardService(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(leaderboard_service.build_leaderboard({}, 'final'), [])
        self.assertEqual(leaderboard_service.build_leaderboard({'users': {}}, None), [])

    def test_total_xp_is_authoritative_and_rounding_is_half_up(self):
        s = {'id': 'u', 'role': 'student', 'examLevelId': 'final', 'name': 'U'}
        tests = {'t': {'id': 't'}}
        xp = leaderboard_service.student_xp(s, [{'testId': 't', 'earnedPoints': 2.5}], [], tests, {}, {})
        self.assertEqual(xp['totalXp'], 3)
        xp = leaderboard_service.student_xp(dict(s, totalXp=0), [{'testId': 't', 'earnedPoints': 50}], [], tests, {}, {})
        self.assertEqual(xp['totalXp'], 0, 'admin reset wins in the overall view')

    def test_revoked_and_expired_subscription(self):
        data = {'users': {'a': {'id': 'u1', 'email': 'a', 'role': 'student', 'examLevelId': 'final'},
                          'b': {'id': 'u2', 'email': 'b', 'role': 'student', 'examLevelId': 'final'}},
                'revoked_users': ['u2'],
                'subscriptions': {'u1': {'status': 'active', 'planTier': 'elite', 'expiresAt': '2000-01-01T00:00:00Z'}}}
        rows = leaderboard_service.build_leaderboard(data, 'final')
        self.assertEqual([r['id'] for r in rows], ['u1'])
        self.assertEqual(rows[0]['subscriptionTier'], 'free')


if __name__ == '__main__':
    unittest.main()
