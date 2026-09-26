import unittest
import os
import sys
import json
import time
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import local_qwen_service
import ai_mcq_engine
import ai_provider_manager
import ai_job_manager
import ai_scheduler
import syllabus_hierarchy

class TestLocalQwenGeneration(unittest.TestCase):

    def setUp(self):
        self.mock_data = {
            'users': [],
            'tests': [],
            'questions': [],
            'ai_scheduled_tasks': [],
            'ai_generation_jobs': [],
            'ai_generation_logs': []
        }

    # TEST 1: Health check when Ollama is online vs offline
    def test_01_health_check_online_and_offline(self):
        # 1a. Test real local Ollama
        is_online, info = local_qwen_service.check_ollama_health(timeout=5.0)
        self.assertTrue(is_online, f"Local Ollama should be online. Got: {info}")
        self.assertTrue(info.get('modelAvailable'), f"Model qwen3:8b should be available. Got models: {info.get('availableModels')}")
        self.assertGreater(info.get('latencyMs', 0), 0)

        # 1b. Test offline scenario with invalid URL
        with patch.object(local_qwen_service, 'OLLAMA_BASE_URL', 'http://127.0.0.1:59999'):
            offline_status, offline_info = local_qwen_service.check_ollama_health(timeout=1.0)
            self.assertFalse(offline_status)
            self.assertTrue(bool(offline_info.get('error')))

    # TEST 2: Generate 2 MCQs (Quantitative Aptitude -> Ratio and Proportion) live via local Qwen3 8B
    def test_02_generate_2_mcqs_live(self):
        mcqs, gen_meta = local_qwen_service.generate_mcqs(
            subject='Quantitative Aptitude',
            chapter='Ratio and Proportion, Indices, Logarithms',
            topic='Ratio and Proportion',
            exam_level='CA Foundation',
            difficulty='ICAI Exam Standard',
            question_category='Direct Questions',
            question_speed='Quick',
            count=2,
            timeout=120.0
        )
        self.assertEqual(len(mcqs), 2, f"Expected 2 MCQs, got {len(mcqs)}")
        self.assertEqual(gen_meta.get('provider'), 'LOCAL')
        self.assertEqual(gen_meta.get('model'), 'qwen3:8b')
        self.assertEqual(gen_meta.get('runtime'), 'Ollama')

        for i, q in enumerate(mcqs):
            self.assertTrue(bool(q.get('question')), f"Question {i+1} text must not be empty")
            opts = q.get('options', {})
            self.assertIsInstance(opts, dict)
            self.assertEqual(set(opts.keys()), {'A', 'B', 'C', 'D'}, f"Options must contain exactly A, B, C, D")
            for key, val in opts.items():
                self.assertTrue(bool(val), f"Option {key} text must not be empty")
            self.assertIn(q.get('answer'), ['A', 'B', 'C', 'D'], f"Answer must be one of A, B, C, D")
            self.assertTrue(bool(q.get('explanation')), f"Explanation must not be empty")

    # TEST 3: Batched pipeline execution using local Qwen3
    def test_03_batched_pipeline_execution(self):
        meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id='ch-fnd-qa-1')
        self.assertIsNotNone(meta)

        verified_qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject='Quantitative Aptitude',
            topic='Ratio and Proportion',
            chapter='Ratio and Proportion, Indices, Logarithms',
            chapter_id='ch-fnd-qa-1',
            exam_level='CA Foundation',
            difficulty='ICAI Exam Standard',
            count=2,
            chapter_metadata=meta
        )
        self.assertEqual(len(verified_qs), 2, f"Expected 2 verified MCQs, got {len(verified_qs)}")
        self.assertEqual(metrics.get('generatedCount'), 2)
        self.assertEqual(metrics.get('failedCount'), 0)
        self.assertIn('local_qwen', metrics.get('providersUsed', []))
        for q in verified_qs:
            self.assertTrue(bool(q.get('text')))
            self.assertIn(q.get('correctOption'), ['A', 'B', 'C', 'D'])
            self.assertIn('Ratio', q.get('chapter', ''))
        for s in metrics['questionStatuses']:
            self.assertEqual(s.get('status'), 'saved')

    # TEST 4: Duplicate prevention check
    def test_04_duplicate_prevention_check(self):
        sample_q = {
            'id': 'q-test-dup-1',
            'text': 'If A:B = 2:3 and B:C = 4:5, what is the compound ratio of A:C?',
            'options': [{'id': 'a', 'text': '8:15', 'isCorrect': True}, {'id': 'b', 'text': '2:5', 'isCorrect': False}],
            'answer': 'A'
        }
        existing_bank = [sample_q]
        current_batch = []

        # Test duplicate question with high similarity
        is_dup, reason = ai_mcq_engine.is_duplicate_question(sample_q['text'], existing_bank, current_batch)
        self.assertTrue(is_dup, f"Exact match question must be flagged as duplicate: {reason}")

        # Test distinct question
        distinct_text = 'What is the logarithmic value of 100 to base 10?'
        is_distinct_dup, _ = ai_mcq_engine.is_duplicate_question(distinct_text, existing_bank, current_batch)
        self.assertFalse(is_distinct_dup, "Distinct question must not be flagged as duplicate")

    # TEST 5: Wrong chapter protection check
    def test_05_wrong_chapter_protection_check(self):
        # Invalid chapter metadata lookup
        invalid_meta = syllabus_hierarchy.get_authoritative_chapter_metadata(chapter_id='ch-invalid-999')
        self.assertIsNone(invalid_meta)

        # Pipeline fails fast when chapter metadata is missing
        qs, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject='Quantitative Aptitude',
            topic='Invalid Topic',
            count=2,
            chapter_id='ch-invalid-999',
            chapter='Unknown Chapter'
        )
        self.assertEqual(len(qs), 0)
        self.assertIn('CHAPTER_METADATA_MISSING', metrics.get('error', ''))

    # TEST 6: Ollama offline handling fails cleanly without freezing
    # TEST 7: Malformed response handling and recovery
    def test_07_malformed_response_handling(self):
        # 7a. Markdown code fence with valid JSON inside
        fenced_payload = '```json\n[{"question": "What is 2+2?", "options": {"A":"1","B":"2","C":"3","D":"4"}, "answer": "D", "explanation": "2+2=4"}]\n```'
        parsed = local_qwen_service.parse_and_validate_mcqs_json(fenced_payload)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]['answer'], 'D')

        # 7b. Invalid unparseable JSON raises ValueError
        broken_json = '{"question": "Unclosed string...'
        with self.assertRaises(ValueError):
            local_qwen_service.parse_and_validate_mcqs_json(broken_json)

        # 7c. Missing option normalization fails gracefully returning None
        invalid_mcq = {
            'question': 'Sample question',
            'options': {'A': 'Option A', 'B': 'Option B'}, # Missing C and D
            'answer': 'A'
        }
        normalized = local_qwen_service.normalize_mcq(invalid_mcq)
        self.assertIsNone(normalized)

    # TEST 8: Auto-Pilot scheduled task execution with local Qwen
    # TEST 9: Generation History records provider: "LOCAL", model: "qwen3:8b", runtime: "Ollama"
if __name__ == '__main__':
    unittest.main()
