import unittest
import time
import json
import urllib.error
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_provider_manager
from ai_provider_manager import RateLimitError
import ai_mcq_engine
import ai_job_manager
import ai_document_indexer

class TestPipelineHardening(unittest.TestCase):

    def setUp(self):
        ai_provider_manager._provider_cooldowns.clear()
        ai_provider_manager._family_cooldowns.clear()
        ai_provider_manager._provider_failures.clear()
        ai_provider_manager._provider_latencies.clear()
        ai_provider_manager._last_provider_call_time.clear()

    # 1. Normal generation with Gemini succeeds
    def test_01_gemini_success(self):
        mock_resp = {
            'question': 'What is the fundamental accounting equation under ICAI framework?',
            'optionA': 'Assets = Liabilities + Equity',
            'optionB': 'Assets = Liabilities - Equity',
            'optionC': 'Assets + Liabilities = Equity',
            'optionD': 'Assets = Equity - Liabilities',
            'correctAnswer': 'A',
            'explanation': 'The fundamental accounting equation states Assets equal Liabilities plus Owners Equity.'
        }
        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', return_value=(json.dumps(mock_resp), 250.0)):
            text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
            self.assertEqual(pid, 'gemini_1')
            self.assertIn('Assets = Liabilities + Equity', text)
        print("PASS: Scenario 1 - Normal Gemini generation succeeds")

    # 2. Rate limit (429) triggers immediate fallback to next provider without retry
    def test_02_rate_limit_immediate_fallback(self):
        call_counts = {'gemini_1': 0, 'groq': 0}
        def mock_gemini(*args, **kwargs):
            call_counts['gemini_1'] += 1
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', retry_after=60.0)
        def mock_groq(*args, **kwargs):
            call_counts['groq'] += 1
            return json.dumps({'question': 'Valid Question Q1?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 100.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                self.assertEqual(pid, 'groq')
                self.assertEqual(call_counts['gemini_1'], 1, "429 must not retry the same exhausted provider!")
                self.assertEqual(call_counts['groq'], 1)
        print("PASS: Scenario 2 - 429 triggers immediate fallback without retrying exhausted provider")

    # 3. 429 sets cooldown on entire provider family (Gemini 1 429 skips Gemini 2)
    def test_03_family_cooldown_skips_gemini_2(self):
        call_counts = {'gemini_1': 0, 'gemini_2': 0, 'groq': 0}
        def mock_gemini_1(*args, **kwargs):
            call_counts['gemini_1'] += 1
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', retry_after=60.0)
        def mock_gemini_2(*args, **kwargs):
            call_counts['gemini_2'] += 1
            return "unexpected", 10.0
        def mock_groq(*args, **kwargs):
            call_counts['groq'] += 1
            return json.dumps({'question': 'Groq question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'provider': 'gemini', 'model': 'gemini-2.5-flash', 'priority': 2, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 3, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini_1):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                self.assertEqual(pid, 'groq')
                self.assertEqual(call_counts['gemini_1'], 1)
                self.assertEqual(call_counts['gemini_2'], 0, "Gemini 2 must be skipped due to gemini family cooldown!")
                self.assertTrue(ai_provider_manager._family_cooldowns.get('gemini', 0) > time.time())
        print("PASS: Scenario 3 - Gemini 1 429 sets family cooldown and skips Gemini 2 directly to Groq")

    # 4. Cooldown prevents attempts to that provider/family during cooldown window
    def test_04_cooldown_prevents_attempts(self):
        ai_provider_manager._family_cooldowns['gemini'] = time.time() + 30.0
        call_counts = {'gemini_1': 0, 'groq': 0}
        def mock_gemini(*args, **kwargs):
            call_counts['gemini_1'] += 1
            return "unexpected", 10.0
        def mock_groq(*args, **kwargs):
            call_counts['groq'] += 1
            return json.dumps({'question': 'Groq question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                self.assertEqual(pid, 'groq')
                self.assertEqual(call_counts['gemini_1'], 0, "Gemini must be skipped during active cooldown window")
        print("PASS: Scenario 4 - Active cooldown window prevents attempts")

    # 5. Cooldown expires and provider becomes eligible again
    def test_05_cooldown_expires(self):
        ai_provider_manager._family_cooldowns['gemini'] = time.time() - 1.0  # Expired
        ai_provider_manager._provider_cooldowns['gemini_1'] = time.time() - 1.0  # Expired
        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', return_value=(json.dumps({'question': 'Ok?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Reason'}), 100.0)):
            text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
            self.assertEqual(pid, 'gemini_1')
        print("PASS: Scenario 5 - Cooldown expiry restores provider eligibility")

    # 6. Transient failure (503) triggers bounded retry (1 retry) then fallback
    def test_06_transient_503_bounded_retry_then_fallback(self):
        gemini_calls = []
        def mock_gemini(*args, **kwargs):
            gemini_calls.append(time.time())
            raise urllib.error.HTTPError('http://gemini', 503, 'Service Unavailable', {}, MagicMock(read=lambda: b'{"error": {"code": 503}}'))
        def mock_groq(*args, **kwargs):
            return json.dumps({'question': 'Groq question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                with patch('time.sleep', return_value=None):
                    text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                    self.assertEqual(pid, 'groq')
                    self.assertEqual(len(gemini_calls), 2, "503 must do exactly 1 transient retry (2 total calls) before fallback")
        print("PASS: Scenario 6 - 503 triggers bounded retry (max 1 retry) then fallback")

    # 7. Transient failure (500) triggers bounded retry (1 retry) then fallback
    def test_07_transient_500_bounded_retry(self):
        gemini_calls = []
        def mock_gemini(*args, **kwargs):
            gemini_calls.append(time.time())
            raise urllib.error.HTTPError('http://gemini', 500, 'Internal Server Error', {}, MagicMock(read=lambda: b'{"error": {"code": 500}}'))
        def mock_groq(*args, **kwargs):
            return json.dumps({'question': 'Groq question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                with patch('time.sleep', return_value=None):
                    text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                    self.assertEqual(pid, 'groq')
                    self.assertEqual(len(gemini_calls), 2)
        print("PASS: Scenario 7 - 500 triggers bounded retry (max 1 retry) then fallback")

    # 8. Network timeout triggers bounded retry (1 retry) then fallback
    def test_08_timeout_bounded_retry(self):
        gemini_calls = []
        def mock_gemini(*args, **kwargs):
            gemini_calls.append(time.time())
            raise TimeoutError("The read operation timed out")
        def mock_groq(*args, **kwargs):
            return json.dumps({'question': 'Groq question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                with patch('time.sleep', return_value=None):
                    text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                    self.assertEqual(pid, 'groq')
                    self.assertEqual(len(gemini_calls), 2)
        print("PASS: Scenario 8 - Timeout triggers bounded retry (max 1 retry) then fallback")

    # 9. Groq is preferred over OpenRouter when Gemini is unavailable
    def test_09_groq_preferred_over_openrouter(self):
        call_order = []
        def mock_gemini(*args, **kwargs):
            call_order.append('gemini')
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', 60.0)
        def mock_groq(*args, **kwargs):
            call_order.append('groq')
            return json.dumps({'question': 'Groq question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0
        def mock_or(*args, **kwargs):
            call_order.append('openrouter')
            return "unexpected", 10.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'openrouter', 'provider': 'openrouter', 'priority': 3, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'priority': 4, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                with patch('ai_provider_manager._call_openrouter_api', side_effect=mock_or):
                    text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                    self.assertEqual(pid, 'groq')
                    self.assertEqual(call_order, ['gemini', 'groq'])
        print("PASS: Scenario 9 - Groq is canonically preferred over OpenRouter")

    # 10. OpenRouter is used when both Gemini and Groq are unavailable
    def test_10_openrouter_used_when_gemini_and_groq_fail(self):
        def mock_gemini(*args, **kwargs):
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', 60.0)
        def mock_groq(*args, **kwargs):
            raise RateLimitError('groq', 'qwen/qwen3.8-27b', 60.0)
        def mock_or(*args, **kwargs):
            return json.dumps({'question': 'OpenRouter question?', 'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D', 'correctAnswer': 'A', 'explanation': 'Valid reasoning'}), 50.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'priority': 2, 'enabled': True, 'roles': ['generation']},
                {'id': 'openrouter', 'provider': 'openrouter', 'priority': 3, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                with patch('ai_provider_manager._call_openrouter_api', side_effect=mock_or):
                    text, pid, model = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                    self.assertEqual(pid, 'openrouter')
        print("PASS: Scenario 10 - OpenRouter is used when Gemini and Groq are unavailable")

    # 11. All providers exhausted fails gracefully without infinite loop
    def test_11_all_providers_exhausted(self):
        def mock_gemini(*args, **kwargs):
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', 60.0)
        def mock_groq(*args, **kwargs):
            raise RateLimitError('groq', 'qwen/qwen3.8-27b', 60.0)
        def mock_or(*args, **kwargs):
            raise RateLimitError('openrouter', 'meta-llama', 60.0)

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'priority': 2, 'enabled': True, 'roles': ['generation']},
                {'id': 'openrouter', 'provider': 'openrouter', 'priority': 3, 'enabled': True, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            with patch('ai_provider_manager._call_groq_api', side_effect=mock_groq):
                with patch('ai_provider_manager._call_openrouter_api', side_effect=mock_or):
                    with self.assertRaises(RuntimeError) as ctx:
                        ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
                    self.assertIn('All AI providers failed', str(ctx.exception))
        print("PASS: Scenario 11 - All providers exhausted fails gracefully")

    # 12. Retry-After header is respected when present
    def test_12_retry_after_header_respected(self):
        def mock_gemini(*args, **kwargs):
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', retry_after=42.5)

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'provider': 'gemini', 'priority': 2, 'enabled': False, 'roles': ['generation']},
                {'id': 'groq', 'provider': 'groq', 'priority': 3, 'enabled': False, 'roles': ['generation']},
                {'id': 'openrouter', 'provider': 'openrouter', 'priority': 4, 'enabled': False, 'roles': ['generation']}
            ]
        }
        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            try:
                ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='test', data=test_data)
            except RuntimeError:
                pass
            cooldown = ai_provider_manager._provider_cooldowns.get('gemini_1', 0)
            remaining = cooldown - time.time()
            self.assertGreater(remaining, 35.0)
            self.assertLessEqual(remaining, 43.0)
        print("PASS: Scenario 12 - Retry-After duration respected")

    # 13. Duplicate question rejected locally, triggers regeneration
    def test_13_duplicate_rejected_locally(self):
        dup_q = {
            'question': 'What is the definition of Depreciation under ICAI standards?',
            'optionA': 'Allocation of depreciable amount',
            'optionB': 'Valuation of asset',
            'optionC': 'Revaluation reserve',
            'optionD': 'Cash accumulation',
            'correctAnswer': 'A',
            'explanation': 'Depreciation is the systematic allocation of the depreciable amount of an asset over its useful life.'
        }
        existing = [{'text': 'What is the definition of Depreciation under ICAI standards?'}]
        is_valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=dup_q,
            existing_questions=existing
        )
        self.assertFalse(is_valid)
        self.assertEqual(code, 'DUPLICATE_QUESTION')
        print("PASS: Scenario 13 - Duplicate question rejected locally")

    # 14. Off-chapter question rejected locally (OFF_CHAPTER_QUESTION)
    def test_14_off_chapter_question_rejected(self):
        q = {
            'question': 'Under the Indian Partnership Act, what is the maximum number of partners permitted?',
            'optionA': '50', 'optionB': '20', 'optionC': '10', 'optionD': '100',
            'correctAnswer': 'A',
            'explanation': 'Under Companies Act / Partnership rules.',
            'chapter': 'Indian Partnership Act'
        }
        is_valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=q,
            chapter='Introduction to Business Economics',
            chapter_id='ch-fnd-eco-1'
        )
        self.assertFalse(is_valid)
        self.assertEqual(code, 'OFF_CHAPTER_QUESTION')
        print("PASS: Scenario 14 - Off-chapter question rejected locally")

    # 15. Source question reproduction rejected locally (SOURCE_REPRODUCTION_REJECTED)
    def test_15_source_reproduction_rejected(self):
        admin_prompt_notes = "In 2024, ABC Corp acquired a manufacturing plant for 50 lakhs with 10 years estimated life. Calculate first year straight line depreciation."
        reproduced_q = {
            'question': 'In 2024, ABC Corp acquired a manufacturing plant for 50 lakhs with 10 years estimated life. What is the first year straight line depreciation?',
            'optionA': '5 lakhs', 'optionB': '10 lakhs', 'optionC': '2.5 lakhs', 'optionD': '1 lakh',
            'correctAnswer': 'A',
            'explanation': 'Straight line depreciation is 50 lakhs divided by 10 years.'
        }
        is_valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=reproduced_q,
            admin_description=admin_prompt_notes
        )
        self.assertFalse(is_valid)
        self.assertEqual(code, 'SOURCE_REPRODUCTION_REJECTED')
        print("PASS: Scenario 15 - Source question reproduction rejected locally")

    # 16. Server-side pacing delay enforced between calls to same provider/family
    def test_16_pacing_delay_same_provider_family(self):
        sleep_calls = []
        with patch('time.sleep', side_effect=lambda s: sleep_calls.append(s)):
            ai_provider_manager.apply_server_side_pacing('gemini_1')
            ai_provider_manager.apply_server_side_pacing('gemini_1')
            self.assertEqual(len(sleep_calls), 1)
            self.assertGreaterEqual(sleep_calls[0], 1.99)
        print("PASS: Scenario 16 - Server-side pacing enforced between calls to same provider/family")

    # 17. Server-side pacing is NOT applied when switching to a different provider
    def test_17_pacing_not_applied_on_provider_switch(self):
        sleep_calls = []
        with patch('time.sleep', side_effect=lambda s: sleep_calls.append(s)):
            ai_provider_manager.apply_server_side_pacing('gemini_1')
            ai_provider_manager.apply_server_side_pacing('groq')
            self.assertEqual(len(sleep_calls), 0, "No pacing delay when switching provider family!")
        print("PASS: Scenario 17 - No pacing delay when switching to different provider family")

    # 18. Sequential generation: Q2 never starts before Q1 reaches terminal state
    def test_18_sequential_execution_and_batch_sizes(self):
        execution_timeline = []

        distinct_q_pool = [
            ('What is the primary definition of Assets under ICAI framework?', 'A resource controlled by the entity as a result of past events'),
            ('Which accounting standard governs Valuation of Inventories?', 'Accounting Standard 2 AS 2 revised'),
            ('Under Indian Contract Act 1872, what makes an agreement void ab initio?', 'Unlawful consideration or absence of lawful object'),
            ('What is the maximum number of members in a private company under Companies Act 2013?', 'Two hundred members maximum excluding employee members'),
            ('In double entry bookkeeping, what does a credit balance in cash book indicate?', 'Bank overdraft condition where withdrawals exceed deposits')
        ]

        def mock_generate_single(**kwargs):
            slot = kwargs.get('slot_number', 1)
            execution_timeline.append(('start', slot, time.time()))
            time.sleep(0.01)
            execution_timeline.append(('finish', slot, time.time()))
            q_tuple = distinct_q_pool[(slot - 1) % len(distinct_q_pool)]
            return {
                'question': q_tuple[0],
                'optionA': q_tuple[1],
                'optionB': 'Alternative incorrect option B',
                'optionC': 'Alternative incorrect option C',
                'optionD': 'Alternative incorrect option D',
                'correctAnswer': 'A',
                'explanation': f'Detailed statutory explanation for question {slot}.'
            }, 'gemini_1', 'gemini-3-flash-preview'

        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_generate_single):
            qs1, m1 = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject='Economics', topic='Theory', count=1, job_id='batch-1'
            )
            self.assertEqual(len(qs1), 1)
            self.assertEqual(m1['generatedCount'], 1)

        execution_timeline.clear()
        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_generate_single):
            qs5, m5 = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject='Economics', topic='Theory', count=5, job_id='batch-5'
            )
            self.assertEqual(len(qs5), 5)
            slots_seen = []
            for event_type, slot, _ in execution_timeline:
                if event_type == 'start':
                    if slots_seen:
                        prev_slot = slots_seen[-1]
                        self.assertEqual(slot, prev_slot + 1, f"Q{slot} started before Q{prev_slot} reached terminal state!")
                    slots_seen.append(slot)
            self.assertEqual(slots_seen, [1, 2, 3, 4, 5])

        print("PASS: Scenario 18 - Strict sequential execution & batch completion verified")

if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPipelineHardening)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print('\n>>> ALL 18 PIPELINE HARDENING SCENARIOS PASSED! <<<')
    else:
        sys.exit(1)
