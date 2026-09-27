"""
local_qwen_worker.LocalQwenWorker.process_job with HTTP and Ollama mocked:
progress after every batch, questions saved incrementally, resume, lease loss, Ollama offline.
"""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import local_qwen_worker
from tests.test_qwen_canonical_pipeline import FakeQwen

JOB = {
    'id': 'job-w1', 'title': 'Worker Test', 'subject': 'Business Economics', 'chapter': 'Theory of Demand and Supply',
    'chapterId': 'ch-fnd-eco-2', 'topic': 'Theory of Demand and Supply', 'examLevel': 'CA Foundation',
    'difficulty': 'ICAI Exam Standard', 'questionCategory': 'Direct Questions', 'questionSpeed': 'Quick',
    'count': 6, 'marksPerCorrect': 2.0, 'negativeMarksPerWrong': 0.5, 'platformXp': 10.0, 'generatedQuestions': [],
}


class RecordingWorker(local_qwen_worker.LocalQwenWorker):
    def __init__(self, progress_status=200):
        super().__init__(server_url='http://test', token='secret', worker_id='w-test')
        self.requests = []
        self.progress_status = progress_status
        self.ollama_healthy = True

    def _make_request(self, endpoint, payload=None, timeout=15.0):
        self.requests.append((endpoint, payload))
        if endpoint.endswith('/progress') and self.progress_status != 200:
            return False, None, f'HTTP {self.progress_status}', self.progress_status
        return True, {'success': True}, None, 200

    def sent(self, suffix):
        return [p for e, p in self.requests if e.endswith(suffix)]


class TestWorkerProcessJob(unittest.TestCase):
    def run_job(self, worker, job, fake=None):
        with patch('local_qwen_service.generate_mcqs', side_effect=fake or FakeQwen()):
            worker.process_job(dict(job))

    def test_progress_after_every_batch_and_complete(self):
        w = RecordingWorker()
        self.run_job(w, JOB)
        batch_reports = [p for p in w.sent('/progress') if p['stage'] == 'batch_complete']
        self.assertEqual([p['verifiedCount'] for p in batch_reports], [2, 4, 6])
        self.assertEqual([len(p['newQuestions']) for p in batch_reports], [2, 2, 2], "each batch's questions are saved once")
        pcts = [p['progressPct'] for p in w.sent('/progress') if p['progressPct'] is not None]
        self.assertEqual(pcts, sorted(pcts), "progress never jumps backwards or ahead")
        self.assertTrue(all(p['workerId'] == 'w-test' for p in w.sent('/progress')))
        complete = w.sent('/complete')
        self.assertEqual(len(complete), 1)
        self.assertEqual(len(complete[0]['questions']), 6)
        self.assertEqual(complete[0]['questions'][0]['negativeMarks'], 0.5)
        self.assertEqual(w.sent('/fail'), [])
        self.assertIsNone(w.current_job_id)

    def test_worker_uses_target_fill_and_hosts_exactly_the_requested_count(self):
        """Local Qwen worker path: rejected duplicates are replaced, chapter/bank checks still apply."""
        bank = "Which statement best explains the role of the ICAI Council in approving accounting standards?"
        fake = FakeQwen(plan={0: ['bank', 'ok'], 4: ['dup', 'dup'], 5: ['ok', 'invalid']}, bank_text=bank)
        w = RecordingWorker()
        self.run_job(w, dict(JOB, count=10, existingQuestions=[{'text': bank}]), fake)
        complete = w.sent('/complete')
        self.assertEqual(len(complete), 1)
        final = complete[0]['questions']
        self.assertEqual(len(final), 10)
        self.assertEqual(len({q['text'] for q in final}), 10)
        self.assertNotIn(bank, [q['text'] for q in final], "question-bank duplicate never hosted")
        self.assertTrue(all(q['chapterId'] == 'ch-fnd-eco-2' for q in final), "canonical chapter metadata kept")
        self.assertEqual(complete[0]['metrics']['finalStatus'], 'COMPLETED')
        self.assertEqual(complete[0]['metrics']['rejectedDuplicates'], 3)
        self.assertEqual(complete[0]['metrics']['rejectedValidation'], 1)
        sent_questions = [q for p in w.sent('/progress') for q in p['newQuestions']]
        self.assertEqual(len(sent_questions), 10, "only accepted questions are ever sent to the server")
        texts = [p['status'] for p in w.sent('/progress')]
        self.assertTrue(any('replacement question' in (t or '') for t in texts), texts)
        pcts = [p['progressPct'] for p in w.sent('/progress') if p['stage'] != 'publishing']
        self.assertTrue(all(pct < 100 for pct in pcts))
        self.assertTrue(all(s['status'] != 'failed' for p in w.sent('/progress') for s in (p['questionStatuses'] or [])))
        self.assertEqual(w.sent('/fail'), [])

    def test_resume_generates_only_missing_questions(self):
        saved = [{'id': f'q-old-{i}', 'text': f'Earlier question number {i} about elasticity?', 'number': i} for i in (1, 2)]
        fake = FakeQwen()
        w = RecordingWorker()
        self.run_job(w, dict(JOB, generatedQuestions=saved), fake)
        self.assertEqual(sum(c[0] for c in fake.calls), 4)
        self.assertEqual([p['verifiedCount'] for p in w.sent('/progress') if p['stage'] == 'batch_complete'], [4, 6])
        final = w.sent('/complete')[0]['questions']
        self.assertEqual(len(final), 6)
        self.assertEqual([q['number'] for q in final[2:]], [3, 4, 5, 6])

    def test_lease_lost_stops_before_next_batch_and_never_publishes(self):
        fake = FakeQwen()
        w = RecordingWorker(progress_status=409)
        self.run_job(w, JOB, fake)
        self.assertEqual(len(fake.calls), 1, "no further Qwen batches after the server rejects the lease")
        self.assertEqual(w.sent('/complete'), [])
        self.assertEqual(w.sent('/fail'), [])

    def test_ollama_offline_fails_job_with_clear_error(self):
        w = RecordingWorker()
        w.ollama_healthy = False
        with patch('local_qwen_service.check_ollama_health', return_value=(False, {'latencyMs': None})):
            self.run_job(w, JOB)
        fails = w.sent('/fail')
        self.assertEqual(len(fails), 1)
        self.assertIn('Ollama is not reachable', fails[0]['error'])

    def test_worker_refuses_to_start_without_secret(self):
        w = local_qwen_worker.LocalQwenWorker(server_url='http://test', token='')
        with self.assertRaises(SystemExit):
            w.start()

    def test_heartbeat_lease_invalid_sets_lease_lost(self):
        w = RecordingWorker()
        w.current_job_id = 'job-w1'
        w._make_request = lambda *a, **k: (True, {'success': True, 'jobLeaseValid': False}, None, 200)
        with patch('local_qwen_service.check_ollama_health', return_value=(True, {'latencyMs': 5.0, 'modelAvailable': True})):
            w.send_heartbeat()
        self.assertTrue(w.lease_lost.is_set())


if __name__ == '__main__':
    unittest.main()
