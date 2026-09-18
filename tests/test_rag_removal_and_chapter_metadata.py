import unittest
import time
import json
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import syllabus_hierarchy
import ai_mcq_engine
import ai_job_manager

class TestRagRemovalAndChapterMetadata(unittest.TestCase):

    def test_01_authoritative_metadata_resolution(self):
        meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id='ch-fnd-eco-1')
        self.assertIsNotNone(meta)
        self.assertEqual(meta['chapterId'], 'ch-fnd-eco-1')
        self.assertEqual(meta['chapterName'], 'Introduction to Business Economics')
        self.assertEqual(meta['subject'], 'Business Economics')
        self.assertGreaterEqual(len(meta['allowedTopics']), 3)
        self.assertGreaterEqual(len(meta['allowedConcepts']), 3)
        self.assertTrue(len(meta['chapterDescription']) > 20)

        invalid_meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id='ch-nonexistent-999')
        self.assertIsNone(invalid_meta)

    def test_02_rag_free_chatgpt_style_prompt(self):
        meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id='ch-fnd-eco-2')
        prompt = ai_mcq_engine.build_generation_user_prompt(
            subject='Business Economics',
            exam_level='CA Foundation',
            chapter_metadata=meta,
            difficulty='ICAI Exam Standard',
            question_category='Direct Questions',
            question_speed='Quick',
            slot_number=1,
            total_count=10
        )
        self.assertIn('Authoritative Chapter: Theory of Demand and Supply (ID: ch-fnd-eco-2)', prompt)
        self.assertIn('Allowed Syllabus Topics for this Chapter:', prompt)
        self.assertIn('Core Conceptual Focus:', prompt)
        self.assertIn('Elasticity of Demand', prompt)
        self.assertNotIn('Source Material Context (Extracted from Syllabus Documents)', prompt)
        self.assertLess(len(prompt), 2200)

    def test_03_fail_fast_on_missing_chapter_metadata(self):
        qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject='Astrology and Mythology',
            topic='Zodiac Signs',
            count=3,
            chapter_id='ch-unknown-zodiac',
            chapter='Unknown Chapter'
        )
        self.assertEqual(len(qs), 0)
        self.assertEqual(metrics['failedCount'], 3)
        self.assertIn('CHAPTER_METADATA_MISSING', metrics.get('error', ''))
        for s in metrics['questionStatuses']:
            self.assertEqual(s['status'], 'failed')
            self.assertIn('CHAPTER_METADATA_MISSING', s.get('error', ''))

    def test_04_off_chapter_local_validation_rejection(self):
        off_chapter_q = {
            'question': 'What is the accounting entry for Bank Overdraft according to BRS?',
            'optionA': 'Debit Bank Credit Cash',
            'optionB': 'Credit Bank Debit Cash',
            'optionC': 'No entry required',
            'optionD': 'Debit Suspense Account',
            'correctAnswer': 'A',
            'explanation': 'Bank overdraft accounting involves debiting bank.',
            'chapterId': 'ch-fnd-acc-3',
            'chapter': 'Bank Reconciliation Statement (BRS)'
        }
        is_valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=off_chapter_q,
            subject='Business Economics',
            chapter='Introduction to Business Economics',
            chapter_id='ch-fnd-eco-1'
        )
        self.assertFalse(is_valid)
        self.assertEqual(code, 'OFF_CHAPTER_QUESTION')

    def test_05_source_reproduction_local_rejection(self):
        admin_desc = 'Compute the elasticity of demand when price rises from Rs 10 to Rs 15 and quantity falls from 100 units to 60 units.'
        copy_q = {
            'question': 'Compute the elasticity of demand when price rises from Rs 10 to Rs 15 and quantity falls from 100 units to 60 units.',
            'optionA': '0.8',
            'optionB': '1.2',
            'optionC': '0.5',
            'optionD': '1.5',
            'correctAnswer': 'A',
            'explanation': 'Elasticity formula applied step by step.'
        }
        is_valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=copy_q,
            subject='Business Economics',
            chapter='Theory of Demand and Supply',
            chapter_id='ch-fnd-eco-2',
            admin_description=admin_desc
        )
        self.assertFalse(is_valid)
        self.assertEqual(code, 'SOURCE_REPRODUCTION_REJECTED')

    def test_06_complete_pipeline_batch_with_authoritative_metadata(self):
        mock_pool = [
            ('Which of the following is a feature of Business Economics?', 'It is normative in nature and pragmatic in approach'),
            ('What does the opportunity cost principle state in economics?', 'It represents the value of the next best alternative sacrificed'),
            ('Which economic system relies primarily on price mechanism for resource allocation?', 'Capitalist economic system with free markets'),
            ('In economic analysis, microeconomics focuses primarily on which of the following?', 'Individual consumer and firm decision making units'),
            ('Which basic economic problem deals with choice of technology and labor intensity?', 'How to produce goods and services efficiently')
        ]

        def mock_generate_single(**kwargs):
            slot = kwargs.get('slot_number', 1)
            q_text, opt_a = mock_pool[(slot - 1) % len(mock_pool)]
            self.assertIsNotNone(kwargs.get('chapter_metadata'))
            self.assertEqual(kwargs['chapter_metadata']['chapterId'], 'ch-fnd-eco-1')
            return {
                'question': q_text,
                'optionA': opt_a,
                'optionB': 'Alternative plausible distractor B',
                'optionC': 'Alternative plausible distractor C',
                'optionD': 'Alternative plausible distractor D',
                'correctAnswer': 'A',
                'explanation': f'Authoritative ICAI explanation for slot {slot}.'
            }, 'gemini_1', 'gemini-3-flash-preview'

        with patch('ai_mcq_engine.generate_single_mcq', side_effect=mock_generate_single):
            qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject='Business Economics',
                chapter_id='ch-fnd-eco-1',
                chapter='Introduction to Business Economics',
                count=5,
                job_id='test-rag-free-batch'
            )
            self.assertEqual(len(qs), 5)
            self.assertEqual(metrics['generatedCount'], 5)
            self.assertEqual(metrics['failedCount'], 0)
            for q in qs:
                self.assertEqual(q['chapterId'], 'ch-fnd-eco-1')
                self.assertEqual(q['chapter'], 'Introduction to Business Economics')
                self.assertIsNone(q['sourceDocId'])

if __name__ == '__main__':
    unittest.main()
