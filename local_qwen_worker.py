#!/usr/bin/env python3
"""
=============================================================================
ExcellenceCA — Outbound Local Qwen Worker (Administrator Machine)
=============================================================================
Connects the administrator's local Ollama instance (qwen3:8b) to ExcellenceCA
Production (e.g., https://excellenceca.vercel.app or http://localhost:8000).

Architecture:
- Strictly OUTBOUND over authenticated HTTPS / HTTP.
- Never opens public ports or exposes Ollama to the public internet.
- Automatically claims pending MCQ generation jobs, executes local inference
  with deterministic validation, streams progress, and commits completed tests.

Usage:
    python local_qwen_worker.py --server https://excellenceca.vercel.app
    python local_qwen_worker.py --server http://localhost:8000
=============================================================================
"""

import os
import sys
import time
import json
import uuid
import socket
import signal
import argparse
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple

# Import local AI engine and Ollama service modules
import local_qwen_service
import ai_mcq_engine
import syllabus_hierarchy

DEFAULT_SERVER = os.environ.get('EXCELLENCECA_SERVER_URL', 'https://excellenceca.vercel.app')
DEFAULT_TOKEN = os.environ.get('AI_WORKER_SECRET') or os.environ.get('ADMIN_SECRET_TOKEN') or 'token_admin_excellenceca_secret'
DEFAULT_MODEL = os.environ.get('LOCAL_QWEN_MODEL', 'qwen3:8b')
DEFAULT_POLL_INTERVAL = 2.5
DEFAULT_HEARTBEAT_INTERVAL = 15.0

