"""
Canonical Local Qwen pipeline (ai_mcq_engine.generate_exact_mcqs_pipeline).
Ollama is mocked at local_qwen_service.generate_mcqs, so these tests are fast and offline.
"""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_mcq_engine

CHAPTER = dict(subject='Business Economics', chapter='Theory of Demand and Supply', exam_level='CA Foundation')

TOPICS = [
    'price elasticity of demand for a normal good', 'the law of supply and upward sloping curves',
    'income elasticity for inferior goods', 'cross elasticity between substitute goods',
    'movement along a demand curve versus a shift', 'determinants of market demand for tea',
    'Giffen goods and the law of demand', 'advertisement elasticity of demand concept',
    'consumer surplus under Marshallian analysis', 'expansion and contraction of supply',
    'arc elasticity measured between two points', 'demand forecasting using the survey method',
]


class FakeQwen:
    """Stand-in for local_qwen_service.generate_mcqs returning unique, valid MCQs."""

    def __init__(self, plan=None):
        self.calls = []          # (count, timeout)
        self.plan = plan or {}   # call_index -> 'error' | int (how many valid questions to return)
        self.serial = 0

    def __call__(self, subject, chapter, count, **kwargs):
        idx = len(self.calls)
        self.calls.append((count, kwargs.get('timeout'), kwargs.get('syllabus_scope', '')))
        self.kwargs = getattr(self, 'kwargs', []) + [kwargs]
        action = self.plan.get(idx, count)
        if action == 'error':
            raise TimeoutError('Local Qwen generation timed out')
        out = []
        for _ in range(action):
            topic = TOPICS[self.serial % len(TOPICS)]
            self.serial += 1
            out.append({
                'question': f"Which statement best explains {topic} in the ICAI syllabus (case {self.serial})?",
                'optionA': f"Alpha answer {self.serial}", 'optionB': f"Beta answer {self.serial}",
                'optionC': f"Gamma answer {self.serial}", 'optionD': f"Delta answer {self.serial}",
                'correctAnswer': 'B', 'correctOption': 'B',
                'explanation': f"Option B is correct because of the rule about {topic}.",
                'subject': subject, 'chapter': chapter,
            })
        return out, {'model': 'qwen3:8b'}


