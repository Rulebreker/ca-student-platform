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

class TestQuotaReductionAndLocalValidation(unittest.TestCase):

    def setUp(self):
        ai_provider_manager._provider_cooldowns.clear()
        ai_provider_manager._provider_failures.clear()
        ai_provider_manager._provider_latencies.clear()

    # -----------------------------------------------------------------
    # Test 1: Valid MCQ passes local deterministic validation
    # -----------------------------------------------------------------
    def test_valid_mcq(self):
        valid_q = {
            'question': 'Which of the following accounting standards deals with Depreciation Accounting according to ICAI?',
            'optionA': 'Accounting Standard 10 (AS 10)',
            'optionB': 'Accounting Standard 2 (AS 2)',
            'optionC': 'Accounting Standard 3 (AS 3)',
            'optionD': 'Accounting Standard 9 (AS 9)',
            'correctAnswer': 'A',
            'explanation': 'AS 10 Property, Plant and Equipment comprehensively governs the principles of depreciation accounting.'
        }

        # Local deterministic validator check
        is_valid, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=valid_q,
            subject='Accounting',
            topic='Depreciation',
            exam_level='CA Foundation',
            difficulty='ICAI Exam Standard',
            question_category='Direct Questions',
            question_speed='Quick'
        )
        self.assertTrue(is_valid, f"Expected valid MCQ to pass, but failed: {reason}")
        self.assertIsNone(err_code)

        # Independent validator check (must use local validation by default with 0 API calls)
        is_v, r, fix, prov = ai_mcq_engine.validate_mcq_independently(
            q_data=valid_q,
            subject='Accounting',
            topic='Depreciation',
            exam_level='CA Foundation'
        )
        self.assertTrue(is_v)
        self.assertEqual(prov, 'local')
        self.assertIn('local deterministic', r.lower())
        print("PASS: test_valid_mcq")

    # -----------------------------------------------------------------
    # Test 2: Duplicate MCQ detection (both from DB and current batch)
    # -----------------------------------------------------------------
    def test_duplicate_mcq(self):
        existing_questions = [
            {
                'text': 'Which of the following accounting standards deals with Depreciation Accounting according to ICAI?'
            }
        ]

        candidate_q = {
            'question': 'Which of the following accounting standards deals with Depreciation Accounting according to ICAI?',
            'optionA': 'Accounting Standard 10',
            'optionB': 'Accounting Standard 2',
            'optionC': 'Accounting Standard 3',
            'optionD': 'Accounting Standard 9',
            'correctAnswer': 'A',
            'explanation': 'AS 10 governs depreciation accounting.'
        }

        # Check duplicate against existing DB questions
        is_valid, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=candidate_q,
            existing_questions=existing_questions
        )
        self.assertFalse(is_valid)
        self.assertEqual(err_code, 'DUPLICATE_QUESTION')
        self.assertIn('duplicate', reason.lower())

        # Check duplicate against current batch questions
        batch_questions = [
            {
                'text': 'Which of the following accounting standards deals with Depreciation Accounting according to ICAI?'
            }
        ]
        is_valid_b, reason_b, err_code_b = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=candidate_q,
            current_batch_questions=batch_questions
        )
        self.assertFalse(is_valid_b)
        self.assertEqual(err_code_b, 'DUPLICATE_QUESTION')
        print("PASS: test_duplicate_mcq")

    # -----------------------------------------------------------------
    # Test 3: Malformed MCQ rejection (short/empty stem, non-dict)
    # -----------------------------------------------------------------
    def test_malformed_mcq(self):
        # 1. Non-dict payload
        is_v1, r1, c1 = ai_mcq_engine.validate_mcq_locally_deterministic("Not a dict")
        self.assertFalse(is_v1)
        self.assertEqual(c1, 'MALFORMED_OUTPUT')

        # 2. Empty stem
        is_v2, r2, c2 = ai_mcq_engine.validate_mcq_locally_deterministic({
            'question': '',
            'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D',
            'correctAnswer': 'A', 'explanation': 'Valid explanation text here.'
        })
        self.assertFalse(is_v2)
        self.assertEqual(c2, 'EMPTY_QUESTION')

        # 3. Too short stem (< 15 chars or < 4 words)
        is_v3, r3, c3 = ai_mcq_engine.validate_mcq_locally_deterministic({
            'question': 'What is AS 10?',
            'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D',
            'correctAnswer': 'A', 'explanation': 'Valid explanation text here.'
        })
        self.assertFalse(is_v3)
        self.assertIn(c3, ['EMPTY_QUESTION', 'TOO_SHORT'])
        print("PASS: test_malformed_mcq")

    # -----------------------------------------------------------------
    # Test 4: Invalid options rejection (not 4, duplicate, placeholder)
    # -----------------------------------------------------------------
    def test_invalid_options(self):
        # Missing option D
        q_missing_d = {
            'question': 'Which of the following describes the revenue recognition principle?',
            'optionA': 'When cash is received',
            'optionB': 'When goods are delivered or services rendered',
            'optionC': 'When contract is signed',
            'correctAnswer': 'B',
            'explanation': 'Revenue is recognized when earned.'
        }
        is_v1, r1, c1 = ai_mcq_engine.validate_mcq_locally_deterministic(q_missing_d)
        self.assertFalse(is_v1)
        self.assertEqual(c1, 'INVALID_OPTIONS')

        # Duplicate options
        q_dup_opts = {
            'question': 'Which of the following describes the revenue recognition principle?',
            'optionA': 'When goods are delivered',
            'optionB': 'When goods are delivered',
            'optionC': 'When contract is signed',
            'optionD': 'When order is placed',
            'correctAnswer': 'A',
            'explanation': 'Revenue is recognized when earned.'
        }
        is_v2, r2, c2 = ai_mcq_engine.validate_mcq_locally_deterministic(q_dup_opts)
        self.assertFalse(is_v2)
        self.assertEqual(c2, 'DUPLICATE_OPTIONS')

        # Placeholder options
        q_placeholder = {
            'question': 'Which of the following describes the revenue recognition principle?',
            'optionA': 'When goods are delivered',
            'optionB': 'None',
            'optionC': 'Option C',
            'optionD': 'When order is placed',
            'correctAnswer': 'A',
            'explanation': 'Revenue is recognized when earned.'
        }
        is_v3, r3, c3 = ai_mcq_engine.validate_mcq_locally_deterministic(q_placeholder)
        self.assertFalse(is_v3)
        self.assertEqual(c3, 'PLACEHOLDER_OPTION')
        print("PASS: test_invalid_options")

    # -----------------------------------------------------------------
    # Test 5: Invalid correct answer index rejection
    # -----------------------------------------------------------------
    def test_invalid_correct_answer(self):
        # Option E (out of range)
        q_inv_e = {
            'question': 'Which of the following statements is true regarding double entry bookkeeping?',
            'optionA': 'Debits must equal credits',
            'optionB': 'Debits must exceed credits',
            'optionC': 'Credits must exceed debits',
            'optionD': 'Only assets are recorded',
            'correctAnswer': 'E',
            'explanation': 'Every debit has an equal and opposite credit.'
        }
        is_v1, r1, c1 = ai_mcq_engine.validate_mcq_locally_deterministic(q_inv_e)
        self.assertFalse(is_v1)
        self.assertEqual(c1, 'INVALID_CORRECT_ANSWER')

        # Missing correct answer
        q_missing_ans = {
            'question': 'Which of the following statements is true regarding double entry bookkeeping?',
            'optionA': 'Debits must equal credits',
            'optionB': 'Debits must exceed credits',
            'optionC': 'Credits must exceed debits',
            'optionD': 'Only assets are recorded',
            'correctAnswer': '',
            'explanation': 'Every debit has an equal and opposite credit.'
        }
        is_v2, r2, c2 = ai_mcq_engine.validate_mcq_locally_deterministic(q_missing_ans)
        self.assertFalse(is_v2)
        self.assertEqual(c2, 'INVALID_CORRECT_ANSWER')
        print("PASS: test_invalid_correct_answer")

    # -----------------------------------------------------------------
    # Test 6: 429 rate-limit handling & immediate provider fallback
    # -----------------------------------------------------------------
    def test_429_handling(self):
        call_log = []

        def mock_urlopen(req, timeout=18.0):
            url = req.full_url
            if 'generativelanguage.googleapis.com' in url:
                call_log.append(('gemini', url))
                err_body = b'{"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Rate limit reached"}}'
                raise urllib.error.HTTPError(url, 429, 'Too Many Requests', {}, MagicMock(read=MagicMock(return_value=err_body)))
            elif 'api.groq.com' in url:
                call_log.append(('groq', url))
                resp_mock = MagicMock()
                resp_mock.__enter__.return_value = resp_mock
                resp_mock.read.return_value = json.dumps({
                    'choices': [{
                        'message': {
                            'content': json.dumps({
                                'question': 'What is the primary objective of accounting according to ICAI framework?',
                                'optionA': 'Systematic recording of financial transactions',
                                'optionB': 'Determining national tax policy',
                                'optionC': 'Regulating legal disputes between companies',
                                'optionD': 'Fixing the prices of consumer commodities',
                                'correctAnswer': 'A',
                                'explanation': 'The fundamental objective is systematic recording to ascertain operating results.'
                            })
                        }
                    }]
                }).encode('utf-8')
                return resp_mock
            raise RuntimeError(f'Unexpected URL: {url}')

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'fallback_model': None, 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'enabled': False},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }

        with patch('urllib.request.urlopen', side_effect=mock_urlopen):
            text, pid, model = ai_provider_manager.call_llm_with_failover(
                purpose='generation',
                prompt='Generate question',
                data=test_data
            )

            gemini_calls = [c for c in call_log if c[0] == 'gemini']
            groq_calls = [c for c in call_log if c[0] == 'groq']

            self.assertEqual(len(gemini_calls), 1)
            self.assertEqual(len(groq_calls), 1)
            self.assertEqual(pid, 'groq')
            self.assertTrue(ai_provider_manager._provider_cooldowns.get('gemini_1', 0) > time.time())
        print("PASS: test_429_handling")

    # -----------------------------------------------------------------
    # Test 7: 503 Service Unavailable handling & provider fallback
    # -----------------------------------------------------------------
    def test_503_handling(self):
        call_log = []

        def mock_urlopen(req, timeout=18.0):
            url = req.full_url
            if 'generativelanguage.googleapis.com' in url:
                call_log.append(('gemini', url))
                err_body = b'{"error": {"code": 503, "status": "UNAVAILABLE", "message": "The service is temporarily overloaded"}}'
                raise urllib.error.HTTPError(url, 503, 'Service Unavailable', {}, MagicMock(read=MagicMock(return_value=err_body)))
            elif 'api.groq.com' in url:
                call_log.append(('groq', url))
                resp_mock = MagicMock()
                resp_mock.__enter__.return_value = resp_mock
                resp_mock.read.return_value = json.dumps({
                    'choices': [{
                        'message': {
                            'content': json.dumps({
                                'question': 'Which schedule of the Companies Act, 2013 sets the format for financial statements?',
                                'optionA': 'Schedule III',
                                'optionB': 'Schedule II',
                                'optionC': 'Schedule VII',
                                'optionD': 'Schedule I',
                                'correctAnswer': 'A',
                                'explanation': 'Schedule III provides the balance sheet and profit & loss presentation formats.'
                            })
                        }
                    }]
                }).encode('utf-8')
                return resp_mock
            raise RuntimeError(f'Unexpected URL: {url}')

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'fallback_model': None, 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'enabled': False},
                {'id': 'groq', 'provider': 'groq', 'model': 'qwen/qwen3.8-27b', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }

        with patch('urllib.request.urlopen', side_effect=mock_urlopen):
            text, pid, model = ai_provider_manager.call_llm_with_failover(
                purpose='generation',
                prompt='Generate question',
                data=test_data
            )

            gemini_calls = [c for c in call_log if c[0] == 'gemini']
            groq_calls = [c for c in call_log if c[0] == 'groq']

            self.assertIn(len(gemini_calls), [1, 2])
            self.assertEqual(len(groq_calls), 1)
            self.assertEqual(pid, 'groq')
        print("PASS: test_503_handling")

    # -----------------------------------------------------------------
    # Test 8: Regeneration on invalid candidate question
    # -----------------------------------------------------------------
    def test_regeneration(self):
        attempt_counter = [0]

        bad_mcq = {
            'question': 'What is AS 2?',
            'optionA': 'Inventory',
            'optionB': 'Cash Flow',
            # missing optionC and optionD
            'correctAnswer': 'A',
            'explanation': 'Short'
        }

        good_mcq = {
            'question': 'Which of the following methods of inventory valuation is prohibited under AS 2 (Revised)?',
            'optionA': 'Last-In First-Out (LIFO)',
            'optionB': 'First-In First-Out (FIFO)',
            'optionC': 'Weighted Average Price',
            'optionD': 'Specific Identification Method',
            'correctAnswer': 'A',
            'explanation': 'Under AS 2 Valuation of Inventories, LIFO is strictly not permitted.'
        }

        def mock_generate_single(**kwargs):
            attempt_counter[0] += 1
            if attempt_counter[0] == 1:
                return dict(bad_mcq), 'gemini_1', 'gemini-3-flash-preview'
            return dict(good_mcq), 'gemini_1', 'gemini-3-flash-preview'

        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_generate_single):
            qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject='Accounting',
                topic='Inventory Valuation',
                count=1,
                job_id='test-regeneration-job'
            )

            self.assertEqual(len(qs), 1)
            self.assertEqual(attempt_counter[0], 2, "Should have attempted generation twice due to validation failure on first attempt.")
            self.assertGreaterEqual(metrics['regenerationCount'], 1)
            self.assertEqual(metrics['rejectedValidation'], 1)
            self.assertEqual(metrics['generatedCount'], 1)
            self.assertEqual(qs[0]['correctOption'], 'A')
            self.assertEqual(qs[0]['validationProvider'], 'local')
        print("PASS: test_regeneration")

    # -----------------------------------------------------------------
    # Test 9: Full 10-Question Batch with Quota Reduction Verification
    # Asserts: 10 generation calls, 0 Gemini validation calls, 10 local validations
    # -----------------------------------------------------------------
    def test_10_question_batch(self):
        # 10 completely distinct questions across syllabus
        mock_questions_pool = [
            {
                'question': 'Under AS 1, disclosure of accounting policies should form an integral part of which financial component?',
                'optionA': 'The financial statements as footnotes or notes on accounts',
                'optionB': 'The directors report exclusively',
                'optionC': 'The auditors independent report',
                'optionD': 'The internal company memorandum',
                'correctAnswer': 'A',
                'explanation': 'AS 1 mandates that significant accounting policies should form part of the financial statements.'
            },
            {
                'question': 'In double entry bookkeeping, what is the impact of purchasing office equipment on credit?',
                'optionA': 'Increase in assets and increase in liabilities',
                'optionB': 'Increase in assets and decrease in liabilities',
                'optionC': 'Decrease in assets and increase in equity',
                'optionD': 'No change in total assets or total liabilities',
                'correctAnswer': 'A',
                'explanation': 'Office equipment (asset) increases, and trade payables (liability) increases.'
            },
            {
                'question': 'Which schedule under the Companies Act 2013 provides the general instructions for preparation of balance sheet?',
                'optionA': 'Division I of Schedule III',
                'optionB': 'Schedule II of Companies Act',
                'optionC': 'Schedule VII relating to CSR',
                'optionD': 'Schedule IV code for directors',
                'correctAnswer': 'A',
                'explanation': 'Schedule III sets forth the presentation requirements for company financial statements.'
            },
            {
                'question': 'What does the going concern fundamental accounting assumption imply for enterprise continuity?',
                'optionA': 'The enterprise will continue in operational existence for the foreseeable future',
                'optionB': 'The business will be liquidated within six months',
                'optionC': 'Assets must be valued strictly at forced sale values',
                'optionD': 'All liabilities are immediate obligations due today',
                'correctAnswer': 'A',
                'explanation': 'Going concern assumes neither intention nor necessity of liquidation or curtailing operations.'
            },
            {
                'question': 'How should abnormal amounts of wasted materials be treated according to AS 2 guidelines?',
                'optionA': 'Recognized as expenses in the period in which they are incurred',
                'optionB': 'Capitalized as part of inventory acquisition cost',
                'optionC': 'Added to factory manufacturing overheads',
                'optionD': 'Carried forward to future balance sheets',
                'correctAnswer': 'A',
                'explanation': 'Abnormal waste is excluded from inventory cost and expensed in the profit and loss account.'
            },
            {
                'question': 'What is the statutory minimum number of directors required for a private company under Companies Act 2013?',
                'optionA': 'Two directors',
                'optionB': 'Three directors',
                'optionC': 'One director only',
                'optionD': 'Five directors',
                'correctAnswer': 'A',
                'explanation': 'Section 149(1) mandates a minimum of 2 directors for a private company.'
            },
            {
                'question': 'Under AS 9, when is revenue from sales transactions recognized in the statement of profit and loss?',
                'optionA': 'When significant risks and rewards of ownership have been transferred to the buyer',
                'optionB': 'When initial advance cash is received from the customer',
                'optionC': 'When the customer sends a purchase quotation',
                'optionD': 'When manufacturing production commences',
                'correctAnswer': 'A',
                'explanation': 'Revenue is recognized when ownership risks and rewards pass to buyer with measurable consideration.'
            },
            {
                'question': 'Which account must be debited when proprietor withdraws cash from the business for personal use?',
                'optionA': 'Drawings account',
                'optionB': 'Cash account',
                'optionC': 'Capital reserve account',
                'optionD': 'Bad debts account',
                'correctAnswer': 'A',
                'explanation': 'Drawings account is debited as it represents reduction in owners capital.'
            },
            {
                'question': 'What is the primary purpose of preparing a bank reconciliation statement at the end of an accounting period?',
                'optionA': 'To reconcile differences between bank book balance and pass book balance',
                'optionB': 'To compute annual corporate income tax liabilities',
                'optionC': 'To determine depreciation rates for fixed assets',
                'optionD': 'To audit payroll and employee bonus payments',
                'correctAnswer': 'A',
                'explanation': 'Bank reconciliation accounts for timing differences and errors between cash book and bank statement.'
            },
            {
                'question': 'Under Section 25 of the Indian Contract Act 1872, an agreement made without consideration is what?',
                'optionA': 'Void ab initio subject to statutory exceptions',
                'optionB': 'Enforceable in all commercial circumstances',
                'optionC': 'Valid only at the option of the promisor',
                'optionD': 'Illegal and punishable under criminal law',
                'correctAnswer': 'A',
                'explanation': 'An agreement without consideration is void except for natural love/affection or time-barred debts.'
            }
        ]

        def mock_generate_single(**kwargs):
            slot_num = kwargs.get('slot_number', 1)
            curr = mock_questions_pool[(slot_num - 1) % len(mock_questions_pool)]
            return dict(curr), 'gemini_1', 'gemini-3-flash-preview'

        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_generate_single):
            qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject='Accounting',
                topic='Standard Framework',
                count=10,
                job_id='test-10-batch-quota'
            )

            # Verification of 10-question completion
            self.assertEqual(len(qs), 10, f"Expected 10 questions, got {len(qs)}")
            self.assertEqual(metrics['generatedCount'], 10)
            self.assertEqual(metrics['failedCount'], 0)

            # Quota Reduction Assertions:
            # 1. Exactly 10 Gemini generation calls (1 per question)
            self.assertEqual(metrics['geminiGenerationCalls'], 10, f"Expected exactly 10 Gemini generation calls, got {metrics['geminiGenerationCalls']}")
            
            # 2. Local deterministic validation used for all questions
            self.assertEqual(metrics['validationProvider'], 'local')
            self.assertEqual(metrics['validationCalls'], 10)
            
            # 3. Validation providers used must only be 'local' (ZERO Gemini validation calls)
            self.assertNotIn('gemini_1', metrics['validationProvidersUsed'])
            self.assertNotIn('gemini_2', metrics['validationProvidersUsed'])
            self.assertEqual(set(metrics['validationProvidersUsed']), {'local'})
            
            # 4. Clean batch with no regenerations
            self.assertEqual(metrics['regenerationCount'], 0)

        # Also verify persistence in ai_job_manager worker
        fake_db = {
            'ai_source_documents': [],
            'questions': [],
            'tests': [],
            'ai_generation_jobs': [
                {
                    'id': 'job-batch-10',
                    'status': 'PENDING'
                }
            ]
        }
        
        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_generate_single):
            ai_job_manager._run_generation_job_worker(
                job_id='job-batch-10',
                params={'title': 'Test 10 MCQs Batch', 'subject': 'Accounting', 'topic': 'Standard Framework', 'count': 10},
                data=fake_db,
                save_callback=lambda d: None,
                firebase_sync_callback=lambda p, v, **kw: None
            )

            final_job = ai_job_manager.get_job_status('job-batch-10', fake_db)
            self.assertEqual(final_job['status'], 'COMPLETED')
            self.assertEqual(final_job['generatedCount'], 10)
            self.assertEqual(final_job['geminiGenerationCalls'], 10)
            self.assertEqual(final_job['validationCalls'], 10)
            self.assertEqual(final_job['validationProvider'], 'local')
            self.assertEqual(final_job['regenerationCount'], 0)

        print("PASS: test_10_question_batch (10 Gemini Generation Calls, 0 Gemini Validation Calls, 10 Local Validations)")

if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(TestQuotaReductionAndLocalValidation)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if result.wasSuccessful():
        print('\n>>> ALL 9 QUOTA REDUCTION & LOCAL VALIDATION TESTS PASSED! <<<')
    else:
        sys.exit(1)
