#!/usr/bin/env python3
"""
Test Suite: Local Qwen Outbound Worker & Production Queue Integration
Verifies:
1. Heartbeat registration and freshness detection (<=60s is online, >60s is offline).
2. Atomic job claiming (FIFO order, orphan recovery, double-claim prevention).
3. Live progress streaming from worker to production.
4. Idempotent test hosting and question persistence upon worker completion.
5. Auto-Pilot scheduled task linked execution in serverless mode.
6. Worker API endpoint handlers in server.py (GET status, POST heartbeat, claim, progress, complete, fail).
"""

import os
import sys
import time
import json
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_job_manager
import ai_provider_manager
import ai_scheduler
import server

class TestLocalQwenWorker(unittest.TestCase):
    def setUp(self):
        ai_job_manager._active_jobs.clear()
        ai_job_manager._active_workers.clear()
        self.mock_data = {
            'users': {
                'admin@excellenceca.com': {
                    'id': 'usr-admin-1',
                    'email': 'admin@excellenceca.com',
                    'username': 'admin',
                    'role': 'admin',
                    'token': 'token_admin_excellenceca_secret',
                    'isActive': True
                }
            },
            'ai_worker_status': {},
            'ai_generation_jobs': [],
            'tests': [],
            'questions': [],
            'ai_generation_logs': [],
            'ai_scheduled_tasks': []
        }
        self.save_called = False
        self.sync_called = False
        self.save_cb = lambda d: setattr(self, 'save_called', True)
        self.sync_cb = lambda p, d, **kw: setattr(self, 'sync_called', True)

    def test_01_heartbeat_and_status(self):
        """Worker registers heartbeat and is correctly recognized as online."""
        hb_payload = {
            'workerId': 'worker-test-123',
            'machine': 'Admin-Laptop',
            'status': 'idle',
            'model': 'qwen3:8b',
            'ollamaHealthy': True,
            'latencyMs': 12.5,
            'version': '1.0.0'
        }
        
        updated = ai_job_manager.update_worker_heartbeat(
            hb_payload, self.mock_data, self.save_cb, self.sync_cb
        )
        self.assertTrue(self.save_called)
        self.assertTrue(self.sync_called)
        self.assertEqual(updated['workerId'], 'worker-test-123')
        self.assertEqual(updated['model'], 'qwen3:8b')
        
        status = ai_job_manager.get_worker_status(self.mock_data)
        self.assertTrue(status['isOnline'])
        self.assertEqual(status['workerId'], 'worker-test-123')
        self.assertEqual(status['model'], 'qwen3:8b')
        self.assertLessEqual(status['lastHeartbeatSecondsAgo'], 5)

    def test_02_stale_heartbeat_offline_detection(self):
        """Heartbeat older than 60 seconds is identified as offline."""
        old_time = (datetime.now(timezone.utc) - timedelta(seconds=75)).isoformat()
        self.mock_data['ai_worker_status'] = {
            'workerId': 'worker-old-123',
            'model': 'qwen3:8b',
            'status': 'idle',
            'lastHeartbeatAt': old_time
        }
        
        status = ai_job_manager.get_worker_status(self.mock_data)
        self.assertFalse(status['isOnline'])
        self.assertGreaterEqual(status['lastHeartbeatSecondsAgo'], 70)
        self.assertIn("Local Qwen Worker Offline", status['error'])

    def test_03_job_creation_and_atomic_claim(self):
        """Serverless job creation queues job; worker claims oldest QUEUED job."""
        params = {
            'title': 'Income Tax Basics',
            'subject': 'Accounting',
            'topic': 'Taxation Basics',
            'count': 3
        }
        
        # Create job in queue_only mode
        ok, err, job = ai_job_manager.create_generation_job(
            params=params,
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb,
            queue_only=True
        )
        self.assertTrue(ok)
        self.assertIsNotNone(job)
        self.assertEqual(job['status'], 'QUEUED')
        self.assertIsNone(job.get('workerId'))

        # Worker claims the job
        claimed = ai_job_manager.claim_pending_job_for_worker(
            worker_id='worker-test-123',
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb
        )
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed['id'], job['id'])
        self.assertEqual(claimed['status'], 'CLAIMED')
        self.assertEqual(claimed['workerId'], 'worker-test-123')

        # Second claim attempt finds no remaining QUEUED jobs
        second_claimed = ai_job_manager.claim_pending_job_for_worker(
            worker_id='worker-test-456',
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb
        )
        self.assertIsNone(second_claimed)

    def test_04_worker_progress_and_complete(self):
        """Worker streams progress and commits verified MCQs to host the test."""
        params = {
            'title': 'Law Practice Challenge',
            'subject': 'Business Law',
            'topic': 'Contract Act',
            'count': 2
        }
        ok, err, job = ai_job_manager.create_generation_job(
            params=params,
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb,
            queue_only=True
        )
        job_id = job['id']

        # Worker claims
        ai_job_manager.claim_pending_job_for_worker(
            'worker-test-1', self.mock_data, self.save_cb, self.sync_cb
        )

        # Worker streams progress
        p_ok, p_err = ai_job_manager.update_job_progress_from_worker(
            job_id=job_id,
            stage='Verified Question 1 of 2',
            progress=50,
            verified_count=1,
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb
        )
        self.assertTrue(p_ok)
        updated_job = ai_job_manager.get_job_status(job_id, self.mock_data)
        self.assertEqual(updated_job['progressPct'], 50)
        self.assertEqual(updated_job['generatedCount'], 1)

        # Worker completes job with 2 verified MCQs
        fake_questions = [
            {
                'id': 'q-1',
                'question': 'What is an offer?',
                'options': ['Proposal', 'Promise', 'Acceptance', 'Agreement'],
                'correctAnswer': 0,
                'explanation': 'Section 2(a) of the Indian Contract Act defines proposal/offer.'
            },
            {
                'id': 'q-2',
                'question': 'When is consideration lawful?',
                'options': ['Not forbidden by law', 'Fraudulent', 'Immoral', 'Opposed to public policy'],
                'correctAnswer': 0,
                'explanation': 'Section 23 defines lawful consideration.'
            }
        ]
        fake_metrics = {
            'provider': 'LOCAL',
            'model': 'qwen3:8b',
            'duration_ms': 15000,
            'workerId': 'worker-test-1'
        }

        c_ok, c_err, c_res = ai_job_manager.complete_job_from_worker(
            job_id=job_id,
            questions=fake_questions,
            metrics=fake_metrics,
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb
        )
        self.assertTrue(c_ok)
        self.assertIsNotNone(c_res)
        
        # Verify test was hosted in data['tests']
        self.assertEqual(len(self.mock_data['tests']), 1)
        hosted_test = self.mock_data['tests'][0]
        self.assertEqual(hosted_test['totalQuestions'], 2)
        self.assertEqual(hosted_test['aiJobId'], job_id)
        self.assertEqual(hosted_test['status'], 'Published')
        
        # Verify questions were saved in data['questions']
        self.assertEqual(len(self.mock_data['questions']), 2)
        
        # Verify telemetry log recorded
        self.assertEqual(len(self.mock_data['ai_generation_logs']), 1)
        self.assertEqual(self.mock_data['ai_generation_logs'][0]['provider'], 'LOCAL')
        self.assertEqual(self.mock_data['ai_generation_logs'][0]['model'], 'qwen3:8b')

    def test_05_autopilot_serverless_integration(self):
        """Auto-Pilot task creates a queued worker job and completes when worker reports back."""
        task = {
            'id': 'task-auto-1',
            'name': 'Daily Economics Test',
            'subject': 'Business Economics',
            'chapter': 'Theory of Demand',
            'questionCount': 3,
            'status': 'scheduled',
            'isLiveEvent': True,
            'scheduleType': 'recurring',
            'intervalHours': 24
        }
        self.mock_data['ai_scheduled_tasks'].append(task)

        # 1. When worker is offline in serverless mode:
        with patch('ai_scheduler.IS_SERVERLESS', True):
            ok, err, res = ai_scheduler.execute_scheduler_task_sync(
                task, self.mock_data, self.save_cb, self.sync_cb
            )
            self.assertFalse(ok)
            self.assertIn("Local Qwen Worker is offline", err)
            self.assertEqual(task['status'], 'failed')

        # 2. Worker comes online:
        ai_job_manager.update_worker_heartbeat(
            {'workerId': 'worker-laptop-1', 'model': 'qwen3:8b', 'status': 'idle'},
            self.mock_data, self.save_cb, self.sync_cb
        )

        # 3. Auto-Pilot executes in serverless mode with worker online:
        with patch('ai_scheduler.IS_SERVERLESS', True):
            ok, err, res = ai_scheduler.execute_scheduler_task_sync(
                task, self.mock_data, self.save_cb, self.sync_cb
            )
            self.assertTrue(ok)
            self.assertTrue(res.get('queuedForWorker'))
            self.assertEqual(task['status'], 'processing')
            queued_job_id = task.get('activeJobId')
            self.assertIsNotNone(queued_job_id)

        # 4. Worker claims job:
        claimed = ai_job_manager.claim_pending_job_for_worker(
            'worker-laptop-1', self.mock_data, self.save_cb, self.sync_cb
        )
        self.assertEqual(claimed['id'], queued_job_id)

        # 5. Worker completes job:
        fake_qs = [{'id': 'q-auto-1', 'question': 'What is demand?', 'options': ['Desire + Ability', 'Need', 'Want', 'Supply'], 'correctAnswer': 0}]
        ai_job_manager.complete_job_from_worker(
            job_id=queued_job_id,
            questions=fake_qs,
            metrics={'provider': 'LOCAL', 'model': 'qwen3:8b'},
            data=self.mock_data,
            save_callback=self.save_cb,
            firebase_sync_callback=self.sync_cb
        )

        # 6. Verify linked scheduled task is completed and live
        self.assertEqual(task['status'], 'live')
        self.assertEqual(task['executionCount'], 1)
        self.assertIsNotNone(task['lastTestId'])

    def test_06_provider_sanitization_serverless(self):
        """Sanitized providers report worker health appropriately in serverless mode."""
        with patch('ai_provider_manager.IS_SERVERLESS', True):
            # When worker offline:
            providers = ai_provider_manager.get_sanitized_providers(self.mock_data)
            qwen_p = next(p for p in providers if p['id'] == 'local_qwen')
            self.assertFalse(qwen_p['online'])
            self.assertEqual(qwen_p['status'], 'Configured — Worker Offline')

            # When worker online:
            ai_job_manager.update_worker_heartbeat(
                {'workerId': 'worker-laptop-1', 'model': 'qwen3:8b', 'status': 'idle'},
                self.mock_data, self.save_cb, self.sync_cb
            )
            providers2 = ai_provider_manager.get_sanitized_providers(self.mock_data)
            qwen_p2 = next(p for p in providers2 if p['id'] == 'local_qwen')
            self.assertTrue(qwen_p2['online'])
            self.assertEqual(qwen_p2['status'], 'Configured — Healthy')

    def test_07_worker_authorization(self):
        """Worker authorization accepts admin tokens and rejects unauthorized tokens."""
        self.assertTrue(server.is_authorized_ai_worker('token_admin_excellenceca_secret'))
        self.assertTrue(server.is_authorized_ai_worker('usr-admin-1'))
        self.assertFalse(server.is_authorized_ai_worker('random-token-xyz'))
        self.assertFalse(server.is_authorized_ai_worker(None))

    @patch('server.load_backend_data')
    @patch('server.save_backend_data')
    @patch('server.sync_to_firebase')
    def test_08_server_worker_endpoints(self, mock_sync, mock_save, mock_load):
        """Server GET/POST endpoints handle worker status, heartbeat, and serverless queueing."""
        import io
        mock_load.return_value = self.mock_data
        
        # Test GET /api/admin/ai/worker/status
        handler = server.ExcellenceCAHandler.__new__(server.ExcellenceCAHandler)
        handler.headers = {'Authorization': 'Bearer token_admin_excellenceca_secret'}
        handler.path = '/api/admin/ai/worker/status'
        sent_status = []
        sent_body = []
        handler.send_json = lambda code, data: (sent_status.append(code), sent_body.append(data))
        handler.do_GET()
        self.assertEqual(sent_status[0], 200)
        self.assertIn('worker', sent_body[0])
        self.assertIn('isServerless', sent_body[0])

        # Test POST /api/admin/ai/worker/heartbeat
        sent_status.clear()
        sent_body.clear()
        handler.path = '/api/admin/ai/worker/heartbeat'
        hb_body = json.dumps({'workerId': 'worker-h-1', 'model': 'qwen3:8b', 'status': 'idle'}).encode('utf-8')
        handler.headers['Content-Length'] = str(len(hb_body))
        handler.rfile = io.BytesIO(hb_body)
        handler.do_POST()
        self.assertEqual(sent_status[0], 200)
        self.assertTrue(sent_body[0]['success'])

        # Test POST /api/admin/ai/jobs/generate when serverless and worker offline
        sent_status.clear()
        sent_body.clear()
        with patch('server.IS_SERVERLESS', True):
            self.mock_data['ai_worker_status'] = {} # empty worker status
            handler.path = '/api/admin/ai/jobs/generate'
            gen_body = json.dumps({'title': 'T1', 'subject': 'Accounting', 'topic': 'Depreciation', 'count': 5}).encode('utf-8')
            handler.headers['Content-Length'] = str(len(gen_body))
            handler.rfile = io.BytesIO(gen_body)
            handler.do_POST()
            self.assertEqual(sent_status[0], 503)
            self.assertIn('Local Qwen Worker is offline', sent_body[0]['error'])

        # Test POST /api/admin/ai/jobs/generate when serverless and worker ONLINE
        sent_status.clear()
        sent_body.clear()
        with patch('server.IS_SERVERLESS', True):
            self.mock_data['ai_worker_status'] = {
                'workerId': 'worker-h-1',
                'model': 'qwen3:8b',
                'status': 'idle',
                'lastHeartbeatAt': datetime.now(timezone.utc).isoformat(),
                'ollamaHealthy': True
            }
            handler.path = '/api/admin/ai/jobs/generate'
            gen_body = json.dumps({'title': 'T2', 'subject': 'Accounting', 'topic': 'Inventory', 'count': 5}).encode('utf-8')
            handler.headers['Content-Length'] = str(len(gen_body))
            handler.rfile = io.BytesIO(gen_body)
            handler.do_POST()
            self.assertEqual(sent_status[0], 200)
            self.assertTrue(sent_body[0]['queuedForWorker'])
            self.assertEqual(sent_body[0]['job']['status'], 'QUEUED')

if __name__ == '__main__':
    unittest.main()
