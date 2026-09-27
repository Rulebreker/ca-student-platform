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
    """Stand-in for local_qwen_service.generate_mcqs returning unique, valid MCQs.

    plan: call_index -> 'error' | int (how many valid questions) | list of candidate kinds:
      'ok' new unique MCQ, 'dup' exact copy of an earlier returned MCQ, 'near' near-duplicate of one,
      'bank' copy of self.bank_text (a question-bank stem), 'invalid' schema-invalid (empty option D).
    """

    def __init__(self, plan=None, bank_text=''):
        self.calls = []          # (count, timeout)
        self.plan = plan or {}
        self.serial = 0
        self.produced = []       # every 'ok' candidate returned
        self.bank_text = bank_text
        self.returned = []       # every candidate returned (any kind)

    def _ok(self, subject, chapter, record=True):
        topic = TOPICS[self.serial % len(TOPICS)]
        self.serial += 1
        q = {
            'question': f"Which statement best explains {topic} in the ICAI syllabus (case {self.serial})?",
            'optionA': f"Alpha answer {self.serial}", 'optionB': f"Beta answer {self.serial}",
            'optionC': f"Gamma answer {self.serial}", 'optionD': f"Delta answer {self.serial}",
            'correctAnswer': 'B', 'correctOption': 'B',
            'explanation': f"Option B is correct because of the rule about {topic}.",
            'subject': subject, 'chapter': chapter,
        }
        if record:
            self.produced.append(q)   # returned 'ok' candidates: what 'dup' / 'near' copy
        return q

    def _candidate(self, kind, subject, chapter):
        if kind == 'ok':
            return self._ok(subject, chapter)
        base = (dict(self.produced[len(self.returned) % len(self.produced)]) if self.produced
                else self._ok(subject, chapter, record=False))
        if kind == 'dup':
            return dict(base)
        if kind == 'near':
            return dict(base, question=base['question'].replace(')?', ') now?'))
        if kind == 'bank':
            return dict(base, question=self.bank_text)
        if kind == 'invalid':
            return dict(self._ok(subject, chapter, record=False), optionD='')
        raise ValueError(kind)

    def __call__(self, subject, chapter, count, **kwargs):
        idx = len(self.calls)
        self.calls.append((count, kwargs.get('timeout'), kwargs.get('syllabus_scope', '')))
        self.kwargs = getattr(self, 'kwargs', []) + [kwargs]
        action = self.plan.get(idx, count)
        if action == 'error':
            raise TimeoutError('Local Qwen generation timed out')
        kinds = action if isinstance(action, list) else ['ok'] * action
        out = [self._candidate(k, subject, chapter) for k in kinds]
        self.returned.extend(out)
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

    def test_short_response_is_topped_up_without_regenerating_accepted_questions(self):
        fake = FakeQwen(plan={0: 1})  # round 1 returns only 1 of the 2 requested candidates
        qs, metrics, _, _ = self.run_pipeline(fake, count=4)
        self.assertEqual([c[0] for c in fake.calls], [2, 2, 1], "then exactly the missing number, <= batch size")
        self.assertIsNone(fake.kwargs[0]['temperature'])
        self.assertEqual(fake.kwargs[1]['temperature'], ai_mcq_engine.RETRY_TEMPERATURE, "replacement rounds diversify")
        self.assertEqual(len(qs), 4)
        self.assertEqual([q['number'] for q in qs], [1, 2, 3, 4])
        self.assertEqual(metrics['finalStatus'], 'COMPLETED')
        self.assertTrue(all(c[0] <= 2 for c in fake.calls), "never more than 2 MCQs per Ollama call")

    def test_transient_provider_errors_are_recovered(self):
        fake = FakeQwen(plan={0: 'error', 1: 'error'})  # two failed calls, then Qwen recovers
        qs, metrics, _, _ = self.run_pipeline(fake, count=4)
        self.assertEqual(len(fake.calls), 4)
        self.assertEqual(len(qs), 4)
        self.assertEqual(metrics['finalStatus'], 'COMPLETED')
        self.assertEqual([s['status'] for s in metrics['questionStatuses']], ['saved'] * 4)

    def test_provider_unavailable_from_the_start_fails_with_reason_without_looping(self):
        fake = FakeQwen(plan={i: 'error' for i in range(50)})
        qs, metrics, _, _ = self.run_pipeline(fake, count=6)
        self.assertEqual(len(fake.calls), ai_mcq_engine.MAX_CONSECUTIVE_PROVIDER_FAILURES)
        self.assertEqual(qs, [])
        self.assertEqual(metrics['finalStatus'], 'FAILED')
        self.assertIn('PROVIDER_UNAVAILABLE', metrics['error'])

    # ---------------------------------------------------------------- target fill
    def assert_complete_and_clean(self, qs, metrics, saved, count, fake):
        """COMPLETED means exactly `count` unique validated questions, none of them a rejected candidate."""
        self.assertEqual(metrics['finalStatus'], 'COMPLETED')
        self.assertEqual(len(qs), count)
        self.assertEqual(len({q['text'] for q in qs}), count, "all unique")
        self.assertEqual([q['number'] for q in qs], list(range(1, count + 1)))
        self.assertEqual([q['id'] for q in saved], [q['id'] for q in qs], "only accepted questions are handed over for saving")
        self.assertEqual(len(saved), count, "no rejected candidate is handed over for saving")
        # an exact duplicate shares its text with the accepted original; every other rejected stem must be absent
        rejected_stems = {r['question'] for r in metrics['rejectedCandidates']
                          if r['question'] and 'Identical match with a question already generated' not in r['reason']}
        self.assertFalse(rejected_stems & {q['text'] for q in qs}, "no rejected candidate is persisted")
        self.assertEqual([s['status'] for s in metrics['questionStatuses']], ['saved'] * count)
        self.assertNotIn('failed', [s['status'] for s in metrics['questionStatuses']])

    def test_two_duplicates_in_last_round_get_replacements_10_of_10(self):
        fake = FakeQwen(plan={4: ['dup', 'dup']})   # Q1-Q8 pass, Q9/Q10 candidates are duplicates
        qs, metrics, progress, saved = self.run_pipeline(fake, count=10)
        self.assertEqual([c[0] for c in fake.calls], [2, 2, 2, 2, 2, 2], "one replacement round for the 2 missing")
        self.assert_complete_and_clean(qs, metrics, saved, 10, fake)
        self.assertEqual(metrics['rejectedDuplicates'], 2)
        texts = [p['status'] for p in progress]
        self.assertIn('8/10 verified \u2014 generating 2 replacement questions...', texts)
        after_rejection = [p for p in progress if p['stage'] == 'batch_complete' and p['verifiedCount'] == 8][-1]
        tail = [(s['number'], s['status']) for s in after_rejection['questionStatuses'][8:]]
        self.assertEqual(tail, [(9, 'retrying'), (10, 'retrying')], "Q9/Q10 are RETRYING, never FAILED")
        self.assertTrue(all(s['error'].startswith('Rejected: Duplicate') for s in after_rejection['questionStatuses'][8:]))
        fresh = [t for t in texts if 'replacement' in t]
        self.assertEqual(len([t for t in texts if t.startswith(('2/10', '4/10', '6/10')) and 'replacement' in t]), 0,
                         f"first-pass rounds are not labelled replacements: {fresh}")
        repl = fake.kwargs[5]
        self.assertEqual(repl['temperature'], ai_mcq_engine.RETRY_TEMPERATURE)
        self.assertEqual(len(repl['rejected_stems']), 2, "rejected stems are sent as DO NOT REPEAT")
        self.assertTrue(repl['diversification'], "a different framing angle is requested")
        self.assertNotEqual(repl['diversification'], fake.kwargs[4].get('diversification'))

    def test_replacement_that_is_again_a_duplicate_gets_another_round(self):
        fake = FakeQwen(plan={4: ['dup', 'dup'], 5: ['ok', 'dup']})
        qs, metrics, progress, saved = self.run_pipeline(fake, count=10)
        self.assertEqual([c[0] for c in fake.calls], [2, 2, 2, 2, 2, 2, 1])
        self.assert_complete_and_clean(qs, metrics, saved, 10, fake)
        texts = [p['status'] for p in progress]
        self.assertIn('9/10 verified \u2014 generating 1 replacement question...', texts)
        self.assertEqual(len(fake.kwargs[6]['rejected_stems']), 3)
        angles = [k['diversification'] for k in fake.kwargs[5:7]]
        self.assertNotEqual(angles[0], angles[1], "each replacement round varies the angle")
        self.assertEqual(metrics['replacementRounds'], 2)

    def test_question_bank_duplicate_is_replaced(self):
        bank = "Which statement best explains the role of the ICAI Council in approving accounting standards?"
        fake = FakeQwen(plan={0: ['bank', 'ok']}, bank_text=bank)
        qs, metrics, _, saved = self.run_pipeline(fake, count=2, existing_questions=[{'id': 'q-bank-1', 'text': bank}])
        self.assert_complete_and_clean(qs, metrics, saved, 2, fake)
        self.assertEqual(metrics['rejectedDuplicates'], 1)
        self.assertIn('question bank', metrics['rejectedCandidates'][0]['reason'])
        self.assertNotIn(bank, [q['text'] for q in qs])

    def test_near_duplicate_above_threshold_is_replaced(self):
        fake = FakeQwen(plan={0: ['ok', 'near']})
        qs, metrics, _, saved = self.run_pipeline(fake, count=2)
        near = fake.returned[1]['question']
        sim = ai_mcq_engine.calculate_jaccard_similarity(near, fake.returned[0]['question'],
                                                         'Business Economics Law of Demand')
        self.assertGreaterEqual(sim, ai_mcq_engine.DUPLICATE_SIMILARITY_THRESHOLD)
        self.assertNotEqual(near, fake.returned[0]['question'], "not an exact copy")
        self.assert_complete_and_clean(qs, metrics, saved, 2, fake)
        self.assertIn('Near-duplicate', metrics['rejectedCandidates'][0]['reason'])

    def test_invalid_schema_candidate_is_replaced(self):
        fake = FakeQwen(plan={0: ['invalid', 'ok']})
        qs, metrics, _, saved = self.run_pipeline(fake, count=2)
        self.assert_complete_and_clean(qs, metrics, saved, 2, fake)
        self.assertEqual(metrics['rejectedValidation'], 1)
        self.assertEqual(len(fake.calls), 2)

    def test_provider_failure_after_progress_is_partial_with_reason(self):
        fake = FakeQwen(plan={i: 'error' for i in range(2, 50)})   # 4 accepted, then Ollama goes away
        qs, metrics, _, saved = self.run_pipeline(fake, count=10)
        self.assertEqual(len(qs), 4)
        self.assertEqual(len(fake.calls), 2 + ai_mcq_engine.MAX_CONSECUTIVE_PROVIDER_FAILURES)
        self.assertEqual(metrics['finalStatus'], 'PARTIAL')
        self.assertIn('PROVIDER_UNAVAILABLE', metrics['partialReason'])
        statuses = [s['status'] for s in metrics['questionStatuses']]
        self.assertEqual(statuses, ['saved'] * 4 + ['unfilled'] * 6)
        self.assertNotIn('failed', statuses)

    def test_global_budget_exhausted_is_partial_and_bounded(self):
        fake = FakeQwen(plan={i: ['dup', 'dup'] for i in range(1, 50)})   # every replacement is a duplicate
        qs, metrics, _, saved = self.run_pipeline(fake, count=4, candidate_budget=10)
        self.assertEqual(len(qs), 2)
        self.assertEqual(metrics['candidatesEvaluated'], 10, "stops exactly at the budget")
        self.assertEqual(len(fake.calls), 5)
        self.assertEqual(metrics['finalStatus'], 'PARTIAL')
        self.assertIn('GENERATION_BUDGET_EXHAUSTED', metrics['partialReason'])
        self.assertEqual([q['id'] for q in saved], [q['id'] for q in qs])
        # default budget is also finite
        fake = FakeQwen(plan={i: ['dup', 'dup'] for i in range(1, 500)})
        qs, metrics, _, _ = self.run_pipeline(fake, count=10)
        self.assertEqual(metrics['candidatesEvaluated'], ai_mcq_engine.generation_budget(10))
        self.assertEqual(metrics['finalStatus'], 'PARTIAL')

    def test_progress_is_accepted_over_target_and_never_100_before_complete(self):
        fake = FakeQwen(plan={4: ['dup', 'dup'], 5: ['ok', 'dup']})
        _, _, progress, _ = self.run_pipeline(fake, count=10)
        for p in progress:
            self.assertEqual(p['progressPct'], min(95, 5 + int(p['verifiedCount'] / 10 * 90)))
            self.assertLess(p['progressPct'], 100)
        eight = [p for p in progress if p['verifiedCount'] == 8]
        self.assertTrue(eight and all(p['progressPct'] == 77 for p in eight), "8/10 is not shown as done")
        self.assertEqual([p['progressPct'] for p in progress], sorted(p['progressPct'] for p in progress))

    def test_replacement_prompt_carries_do_not_repeat_and_new_angle(self):
        import local_qwen_service
        prompt = local_qwen_service.build_mcq_user_prompt(
            subject='Business Economics', chapter='Theory of Demand and Supply', count=2,
            previous_concepts=['Accepted question one?'], syllabus_scope='Allowed topics: Law of Demand',
            rejected_stems=['Rejected duplicate stem about Giffen goods?'],
            diversification='Frame each new question as a short numerical or computation-based stem.')
        self.assertIn('DO NOT REPEAT', prompt)
        self.assertIn('Rejected duplicate stem about Giffen goods?', prompt)
        self.assertIn('short numerical or computation-based stem', prompt)
        self.assertIn('Allowed topics: Law of Demand', prompt, "syllabus scope still enforced")
        plain = local_qwen_service.build_mcq_user_prompt(subject='Business Economics', chapter='Theory of Demand and Supply')
        self.assertNotIn('DO NOT REPEAT', plain, "first-pass prompt unchanged")

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