class TestCanonicalPipeline(unittest.TestCase):
    def run_pipeline(self, fake, **overrides):
        progress = []
        saved = []
        kwargs = dict(CHAPTER, topic='Law of Demand', count=10, job_id='job-t',
                      progress_callback=progress.append,
                      on_question_verified=lambda q, all_q, n, total: saved.append(q))
        kwargs.update(overrides)
        with patch('local_qwen_service.generate_mcqs', side_effect=fake):
            qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(**kwargs)
        return qs, metrics, progress, saved

    def test_ten_questions_run_as_five_batches_of_two(self):
        fake = FakeQwen()
        qs, metrics, progress, saved = self.run_pipeline(fake)
        self.assertEqual([c[0] for c in fake.calls], [2, 2, 2, 2, 2])
        self.assertEqual(len(qs), 10)
        self.assertEqual(metrics['finalStatus'], 'COMPLETED')
        after_batches = [p['verifiedCount'] for p in progress if p['stage'] == 'batch_complete']
        self.assertEqual(after_batches, [2, 4, 6, 8, 10])
        self.assertEqual(len(saved), 10, "every verified question is handed to on_question_verified")
        self.assertEqual([q['number'] for q in qs], list(range(1, 11)))

    def test_per_batch_timeout_and_syllabus_scope_are_passed(self):
        fake = FakeQwen()
        self.run_pipeline(fake, count=2, batch_timeout=123)
        self.assertEqual(fake.calls[0][1], 123)
        self.assertIn('Allowed topics', fake.calls[0][2])

    def test_metadata_and_marking_propagate(self):
        qs, _, _, _ = self.run_pipeline(FakeQwen(), count=2, marks_per_correct=4.0, negative_marks_per_wrong=1.0,
                                        platform_xp=15.0, question_category='Direct Questions', test_id='tst-1')
        q = qs[0]
        self.assertEqual((q['marks'], q['negativeMarks'], q['points']), (4.0, 1.0, 15.0))
        self.assertEqual(q['subject'], 'Business Economics')
        self.assertEqual(q['chapter'], 'Theory of Demand and Supply')
        self.assertEqual(q['chapterId'], 'ch-fnd-eco-2')
        self.assertEqual(q['examLevel'], 'CA Foundation')
        self.assertEqual(q['category'], 'Direct Questions')
        self.assertEqual(q['testId'], 'tst-1')
        self.assertEqual(q['options']['B'], q['optionB'])

    def test_unknown_or_legacy_parameter_names_are_rejected(self):
        for bad in ({'negative_marks': 0.5}, {'exam_level_id': 'foundation'}, {'target_count': 10}, {'category': 'x'}):
            with self.assertRaises(TypeError, msg=f"{bad} must not be silently ignored"):
                with patch('local_qwen_service.generate_mcqs', side_effect=FakeQwen()):
                    ai_mcq_engine.generate_exact_mcqs_pipeline(**CHAPTER, count=2, **bad)

    def test_short_batch_retry_keeps_successful_questions_and_fills_only_the_gap(self):
        fake = FakeQwen(plan={0: 1})  # batch 1 first attempt returns only 1 valid question
        qs, metrics, _, _ = self.run_pipeline(fake, count=4)
        self.assertEqual([c[0] for c in fake.calls], [2, 2, 2], "retry asks a full (<=2) batch for spare candidates")
        self.assertEqual(fake.kwargs[1]['temperature'], ai_mcq_engine.RETRY_TEMPERATURE)
        self.assertIsNone(fake.kwargs[0]['temperature'])
        self.assertEqual(len(qs), 4, "the retry fills only the 1 missing slot")
        self.assertEqual([q['number'] for q in qs], [1, 2, 3, 4])
        self.assertEqual(metrics['regenerationAttempts'], 1)
        self.assertTrue(all(c[0] <= 2 for c in fake.calls), "never more than 2 MCQs per Ollama call")

    def test_failed_batch_retried_once_then_filled_by_single_top_up(self):
        fake = FakeQwen(plan={0: 'error', 1: 'error'})  # batch 1 fails twice
        qs, metrics, progress, _ = self.run_pipeline(fake, count=4)
        self.assertEqual(len(fake.calls), 4, "batch 1 x2, batch 2 x1, then one top-up call")
        self.assertEqual(len(qs), 4)
        self.assertEqual(metrics['finalStatus'], 'COMPLETED')
        self.assertEqual((metrics['batchesFailed'], metrics['topUpCalls']), (1, 1))
        self.assertEqual([s['status'] for s in metrics['questionStatuses']], ['saved'] * 4)

    def test_top_up_is_bounded_and_run_ends_partial(self):
        fake = FakeQwen(plan={0: 'error', 1: 'error', 3: 'error'})  # batch 1 fails, its top-up fails too
        qs, metrics, _, _ = self.run_pipeline(fake, count=4)
        self.assertEqual(len(fake.calls), 4)
        self.assertEqual(len(qs), 2)
        self.assertEqual(metrics['finalStatus'], 'PARTIAL')
        statuses = [s['status'] for s in metrics['questionStatuses']]
        self.assertEqual(statuses, ['failed', 'failed', 'saved', 'saved'])
        self.assertIn('timed out', metrics['questionStatuses'][0]['error'])

    def test_all_batches_fail_gives_failed_without_looping(self):
        fake = FakeQwen(plan={i: 'error' for i in range(50)})
        qs, metrics, _, _ = self.run_pipeline(fake, count=6)
        self.assertEqual(len(fake.calls), 9, "3 batches x (attempt + retry) + 3 top-ups, then stop")
        self.assertEqual(qs, [])
        self.assertEqual(metrics['finalStatus'], 'FAILED')

    def test_duplicates_are_rejected(self):
        existing = [{'text': "Which statement best explains price elasticity of demand for a normal good in the ICAI syllabus (case 1)?"}]
        fake = FakeQwen()
        qs, metrics, _, _ = self.run_pipeline(fake, count=2, existing_questions=existing)
        self.assertGreaterEqual(metrics['rejectedDuplicates'], 1)
        self.assertEqual(len(qs), 2)

    def test_existing_bank_and_run_questions_are_sent_as_avoid_list(self):
        existing = [{'text': f'Existing bank question {i} on demand?'} for i in range(30)]
        fake = FakeQwen()
        self.run_pipeline(fake, count=4, existing_questions=existing)
        first, second = fake.kwargs[0]['previous_concepts'], fake.kwargs[1]['previous_concepts']
        self.assertEqual(len(first), ai_mcq_engine.AVOID_LIST_SIZE)
        self.assertIn('Existing bank question 29 on demand?', first, "newest bank questions are included")
        self.assertEqual(len(second), ai_mcq_engine.AVOID_LIST_SIZE)
        self.assertTrue(any('case 1)' in c for c in second), "questions from earlier batches are included")

    def test_whole_chapter_requests_rotate_sub_topics_per_batch(self):
        fake = FakeQwen()
        self.run_pipeline(fake, count=6, topic='Theory of Demand and Supply')
        topics = [k['topic'] for k in fake.kwargs]
        self.assertEqual(len(set(topics)), 3, f"each batch targets a different allowed topic: {topics}")

    def test_specific_admin_topic_is_not_rotated(self):
        fake = FakeQwen()
        self.run_pipeline(fake, count=4, topic='Elasticity of Demand')
        self.assertEqual({k['topic'] for k in fake.kwargs}, {'Elasticity of Demand'})

    def test_correct_answers_are_spread_evenly_and_keep_their_text(self):
        from collections import Counter
        qs, _, _, _ = self.run_pipeline(FakeQwen(), count=12)  # the fake model always answers "B"
        self.assertEqual(Counter(q['correctOption'] for q in qs), Counter({'A': 3, 'B': 3, 'C': 3, 'D': 3}))
        for q in qs:
            self.assertTrue(q[f"option{q['correctOption']}"].startswith('Beta answer'), "correct text moves with the key")
            self.assertEqual(q['correctAnswer'], q['correctOption'])
            self.assertEqual(q['options'][q['correctOption']], q[f"option{q['correctOption']}"])
            self.assertEqual(len({q['optionA'], q['optionB'], q['optionC'], q['optionD']}), 4)

    def test_shuffle_remaps_letter_references_in_explanation(self):
        import random
        q = {'optionA': 'alpha', 'optionB': 'beta', 'optionC': 'gamma', 'optionD': 'delta', 'correctAnswer': 'B',
             'correctOption': 'B', 'explanation': "Option B is correct. (A) is wrong. The answer is B. A choice a firm makes."}
        ai_mcq_engine.shuffle_options_to(q, 'D', random.Random(7))
        self.assertEqual((q['correctOption'], q['optionD']), ('D', 'beta'))
        self.assertIn('Option D is correct', q['explanation'])
        self.assertIn('The answer is D', q['explanation'])
        old_a_new = next(k for k in 'ABCD' if q[f'option{k}'] == 'alpha')
        self.assertIn(f'({old_a_new}) is wrong', q['explanation'])
        self.assertTrue(q['explanation'].endswith('A choice a firm makes.'), "prose is untouched")

    def test_start_number_offsets_numbering_for_resumed_jobs(self):
        qs, metrics, _, _ = self.run_pipeline(FakeQwen(), count=4, start_number=7)
        self.assertEqual([q['number'] for q in qs], [7, 8, 9, 10])
        self.assertEqual([s['number'] for s in metrics['questionStatuses']], [7, 8, 9, 10])

    def test_cancel_check_stops_before_next_batch(self):
        fake = FakeQwen()
        state = {'n': 0}

        def cancel():
            state['n'] += 1
            return state['n'] > 1  # allow first batch only

        with self.assertRaises(ai_mcq_engine.GenerationCancelled):
            self.run_pipeline(fake, count=6, cancel_check=cancel)
        self.assertEqual(len(fake.calls), 1)

    def test_unresolvable_chapter_fails_fast_without_calling_qwen(self):
        fake = FakeQwen()
        qs, metrics, _, _ = self.run_pipeline(fake, chapter='No Such Chapter Xyzzy', topic='No Such Chapter Xyzzy', count=2)
        self.assertEqual(fake.calls, [])
        self.assertEqual(metrics['finalStatus'], 'FAILED')
        self.assertIn('CHAPTER_METADATA_MISSING', metrics['error'])


if __name__ == '__main__':
    unittest.main()