class LocalQwenWorker:
    def __init__(
        self,
        server_url: str = DEFAULT_SERVER,
        token: str = DEFAULT_TOKEN,
        model: str = DEFAULT_MODEL,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
        worker_id: Optional[str] = None
    ):
        self.server_url = server_url.rstrip('/')
        self.token = token
        self.model = model
        self.poll_interval = poll_interval
        self.heartbeat_interval = heartbeat_interval
        self.worker_id = worker_id or f"qwen-worker-{socket.gethostname()[:8]}-{uuid.uuid4().hex[:6]}"
        self.hostname = socket.gethostname()
        
        self.running = False
        self.current_status = "idle"
        self.current_job_id = None
        self._last_heartbeat_time = 0.0
        self._heartbeat_thread = None

    def _make_request(self, endpoint: str, payload: Optional[Dict[str, Any]] = None, timeout: float = 10.0) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """Perform an authenticated HTTP request to the ExcellenceCA backend."""
        url = f"{self.server_url}{endpoint}"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.token}',
            'X-Worker-Token': self.token,
            'User-Agent': f'ExcellenceCA-LocalQwenWorker/{self.worker_id}'
        }
        
        data_bytes = json.dumps(payload).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST' if payload is not None else 'GET')
        
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                resp_body = resp.read().decode('utf-8')
                result = json.loads(resp_body) if resp_body else {}
                return True, result, None
        except urllib.error.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode('utf-8')
            except Exception:
                pass
            return False, None, f"HTTP {e.code}: {e.reason} ({err_body})"
        except Exception as e:
            return False, None, str(e)

    def check_local_ollama(self) -> Tuple[bool, str]:
        """Verify that Ollama is active on 127.0.0.1:11434 with the required model."""
        is_healthy, info = local_qwen_service.check_ollama_health(timeout=3.0)
        if not is_healthy:
            return False, (
                f"Ollama is not reachable at {local_qwen_service.OLLAMA_BASE_URL}.\n"
                "Please verify Ollama is running (`ollama serve`)."
            )
        
        models = info.get('models', [])
        req_clean = self.model.lower().split(':')[0]
        model_found = any(req_clean in m.lower() for m in models)
        if not model_found and models:
            return False, (
                f"Required model '{self.model}' not found in Ollama.\n"
                f"Available models: {models}\n"
                f"Please run: `ollama run {self.model}`"
            )
        return True, "Ollama and Qwen3 are ready."

    def send_heartbeat(self) -> bool:
        """Send outbound heartbeat to the server."""
        t0 = time.time()
        is_healthy, _ = local_qwen_service.check_ollama_health(timeout=2.0)
        latency = round((time.time() - t0) * 1000, 1)
        
        payload = {
            'workerId': self.worker_id,
            'machine': self.hostname,
            'status': self.current_status,
            'currentJobId': self.current_job_id,
            'model': self.model,
            'ollamaHealthy': is_healthy,
            'latencyMs': latency,
            'version': '1.0.0'
        }
        
        ok, res, err = self._make_request('/api/admin/ai/worker/heartbeat', payload, timeout=5.0)
        if ok:
            self._last_heartbeat_time = time.time()
            return True
        else:
            print(f"[WORKER_HEARTBEAT_WARN] Heartbeat failed: {err}", flush=True)
            return False

    def _heartbeat_loop(self):
        """Background thread to maintain continuous heartbeat with production."""
        while self.running:
            try:
                self.send_heartbeat()
            except Exception as e:
                print(f"[WORKER_HEARTBEAT_ERR] {e}", flush=True)
            
            # Sleep in 1-second chunks for responsive cancellation
            slept = 0.0
            while self.running and slept < self.heartbeat_interval:
                time.sleep(1.0)
                slept += 1.0

    def claim_job(self) -> Optional[Dict[str, Any]]:
        """Poll the server to claim any pending QUEUED job."""
        ok, res, err = self._make_request('/api/admin/ai/worker/claim', {'workerId': self.worker_id}, timeout=8.0)
        if ok and res and res.get('job'):
            return res['job']
        return None

    def report_progress(self, job_id: str, stage: str, progress: int, verified_count: int = 0):
        """Stream progress update to production."""
        payload = {
            'jobId': job_id,
            'stage': stage,
            'progress': progress,
            'verifiedCount': verified_count
        }
        self._make_request('/api/admin/ai/worker/progress', payload, timeout=5.0)

    def complete_job(self, job_id: str, questions: list, metrics: dict) -> bool:
        """Commit generated questions and completion metrics to production."""
        payload = {
            'jobId': job_id,
            'questions': questions,
            'metrics': metrics
        }
        ok, res, err = self._make_request('/api/admin/ai/worker/complete', payload, timeout=60.0)
        if not ok:
            print(f"[WORKER_COMPLETE_ERR] Failed to post job completion: {err}", flush=True)
            return False
        return True

    def fail_job(self, job_id: str, error_msg: str):
        """Notify production of a fatal job error."""
        payload = {
            'jobId': job_id,
            'error': error_msg
        }
        self._make_request('/api/admin/ai/worker/fail', payload, timeout=10.0)

    def process_job(self, job: Dict[str, Any]):
        """Execute MCQ generation and local validation for a claimed job."""
        job_id = job.get('id')
        self.current_job_id = job_id
        self.current_status = "busy"
        
        title = job.get('title', 'AI Practice Test')
        subject = job.get('subject', 'Accounting')
        topic = job.get('topic') or job.get('chapter') or 'General'
        count = int(job.get('count', 5))
        exam_level = job.get('examLevel', 'CA Foundation')
        difficulty = job.get('difficulty', 'ICAI Exam Standard')
        question_category = job.get('questionCategory', 'Direct Questions')
        question_speed = job.get('questionSpeed', 'Quick')
        test_id = job.get('testId') or f"tst-ai-{int(time.time() * 1000)}"
        marks_per_correct = float(job.get('marksPerCorrect', 2.0))
        negative_marks = float(job.get('negativeMarksPerWrong', 0.5))
        platform_xp = float(job.get('platformXp', 10.0))

        print(f"\n=======================================================", flush=True)
        print(f"[WORKER_JOB_CLAIMED] Job ID: {job_id}", flush=True)
        print(f"Title: {title}", flush=True)
        print(f"Subject: {subject} | Topic: {topic} | Count: {count}", flush=True)
        print(f"Level: {exam_level} | Difficulty: {difficulty}", flush=True)
        print(f"=======================================================", flush=True)

        self.report_progress(job_id, "Worker Claimed Job: Initializing Local Qwen Pipeline...", 10, 0)

        # Progress bridge to send stage updates to production
        def _on_progress(p_info):
            stage = p_info.get('status') or 'Generating questions with Local Qwen3...'
            progress = p_info.get('progressPct', 25)
            verified = p_info.get('verifiedCount', 0)
            print(f"  -> [{progress}%] {stage} (Verified: {verified}/{count})", flush=True)
            self.report_progress(job_id, stage, progress, verified)

        chapter_metadata = syllabus_hierarchy.get_authoritative_chapter_metadata(
            chapter_id=job.get('chapterId', ''),
            chapter_name=topic,
            exam_level=exam_level
        )

        t_start = time.time()
        try:
            questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                subject=subject,
                topic=topic,
                count=count,
                exam_level=exam_level,
                difficulty=difficulty,
                question_category=question_category,
                question_speed=question_speed,
                test_id=test_id,
                source_documents=[],
                existing_questions=[],
                job_id=job_id,
                marks_per_correct=marks_per_correct,
                negative_marks=negative_marks,
                negative_marks_per_wrong=negative_marks,
                platform_xp=platform_xp,
                chapter_metadata=chapter_metadata,
                progress_callback=_on_progress
            )

            dur = round(time.time() - t_start, 2)
            print(f"[WORKER_GENERATION_SUCCESS] Generated & verified {len(questions)}/{count} MCQs in {dur}s.", flush=True)

            if len(questions) == 0:
                err_msg = "Local Qwen3 completed inference but produced 0 valid MCQs passing deterministic checks."
                print(f"[WORKER_JOB_FAILED] {err_msg}", flush=True)
                self.fail_job(job_id, err_msg)
                return

            # Enrich metrics with worker info
            metrics['workerId'] = self.worker_id
            metrics['machine'] = self.hostname
            metrics['model'] = self.model
            metrics['workerDurationSeconds'] = dur

            # Submit completed job to production
            self.report_progress(job_id, f"Hosting Test with {len(questions)} Verified MCQs...", 95, len(questions))
            ok = self.complete_job(job_id, questions, metrics)
            if ok:
                print(f"[WORKER_JOB_FINISHED] Job {job_id} successfully hosted and committed to production!\n", flush=True)
            else:
                print(f"[WORKER_JOB_WARN] Completed locally, but remote commit failed for job {job_id}.", flush=True)

        except Exception as e:
            err_str = f"Local generation error: {str(e)}"
            print(f"[WORKER_JOB_ERROR] {err_str}", flush=True)
            self.fail_job(job_id, err_str)
        finally:
            self.current_job_id = None
            self.current_status = "idle"

    def start(self):
        """Main loop: starts heartbeat thread and polls for jobs."""
        print("=" * 65, flush=True)
        print(" ExcellenceCA Outbound Local Qwen Worker", flush=True)
        print("=" * 65, flush=True)
        print(f"Worker ID:   {self.worker_id}", flush=True)
        print(f"Target Server: {self.server_url}", flush=True)
        print(f"Target Model:  {self.model}", flush=True)
        print(f"Poll Interval: {self.poll_interval}s", flush=True)
        print(f"Heartbeat:     {self.heartbeat_interval}s", flush=True)
        import inspect
        pipeline_sig = inspect.signature(ai_mcq_engine.generate_exact_mcqs_pipeline)
        print(f"Pipeline Signature: generate_exact_mcqs_pipeline{pipeline_sig}", flush=True)
        print("-" * 65, flush=True)

        # 1. Verify local Ollama setup
        ollama_ok, ollama_msg = self.check_local_ollama()
        if not ollama_ok:
            print(f"[WARNING] {ollama_msg}", flush=True)
            print("Retrying connection to Ollama...", flush=True)
            while not ollama_ok:
                time.sleep(3.0)
                ollama_ok, ollama_msg = self.check_local_ollama()
        print(f"[OK] {ollama_msg}", flush=True)

        # 2. Test initial handshake with production server
        print(f"Connecting to ExcellenceCA production server at {self.server_url}...", flush=True)
        initial_hb = self.send_heartbeat()
        if not initial_hb:
            print(f"[WARNING] Could not establish immediate contact with {self.server_url}.")
            print("Will keep trying in the background...\n", flush=True)
        else:
            print(f"[OK] Connected to ExcellenceCA server. Worker registered as ONLINE.\n", flush=True)

        self.running = True

        # 3. Start background heartbeat thread
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

        # 4. Main polling loop
        print(f"[WORKER_READY] Listening for MCQ generation jobs from production...", flush=True)
        try:
            while self.running:
                try:
                    job = self.claim_job()
                    if job:
                        self.process_job(job)
                except Exception as e:
                    print(f"[WORKER_POLL_ERR] {e}", flush=True)
                
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            print("\n[WORKER_SHUTDOWN] Stopping Local Qwen Worker gracefully...", flush=True)
        finally:
            self.stop()

    def stop(self):
        """Stop worker and report shutdown."""
        self.running = False
        print("[WORKER_EXIT] Worker stopped. Goodbye.", flush=True)

