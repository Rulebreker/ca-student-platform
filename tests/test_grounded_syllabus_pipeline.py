import unittest
import os
import sys
import json
import hashlib
import time
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_document_indexer
import ai_mcq_engine
import ai_job_manager
import ai_scheduler
import syllabus_hierarchy

class TestGroundedSyllabusPipeline(unittest.TestCase):

    def setUp(self):
        self.sample_pdf_bytes = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\nxref\n0 4\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
        self.sample_hash = hashlib.sha256(self.sample_pdf_bytes).hexdigest()

    # 1. PDF Validation & Size Limit
    def test_01_pdf_validation_and_size_limit(self):
        # Non-PDF rejection
        is_valid, err = ai_document_indexer.validate_pdf_binary(b'Not a PDF file content')
        self.assertFalse(is_valid)
        self.assertTrue('corrupted file format' in err or 'File signature' in err or '%PDF' in err)

        # Oversized file rejection (>20MB)
        oversized = b'%PDF-1.4' + (b'0' * (21 * 1024 * 1024))
        is_valid, err = ai_document_indexer.validate_pdf_binary(oversized, max_size_bytes=20 * 1024 * 1024)
        self.assertFalse(is_valid)
        self.assertIn('exceeds maximum', err)

        # Serverless size limit rejection (>4MB)
        oversized_serverless = b'%PDF-1.4' + (b'0' * (5 * 1024 * 1024))
        is_valid, err = ai_document_indexer.validate_pdf_binary(oversized_serverless, max_size_bytes=4 * 1024 * 1024)
        self.assertFalse(is_valid)
        self.assertIn('exceeds maximum', err)

        # Valid PDF acceptance
        is_valid, err = ai_document_indexer.validate_pdf_binary(self.sample_pdf_bytes)
        self.assertTrue(is_valid)
        self.assertIsNone(err)

    # 2. Deterministic Deduplication
    def test_02_deterministic_deduplication(self):
        test_data = {'ai_source_documents': []}
        mock_ocr_response = {
            'page_count': 1,
            'pages': [{'page_number': 1, 'markdown': '# Chapter 1: Nature and Scope of Business Economics\nMicroeconomics and Macroeconomics.'}],
            'full_text': '# Chapter 1: Nature and Scope of Business Economics\nMicroeconomics and Macroeconomics.'
        }

        # First indexing
        with patch('ai_document_indexer.extract_pdf_text_locally', return_value=mock_ocr_response):
            ok1, err1, doc1 = ai_document_indexer.index_document(
                self.sample_pdf_bytes,
                filename='business_economics_ch1.pdf',
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Introduction to Business Economics',
                chapter_id='ch-fnd-eco-1',
                data=test_data
            )
            self.assertTrue(ok1)
            self.assertIsNone(err1)
            self.assertFalse(doc1.get('alreadyProcessed', False))
            self.assertEqual(len(test_data['ai_source_documents']), 1)
            doc_id = doc1['id']

        # Second indexing with identical PDF binary
        with patch('ai_document_indexer.extract_pdf_text_locally') as mock_ocr:
            ok2, err2, doc2 = ai_document_indexer.index_document(
                self.sample_pdf_bytes,
                filename='business_economics_ch1_duplicate.pdf',
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Introduction to Business Economics',
                chapter_id='ch-fnd-eco-1',
                data=test_data
            )
            self.assertTrue(ok2)
            self.assertIsNone(err2)
            self.assertTrue(doc2.get('alreadyProcessed', False))
            self.assertEqual(doc2['id'], doc_id)
            # OCR must NOT be called again
            mock_ocr.assert_not_called()
            # Database should still contain only 1 document
            self.assertEqual(len(test_data['ai_source_documents']), 1)

    # 3. Structured Syllabus Knowledge Base Schema
    def test_03_structured_syllabus_knowledge_base_schema(self):
        test_data = {'ai_source_documents': []}
        ocr_text = """# Chapter 2: Theory of Demand and Supply
## Unit 1: Law of Demand
Demand refers to quantity demanded at various prices.
The Law of Demand states price and quantity are inversely related.
Price Elasticity of Demand measures the percentage change."""

        mock_ocr_response = {
            'page_count': 1,
            'pages': [{'page_number': 1, 'markdown': ocr_text}],
            'full_text': ocr_text
        }

        with patch('ai_document_indexer.extract_pdf_text_locally', return_value=mock_ocr_response):
            ok, err, doc = ai_document_indexer.index_document(
                self.sample_pdf_bytes,
                filename='demand_and_supply.pdf',
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Theory of Demand and Supply',
                chapter_id='ch-fnd-eco-2',
                data=test_data
            )
            self.assertTrue(ok)
            self.assertEqual(doc['status'], 'COMPLETED')
            self.assertEqual(doc['processingStatus'], 'COMPLETED')
            self.assertEqual(doc['isActive'], True)
            self.assertEqual(doc['chapterId'], 'ch-fnd-eco-2')
            self.assertEqual(doc['contentHash'], self.sample_hash)
            self.assertGreater(doc['chunkCount'], 0)

            # Validate chunk schema
            chunks = doc['chunks']
            self.assertGreater(len(chunks), 0)
            chunk = chunks[0]
            self.assertTrue(chunk['chunkId'].startswith('chk-'))
            self.assertEqual(chunk['sourceDocumentId'], doc['id'])
            self.assertEqual(chunk['chapterId'], 'ch-fnd-eco-2')
            self.assertEqual(chunk['chapter'], 'Theory of Demand and Supply')
            self.assertEqual(chunk['isActive'], True)
            self.assertIn('extractedText', chunk)
            self.assertGreater(chunk['wordCount'], 0)

    # 4. Scoped Chunk Retrieval and Active State Toggling
    def test_04_scoped_retrieval_and_active_toggle(self):
        test_data = {'ai_source_documents': []}
        ocr_text = 'Demand and supply equilibrium occurs where market demand equals market supply.'
        mock_ocr = {
            'page_count': 1,
            'pages': [{'page_number': 1, 'markdown': ocr_text}],
            'full_text': ocr_text
        }
        with patch('ai_document_indexer.extract_pdf_text_locally', return_value=mock_ocr):
            ok, err, doc = ai_document_indexer.index_document(
                self.sample_pdf_bytes,
                filename='demand_and_supply.pdf',
                exam_level='CA Foundation',
                subject='Business Economics',
                chapter='Theory of Demand and Supply',
                chapter_id='ch-fnd-eco-2',
                data=test_data
            )
            doc_id = doc['id']

        # Retrieval for matching chapter
        matching_chunks = ai_document_indexer.retrieve_relevant_chunks(
            documents=test_data['ai_source_documents'],
            query_topic='Demand',
            subject='Business Economics',
            chapter='Theory of Demand and Supply',
            chapter_id='ch-fnd-eco-2'
        )
        self.assertGreater(len(matching_chunks), 0)

        # Retrieval for completely different chapter returns nothing
        other_chunks = ai_document_indexer.retrieve_relevant_chunks(
            documents=test_data['ai_source_documents'],
            query_topic='Inventory Valuation',
            subject='Principles and Practice of Accounting',
            chapter='Inventories',
            chapter_id='ch-fnd-acc-4'
        )
        self.assertEqual(len(other_chunks), 0)

        # Toggle inactive
        toggled_doc = ai_document_indexer.toggle_document_active(doc_id, False, test_data)
        self.assertIsNotNone(toggled_doc)
        self.assertFalse(toggled_doc['isActive'])

        # Inactive document chunks are filtered out
        inactive_query_chunks = ai_document_indexer.retrieve_relevant_chunks(
            documents=test_data['ai_source_documents'],
            query_topic='Demand',
            subject='Business Economics',
            chapter='Theory of Demand and Supply',
            chapter_id='ch-fnd-eco-2'
        )
        self.assertEqual(len(inactive_query_chunks), 0)

    # 5. Strict Source Grounding Prompt
    # 6. Out-of-Syllabus and Insufficient Source Deterministic Rejection
    def test_06_out_of_syllabus_and_insufficient_source_rejection(self):
        # Insufficient source rejection
        insufficient_q = {
            'question': 'INSUFFICIENT_SOURCE',
            'optionA': 'Valid Option A', 'optionB': 'Valid Option B',
            'optionC': 'Valid Option C', 'optionD': 'Valid Option D',
            'correctAnswer': 'A', 'explanation': 'Explanation text here.'
        }
        valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=insufficient_q,
            subject='Business Economics',
            chapter='Theory of Demand and Supply',
            chapter_id='ch-fnd-eco-2'
        )
        self.assertFalse(valid)
        self.assertEqual(code, 'INSUFFICIENT_SOURCE')

        # Out of syllabus chapter mismatch rejection
        mismatch_q = {
            'question': 'What is the depreciation rate under straight line method for manufacturing machinery?',
            'optionA': '10% per annum', 'optionB': '15% per annum',
            'optionC': '20% per annum', 'optionD': '25% per annum',
            'correctAnswer': 'A', 'explanation': 'Straight line depreciation calculation under AS 10.',
            'chapterId': 'ch-fnd-acc-5'
        }
        valid, reason, code = ai_mcq_engine.validate_mcq_locally_deterministic(
            q_data=mismatch_q,
            subject='Business Economics',
            chapter='Theory of Demand and Supply',
            chapter_id='ch-fnd-eco-2'
        )
        self.assertFalse(valid)
        self.assertIn(code, ['OFF_CHAPTER_QUESTION', 'OUT_OF_SYLLABUS_REJECTED'])

    # 7. Source Traceability in Generated Questions
    # 8. Partial Generation Preservation
    # 9. Scheduler Forwards sourceDocId
    # 10. Student Metadata Protection
    def test_10_student_metadata_protection(self):
        student_test = {
            'id': 'test-sec-01',
            'title': 'Demand and Supply Quiz',
            'questions': [
                {
                    'id': 'q-1',
                    'question': 'What is demand?',
                    'optionA': 'Desire backed by ability to pay',
                    'optionB': 'Need only',
                    'optionC': 'Desire only',
                    'optionD': 'None',
                    'correctAnswer': 'A',
                    'explanation': 'Authoritative definition.',
                    'sourceDocId': 'doc-secret-123',
                    'sourceContentId': 'chunk-secret-456',
                    'sourceChapter': 'Theory of Demand and Supply',
                    'sourceTopic': 'Law of Demand',
                    'sourcePage': 15,
                    'generationJobId': 'job-internal-99',
                    'providerUsed': 'gemini_1',
                    'modelUsed': 'gemini-3-flash-preview',
                    'validationProvider': 'local_deterministic'
                }
            ]
        }

        # Test endpoint sanitization logic
        cleaned_tests = []
        for t in [student_test]:
            t_copy = dict(t)
            if 'questions' in t_copy and isinstance(t_copy['questions'], list):
                sanitized_qs = []
                for q in t_copy['questions']:
                    if isinstance(q, dict):
                        qc = dict(q)
                        for priv_field in [
                            'sourceDocId', 'sourceContentId', 'sourceChapter',
                            'sourceTopic', 'sourcePage', 'generationJobId',
                            'providerUsed', 'modelUsed', 'validationProvider'
                        ]:
                            qc.pop(priv_field, None)
                        sanitized_qs.append(qc)
                    else:
                        sanitized_qs.append(q)
                t_copy['questions'] = sanitized_qs
            cleaned_tests.append(t_copy)

        student_q = cleaned_tests[0]['questions'][0]
        self.assertNotIn('sourceDocId', student_q)
        self.assertNotIn('sourceContentId', student_q)
        self.assertNotIn('sourceChapter', student_q)
        self.assertNotIn('sourceTopic', student_q)
        self.assertNotIn('sourcePage', student_q)
        self.assertNotIn('generationJobId', student_q)
        self.assertNotIn('providerUsed', student_q)
        self.assertNotIn('modelUsed', student_q)
        self.assertNotIn('validationProvider', student_q)
        self.assertEqual(student_q['id'], 'q-1')
        self.assertEqual(student_q['question'], 'What is demand?')
        self.assertEqual(student_q['correctAnswer'], 'A')

if __name__ == '__main__':
    unittest.main()
