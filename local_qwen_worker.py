#!/usr/bin/env python3
"""
=============================================================================
ExcellenceCA — Outbound Local Qwen Worker (Administrator Machine)
=============================================================================
Connects the administrator's local Ollama instance (qwen3:8b) to the ExcellenceCA
server (production https://excellenceca.vercel.app or local http://localhost:8000).

Architecture:
- Strictly OUTBOUND over authenticated HTTPS / HTTP; Ollama is never exposed.
- Authenticates with the dedicated AI_WORKER_SECRET (never the admin login token).
- Claims QUEUED generation jobs (Generate & Host Now and Auto-Pilot) and runs them
  through the single canonical pipeline: ai_mcq_engine.generate_exact_mcqs_pipeline
  -> local_qwen_service -> Ollama qwen3:8b, in small batches.
- After every batch, verified questions + progress are saved to the server.
- A background heartbeat (every 15s) keeps the worker online AND renews the job
  lease while a long Qwen batch is running; if the server reports the lease lost
  (job cancelled / expired / re-assigned) the job is abandoned before the next batch.
- While idle, the worker drives Auto-Pilot by calling the authenticated scheduler tick.

Usage:
    set AI_WORKER_SECRET=<secret configured on the server>
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
from typing import Dict, Any, List, Optional, Tuple

import local_qwen_service
import ai_mcq_engine

DEFAULT_SERVER = os.environ.get('EXCELLENCECA_SERVER_URL', 'https://excellenceca.vercel.app')
DEFAULT_MODEL = local_qwen_service.OLLAMA_MODEL
DEFAULT_POLL_INTERVAL = 2.5
DEFAULT_HEARTBEAT_INTERVAL = 15.0
DEFAULT_TICK_INTERVAL = 60.0
WORKER_VERSION = '2.0.0'


class LocalQwenWorker:
    def __init__(
        self,
        server_url: str = DEFAULT_SERVER,
        token: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
        tick_interval: float = DEFAULT_TICK_INTERVAL,
        worker_id: Optional[str] = None
    ):
        self.server_url = server_url.rstrip('/')
        self.token = token if token is not None else os.environ.get('AI_WORKER_SECRET', '')
        self.model = model
        local_qwen_service.OLLAMA_MODEL = model
        self.poll_interval = poll_interval
        self.heartbeat_interval = heartbeat_interval
        self.tick_interval = tick_interval
        self.worker_id = worker_id or f"qwen-worker-{socket.gethostname()[:8]}-{uuid.uuid4().hex[:6]}"
        self.hostname = socket.gethostname()

        self.running = False
        self.current_status = "idle"
        self.current_job_id: Optional[str] = None
        self.lease_lost = threading.Event()
        self.ollama_healthy = False
        self._last_tick_time = 0.0
        self._heartbeat_thread: Optional[threading.Thread] = None

    # ------------------------------------------------------------------ HTTP
    def _make_request(self, endpoint: str, payload: Optional[Dict[str, Any]] = None,
                      timeout: float = 15.0) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str], int]:
        """Authenticated request to the ExcellenceCA server. Returns (ok, json, error, http_status)."""
        url = f"{self.server_url}{endpoint}"
        headers = {
            'Content-Type': 'application/json',
            'X-Worker-Token': self.token,
            'User-Agent': f'ExcellenceCA-LocalQwenWorker/{WORKER_VERSION}'
        }
        data_bytes = json.dumps(payload).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST' if payload is not None else 'GET')
        started = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode('utf-8')
                return True, (json.loads(body) if body else {}), None, resp.status
        except urllib.error.HTTPError as e:
            try:
                err_body = e.read().decode('utf-8')[:300]
            except Exception:
                err_body = ''
            return False, None, f"HTTP {e.code}: {e.reason} {err_body} ({endpoint}, {int((time.time() - started) * 1000)} ms)".strip(), e.code
        except Exception as e:
            # e.g. "The read operation timed out (/api/admin/ai/worker/claim, 15003 ms, timeout 15s)"
            return False, None, f"{e} ({endpoint}, {int((time.time() - started) * 1000)} ms, timeout {timeout:g}s)", 0

    # ------------------------------------------------------------- heartbeat
    def check_local_ollama(self) -> Tuple[bool, str, Optional[float]]:
        """Verify Ollama is reachable and the model is pulled. Returns (ok, message, latency_ms)."""
        is_online, info = local_qwen_service.check_ollama_health(timeout=3.0)
        latency = info.get('latencyMs') if is_online else None  # a failed probe has no meaningful latency
        if not is_online:
            return False, f"Ollama is not reachable at {local_qwen_service.OLLAMA_BASE_URL} (run `ollama serve`).", latency
        if not info.get('modelAvailable'):
            return False, f"Model '{self.model}' is not pulled in Ollama (run `ollama pull {self.model}`). Available: {info.get('availableModels')}", latency
        return True, f"Ollama is ready with {self.model}.", latency

    def send_heartbeat(self) -> bool:
        ok_ollama, _, latency = self.check_local_ollama()
        self.ollama_healthy = ok_ollama
        payload = {
            'workerId': self.worker_id,
            'machine': self.hostname,
            'status': self.current_status,
            'currentJobId': self.current_job_id,
            'model': self.model,
            'ollamaHealthy': ok_ollama,
            'latencyMs': latency,
            'version': WORKER_VERSION
        }
        ok, res, err, _ = self._make_request('/api/admin/ai/worker/heartbeat', payload, timeout=10.0)
        if not ok:
            print(f"[WORKER_HEARTBEAT_WARN] Heartbeat failed: {err}", flush=True)
            return False
        if self.current_job_id and res and res.get('jobLeaseValid') is False:
            print(f"[WORKER_LEASE_LOST] Server reports job {self.current_job_id} is no longer ours; abandoning it.", flush=True)
            self.lease_lost.set()
        return True

    def _heartbeat_loop(self):
        while self.running:
            try:
                self.send_heartbeat()
            except Exception as e:
                print(f"[WORKER_HEARTBEAT_ERR] {e}", flush=True)
            slept = 0.0
            while self.running and slept < self.heartbeat_interval:
                time.sleep(0.5)
                slept += 0.5

    # ------------------------------------------------------------ auto-pilot
    def maybe_tick_scheduler(self):
        """Drive Auto-Pilot: due scheduled tasks are turned into QUEUED jobs by the server."""
        if time.time() - self._last_tick_time < self.tick_interval:
            return
        self._last_tick_time = time.time()
        ok, res, err, _ = self._make_request('/api/admin/ai/scheduler/tick', {'workerId': self.worker_id}, timeout=30.0)
        if not ok:
            print(f"[WORKER_TICK_WARN] Scheduler tick failed: {err}", flush=True)
        elif res and res.get('executedCount'):
            print(f"[WORKER_TICK] Auto-Pilot processed {res['executedCount']} task event(s).", flush=True)

    # ------------------------------------------------------------------ jobs
    def claim_job(self) -> Optional[Dict[str, Any]]:
        ok, res, err, _ = self._make_request('/api/admin/ai/worker/claim', {'workerId': self.worker_id}, timeout=15.0)
        if not ok:
            print(f"[WORKER_CLAIM_WARN] {err}", flush=True)
            return None
        return (res or {}).get('job')

    def report_progress(self, job_id: str, progress: Dict[str, Any], new_questions: List[Dict[str, Any]]) -> bool:
        payload = {
            'jobId': job_id,
            'workerId': self.worker_id,
            'stage': progress.get('stage'),
            'status': progress.get('status'),
            'progressPct': progress.get('progressPct'),
            'verifiedCount': progress.get('verifiedCount'),
            'questionStatuses': progress.get('questionStatuses'),
            'newQuestions': new_questions
        }
        ok, _, err, code = self._make_request('/api/admin/ai/worker/progress', payload, timeout=30.0)
        if code == 409 or code == 404:
            print(f"[WORKER_LEASE_LOST] Progress rejected for {job_id}: {err}", flush=True)
            self.lease_lost.set()
        elif not ok:
            print(f"[WORKER_PROGRESS_WARN] {err}", flush=True)
        return ok

    def complete_job(self, job_id: str, questions: List[Dict[str, Any]], metrics: Dict[str, Any]) -> bool:
        payload = {'jobId': job_id, 'workerId': self.worker_id, 'questions': questions, 'metrics': metrics}
        for attempt in range(1, 4):
            ok, _, err, code = self._make_request('/api/admin/ai/worker/complete', payload, timeout=60.0)
            if ok:
                return True
            print(f"[WORKER_COMPLETE_ERR] attempt {attempt}: {err}", flush=True)
            if code in (404, 409):
                return False
            time.sleep(2 * attempt)
        return False

    def fail_job(self, job_id: str, error_msg: str):
        payload = {'jobId': job_id, 'workerId': self.worker_id, 'error': error_msg[:500]}
        ok, _, err, _ = self._make_request('/api/admin/ai/worker/fail', payload, timeout=20.0)
        if not ok:
            print(f"[WORKER_FAIL_REPORT_ERR] {err}", flush=True)

    def process_job(self, job: Dict[str, Any]):
        """Run one claimed job through the canonical pipeline, saving progress after every batch."""
        job_id = job['id']
        count = int(job.get('count', 5))
        saved: List[Dict[str, Any]] = [q for q in (job.get('generatedQuestions') or []) if isinstance(q, dict)]
        resumed_count = len(saved)  # verified by a previous worker before this claim
        remaining = max(0, count - resumed_count)

        self.current_job_id = job_id
        self.current_status = "busy"
        self.lease_lost.clear()
        print(f"\n[WORKER_JOB_CLAIMED] {job_id} '{job.get('title')}' | {job.get('subject')} / {job.get('chapter')} "
              f"| {count} MCQs | {len(saved)} already saved", flush=True)

        pending: List[Dict[str, Any]] = []

        def _on_question_verified(q_rec, _all, _n, _total):
            pending.append(q_rec)

        def _on_progress(p: Dict[str, Any]):
            new_qs = list(pending)
            pending.clear()
            verified_total = resumed_count + p.get('verifiedCount', 0)
            report = dict(p)
            report['verifiedCount'] = verified_total
            report['progressPct'] = min(95, 5 + int(verified_total / count * 90))
            print(f"  -> [{verified_total}/{count}] {p.get('status')}", flush=True)
            if self.report_progress(job_id, report, new_qs):
                saved.extend(new_qs)
            else:
                pending[:0] = new_qs  # retry these with the next report

        try:
            if not self.ollama_healthy:
                ok_ollama, msg, _ = self.check_local_ollama()
                if not ok_ollama:
                    raise RuntimeError(msg)

            metrics: Dict[str, Any] = {}
            if remaining > 0:
                t0 = time.time()
                new_questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
                    subject=job.get('subject', ''),
                    chapter=job.get('chapter', ''),
                    chapter_id=job.get('chapterId', ''),
                    topic=job.get('topic', ''),
                    count=remaining,
                    exam_level=job.get('examLevel', 'CA Foundation'),
                    difficulty=job.get('difficulty', 'ICAI Exam Standard'),
                    question_category=job.get('questionCategory', 'Direct Questions'),
                    question_speed=job.get('questionSpeed', 'Quick'),
                    marks_per_correct=float(job.get('marksPerCorrect', 2.0)),
                    negative_marks_per_wrong=float(job.get('negativeMarksPerWrong', 0.5)),
                    platform_xp=float(job.get('platformXp', 10.0)),
                    test_id=job.get('testId'),
                    job_id=job_id,
                    admin_description=job.get('adminDescription', ''),
                    existing_questions=(job.get('existingQuestions') or []) + saved,
                    start_number=len(saved) + 1,
                    progress_callback=_on_progress,
                    on_question_verified=_on_question_verified,
                    cancel_check=self.lease_lost.is_set
                )
                print(f"[WORKER_GENERATION_DONE] {len(new_questions)}/{remaining} new MCQs in {round(time.time() - t0, 1)}s "
                      f"({metrics.get('finalStatus')})", flush=True)
                known = {q.get('id') for q in saved}
                saved.extend(q for q in new_questions if q.get('id') not in known)

            if self.lease_lost.is_set():
                print(f"[WORKER_JOB_ABANDONED] {job_id}: lease lost; not publishing.", flush=True)
                return
            if not saved:
                self.fail_job(job_id, metrics.get('error') or "Local Qwen3 produced 0 MCQs that passed validation.")
                return

            metrics.update({'workerId': self.worker_id, 'machine': self.hostname, 'model': self.model})
            self.report_progress(job_id, {'stage': 'publishing', 'status': f"Publishing test with {len(saved)} verified MCQs...",
                                          'progressPct': 97, 'verifiedCount': len(saved)}, [])
            if self.complete_job(job_id, saved, metrics):
                print(f"[WORKER_JOB_FINISHED] {job_id}: hosted {len(saved)}/{count} MCQs.\n", flush=True)
            else:
                print(f"[WORKER_JOB_WARN] {job_id}: completion was not accepted by the server.", flush=True)

        except ai_mcq_engine.GenerationCancelled as e:
            print(f"[WORKER_JOB_ABANDONED] {job_id}: {e}", flush=True)
        except Exception as e:
            err_str = f"Local generation error: {e}"
            print(f"[WORKER_JOB_ERROR] {err_str}", flush=True)
            if not self.lease_lost.is_set():
                self.fail_job(job_id, err_str)
        finally:
            self.current_job_id = None
            self.current_status = "idle"
            self.lease_lost.clear()

    # ------------------------------------------------------------------ main
    def start(self):
        if not self.token:
            print("[WORKER_CONFIG_ERROR] AI_WORKER_SECRET is not set. Set it to the secret configured on the server "
                  "(environment variable AI_WORKER_SECRET or --token).", flush=True)
            sys.exit(2)

        print("=" * 65, flush=True)
        print(" ExcellenceCA Outbound Local Qwen Worker", flush=True)
        print("=" * 65, flush=True)
        print(f"Worker ID:     {self.worker_id}", flush=True)
        print(f"Target Server: {self.server_url}", flush=True)
        print(f"Model:         {self.model} (batch size {ai_mcq_engine.QWEN_BATCH_SIZE}, "
              f"{int(ai_mcq_engine.QWEN_BATCH_TIMEOUT)}s per batch)", flush=True)
        print("-" * 65, flush=True)

        self.running = True
        ok_ollama, msg, _ = self.check_local_ollama()
        self.ollama_healthy = ok_ollama
        print(f"[{'OK' if ok_ollama else 'WARNING'}] {msg}", flush=True)
        if self.send_heartbeat():
            print("[OK] Connected to ExcellenceCA server. Worker registered.", flush=True)
        else:
            print("[WARNING] Could not reach the server yet; will keep retrying.", flush=True)

        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

        print("[WORKER_READY] Listening for MCQ generation jobs...", flush=True)
        try:
            while self.running:
                try:
                    if self.ollama_healthy:
                        self.maybe_tick_scheduler()
                        job = self.claim_job()
                        if job:
                            self.process_job(job)
                            continue
                except Exception as e:
                    print(f"[WORKER_POLL_ERR] {e}", flush=True)
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            print("\n[WORKER_SHUTDOWN] Stopping Local Qwen Worker...", flush=True)
        finally:
            self.stop()

    def stop(self):
        self.running = False
        print("[WORKER_EXIT] Worker stopped.", flush=True)


def parse_args():
    parser = argparse.ArgumentParser(description="ExcellenceCA Outbound Local Qwen Worker")
    parser.add_argument('--server', default=DEFAULT_SERVER, help=f"Server URL (default: {DEFAULT_SERVER})")
    parser.add_argument('--token', default=None, help="Worker secret (default: AI_WORKER_SECRET environment variable)")
    parser.add_argument('--model', default=DEFAULT_MODEL, help=f"Ollama model name (default: {DEFAULT_MODEL})")
    parser.add_argument('--poll-interval', type=float, default=DEFAULT_POLL_INTERVAL)
    parser.add_argument('--heartbeat-interval', type=float, default=DEFAULT_HEARTBEAT_INTERVAL)
    parser.add_argument('--tick-interval', type=float, default=DEFAULT_TICK_INTERVAL, help="Auto-Pilot tick interval in seconds")
    parser.add_argument('--worker-id', default=None, help="Stable worker identifier (lets a restarted worker resume its job)")
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    worker = LocalQwenWorker(
        server_url=args.server,
        token=args.token,
        model=args.model,
        poll_interval=args.poll_interval,
        heartbeat_interval=args.heartbeat_interval,
        tick_interval=args.tick_interval,
        worker_id=args.worker_id
    )

    def _sig_handler(sig, frame):
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _sig_handler)
    try:
        signal.signal(signal.SIGTERM, _sig_handler)
    except Exception:
        pass
    worker.start()
