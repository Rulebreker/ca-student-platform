import unittest
from unittest.mock import patch, MagicMock
import time
import json
import os
import sys

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import ai_provider_manager
import ai_mcq_engine
import ai_job_manager

class TestGeminiMultiKeyAndSameSlotRepair(unittest.TestCase):

    def setUp(self):
        ai_provider_manager._provider_cooldowns.clear()
        ai_provider_manager._family_cooldowns.clear()
        ai_provider_manager._provider_failures.clear()
        ai_job_manager._active_jobs.clear()

    # Scenario 1: Gemini key 1 success
    @patch('ai_provider_manager._call_gemini_api')
    def test_gemini_key_1_success(self, mock_gemini):
        mock_gemini.return_value = (
            json.dumps({
                "question": "What is the capital of accounting?",
                "optionA": "Ledger", "optionB": "Journal",
                "optionC": "Trial Balance", "optionD": "Balance Sheet",
                "correctAnswer": "A",
                "explanation": "Ledger is the principal book of accounts in accounting."
            }),
            120.0
        )
        text, prov, model = ai_provider_manager.call_llm_with_failover(
            purpose='generation',
            prompt='Test prompt',
            preferred_provider='gemini_1'
        )
        self.assertEqual(prov, 'gemini_1')
        self.assertIn("capital of accounting", text)

    # Scenario 2: Gemini key 1 timeout rotates immediately to Gemini key 2
    @patch('ai_provider_manager._call_gemini_api')
    def test_gemini_key_1_timeout_rotates_to_key_2(self, mock_gemini):
        call_count = [0]
        def _side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise TimeoutError("The read operation timed out after 12.0 seconds")
            return (
                json.dumps({
                    "question": "Which principle requires revenue recognition when earned?",
                    "optionA": "Accrual", "optionB": "Cash",
                    "optionC": "Matching", "optionD": "Conservatism",
                    "correctAnswer": "A",
                    "explanation": "Accrual principle requires revenues and costs to be recognized when earned."
                }),
                150.0
            )
        mock_gemini.side_effect = _side_effect

        text, prov, model = ai_provider_manager.call_llm_with_failover(
            purpose='generation',
            prompt='Test prompt',
            preferred_provider='gemini_1'
        )
        self.assertEqual(prov, 'gemini_2')
        self.assertIn('accrual', text.lower())
        self.assertGreater(ai_provider_manager._provider_cooldowns.get('gemini_1', 0), time.time())

    # Scenario 3: Key 1 returns 429 quota exhausted -> only key 1 cools down, rotates to key 2 with zero wait
    @patch('ai_provider_manager._call_gemini_api')
    def test_key_1_429_rotates_to_key_2(self, mock_gemini):
        call_count = [0]
        def _side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise ai_provider_manager.RateLimitError('gemini_1', 'gemini-3-flash-preview', retry_after=60.0)
            return (
                json.dumps({
                    "question": "What is depreciation?",
                    "optionA": "Allocation of cost", "optionB": "Valuation",
                    "optionC": "Cash expense", "optionD": "None",
                    "correctAnswer": "A",
                    "explanation": "Depreciation is the systematic allocation of the depreciable amount of an asset."
                }),
                100.0
            )
        mock_gemini.side_effect = _side_effect

        text, prov, model = ai_provider_manager.call_llm_with_failover(
            purpose='generation',
            prompt='Test prompt',
            preferred_provider='gemini_1'
        )
        self.assertEqual(prov, 'gemini_2')
        # Only gemini_1 should be in cooldown, NOT gemini_2
        self.assertGreater(ai_provider_manager._provider_cooldowns.get('gemini_1', 0), time.time())
        self.assertNotIn('gemini_2', ai_provider_manager._provider_cooldowns)

    # Scenario 4: Multiple keys rate-limited cooldown -> pipeline calculates earliest expiring cooldown
    def test_multiple_keys_rate_limited_cooldown_same_slot_retry(self):
        now = time.time()
        for p in ['gemini_1', 'gemini_2', 'gemini_3', 'gemini_4', 'gemini_5', 'gemini_6']:
            ai_provider_manager._provider_cooldowns[p] = now + 25.0
        ai_provider_manager._provider_cooldowns['gemini_3'] = now + 4.0

        earliest = ai_provider_manager.get_earliest_gemini_cooldown_remaining()
        self.assertGreater(earliest, 0.0)
        self.assertLessEqual(earliest, 5.0)

    # Scenario 5: Invalid MCQ format (missing options) causes same-slot repair
    def test_invalid_mcq_format_same_slot_repair(self):
        invalid_mcq = {
            "question": "What is an asset?",
            "optionA": "Resource owned",
            "optionB": "Expense",
            # missing optionC and optionD
            "correctAnswer": "A",
            "explanation": "An asset is a resource controlled by the enterprise."
        }
        is_valid, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=invalid_mcq,
            subject="Accounting",
            topic="Introduction"
        )
        self.assertFalse(is_valid)
        self.assertEqual(err_code, "INVALID_OPTIONS")

    # Scenario 6: Duplicate MCQ is rejected and added to slot rejected stems
    def test_duplicate_mcq_same_slot_repair(self):
        existing = [{
            'id': 'q-101',
            'text': 'What is the primary objective of accounting according to ICAI framework?'
        }]
        candidate = {
            "question": "What is the primary objective of accounting according to ICAI framework?",
            "optionA": "Record keeping", "optionB": "Taxation",
            "optionC": "Decision making", "optionD": "Auditing",
            "correctAnswer": "A",
            "explanation": "Primary objective of accounting is systematic recording of financial transactions."
        }
        is_valid, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=candidate,
            subject="Accounting",
            topic="Introduction",
            existing_questions=existing
        )
        self.assertFalse(is_valid)
        self.assertEqual(err_code, "DUPLICATE_QUESTION")

    # Scenario 7: Off-chapter MCQ rejected by local deterministic validation
    def test_off_chapter_mcq_same_slot_repair(self):
        candidate = {
            "question": "Under the Sale of Goods Act, an unpaid seller has rights against goods.",
            "optionA": "Lien", "optionB": "Stoppage",
            "optionC": "Resale", "optionD": "All of these",
            "correctAnswer": "D",
            "explanation": "Unpaid seller has right of lien, stoppage in transit, and resale under the Act.",
            "chapter": "Sale of Goods Act",
            "chapterId": "ch-law-soga"
        }
        is_valid, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=candidate,
            subject="Business Law",
            topic="Indian Contract Act, 1872",
            chapter="Indian Contract Act, 1872",
            chapter_id="ch-law-contract"
        )
        self.assertFalse(is_valid)
        self.assertEqual(err_code, "OFF_CHAPTER_QUESTION")

    # Scenario 8: Firebase save resilience / error callback does not crash slot loop
    def test_firebase_save_resilience_same_slot_recovery(self):
        job_record = {'id': 'test-job', 'title': 'Test', 'generatedCount': 0}
        failing_sync = MagicMock(side_effect=RuntimeError("Firebase connection timed out"))
        save_cb = MagicMock()
        ai_job_manager.save_job_record(job_record, {}, save_cb, failing_sync)
        save_cb.assert_called_once()

    # Scenario 9: Q3 failure does NOT start Q4 (Q3 stays active on retry)
    @patch('ai_mcq_engine.generate_single_mcq')
    @patch('ai_mcq_engine.validate_mcq_independently')
    def test_q3_failure_does_not_start_q4(self, mock_validate, mock_gen):
        attempts_seen = []

        def _mock_gen_side_effect(**kwargs):
            s_num = kwargs.get('slot_number')
            att = kwargs.get('attempt_number')
            attempts_seen.append((s_num, att))
            return (
                {
                    "question": f"Question text for slot {s_num} attempt {att}",
                    "optionA": "A1", "optionB": "B1", "optionC": "C1", "optionD": "D1",
                    "correctAnswer": "A", "explanation": "Explanation here for testing."
                },
                "gemini_1",
                "gemini-3-flash-preview"
            )

        mock_gen.side_effect = _mock_gen_side_effect

        def _mock_val_side_effect(q_data, **kwargs):
            q_text = q_data.get('question', '')
            if 'slot 3' in q_text:
                return False, "Validation rejected: Slot 3 persistent error", None, "local"
            return True, "Passed local validation", None, "local"

        mock_validate.side_effect = _mock_val_side_effect

        # Run pipeline requesting 4 questions
        questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject="Accounting",
            chapter="Theoretical Framework",
            count=4
        )

        # Q3 failed repeatedly and was retried on slot 3; Q4 was NEVER started!
        self.assertEqual(len(questions), 2)
        q4_attempts = [att for s_num, att in attempts_seen if s_num == 4]
        self.assertEqual(len(q4_attempts), 0, "Q4 must NEVER start while Q3 has not succeeded!")

    # Scenario 10: Q3 recovery -> Q4 starts
    @patch('ai_mcq_engine.generate_single_mcq')
    @patch('ai_mcq_engine.validate_mcq_independently')
    def test_q3_recovery_starts_q4(self, mock_validate, mock_gen):
        attempts_seen = []

        def _mock_gen_side_effect(**kwargs):
            s_num = kwargs.get('slot_number')
            att = kwargs.get('attempt_number')
            attempts_seen.append((s_num, att))
            return (
                {
                    "question": f"Question text for slot {s_num} attempt {att}",
                    "optionA": "A1", "optionB": "B1", "optionC": "C1", "optionD": "D1",
                    "correctAnswer": "A", "explanation": "Explanation here for testing."
                },
                f"gemini_{((att-1)%6)+1}",
                "gemini-3-flash-preview"
            )

        mock_gen.side_effect = _mock_gen_side_effect

        def _mock_val_side_effect(q_data, **kwargs):
            q_text = q_data.get('question', '')
            if 'slot 3 attempt 1' in q_text:
                return False, "Validation rejected: Mock duplicate on attempt 1", None, "local"
            return True, "Passed local validation", None, "local"

        mock_validate.side_effect = _mock_val_side_effect

        questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject="Accounting",
            chapter="Theoretical Framework",
            count=4
        )

        self.assertEqual(len(questions), 4)
        self.assertEqual(metrics['generatedCount'], 4)
        self.assertIn((3, 1), attempts_seen)
        self.assertIn((3, 2), attempts_seen)
        idx_s3_att1 = attempts_seen.index((3, 1))
        idx_s3_att2 = attempts_seen.index((3, 2))
        idx_s4 = attempts_seen.index((4, 1))
        self.assertLess(idx_s3_att1, idx_s3_att2)
        self.assertLess(idx_s3_att2, idx_s4)

    # Scenario 11: 10 requested -> exactly 10 verified
    @patch('ai_mcq_engine.generate_single_mcq')
    @patch('ai_mcq_engine.validate_mcq_independently')
    def test_10_requested_yields_exact_10_verified(self, mock_val, mock_gen):
        mock_gen.side_effect = lambda **kwargs: (
            {
                "question": f"Question {kwargs.get('slot_number')} verified",
                "optionA": "OptA", "optionB": "OptB", "optionC": "OptC", "optionD": "OptD",
                "correctAnswer": "A", "explanation": "Valid test explanation."
            },
            "gemini_1", "gemini-3-flash-preview"
        )
        mock_val.return_value = (True, "Passed local validation", None, "local")

        questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject="Accounting",
            chapter="Theoretical Framework",
            count=10
        )
        self.assertEqual(len(questions), 10)
        self.assertEqual(metrics['generatedCount'], 10)
        self.assertEqual(metrics['failedCount'], 0)

    # Scenario 12: 8/10 must never publish or host (job marked FAILED)
    @patch('ai_mcq_engine.generate_exact_mcqs_pipeline')
    def test_8_of_10_never_publishes_or_hosts(self, mock_pipeline):
        mock_questions = [{'id': f'q-{i}', 'text': f'Q{i}'} for i in range(1, 9)]
        mock_metrics = {'generatedCount': 8, 'failedCount': 2}
        mock_pipeline.return_value = (mock_questions, mock_metrics)

        data = {'tests': [], 'questions': [], 'ai_generation_jobs': []}
        params = {'title': 'Test 8 of 10', 'subject': 'Accounting', 'topic': 'Framework', 'count': 10}

        success, err, result = ai_job_manager.run_generation_job_synchronous(
            params=params,
            data=data,
            save_callback=None,
            firebase_sync_callback=None
        )
        self.assertFalse(success)
        self.assertIsNone(result)
        self.assertEqual(len(data.get('tests', [])), 0)

    # Scenario 13: 10/10 publishes successfully
    @patch('ai_mcq_engine.generate_exact_mcqs_pipeline')
    def test_10_of_10_publishes_successfully(self, mock_pipeline):
        mock_questions = [{'id': f'q-{i}', 'text': f'Q{i}'} for i in range(1, 11)]
        mock_metrics = {'generatedCount': 10, 'failedCount': 0}
        mock_pipeline.return_value = (mock_questions, mock_metrics)

        data = {'tests': [], 'questions': [], 'ai_generation_jobs': []}
        params = {'title': 'Test 10 of 10', 'subject': 'Accounting', 'topic': 'Framework', 'count': 10, 'autoPublish': True}

        success, err, result = ai_job_manager.run_generation_job_synchronous(
            params=params,
            data=data,
            save_callback=None,
            firebase_sync_callback=None
        )
        self.assertTrue(success)
        self.assertIsNotNone(result)
        self.assertEqual(len(data.get('tests', [])), 1)
        self.assertEqual(data['tests'][0]['status'], 'Published')
        self.assertEqual(data['tests'][0]['totalQuestions'], 10)

    # Scenario 14: No Groq calls anywhere in MCQ generation
    @patch('ai_provider_manager._call_groq_api')
    @patch('ai_provider_manager._call_gemini_api')
    def test_no_groq_calls_in_generation(self, mock_gemini, mock_groq):
        mock_gemini.side_effect = ai_provider_manager.RateLimitError('gemini', 'gemini-3-flash-preview', 60.0)
        
        with self.assertRaises(RuntimeError):
            ai_provider_manager.call_llm_with_failover(
                purpose='generation',
                prompt='Test prompt'
            )
        mock_groq.assert_not_called()

    # Scenario 15: Progress percentage is based strictly on verified count
    def test_progress_percentage_strictly_verified_count(self):
        progress_events = []
        def _cb(p_info):
            progress_events.append(p_info)

        with patch('ai_mcq_engine.generate_single_mcq') as mock_gen, \
             patch('ai_mcq_engine.validate_mcq_independently') as mock_val:
            mock_gen.side_effect = lambda **kwargs: (
                {
                    "question": f"Question {kwargs.get('slot_number')}",
                    "optionA": "A", "optionB": "B", "optionC": "C", "optionD": "D",
                    "correctAnswer": "A", "explanation": "Explanation."
                },
                "gemini_1", "gemini-3-flash-preview"
            )
            mock_val.return_value = (True, "Passed local validation", None, "local")

            ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject="Accounting",
                chapter="Theoretical Framework",
                count=5,
                progress_callback=_cb
            )

        verified_counts = [p.get('verifiedCount', 0) for p in progress_events if 'verifiedCount' in p]
        self.assertEqual(verified_counts, sorted(verified_counts))
        self.assertEqual(verified_counts[-1], 4)

    # Scenario 16: Status polling freshness - get_job_status returns fresh DB/Firebase record over stale memory cache
    def test_refresh_preserves_fresh_backend_state(self):
        job_id = 'job-freshness-test'
        ai_job_manager._active_jobs[job_id] = {
            'id': job_id,
            'status': 'GENERATING',
            'generatedCount': 1,
            'progressPct': 15
        }
        fresh_data = {
            'ai_generation_jobs': [
                {
                    'id': job_id,
                    'status': 'GENERATING',
                    'generatedCount': 8,
                    'progressPct': 75
                }
            ]
        }
        status = ai_job_manager.get_job_status(job_id, fresh_data)
        self.assertIsNotNone(status)
        self.assertEqual(status['generatedCount'], 8)
        self.assertEqual(status['progressPct'], 75)

if __name__ == '__main__':
    unittest.main()
