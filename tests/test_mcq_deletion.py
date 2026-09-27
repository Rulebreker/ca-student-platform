"""
Deleting MCQ questions/tests must stick on every server instance: no resurrection from another
instance's stale copy, from the bundled seed of a fresh instance, or through write-through.
Two instances share one in-memory fake MongoDB (never a real database).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongodb_manager
import server
from tests.test_mongo_persistence import FakeDB, FakeReplaceOne


def make_seed():
    return {
        'users': {}, 'test_attempts': [], 'revoked_users': [], 'revoked_tokens': [],
        'tests': [{'id': 't-1', 'title': 'Five', 'totalQuestions': 5, 'updatedAt': '2026-09-01T00:00:00+00:00'},
                  {'id': 't-2', 'title': 'Other', 'totalQuestions': 1, 'updatedAt': '2026-09-01T00:00:00+00:00'}],
        'questions': [{'id': f'q-{i}', 'testId': 't-1', 'number': i, 'text': f'Q{i}'} for i in range(1, 6)] +
                     [{'id': 'q-x', 'testId': 't-2', 'number': 1, 'text': 'X'}],
    }


class TestDeletionSticks(unittest.TestCase):
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
        # both instances have already uploaded the seed questions to MongoDB
        for q in make_seed()['questions']:
            self.db['questions'].replace_one({'_id': q['id']}, dict(q, _id=q['id']))

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def instance(self, name):
        server._collection_last_synced.clear()
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, f'{name}.json')):
            return server.load_backend_data(refresh_collections=['tests', 'questions'], min_interval=0.0)

    def save(self, name, data):
        with patch.object(server, 'DATA_STORE_FILE', os.path.join(self.tmp, f'{name}.json')):
            server.save_backend_data(data)

    def count(self, data, test_id='t-1'):
        return len([q for q in data['questions'] if q.get('testId') == test_id])

    def test_deleted_question_does_not_come_back_on_another_instance(self):
        a = self.instance('a')
        res = server.delete_questions_everywhere(a, ['q-3'])
        self.save('a', a)
        self.assertEqual(res['updatedTests'], [{'id': 't-1', 'totalQuestions': 4}])
        self.assertNotIn('q-3', self.db['questions'].docs)
        self.assertIn('questions:q-3', self.db['deleted_documents'].docs)

        b = self.instance('b')           # stale copy still has 5 questions on disk
        self.assertEqual(self.count(b), 4)
        t1 = next(t for t in b['tests'] if t['id'] == 't-1')
        self.assertEqual(t1['totalQuestions'], 4, "count follows the deletion (no 'keep larger count' rule)")
        self.assertEqual(sorted(q['number'] for q in a['questions'] if q['testId'] == 't-1'), [1, 2, 3, 4])

    def test_stale_instance_cannot_reupload_a_deleted_question(self):
        a = self.instance('a')
        b = self.instance('b')
        server.delete_questions_everywhere(a, ['q-2'])
        self.save('a', a)
        # b still holds q-2 in memory and edits it, then saves
        next(q for q in b['questions'] if q['id'] == 'q-2')['text'] = 'edited on stale instance'
        self.save('b', b)
        self.assertNotIn('q-2', self.db['questions'].docs)

    def test_fresh_instance_seeded_from_bundle_drops_deleted_records(self):
        a = self.instance('a')
        server.delete_tests_everywhere(a, ['t-2'])
        self.save('a', a)
        with open(os.path.join(self.tmp, 'c.json'), 'w', encoding='utf-8') as f:
            json.dump(make_seed(), f)    # a brand-new instance starts from the bundled seed
        c = self.instance('c')
        self.assertEqual([t['id'] for t in c['tests']], ['t-1'])
        self.assertEqual(self.count(c, 't-2'), 0)

    def test_bulk_question_delete_across_tests(self):
        a = self.instance('a')
        res = server.delete_questions_everywhere(a, ['q-1', 'q-5', 'q-x', 'missing'])
        self.assertEqual(sorted(res['deletedQuestionIds']), ['q-1', 'q-5', 'q-x'])
        self.assertEqual(res['notFound'], ['missing'])
        self.assertEqual({t['id']: t['totalQuestions'] for t in a['tests']}, {'t-1': 3, 't-2': 0})
        self.assertEqual(sorted(q['number'] for q in a['questions'] if q['testId'] == 't-1'), [1, 2, 3])

    def test_bulk_test_delete_removes_their_questions(self):
        a = self.instance('a')
        res = server.delete_tests_everywhere(a, ['t-1', 't-2'])
        self.assertEqual(sorted(res['deletedTestIds']), ['t-1', 't-2'])
        self.assertEqual(res['deletedQuestionCount'], 6)
        self.assertEqual(a['tests'], [])
        self.assertEqual(a['questions'], [])
        self.assertEqual(self.db['questions'].docs, {})


if __name__ == '__main__':
    unittest.main()
