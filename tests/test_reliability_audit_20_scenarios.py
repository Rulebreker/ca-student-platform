import unittest
import time
import json
import uuid
import socket
import os
import sys
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_provider_manager
from ai_provider_manager import RateLimitError
import ai_mcq_engine
import ai_job_manager
import ai_scheduler
import ai_document_indexer
import syllabus_hierarchy

class TestReliabilityAudit20Scenarios(unittest.TestCase):

    def setUp(self):
        ai_provider_manager._provider_cooldowns.clear()
        ai_provider_manager._family_cooldowns.clear()
        ai_provider_manager._provider_failures.clear()
        ai_provider_manager._provider_latencies.clear()
        ai_provider_manager._last_provider_call_time.clear()
        ai_job_manager._active_jobs.clear()
        ai_job_manager._active_workers.clear()

    # =========================================================================
    # SCENARIO 1: Generate 10 MCQs successfully via batched generation
    # =========================================================================
    def test_01_generate_10_mcqs_successfully(self):
        chunk_text = """
        The Law of Demand states that other things being equal, quantity demanded varies inversely with price.
        Elasticity of demand measures the responsiveness of quantity demanded to price changes.
        Normal goods have positive income elasticity, while inferior goods have negative income elasticity.
        Cross elasticity measures responsiveness to prices of related substitute or complementary goods.
        Determinants of demand include consumer tastes, preferences, population, and distribution of income.
        """
        mock_chunks = [{
            'chunkId': 'chk-aud-01',
            'docId': 'doc-aud-01',
            'sourceDocumentId': 'doc-aud-01',
            'sourcePage': 1,
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'topic': 'Law of Demand',
            'text': chunk_text,
            'extractedText': chunk_text,
            'isActive': True
        }]
        source_docs = [{
            'id': 'doc-aud-01',
            'chapterId': 'ch-fnd-eco-2',
            'chapter': 'Theory of Demand and Supply',
            'subject': 'Business Economics',
            'examLevel': 'CA Foundation',
            'isActive': True,
            'chunks': mock_chunks
        }]

        # 10 completely distinct questions to prevent local duplicate detection
        mock_10_qs = [
            {
                'question': 'What fundamental relationship does the law of demand articulate between price and quantity?',
                'optionA': 'An inverse relationship ceteris paribus',
                'optionB': 'A direct linear correlation',
                'optionC': 'A constant proportional ratio',
                'optionD': 'No systematic relationship exists',
                'correctAnswer': 'A',
                'explanation': 'Under the law of demand, quantity demanded varies inversely with price holding other factors constant.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'How is price elasticity of demand formally characterized in economic analysis?',
                'optionA': 'Responsiveness of quantity demanded to changes in unit price',
                'optionB': 'Slope of the total revenue curve over fixed cost',
                'optionC': 'Total expenditure divided by average cost',
                'optionD': 'Rate of production substitution over market period',
                'correctAnswer': 'A',
                'explanation': 'Elasticity of demand measures the responsiveness of quantity demanded to price variations.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'What sign does the income elasticity of demand exhibit for normal goods?',
                'optionA': 'Positive sign indicating direct demand expansion with income',
                'optionB': 'Strictly negative coefficient under all conditions',
                'optionC': 'Zero elasticity showing perfect insensitivity',
                'optionD': 'Indeterminate sign fluctuating with market rate',
                'correctAnswer': 'A',
                'explanation': 'Normal goods demonstrate positive income elasticity as higher income raises purchases.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'When the price of a substitute good rises, how does demand for the original good shift?',
                'optionA': 'Demand curve shifts rightward to satisfy preference',
                'optionB': 'Demand curve shifts leftward toward origin',
                'optionC': 'Demand remains static along original schedule',
                'optionD': 'Quantity demanded drops along identical curve',
                'correctAnswer': 'A',
                'explanation': 'An increase in the price of substitutes leads consumers to switch demand rightward.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'Which of the following commodities typically exhibits negative income elasticity of demand?',
                'optionA': 'Inferior goods consumed less as earnings improve',
                'optionB': 'Luxury goods exhibiting high income responsiveness',
                'optionC': 'Giffen items outside normal classification',
                'optionD': 'Prestige items signaling social distinction',
                'correctAnswer': 'A',
                'explanation': 'Inferior goods have negative income elasticity because purchases decline as income grows.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'How does cross elasticity of demand operate between complementary products?',
                'optionA': 'Cross elasticity is negative between complements',
                'optionB': 'Cross elasticity is strictly positive for jointly used items',
                'optionC': 'Cross elasticity equals infinity in competitive equilibrium',
                'optionD': 'Cross elasticity is perfectly zero at all price points',
                'correctAnswer': 'A',
                'explanation': 'Complementary goods have negative cross elasticity because higher price of one cuts demand for both.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'What happens to consumer surplus when market equilibrium price decreases?',
                'optionA': 'Consumer surplus increases representing greater net welfare',
                'optionB': 'Consumer surplus is completely eliminated from trade',
                'optionC': 'Consumer surplus transitions into deadweight loss',
                'optionD': 'Consumer surplus contracts by producer margin',
                'correctAnswer': 'A',
                'explanation': 'Lower price enhances consumer surplus by expanding the area below demand above price.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'Which condition is held constant under the ceteris paribus assumption in demand theory?',
                'optionA': 'Prices of related goods and consumer preferences',
                'optionB': 'The market price of the commodity itself',
                'optionC': 'The quantity supplied by manufacturing firms',
                'optionD': 'The regulatory taxation framework alone',
                'correctAnswer': 'A',
                'explanation': 'Ceteris paribus holds other determinants such as related prices and preferences unchanged.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'What type of demand curve is represented by a vertical straight line parallel to the Y-axis?',
                'optionA': 'Perfectly inelastic demand schedule',
                'optionB': 'Perfectly elastic horizontal schedule',
                'optionC': 'Unitary elastic rectangular hyperbola',
                'optionD': 'Relatively elastic downward trajectory',
                'correctAnswer': 'A',
                'explanation': 'A vertical demand curve indicates zero elasticity where quantity is completely unresponsive to price.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            },
            {
                'question': 'When total expenditure remains unchanged after a price decrease, what is price elasticity?',
                'optionA': 'Unitary elasticity with coefficient equal to one',
                'optionB': 'Greater than one indicating high elasticity',
                'optionC': 'Less than one demonstrating inelastic demand',
                'optionD': 'Infinite elasticity under total outlay method',
                'correctAnswer': 'A',
                'explanation': 'Under the total outlay method, invariant expenditure following price shifts implies unitary elasticity.',
                'sourceDocId': 'doc-aud-01', 'sourceContentId': 'chk-aud-01'
            }
        ]

        with patch('ai_mcq_engine.generate_batched_mcqs', return_value=(mock_10_qs, 'gemini_1', 'gemini-3-flash-preview')):
            questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                count=10,
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Theory of Demand and Supply',
                chapter_id='ch-fnd-eco-2',
                job_id='job-aud-01',
                source_documents=source_docs,
                allow_ungrounded=False
            )

            self.assertEqual(metrics['finalStatus'], 'COMPLETED')
            self.assertEqual(len(questions), 10)
            self.assertEqual(metrics['generatedCount'], 10)
            self.assertEqual(metrics['failedCount'], 0)
            self.assertEqual(len(metrics['questionStatuses']), 10)
            for status_info in metrics['questionStatuses']:
                self.assertEqual(status_info['status'], 'saved')
        print("PASS: Scenario 01 - Generate 10 MCQs successfully via batched generation")

    # =========================================================================
    # SCENARIO 2: Force AI provider timeout -> clean failover within budget
    # =========================================================================
    def test_02_force_ai_timeout(self):
        gemini_calls = []
        def mock_gemini(*args, **kwargs):
            gemini_calls.append(time.time())
            if len(gemini_calls) == 1:
                raise TimeoutError("Connection timed out after 12.0s")
            return json.dumps({
                'question': 'What is marginal utility under consumer equilibrium?',
                'optionA': 'Additional satisfaction from consuming one more unit',
                'optionB': 'Total satisfaction',
                'optionC': 'Zero utility',
                'optionD': 'Average cost',
                'correctAnswer': 'A',
                'explanation': 'Marginal utility is the additional satisfaction derived from consuming an extra unit.'
            }), 120.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }

        with patch('ai_provider_manager._call_gemini_api', side_effect=mock_gemini):
            text, used_pid, used_model = ai_provider_manager.call_llm_with_failover(
                purpose='generation',
                prompt='test timeout',
                data=test_data,
                timeout=5.0
            )
            self.assertEqual(used_pid, 'gemini_2')
            self.assertIn('marginal utility', text.lower())
            self.assertEqual(len(gemini_calls), 2)
        print("PASS: Scenario 02 - Force AI timeout triggers clean failover")

    # =========================================================================
    # SCENARIO 3: Force provider 429 rate limit -> cooldown & failover
    # =========================================================================
    def test_03_force_provider_429(self):
        call_counts = {'gemini_1': 0, 'gemini_2': 0}
        def mock_gemini_1(*args, **kwargs):
            call_counts['gemini_1'] += 1
            raise RateLimitError('gemini_1', 'gemini-3-flash-preview', retry_after=60.0)

        def mock_gemini_2(*args, **kwargs):
            call_counts['gemini_2'] += 1
            return json.dumps({
                'question': 'Which curve is always downward sloping under normal demand?',
                'optionA': 'Demand curve',
                'optionB': 'Supply curve',
                'optionC': 'Marginal cost curve',
                'optionD': 'Total revenue curve',
                'correctAnswer': 'A',
                'explanation': 'The normal demand curve slopes downward from left to right.'
            }), 110.0

        test_data = {
            'ai_providers': [
                {'id': 'gemini_1', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 1, 'enabled': True, 'roles': ['generation']},
                {'id': 'gemini_2', 'provider': 'gemini', 'model': 'gemini-3-flash-preview', 'priority': 2, 'enabled': True, 'roles': ['generation']}
            ]
        }

        with patch('ai_provider_manager._call_gemini_api', side_effect=lambda *args, **kwargs: mock_gemini_1(*args, **kwargs) if call_counts['gemini_1'] == 0 else mock_gemini_2(*args, **kwargs)):
            text, used_pid, _ = ai_provider_manager.call_llm_with_failover(
                purpose='generation',
                prompt='test 429',
                data=test_data
            )
            self.assertEqual(used_pid, 'gemini_2')
            self.assertGreater(ai_provider_manager._provider_cooldowns.get('gemini_1', 0), time.time())
            self.assertEqual(call_counts['gemini_1'], 1)
            self.assertEqual(call_counts['gemini_2'], 1)
        print("PASS: Scenario 03 - Force provider 429 triggers cooldown and immediate failover")

    # =========================================================================
    # SCENARIO 4: Force validation rejection locally
    # =========================================================================
    def test_04_force_validation_rejection(self):
        # 1. Missing correctAnswer
        invalid_q1 = {
            'question': 'What is price elasticity?',
            'optionA': 'A', 'optionB': 'B', 'optionC': 'C', 'optionD': 'D',
            'explanation': 'Some explanation'
        }
        ok, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(invalid_q1)
        self.assertFalse(ok)
        self.assertEqual(err_code, 'INVALID_CORRECT_ANSWER')

        # 2. Duplicate options
        invalid_q2 = {
            'question': 'What is the law of demand?',
            'optionA': 'Price and demand are inversely related',
            'optionB': 'Price and demand are inversely related',
            'optionC': 'Price and demand are directly related',
            'optionD': 'No relationship exists',
            'correctAnswer': 'A',
            'explanation': 'Inverse relationship between price and quantity demanded.'
        }
        ok, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(invalid_q2)
        self.assertFalse(ok)
        self.assertEqual(err_code, 'DUPLICATE_OPTIONS')

        # 3. Short trivial explanation
        invalid_q3 = {
            'question': 'What is the fundamental law of demand in consumer economics?',
            'optionA': 'Price and demand are inversely related',
            'optionB': 'Supply and price are identical',
            'optionC': 'Cost is equal to marginal revenue',
            'optionD': 'Profit is maximized at equilibrium',
            'correctAnswer': 'A',
            'explanation': 'It is A'
        }
        ok, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(invalid_q3)
        self.assertFalse(ok)
        self.assertIn(err_code, ['MISSING_EXPLANATION', 'EXPLANATION_TRIVIAL'])
        print("PASS: Scenario 04 - Local deterministic validation strictly rejects flawed MCQs")

    # =========================================================================
    # SCENARIO 5: Verify generation continues when a slot fails
    # =========================================================================
    def test_05_verify_generation_continues(self):
        chunk_text = "Supply curve slopes upward reflecting direct relationship between price and quantity supplied."
        mock_chunks = [{
            'chunkId': 'chk-s5',
            'docId': 'doc-s5',
            'sourceDocumentId': 'doc-s5',
            'sourcePage': 1,
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'topic': 'Law of Supply',
            'text': chunk_text,
            'extractedText': chunk_text,
            'isActive': True
        }]
        source_docs = [{
            'id': 'doc-s5',
            'chapterId': 'ch-fnd-eco-2',
            'chapter': 'Theory of Demand and Supply',
            'subject': 'Business Economics',
            'examLevel': 'CA Foundation',
            'isActive': True,
            'chunks': mock_chunks
        }]

        pass1_qs = [
            {
                'question': 'How does supply curve slope reflect price behavior?',
                'optionA': 'Supply curve slopes upward directly with price',
                'optionB': 'Supply curve slopes downward with price',
                'optionC': 'Horizontal supply curve irrespective of price',
                'optionD': 'Vertical supply curve completely fixed',
                'correctAnswer': 'A',
                'explanation': 'The law of supply indicates a direct upward relationship with market price.'
            },
            {
                'question': 'Flawed Question Q2 with duplicate options?',
                'optionA': 'Identical option text here',
                'optionB': 'Identical option text here',
                'optionC': 'Another option',
                'optionD': 'Yet another option',
                'correctAnswer': 'A',
                'explanation': 'Flawed explanation.'
            },
            {
                'question': 'What happens to quantity supplied when price expands?',
                'optionA': 'Quantity supplied increases as price rises directly',
                'optionB': 'Quantity supplied contracts immediately',
                'optionC': 'Quantity supplied remains strictly fixed',
                'optionD': 'Market mechanism collapses',
                'correctAnswer': 'A',
                'explanation': 'Quantity supplied responds directly and positively to price increases.'
            }
        ]

        repair_qs = [
            {
                'question': 'What does a tabular market supply schedule represent?',
                'optionA': 'Supply schedule tabulates quantities supplied across price levels',
                'optionB': 'Demand schedule measuring consumer willingness',
                'optionC': 'Cost schedule documenting historical fixed outlays',
                'optionD': 'Revenue schedule recording gross corporate receipts',
                'correctAnswer': 'A',
                'explanation': 'A supply schedule tabulates quantities supplied directly across price points.'
            }
        ]

        call_idx = [0]
        def mock_generate_batch(*args, **kwargs):
            call_idx[0] += 1
            if call_idx[0] == 1:
                return pass1_qs, 'gemini_1', 'gemini-3-flash-preview'
            return repair_qs, 'gemini_1', 'gemini-3-flash-preview'

        with patch('ai_mcq_engine.generate_batched_mcqs', side_effect=mock_generate_batch):
            questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                count=3,
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Theory of Demand and Supply',
                chapter_id='ch-fnd-eco-2',
                job_id='job-aud-05',
                source_documents=source_docs
            )
            self.assertEqual(metrics['finalStatus'], 'COMPLETED')
            self.assertEqual(metrics['generatedCount'], 3)
            self.assertEqual(len(questions), 3)
        print("PASS: Scenario 05 - Generation continues when an individual slot fails")

    # =========================================================================
    # SCENARIO 6: No stuck at 6/10 — slot failure isolation & bounded attempts
    # =========================================================================
    def test_06_no_stuck_at_6_of_10(self):
        chunk_text = """
        Business Economics incorporates microeconomic tools to analyze business decisions and resource allocation.
        Normative economics prescribes desirable outcomes based on value judgments, while positive economics is descriptive.
        The basic economic problems are what, how, and for whom to produce within society.
        Opportunity cost evaluates the benefit of the next best choice or alternative foregone in decision making.
        Business economics adopts a pragmatic approach emphasizing practical application over pure theoretical abstraction.
        Macroeconomics investigates national aggregate income, employment, and general price levels.
        """
        mock_chunks = [{
            'chunkId': 'chk-s6',
            'docId': 'doc-s6',
            'sourceDocumentId': 'doc-s6',
            'sourcePage': 1,
            'chapter': 'Introduction to Business Economics',
            'chapterId': 'ch-fnd-eco-1',
            'topic': 'Microeconomics',
            'text': chunk_text,
            'extractedText': chunk_text,
            'isActive': True
        }]
        source_docs = [{
            'id': 'doc-s6',
            'chapterId': 'ch-fnd-eco-1',
            'chapter': 'Introduction to Business Economics',
            'subject': 'Business Economics',
            'examLevel': 'CA Foundation',
            'isActive': True,
            'chunks': mock_chunks
        }]

        distinct_valid_stems = [
            ("How does microeconomic analysis support managerial choice?", "Applies micro tools to allocation decisions", "Under Business Economics microeconomic tools guide allocation decisions."),
            ("What is the central focus of normative economic evaluation?", "Prescribing desirable outcomes based on value judgments", "Normative economics offers value-based prescriptive statements."),
            ("Which basic economic problem addresses product distribution?", "For whom to produce within society", "The for whom question resolves societal product allocation."),
            ("What role does opportunity cost play in financial capital budgeting?", "Quantifies the return of best forgone alternative", "Opportunity cost evaluates the benefit of the next best choice foregone."),
            ("How is pragmatism reflected in modern business economics?", "Emphasizing practical application over pure theoretical abstraction", "Business economics adopts pragmatic decision rules for actual enterprises."),
            ("What distinguishes macroeconomics from firm-level micro analysis?", "Study of national aggregate income and price levels", "Macroeconomics investigates broad economic aggregates and trends.")
        ]

        def make_qs(count, valid=True):
            qs = []
            for i in range(count):
                if valid:
                    q_stem, opt_a, expl = distinct_valid_stems[i % len(distinct_valid_stems)]
                    qs.append({
                        'question': q_stem,
                        'optionA': opt_a,
                        'optionB': f'Plausible incorrect alternative {i+1}B',
                        'optionC': f'Plausible incorrect alternative {i+1}C',
                        'optionD': f'Plausible incorrect alternative {i+1}D',
                        'correctAnswer': 'A',
                        'explanation': expl
                    })
                else:
                    qs.append({
                        'question': f'Broken invalid question stem {i+1}',
                        'optionA': 'Dup',
                        'optionB': 'Dup',
                        'optionC': 'C',
                        'optionD': 'D',
                        'correctAnswer': 'A',
                        'explanation': 'Short'
                    })
            return qs

        pass1_qs = make_qs(6, valid=True) + make_qs(4, valid=False)
        repair_qs = make_qs(4, valid=False)

        call_count = [0]
        def mock_generate_batch(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return pass1_qs, 'gemini_1', 'gemini-3-flash-preview'
            return repair_qs, 'gemini_1', 'gemini-3-flash-preview'

        start_time = time.time()
        with patch('ai_mcq_engine.generate_batched_mcqs', side_effect=mock_generate_batch):
            questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                count=10,
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Introduction to Business Economics',
                chapter_id='ch-fnd-eco-1',
                job_id='job-aud-06',
                source_documents=source_docs
            )
        elapsed = time.time() - start_time

        self.assertLess(elapsed, 5.0, "Execution took too long; potential infinite loop!")
        self.assertEqual(call_count[0], 2, "Must perform at most 1 primary + 1 repair pass")
        self.assertEqual(metrics['finalStatus'], 'PARTIAL')
        self.assertEqual(metrics['generatedCount'], 6)
        self.assertEqual(metrics['failedCount'], 4)
        self.assertEqual(len(questions), 6)
        self.assertEqual(metrics['questionStatuses'][6]['status'], 'failed')
        print("PASS: Scenario 06 - No stuck at 6/10; slots fail fast and pipeline completes with PARTIAL status")

    # =========================================================================
    # SCENARIO 7: Partial job preservation
    # =========================================================================
    def test_07_partial_job_preservation(self):
        chunk_text_s7 = """
        Business Economics incorporates microeconomic tools to analyze business decisions and resource allocation.
        Normative economics prescribes desirable outcomes based on value judgments, while positive economics is descriptive.
        The basic economic problems are what, how, and for whom to produce within society.
        Opportunity cost evaluates the benefit of the next best choice or alternative foregone in decision making.
        Business economics adopts a pragmatic approach emphasizing practical application over pure theoretical abstraction.
        Macroeconomics investigates national aggregate income, employment, and general price levels.
        """
        test_data = {
            'ai_generation_jobs': [],
            'questions': [],
            'tests': [],
            'ai_source_documents': [{
                'id': 'doc-s7',
                'chapterId': 'ch-fnd-eco-1',
                'chapter': 'Introduction to Business Economics',
                'subject': 'Business Economics',
                'examLevel': 'CA Foundation',
                'isActive': True,
                'chunks': [{
                    'chunkId': 'chk-s7',
                    'docId': 'doc-s7',
                    'chapterId': 'ch-fnd-eco-1',
                    'chapter': 'Introduction to Business Economics',
                    'isActive': True,
                    'text': chunk_text_s7,
                    'extractedText': chunk_text_s7
                }]
            }]
        }

        distinct_valid_6 = [
            {
                'question': 'How does microeconomic analysis support managerial choice?',
                'optionA': 'Applies micro tools to allocation decisions',
                'optionB': 'Exclusively macroeconomic forecasting',
                'optionC': 'General accounting reconciliation',
                'optionD': 'Auditing statutory statements',
                'correctAnswer': 'A',
                'explanation': 'Under Business Economics microeconomic tools guide allocation decisions.',
                'sourceDocId': 'doc-s7', 'sourceContentId': 'chk-s7'
            },
            {
                'question': 'What is the central focus of normative economic evaluation?',
                'optionA': 'Prescribing desirable outcomes based on value judgments',
                'optionB': 'Describing observed facts without opinions',
                'optionC': 'Calculating arithmetic historical means',
                'optionD': 'Computing physical asset deprecation',
                'correctAnswer': 'A',
                'explanation': 'Normative economics offers value-based prescriptive statements.',
                'sourceDocId': 'doc-s7', 'sourceContentId': 'chk-s7'
            },
            {
                'question': 'Which basic economic problem addresses product distribution?',
                'optionA': 'For whom to produce within society',
                'optionB': 'What technology to adopt in factories',
                'optionC': 'How much currency reserve to maintain',
                'optionD': 'When to close retail establishments',
                'correctAnswer': 'A',
                'explanation': 'The for whom question resolves societal product allocation.',
                'sourceDocId': 'doc-s7', 'sourceContentId': 'chk-s7'
            },
            {
                'question': 'What role does opportunity cost play in financial capital budgeting?',
                'optionA': 'Quantifies the return of best forgone alternative',
                'optionB': 'Records cash outlay already expended in past',
                'optionC': 'Tracks statutory registration levies paid',
                'optionD': 'Calculates bank overdraft penalty interest',
                'correctAnswer': 'A',
                'explanation': 'Opportunity cost evaluates the benefit of the next best choice foregone.',
                'sourceDocId': 'doc-s7', 'sourceContentId': 'chk-s7'
            },
            {
                'question': 'How is pragmatism reflected in modern business economics?',
                'optionA': 'Emphasizing practical application over pure theoretical abstraction',
                'optionB': 'Rejecting all empirical observation',
                'optionC': 'Relying exclusively on deductive axioms',
                'optionD': 'Ignoring operational limitations',
                'correctAnswer': 'A',
                'explanation': 'Business economics adopts pragmatic decision rules for actual enterprises.',
                'sourceDocId': 'doc-s7', 'sourceContentId': 'chk-s7'
            },
            {
                'question': 'What distinguishes macroeconomics from firm-level micro analysis?',
                'optionA': 'Study of national aggregate income and price levels',
                'optionB': 'Pricing single products in local stores',
                'optionC': 'Determining wage for single technician',
                'optionD': 'Measuring productivity of one assembly line',
                'correctAnswer': 'A',
                'explanation': 'Macroeconomics investigates broad economic aggregates and trends.',
                'sourceDocId': 'doc-s7', 'sourceContentId': 'chk-s7'
            }
        ]

        with patch('ai_mcq_engine.generate_batched_mcqs', return_value=(distinct_valid_6, 'gemini_1', 'gemini-3-flash-preview')):
            ok, err, res = ai_job_manager.run_generation_job_synchronous(
                params={
                    'title': 'Partial Practice Test',
                    'examLevel': 'CA Foundation',
                    'subject': 'Business Economics',
                    'chapter': 'Introduction to Business Economics',
                    'chapterId': 'ch-fnd-eco-1',
                    'topic': 'Introduction to Business Economics',
                    'count': 10
                },
                data=test_data,
                save_callback=lambda d: None,
                firebase_sync_callback=lambda p, b, **k: None
            )

            self.assertTrue(ok)
            created_test = res.get('test')
            self.assertIsNotNone(created_test)
            self.assertEqual(created_test['totalQuestions'], 6)
            self.assertEqual(len(test_data['questions']), 6)
            self.assertEqual(test_data['ai_generation_jobs'][0]['status'], 'PARTIAL')
            self.assertEqual(test_data['ai_generation_jobs'][0]['validatedCount'], 6)
            self.assertEqual(test_data['ai_generation_jobs'][0]['failedCount'], 4)
        print("PASS: Scenario 07 - Partial job preservation maintains verified questions and PARTIAL status")

    # =========================================================================
    # SCENARIO 8: Refresh during generation reconstructs state cleanly
    # =========================================================================
    def test_08_refresh_during_generation(self):
        now_iso = datetime.now(timezone.utc).isoformat()
        job_record = {
            'id': 'job-active-refresh-1',
            'status': 'PROCESSING',
            'requestedCount': 10,
            'generatedCount': 5,
            'validatedCount': 5,
            'rejectedCount': 0,
            'currentQuestionIndex': 5,
            'lastHeartbeatAt': now_iso,
            'createdAt': now_iso,
            'generatedQuestions': [{'id': f'q-{i}'} for i in range(5)],
            'questionStatuses': ['VERIFIED'] * 5 + ['PENDING'] * 5
        }
        test_data = {'ai_generation_jobs': [job_record]}

        active_job = ai_job_manager.get_active_generation_job(data=test_data)
        self.assertIsNotNone(active_job)
        self.assertEqual(active_job['id'], 'job-active-refresh-1')
        self.assertEqual(active_job['status'], 'PROCESSING')
        self.assertEqual(active_job['validatedCount'], 5)
        self.assertEqual(len(active_job['generatedQuestions']), 5)
        print("PASS: Scenario 08 - Browser refresh during generation recovers active job state cleanly")

    # =========================================================================
    # SCENARIO 9: Restart backend during generation — no false 30s kill
    # =========================================================================
    def test_09_restart_backend_during_generation(self):
        ai_job_manager._active_jobs.clear()
        ai_job_manager._active_workers.clear()

        forty_secs_ago = (datetime.now(timezone.utc) - timedelta(seconds=40)).isoformat()
        job_record = {
            'id': 'job-restart-recovery-1',
            'status': 'PROCESSING',
            'requestedCount': 10,
            'generatedCount': 4,
            'validatedCount': 4,
            'rejectedCount': 0,
            'createdAt': forty_secs_ago,
            'lastHeartbeatAt': forty_secs_ago,
            'generatedQuestions': [{'id': f'q-{i}'} for i in range(4)]
        }
        test_data = {'ai_generation_jobs': [job_record]}

        active_job = ai_job_manager.get_active_generation_job(data=test_data)
        self.assertIsNotNone(active_job)
        self.assertEqual(active_job['status'], 'PROCESSING')
        self.assertEqual(len(active_job['generatedQuestions']), 4)
        print("PASS: Scenario 09 - Process restart preserves active job; 30s killer removed")

    # =========================================================================
    # SCENARIO 10: Recovery and reclaim of stale jobs (>120s inactive)
    # =========================================================================
    def test_10_recovery_and_reclaim(self):
        ai_job_manager._active_jobs.clear()
        ai_job_manager._active_workers.clear()

        stale_time = (datetime.now(timezone.utc) - timedelta(seconds=150)).isoformat()
        stale_job = {
            'id': 'job-crashed-worker-1',
            'status': 'PROCESSING',
            'requestedCount': 10,
            'generatedCount': 5,
            'validatedCount': 5,
            'rejectedCount': 0,
            'createdAt': stale_time,
            'lastHeartbeatAt': stale_time,
            'generatedQuestions': [{'id': f'q-{i}', 'question': f'Q{i}'} for i in range(5)],
            'testId': 'test-stale-01'
        }
        test_data = {
            'ai_generation_jobs': [stale_job],
            'tests': [{'id': 'test-stale-01', 'questions': []}],
            'questions': []
        }

        active_job = ai_job_manager.get_active_generation_job(data=test_data)
        self.assertEqual(stale_job['status'], 'PARTIAL')
        self.assertIn('timed out', stale_job.get('error', '').lower())
        self.assertEqual(len(test_data['tests'][0]['questions']), 5)
        print("PASS: Scenario 10 - Stale job recovered safely to PARTIAL without data loss")

    # =========================================================================
    # SCENARIO 11: Create scheduled task
    # =========================================================================
    def test_11_create_scheduled_task(self):
        test_data = {'ai_scheduled_tasks': []}
        task_input = {
            'name': 'Daily Economics Practice',
            'scheduleType': 'recurring',
            'dailyTime': '09:00',
            'examLevel': 'CA Foundation',
            'subject': 'Business Economics',
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'questionCount': 5
        }
        task = ai_scheduler.save_scheduled_task(task_input, data=test_data)
        self.assertIsNotNone(task)
        self.assertEqual(task['status'], 'scheduled')
        self.assertEqual(task['chapterId'], 'ch-fnd-eco-2')
        self.assertEqual(task['questionCount'], 5)
        self.assertIn('nextRunAt', task)
        self.assertEqual(len(test_data['ai_scheduled_tasks']), 1)
        print("PASS: Scenario 11 - Scheduled task created with proper syllabus and timing parameters")

    # =========================================================================
    # SCENARIO 12: Trigger two scheduler invocations simultaneously
    # =========================================================================
    def test_12_trigger_two_scheduler_invocations_simultaneously(self):
        task = {
            'id': 'task-race-1',
            'name': 'Concurrent Task',
            'status': 'scheduled',
            'nextRunAt': (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        }
        test_data = {'ai_scheduled_tasks': [task]}

        ok_a, exec_id = ai_scheduler.attempt_claim_task(task, data=test_data, worker_id='worker-node-A')
        self.assertTrue(ok_a)
        self.assertEqual(task['status'], 'CLAIMING')
        self.assertEqual(task['workerId'], 'worker-node-A')

        ok_b, reason = ai_scheduler.attempt_claim_task(task, data=test_data, worker_id='worker-node-B')
        self.assertFalse(ok_b)
        self.assertIn('already claimed', reason.lower())
        print("PASS: Scenario 12 - Concurrent claim attempt properly locked to Worker A")

    # =========================================================================
    # SCENARIO 13: Verify only one execution occurs
    # =========================================================================
    def test_13_verify_only_one_execution_occurs(self):
        task = {
            'id': 'task-dedup-exec-1',
            'name': 'Dedup Task',
            'status': 'scheduled',
            'nextRunAt': (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
            'examLevel': 'CA Foundation',
            'subject': 'Business Economics',
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'questionCount': 3
        }
        test_data = {'ai_scheduled_tasks': [task], 'ai_generation_jobs': [], 'questions': [], 'tests': []}

        execution_counts = [0]
        def mock_sync_job(*args, **kwargs):
            execution_counts[0] += 1
            return True, None, {'test': {'id': 'tst-01', 'title': 'Dedup Test'}}

        with patch('ai_job_manager.run_generation_job_synchronous', side_effect=mock_sync_job):
            processed_1 = ai_scheduler.process_due_tasks(test_data, lambda d: None, lambda p, b, **k: None)
            processed_2 = ai_scheduler.process_due_tasks(test_data, lambda d: None, lambda p, b, **k: None)

            self.assertEqual(execution_counts[0], 1, "Task must execute exactly once across concurrent workers")
            self.assertEqual(processed_1['executedCount'], 1)
            self.assertEqual(processed_2['executedCount'], 0)
        print("PASS: Scenario 13 - Verified only one execution occurs under concurrent scheduler processing")

    # =========================================================================
    # SCENARIO 14: Verify scheduled MCQs generated via shared pipeline
    # =========================================================================
    def test_14_verify_scheduled_mcqs_generated(self):
        task = {
            'id': 'task-exec-mcq-1',
            'name': 'Generate Scheduled MCQs',
            'status': 'scheduled',
            'nextRunAt': (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(),
            'examLevel': 'CA Foundation',
            'subject': 'Business Economics',
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'topic': 'Theory of Demand and Supply',
            'questionCount': 4
        }
        test_data = {
            'ai_scheduled_tasks': [task],
            'ai_generation_jobs': [],
            'questions': [],
            'tests': [],
            'ai_source_documents': [{
                'id': 'doc-sch-1',
                'chapterId': 'ch-fnd-eco-2',
                'chapter': 'Theory of Demand and Supply',
                'subject': 'Business Economics',
                'examLevel': 'CA Foundation',
                'isActive': True,
                'chunks': [{
                    'chunkId': 'chk-sch-1',
                    'docId': 'doc-sch-1',
                    'chapterId': 'ch-fnd-eco-2',
                    'chapter': 'Theory of Demand and Supply',
                    'isActive': True,
                    'text': 'Demand elasticity quantifies price sensitivity across consumer segments. When demand is unit elastic total expenditure remains unchanged. The Engel curve illustrates relationship between income and quantity demanded. A rectangular hyperbola demand curve possesses unitary elasticity throughout.',
                    'extractedText': 'Demand elasticity quantifies price sensitivity across consumer segments. When demand is unit elastic total expenditure remains unchanged. The Engel curve illustrates relationship between income and quantity demanded. A rectangular hyperbola demand curve possesses unitary elasticity throughout.'
                }]
            }]
        }

        generated_qs = [
            {
                'question': 'How does price elasticity quantify consumer price sensitivity?',
                'optionA': 'Measures responsiveness of quantity demanded to price change',
                'optionB': 'Tracks supply shift along identical trajectory',
                'optionC': 'Calculates fixed factory overhead expenditure',
                'optionD': 'Computes marginal cost ratio at threshold',
                'correctAnswer': 'A',
                'explanation': 'Demand elasticity quantifies sensitivity to price changes.',
                'sourceDocId': 'doc-sch-1', 'sourceContentId': 'chk-sch-1'
            },
            {
                'question': 'What happens to consumer expenditure when demand is unit elastic?',
                'optionA': 'Total expenditure remains unchanged following price adjustments',
                'optionB': 'Total expenditure increases proportionally with price',
                'optionC': 'Total expenditure plunges strictly to zero',
                'optionD': 'Total expenditure doubles regardless of volume',
                'correctAnswer': 'A',
                'explanation': 'Under unit elasticity total consumer expenditure remains identical.',
                'sourceDocId': 'doc-sch-1', 'sourceContentId': 'chk-sch-1'
            },
            {
                'question': 'Which curve traces quantities demanded at varying consumer income?',
                'optionA': 'Engel curve reflecting consumer expenditure shifts',
                'optionB': 'Isoquant contour showing resource substitutability',
                'optionC': 'Indifference profile mapping equivalent satisfaction',
                'optionD': 'Transformation curve documenting maximum output',
                'correctAnswer': 'A',
                'explanation': 'The Engel curve illustrates relationship between income and quantity demanded.',
                'sourceDocId': 'doc-sch-1', 'sourceContentId': 'chk-sch-1'
            },
            {
                'question': 'When demand curve is rectangular hyperbola, what is elasticity?',
                'optionA': 'Elasticity equals unity at all points on curve',
                'optionB': 'Elasticity increases toward infinity at upper end',
                'optionC': 'Elasticity drops to zero at lower intercept',
                'optionD': 'Elasticity varies directly with product price',
                'correctAnswer': 'A',
                'explanation': 'A rectangular hyperbola demand curve possesses unitary elasticity throughout.',
                'sourceDocId': 'doc-sch-1', 'sourceContentId': 'chk-sch-1'
            }
        ]

        with patch('ai_mcq_engine.generate_batched_mcqs', return_value=(generated_qs, 'gemini_1', 'gemini-3-flash-preview')):
            ok, err, res = ai_scheduler.execute_scheduler_task_sync(
                task=task,
                data=test_data,
                save_callback=lambda d: None,
                firebase_sync_callback=lambda p, b, **k: None
            )
            self.assertTrue(ok)
            self.assertIn(task['status'], ['live', 'completed'])
            self.assertEqual(len(test_data['questions']), 4)
        print("PASS: Scenario 14 - Scheduled task successfully generates MCQs via shared engine")

    # =========================================================================
    # SCENARIO 15: Verify scheduled MCQs hosted into tests
    # =========================================================================
    def test_15_verify_scheduled_mcqs_hosted(self):
        task = {
            'id': 'task-host-01',
            'name': 'Publishing Scheduled Test',
            'status': 'scheduled',
            'nextRunAt': (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
            'examLevel': 'CA Foundation',
            'subject': 'Business Economics',
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'topic': 'Theory of Demand and Supply',
            'questionCount': 2
        }
        test_data = {'ai_scheduled_tasks': [task], 'ai_generation_jobs': [], 'questions': [], 'tests': []}

        mock_test_obj = {
            'id': 'tst-hosted-99',
            'title': 'Publishing Scheduled Test',
            'examLevel': 'CA Foundation',
            'subject': 'Business Economics',
            'chapter': 'Theory of Demand and Supply',
            'chapterId': 'ch-fnd-eco-2',
            'status': 'scheduled',
            'questions': [{'id': 'q-1'}, {'id': 'q-2'}]
        }

        def mock_sync_job(*args, **kwargs):
            test_data['tests'].append(dict(mock_test_obj))
            return True, None, {'test': mock_test_obj}

        with patch('ai_job_manager.run_generation_job_synchronous', side_effect=mock_sync_job):
            ok, err, res = ai_scheduler.execute_scheduler_task_sync(
                task=task,
                data=test_data,
                save_callback=lambda d: None,
                firebase_sync_callback=lambda p, b, **k: None
            )
            self.assertTrue(ok)
            self.assertIn(task['status'], ['live', 'completed'])
            self.assertEqual(task['lastTestId'], 'tst-hosted-99')
            self.assertTrue(any(t['id'] == 'tst-hosted-99' for t in test_data['tests']))
        print("PASS: Scenario 15 - Scheduled test properly hosted in test repository")

    # =========================================================================
    # SCENARIO 16: Upload syllabus PDF with deduplication & semantic chunking
    # =========================================================================
    def test_16_upload_syllabus_pdf(self):
        test_data = {'ai_source_documents': []}
        pdf_content = b"%PDF-1.4 Mock PDF content for CA Foundation Economics Chapter 1"
        ocr_response = {
            'page_count': 2,
            'pages': [
                {'page_number': 1, 'markdown': '# Chapter 1: Introduction to Business Economics\nEconomics is the study of scarcity and choice.'},
                {'page_number': 2, 'markdown': 'Microeconomics focuses on individual decision-making entities.'}
            ],
            'full_text': 'Economics is the study of scarcity and choice. Microeconomics focuses on individual entities.'
        }

        with patch('ai_provider_manager.call_mistral_ocr', return_value=ocr_response):
            ok1, err1, doc1 = ai_document_indexer.index_document(
                pdf_content,
                filename='economics_ch1.pdf',
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Introduction to Business Economics',
                chapter_id='ch-fnd-eco-1',
                data=test_data
            )
            self.assertTrue(ok1)
            self.assertEqual(doc1['status'], 'COMPLETED')
            self.assertGreater(doc1['chunkCount'], 0)
            self.assertEqual(len(test_data['ai_source_documents']), 1)

            ok2, err2, doc2 = ai_document_indexer.index_document(
                pdf_content,
                filename='economics_ch1_copy.pdf',
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Introduction to Business Economics',
                chapter_id='ch-fnd-eco-1',
                data=test_data
            )
            self.assertTrue(ok2)
            self.assertTrue(doc2['alreadyProcessed'])
            self.assertEqual(len(test_data['ai_source_documents']), 1)
        print("PASS: Scenario 16 - Syllabus PDF uploaded, chunked, and deduplicated via hash")

    # =========================================================================
    # SCENARIO 17: Generate from chapter with matching source chunks
    # =========================================================================
    def test_17_generate_from_chapter_with_matching_source(self):
        chunk_text = "Price elasticity of demand is defined as percentage change in quantity demanded divided by percentage change in price."
        test_data = {
            'ai_source_documents': [{
                'id': 'doc-grounded-01',
                'chapterId': 'ch-fnd-eco-2',
                'chapter': 'Theory of Demand and Supply',
                'subject': 'Business Economics',
                'examLevel': 'CA Foundation',
                'isActive': True,
                'chunks': [{
                    'chunkId': 'chk-ped-01',
                    'docId': 'doc-grounded-01',
                    'chapterId': 'ch-fnd-eco-2',
                    'chapter': 'Theory of Demand and Supply',
                    'isActive': True,
                    'text': chunk_text,
                    'extractedText': chunk_text
                }]
            }]
        }

        mock_gen_qs = [{
            'question': 'How is price elasticity of demand calculated under syllabus standards?',
            'optionA': 'Percentage change in quantity demanded divided by percentage change in price',
            'optionB': 'Change in price divided by change in supply',
            'optionC': 'Total revenue minus total cost',
            'optionD': 'Marginal cost ratio',
            'correctAnswer': 'A',
            'explanation': 'Price elasticity of demand equals percentage change in quantity demanded divided by percentage change in price.',
            'sourceDocId': 'doc-grounded-01',
            'sourceContentId': 'chk-ped-01'
        }]

        with patch('ai_mcq_engine.generate_batched_mcqs', return_value=(mock_gen_qs, 'gemini_1', 'gemini-3-flash-preview')):
            questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                count=1,
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Theory of Demand and Supply',
                chapter_id='ch-fnd-eco-2',
                source_documents=test_data['ai_source_documents'],
                allow_ungrounded=False
            )
            self.assertEqual(metrics['finalStatus'], 'COMPLETED')
            self.assertEqual(metrics['generatedCount'], 1)
            self.assertEqual(questions[0]['sourceContentId'], 'chk-ped-01')
        print("PASS: Scenario 17 - MCQ generation from chapter with matching source chunks succeeds")

    # =========================================================================
    # SCENARIO 18: Generate from chapter with NO matching source chunks
    # =========================================================================
    def test_18_generate_from_chapter_with_no_matching_source(self):
        test_data = {
            'ai_source_documents': [{
                'id': 'doc-ch1-only',
                'chapterId': 'ch-fnd-eco-1',
                'chapter': 'Introduction to Business Economics',
                'subject': 'Business Economics',
                'examLevel': 'CA Foundation',
                'isActive': True,
                'chunks': [{
                    'chunkId': 'chk-ch1',
                    'docId': 'doc-ch1-only',
                    'chapterId': 'ch-fnd-eco-1',
                    'chapter': 'Introduction to Business Economics',
                    'isActive': True,
                    'text': 'Nature of Business Economics.',
                    'extractedText': 'Nature of Business Economics.'
                }]
            }]
        }

        questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            count=5,
            exam_level='CA Foundation',
            subject='Business Economics',
            chapter='Determination of National Income',
            chapter_id='ch-fnd-eco-5',
            source_documents=test_data['ai_source_documents'],
            allow_ungrounded=False
        )
        self.assertEqual(metrics['finalStatus'], 'FAILED')
        self.assertIn('INSUFFICIENT_SOURCE', metrics['error'])
        print("PASS: Scenario 18 - Chapter with no matching source chunks halts pipeline immediately")

    # =========================================================================
    # SCENARIO 19: Verify NO source causes INSUFFICIENT_SOURCE (no ungrounded fallback)
    # =========================================================================
    def test_19_verify_no_source_causes_insufficient_source(self):
        with patch('ai_mcq_engine.generate_batched_mcqs') as mock_llm_call:
            questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                count=10,
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Determination of National Income',
                chapter_id='ch-fnd-eco-5',
                source_documents=[],
                allow_ungrounded=False
            )
            self.assertEqual(mock_llm_call.call_count, 0, "LLM was invoked despite missing source documents!")
            self.assertEqual(metrics['finalStatus'], 'FAILED')
            self.assertIn('INSUFFICIENT_SOURCE', metrics['error'])
        print("PASS: Scenario 19 - Missing source documents trigger INSUFFICIENT_SOURCE with zero LLM calls")

    # =========================================================================
    # SCENARIO 20: Out-of-syllabus concept rejected locally
    # =========================================================================
    def test_20_out_of_syllabus_concept_rejected(self):
        source_chunk_text = """
        The Law of Demand states that quantity demanded increases as price falls, ceteris paribus.
        Demand curves slope downward due to the substitution effect and income effect.
        Exceptions include Giffen goods and Veblen luxury items.
        """

        out_of_syllabus_q = {
            'question': 'What is the Schrödinger wave equation solution for quantum harmonic oscillation?',
            'optionA': 'Psi equals exponential of minus alpha x squared over two',
            'optionB': 'Linear combination of eigenvalues',
            'optionC': 'Zero energy ground state',
            'optionD': 'None of the above',
            'correctAnswer': 'A',
            'explanation': 'Quantum mechanics wave equation describes probability amplitudes.',
            'sourceDocId': 'doc-1',
            'sourceContentId': 'chk-1'
        }

        is_grounded, reason, best_chunk, score = ai_mcq_engine.verify_source_chunk_grounding(
            candidate_text=out_of_syllabus_q['question'],
            explanation_text=out_of_syllabus_q['explanation'],
            source_chunks=[{'chunkId': 'chk-1', 'text': source_chunk_text}]
        )
        self.assertFalse(is_grounded)

        ok, reason, err_code = ai_mcq_engine.validate_mcq_locally_deterministic(
            out_of_syllabus_q,
            source_chunks=[{'chunkId': 'chk-1', 'text': source_chunk_text}],
            require_grounding=True
        )
        self.assertFalse(ok)
        self.assertEqual(err_code, 'UNGROUNDED_SOURCE_REJECTED')
        print("PASS: Scenario 20 - Out-of-syllabus candidate question strictly rejected locally")

if __name__ == '__main__':
    unittest.main()