def parse_args():
    parser = argparse.ArgumentParser(description="ExcellenceCA Outbound Local Qwen Worker")
    parser.add_argument('--server', default=DEFAULT_SERVER, help=f"Backend URL (default: {DEFAULT_SERVER})")
    parser.add_argument('--token', default=DEFAULT_TOKEN, help="Admin or worker secret token")
    parser.add_argument('--model', default=DEFAULT_MODEL, help=f"Ollama model name (default: {DEFAULT_MODEL})")
    parser.add_argument('--poll-interval', type=float, default=DEFAULT_POLL_INTERVAL, help="Poll interval in seconds")
    parser.add_argument('--heartbeat-interval', type=float, default=DEFAULT_HEARTBEAT_INTERVAL, help="Heartbeat interval in seconds")
    parser.add_argument('--worker-id', default=None, help="Custom identifier for this worker instance")
    return parser.parse_args()

if __name__ == '__main__':
    args = parse_args()
    worker = LocalQwenWorker(
        server_url=args.server,
        token=args.token,
        model=args.model,
        poll_interval=args.poll_interval,
        heartbeat_interval=args.heartbeat_interval,
        worker_id=args.worker_id
    )
    
    # Graceful exit on signal
    def _sig_handler(sig, frame):
        worker.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, _sig_handler)
    try:
        signal.signal(signal.SIGTERM, _sig_handler)
    except Exception:
        pass

    worker.start()
