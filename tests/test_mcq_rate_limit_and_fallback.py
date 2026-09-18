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

class TestMcqRateLimitAndFallback(unittest.TestCase):

    def setUp(self):
        ai_provider_manager._provider_cooldowns.clear()
        ai_provider_manager._provider_failures.clear()
        ai_provider_manager._provider_latencies.clear()

    def test_explicit_429_detection_in_gemini_client(self):
        headers = MagicMock()
        headers.get.return_value = '15'
        err_body = json.dumps({
            'error': {
                'code': 429,
                'message': 'You exceeded your current quota... Please retry in 13.17s.',
                'status': 'RESOURCE_EXHAUSTED',
                'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '13s'}]
            }
        }).encode('utf-8')
        mock_http_err = urllib.error.HTTPError(
            url='https://mock.gemini',
            code=429,
            msg='Too Many Requests',
            hdrs=headers,
            fp=MagicMock(read=MagicMock(return_value=err_body))
        )

        with patch('urllib.request.urlopen', side_effect=mock_http_err):
            with self.assertRaises(RateLimitError) as ctx:
                ai_provider_manager._call_gemini_api('mock_key', 'gemini-3-flash-preview', 'hi')

            self.assertIn('RESOURCE_EXHAUSTED', str(ctx.exception))
            self.assertEqual(ctx.exception.provider_id, 'gemini')
            self.assertTrue(10.0 <= ctx.exception.retry_after <= 15.0)
        print('PASS: test_explicit_429_detection_in_gemini_client')

    def test_immediate_fallback_on_429_without_retrying_same_provider_models(self):
        call_log = []

        def mock_urlopen(req, timeout=18.0):
            url = req.full_url
            if 'generativelanguage.googleapis.com' in url:
                call_log.append(('gemini', url))
                if len(call_log) == 1:
                    err_body = b'{"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded"}}'
                    raise urllib.error.HTTPError(url, 429, 'Too Many Requests', {}, MagicMock(read=MagicMock(return_value=err_body)))
                else:
                    resp_mock = MagicMock()
                    resp_mock.__enter__.return_value = resp_mock
                    resp_mock.read.return_value = json.dumps({
                        'candidates': [{
                            'content': {
                                'parts': [{'text': '{"question": "What is depreciation?", "optionA": "Allocation of cost", "optionB": "Cash reserve", "optionC": "Revaluation", "optionD": "Profit", "correctAnswer": "A", "explanation": "Depreciation is cost allocation."}'}]
                            }
                        }]
                    }).encode('utf-8')
                    return resp_mock
            raise RuntimeError(f'Unexpected URL: {url}')

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'fallback_model': 'gemini-flash-latest', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'fallback_model': 'gemini-flash-latest', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }

        with patch('urllib.request.urlopen', side_effect=mock_urlopen):
            text, pid, model = ai_provider_manager.call_llm_with_failover(
                purpose='generation',
                prompt='GEN_QUESTION',
                data=test_data
            )

            gemini_calls = [c for c in call_log if c[0] == 'gemini']
            self.assertEqual(len(gemini_calls), 2, f'Gemini_1 should fail with 429 and Gemini_2 should succeed, got: {gemini_calls}')
            self.assertEqual(pid, 'gemini_2')
            self.assertEqual(model, 'gemini-3-flash-preview')
            self.assertTrue(ai_provider_manager._provider_cooldowns.get('gemini_1', 0) > time.time())
        print('PASS: test_immediate_fallback_on_429_without_retrying_same_provider_models')

    def test_cooldown_persists_across_batch_questions(self):
        call_log = []

        def mock_urlopen(req, timeout=18.0):
            url = req.full_url
            if 'generativelanguage.googleapis.com' in url:
                call_log.append(('gemini', url))
                resp_mock = MagicMock()
                resp_mock.__enter__.return_value = resp_mock
                resp_mock.read.return_value = json.dumps({
                    'candidates': [{
                        'content': {
                            'parts': [{'text': '{"question": "What is accounting?", "optionA": "Process", "optionB": "Tax", "optionC": "Law", "optionD": "Math", "correctAnswer": "A", "explanation": "Accounting is an information process."}'}]
                        }
                    }]
                }).encode('utf-8')
                return resp_mock
            raise RuntimeError(f'Unexpected URL: {url}')

        # Put gemini_1 into cooldown explicitly
        ai_provider_manager._provider_cooldowns['gemini_1'] = time.time() + 60.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'fallback_model': 'gemini-flash-latest', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'fallback_model': 'gemini-flash-latest', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }

        with patch('urllib.request.urlopen', side_effect=mock_urlopen):
            t1, p1, m1 = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='Q1', data=test_data)
            self.assertEqual(p1, 'gemini_2')

            two_t2, p2, m2 = ai_provider_manager.call_llm_with_failover(purpose='generation', prompt='Q2', data=test_data)
            self.assertEqual(p2, 'gemini_2')

            # gemini_1 should never have been called because it was in cooldown
            self.assertEqual(len(call_log), 2)
        print('PASS: test_cooldown_persists_across_batch_questions')

    def test_pipeline_with_gemini_429_generates_mcqs_and_reports_verified_count(self):
        mock_mcq_1 = {
            'question': 'What is the primary objective of accounting according to ICAI?',
            'optionA': 'To systematically record financial transactions and determine profit or loss',
            'optionB': 'To calculate income tax liability exclusively',
            'optionC': 'To eliminate all operational business risks',
            'optionD': 'To prepare company legal constitutions',
            'correctAnswer': 'A',
            'explanation': 'According to the ICAI framework, accounting aims to systematically record transactions.'
        }

        mock_mcq_2 = {
            'question': 'Which of the following items is classified as a current liability under Schedule III?',
            'optionA': 'Trade payables due within 90 days',
            'optionB': 'Debentures redeemable after five years',
            'optionC': 'General reserve accumulated over past years',
            'optionD': 'Capital work-in-progress for plant installation',
            'correctAnswer': 'A',
            'explanation': 'Trade payables payable within the operating cycle are current liabilities.'
        }

        gen_counter = [0]
        def mock_gen_single(**kwargs):
            gen_counter[0] += 1
            on_event = kwargs.get('on_provider_event')
            if on_event:
                on_event('rate_limited', 'gemini_1', 'gemini-3-flash-preview', 13.0)
                on_event('fallback', 'gemini_2', 'gemini-3-flash-preview', None)
            res = dict(mock_mcq_1 if gen_counter[0] % 2 == 1 else mock_mcq_2)
            return res, 'gemini_2', 'gemini-3-flash-preview'

        progress_events = []
        def on_prog(p):
            progress_events.append(dict(p))

        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_gen_single):
            with patch('ai_mcq_engine.validate_mcq_independently', return_value=(True, 'OK', None, 'heuristic')):
                qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                    subject='Accounting',
                    topic='Theoretical Framework',
                    count=2,
                    progress_callback=on_prog,
                    job_id='test-job-429'
                )

                self.assertEqual(len(qs), 2)
                self.assertEqual(metrics['generatedCount'], 2)
                self.assertEqual(metrics['failedCount'], 0)
                self.assertIn('gemini_2', metrics['providersUsed'])

                stages = [e.get('stage') for e in progress_events]
                self.assertIn('rate_limited', stages)
                self.assertIn('fallback', stages)

                for e in progress_events:
                    if 'verifiedCount' in e:
                        self.assertTrue(0 <= e['verifiedCount'] <= 2)
        print('PASS: test_pipeline_with_gemini_429_generates_mcqs_and_reports_verified_count')

    def test_all_providers_exhausted_terminates_cleanly_without_infinite_loop(self):
        def mock_fail(**kwargs):
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', 60.0, 'All quotas exceeded')

        start = time.time()
        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_fail):
            qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject='Law',
                topic='Contract Act',
                count=2,
                job_id='test-job-all-fail'
            )
            duration = time.time() - start

            self.assertTrue(duration < 15.0, f'Batch took too long ({duration:.1f}s) when all providers failed!')
            self.assertEqual(len(qs), 0)
            self.assertEqual(metrics['failedCount'], 2)
        print('PASS: test_all_providers_exhausted_terminates_cleanly_without_infinite_loop')

if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(TestMcqRateLimitAndFallback)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print('\n>>> ALL RATE LIMIT &_FALLBACK TESTS PASSED! <<<')
    else:
        exit(1)
