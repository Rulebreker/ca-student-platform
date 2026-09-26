"""
ai_job_manager.py
=================
MCQ generation job lifecycle for the Local Qwen Worker architecture.

Every generation - "Generate & Host Now" and Auto-Pilot - is a QUEUED job that the outbound
local_qwen_worker.py claims and executes through the canonical ai_mcq_engine pipeline
(local_qwen_service -> Ollama qwen3:8b). The server never runs inference itself.

Job states
    QUEUED -> CLAIMED -> GENERATING <-> VALIDATING -> PUBLISHING -> COMPLETED | PARTIAL
    any active state -> FAILED (worker error / admin cancel) | EXPIRED (no worker / lease lost)

Lease model
    A claimed job belongs to exactly one worker (job.workerId) until job.leaseExpiresTs.
    Every worker heartbeat (every ~15s, sent from a background thread even while a long Qwen
    batch is running) and every progress report renews the lease by JOB_LEASE_SECONDS.
    Progress/complete/fail from any other worker is rejected with 409, so two workers can never
    process the same job. A job whose lease expires is re-queued for another worker (keeping
    its already-verified questions) up to MAX_CLAIMS_PER_JOB times, then finalised as
    PARTIAL (if it has verified questions) or EXPIRED.

All reads/writes go through job_repository.JobRepository; callers hold
job_repository.STORE_LOCK around load -> mutate -> save.
"""

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import syllabus_hierarchy
from job_repository import JobRepository

ACTIVE_STATUSES = ('QUEUED', 'CLAIMED', 'GENERATING', 'VALIDATING', 'PUBLISHING')
LEASED_STATUSES = ('CLAIMED', 'GENERATING', 'VALIDATING', 'PUBLISHING')
TERMINAL_STATUSES = ('COMPLETED', 'PARTIAL', 'FAILED', 'EXPIRED')

JOB_LEASE_SECONDS = float(os.environ.get('AI_JOB_LEASE_SECONDS', '120'))
QUEUE_TIMEOUT_SECONDS = float(os.environ.get('AI_JOB_QUEUE_TIMEOUT_SECONDS', '900'))
MAX_CLAIMS_PER_JOB = int(os.environ.get('AI_JOB_MAX_CLAIMS', '2'))
WORKER_ONLINE_SECONDS = 60.0

# Worker-reported pipeline stage -> job status
_STAGE_TO_STATUS = {
    'generating': 'GENERATING',
    'batch_complete': 'GENERATING',
    'validating': 'VALIDATING',
    'publishing': 'PUBLISHING',
}


def _now_ts() -> float:
    return time.time()


def _iso(ts: Optional[float] = None) -> str:
    return datetime.fromtimestamp(ts if ts is not None else _now_ts(), timezone.utc).isoformat()


def _coerce_latency(value: Any) -> Optional[float]:
    """Latency in ms as a rounded float, or None when unavailable. Never raises."""
    try:
        if value is None or value == '':
            return None
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _created_ts(job: Dict[str, Any]) -> float:
    """Creation time; falls back to createdAt for jobs written by older code (0 = unknown, i.e. very old)."""
    if job.get('createdTs'):
        return float(job['createdTs'])
    try:
        return datetime.fromisoformat(str(job.get('createdAt')).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return 0.0


def _touch_lease(job: Dict[str, Any], now: float) -> None:
    job['lastHeartbeatAt'] = _iso(now)
    job['lastHeartbeatTs'] = now
    job['leaseExpiresTs'] = now + JOB_LEASE_SECONDS
    job['leaseExpiresAt'] = _iso(now + JOB_LEASE_SECONDS)


def _save(repo: JobRepository, job: Dict[str, Any]) -> None:
    job['updatedAt'] = _iso()
    job['updatedTs'] = _now_ts()
    repo.save(job, active_statuses=ACTIVE_STATUSES)


# ======================================================================
# JOB CREATION
# ======================================================================

def create_generation_job(
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any = None,
    sync_callback: Any = None,
    scheduled_task_id: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validate parameters, resolve the syllabus chapter and persist a QUEUED job for the worker."""
    repo = JobRepository(data, save_callback, sync_callback)
    title = str(params.get('title', '')).strip()
    subject = str(params.get('subject', '')).strip()
    topic = str(params.get('topic', '')).strip()
    try:
        count = int(params.get('count', 5))
    except (TypeError, ValueError):
        return False, "Question count must be a number.", None

    if not title or not subject or not topic:
        return False, "Title, Subject, and Topic are mandatory.", None
    if count < 1 or count > 50:
        return False, "Question count must be between 1 and 50.", None

    exam_level = str(params.get('examLevel') or 'CA Foundation').strip()
    chapter_meta = syllabus_hierarchy.get_authoritative_chapter_metadata(
        chapter_id=params.get('chapterId', ''),
        chapter_name=params.get('chapter') or params.get('chapterName') or topic,
        subject=subject,
        exam_level=exam_level,
        data=data
    )
    if not chapter_meta:
        return False, (f"Chapter could not be resolved in the {subject} syllabus. "
                       "Select a chapter from the syllabus list."), None

    now = _now_ts()
    # Idempotency guard: identical submission within 10 seconds returns the existing job
    for j in repo.list_jobs():
        if (j.get('title') == title and j.get('subject') == chapter_meta.get('subject', subject)
                and j.get('topic') == topic and j.get('status') in ACTIVE_STATUSES
                and now - (j.get('createdTs') or 0) < 10):
            return True, None, dict(j)

    job_id = f"job-ai-{int(now * 1000)}-{uuid.uuid4().hex[:6]}"
    job = {
        'id': job_id,
        'jobId': job_id,
        'title': title,
        'subject': chapter_meta.get('subject', subject),
        'subjectId': chapter_meta.get('subjectId') or params.get('subjectId') or '',
        'chapter': chapter_meta['chapterName'],
        'chapterId': chapter_meta['chapterId'],
        'topic': topic,
        'description': str(params.get('description') or '').strip(),
        'adminDescription': str(params.get('adminDescription') or '').strip(),
        'sourceDocId': params.get('sourceDocId') or params.get('sourceDocumentId'),
        'examLevel': chapter_meta.get('examLevel', exam_level),
        'examLevelId': chapter_meta.get('examLevelId') or params.get('examLevelId', 'foundation'),
        'difficulty': params.get('difficulty', 'ICAI Exam Standard'),
        'questionCategory': str(params.get('questionCategory') or 'Direct Questions').strip(),
        'questionSpeed': str(params.get('questionSpeed') or 'Quick').strip(),
        'durationMinutes': int(params.get('durationMinutes', 15)),
        'count': count,
        'requestedCount': count,
        'totalQuestions': count,
        'marksPerCorrect': float(params.get('marksPerCorrect', 2.0)),
        'negativeMarksPerWrong': float(params.get('negativeMarksPerWrong', 0.5)),
        'platformXp': float(params.get('platformXp', 10)),
        'maxAttempts': int(params.get('maxAttempts', 3)),
        'allowedPlans': params.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite']),
        'autoPublish': bool(params.get('autoPublish', True)),
        'scheduledTaskId': scheduled_task_id or params.get('scheduledTaskId'),
        'status': 'QUEUED',
        'progressPct': 2,
        'currentStage': 'Queued - waiting for the Local Qwen Worker to claim this job...',
        'generatedCount': 0,
        'currentQuestionIndex': 0,
        'generatedQuestions': [],
        'questionStatuses': [{'number': s, 'status': 'pending', 'error': None, 'provider': None} for s in range(1, count + 1)],
        'workerId': None,
        'claimCount': 0,
        'leaseExpiresTs': None,
        'leaseExpiresAt': None,
        'testId': None,
        'createdTs': now,
        'createdAt': _iso(now),
        'startedAt': None,
        'completedAt': None,
        'lastHeartbeatAt': None,
        'error': None,
        'result': None
    }
    _save(repo, job)
    print(f"[AI_JOB_QUEUED] {job_id} '{title}' {job['subject']} / {job['chapter']} x{count}", flush=True)
    return True, None, dict(job)


# ======================================================================
# STALE JOB HANDLING (lease expiry / orphan recovery)
# ======================================================================

def expire_stale_jobs(data: Dict[str, Any], save_callback: Any = None, sync_callback: Any = None) -> List[Dict[str, Any]]:
    """
    Re-queue jobs whose worker lease expired (orphan recovery) and expire jobs that can no
    longer make progress. Returns the jobs that changed.
    """
    repo = JobRepository(data, save_callback, sync_callback)
    now = _now_ts()
    changed = []
    for job in repo.list_jobs():
        status = job.get('status')
        if status == 'QUEUED':
            if now - _created_ts(job) > QUEUE_TIMEOUT_SECONDS and not job.get('generatedQuestions'):
                _finalize_without_worker(repo, job, 'EXPIRED',
                                         f"No Local Qwen Worker claimed this job within {int(QUEUE_TIMEOUT_SECONDS // 60)} minutes.")
                changed.append(job)
            continue
        if status not in LEASED_STATUSES:
            continue
        lease_ts = job.get('leaseExpiresTs') or 0
        if lease_ts and now <= lease_ts:
            continue

        saved_qs = job.get('generatedQuestions') or []
        lost_worker = job.get('workerId')
        if (job.get('claimCount') or 0) < MAX_CLAIMS_PER_JOB:
            job.update({
                'status': 'QUEUED',
                'workerId': None,
                'leaseExpiresTs': None,
                'leaseExpiresAt': None,
                'currentStage': (f"Worker {lost_worker} stopped responding. Re-queued for recovery; "
                                 f"{len(saved_qs)} verified question(s) preserved."),
            })
            print(f"[WORKER_RECOVER_ORPHAN] Job {job['id']} re-queued (lease expired, worker {lost_worker}).", flush=True)
            _save(repo, job)
        elif saved_qs:
            _finalize_job(repo, job, saved_qs, dict(job.get('metrics') or {}),
                          note=f"Worker lease expired after {job.get('claimCount')} claims; hosting verified questions.")
        else:
            _finalize_without_worker(repo, job, 'EXPIRED',
                                     f"Local Qwen Worker stopped responding (lease expired after {job.get('claimCount')} claims).")
        changed.append(job)
    return changed


def get_job_status(job_id: str, data: Dict[str, Any], save_callback: Any = None, sync_callback: Any = None) -> Optional[Dict[str, Any]]:
    expire_stale_jobs(data, save_callback, sync_callback)
    job = JobRepository(data).get(job_id)
    return dict(job) if job else None


def get_active_generation_job(data: Dict[str, Any], save_callback: Any = None, sync_callback: Any = None) -> Optional[Dict[str, Any]]:
    """Newest job that is still QUEUED/CLAIMED/GENERATING/VALIDATING/PUBLISHING (after lease checks)."""
    expire_stale_jobs(data, save_callback, sync_callback)
    active = [j for j in JobRepository(data).list_jobs() if j.get('status') in ACTIVE_STATUSES]
    if not active:
        return None
    return dict(max(active, key=lambda j: j.get('createdTs', 0) or 0))


def cancel_generation_job(job_id: str, data: Dict[str, Any], save_callback: Any = None,
                          sync_callback: Any = None) -> Tuple[bool, Optional[str]]:
    repo = JobRepository(data, save_callback, sync_callback)
    job = repo.get(job_id)
    if not job:
        return False, "Job not found"
    if job.get('status') not in ACTIVE_STATUSES:
        return True, None
    _finalize_without_worker(repo, job, 'FAILED', 'Job cancelled by administrator')
    return True, None


def reset_all_stuck_jobs(data: Dict[str, Any], save_callback: Any = None, sync_callback: Any = None) -> int:
    """Forcefully fail every active job (admin 'Force Reset Pipeline')."""
    repo = JobRepository(data, save_callback, sync_callback)
    count = 0
    for job in repo.list_jobs():
        if job.get('status') in ACTIVE_STATUSES:
            _finalize_without_worker(repo, job, 'FAILED', 'Pipeline reset by administrator')
            count += 1
    return count


# ======================================================================
# LOCAL QWEN WORKER PROTOCOL
# ======================================================================

def update_worker_heartbeat(payload: Dict[str, Any], data: Dict[str, Any], save_callback: Any = None,
                            sync_callback: Any = None) -> Dict[str, Any]:
    """
    Record a worker heartbeat and renew the lease of the job the worker is processing.
    Returns {'worker': status, 'jobLeaseValid': True|False|None}. jobLeaseValid False tells
    the worker to abandon its current job (cancelled, expired or re-assigned).
    """
    repo = JobRepository(data, save_callback, sync_callback)
    now = _now_ts()
    worker_id = str(payload.get('workerId') or '').strip() or 'unknown-worker'
    status = {
        'workerId': worker_id,
        'machine': str(payload.get('machine') or '')[:80],
        'status': str(payload.get('status') or 'idle')[:20],
        'model': str(payload.get('model') or 'qwen3:8b')[:60],
        'runtime': 'Ollama',
        'ollamaHealthy': bool(payload.get('ollamaHealthy', False)),
        'lastLatencyMs': _coerce_latency(payload.get('latencyMs', payload.get('lastLatencyMs'))),
        'currentJobId': payload.get('currentJobId') or None,
        'version': str(payload.get('version') or '')[:20],
        'lastHeartbeatAt': _iso(now),
        'lastHeartbeatTs': now
    }

    lease_valid = None
    job_id = status['currentJobId']
    if job_id:
        job = repo.get(job_id)
        lease_valid = bool(job and job.get('status') in LEASED_STATUSES and job.get('workerId') == worker_id)
        if lease_valid:
            _touch_lease(job, now)
            _save(repo, job)
        status['currentJobTitle'] = job.get('title') if job else None
    repo.save_worker_status(status)
    return {'worker': get_worker_status(data), 'jobLeaseValid': lease_valid}


def get_worker_status(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Worker online state derived from the last heartbeat (> WORKER_ONLINE_SECONDS old = offline)."""
    w = JobRepository(data).get_worker_status() if data else None
    if not w:
        return {
            'workerId': None, 'online': False, 'isOnline': False, 'workerOnline': False,
            'status': 'offline', 'error': 'Local Qwen Worker Offline', 'model': 'qwen3:8b',
            'runtime': 'Ollama', 'ollamaHealthy': False, 'lastLatencyMs': None,
            'currentJobId': None, 'lastHeartbeatAt': None, 'lastHeartbeatSecondsAgo': None,
            'secondsSinceHeartbeat': None
        }
    now = _now_ts()
    last_ts = w.get('lastHeartbeatTs') or 0
    if not last_ts and w.get('lastHeartbeatAt'):
        try:
            last_ts = datetime.fromisoformat(str(w['lastHeartbeatAt']).replace('Z', '+00:00')).timestamp()
        except ValueError:
            last_ts = 0
    fresh = bool(last_ts and now - last_ts <= WORKER_ONLINE_SECONDS)
    ollama_ok = bool(w.get('ollamaHealthy'))
    ago = round(now - last_ts, 1) if last_ts else None
    out = dict(w)
    out.update({
        'lastLatencyMs': _coerce_latency(w.get('lastLatencyMs')),
        'workerOnline': fresh,
        'online': fresh and ollama_ok,
        'isOnline': fresh and ollama_ok,
        'lastHeartbeatSecondsAgo': ago,
        'secondsSinceHeartbeat': ago,
    })
    if not fresh:
        out['status'], out['error'] = 'offline', 'Local Qwen Worker Offline'
    elif not ollama_ok:
        out['status'], out['error'] = 'ollama_offline', 'Worker connected, but its local Ollama is unreachable'
    else:
        out['error'] = None
        if out.get('status') not in ('busy', 'idle'):
            out['status'] = 'online'
    return out


def claim_pending_job_for_worker(worker_id: str, data: Dict[str, Any], save_callback: Any = None,
                                 sync_callback: Any = None) -> Optional[Dict[str, Any]]:
    """
    Claim the oldest QUEUED job for this worker (FIFO). If this worker already owns an active
    job (e.g. it restarted with the same --worker-id) that job is returned again so it resumes.
    The returned job carries 'existingQuestions' (same chapter) for duplicate detection.
    """
    if not worker_id:
        return None
    repo = JobRepository(data, save_callback, sync_callback)
    expire_stale_jobs(data, save_callback, sync_callback)
    now = _now_ts()
    jobs = sorted(repo.list_jobs(), key=lambda j: j.get('createdTs', 0) or 0)

    job = next((j for j in jobs if j.get('status') in LEASED_STATUSES and j.get('workerId') == worker_id), None)
    if not job:
        job = next((j for j in jobs if j.get('status') == 'QUEUED'), None)
        if not job:
            return None
        job['claimCount'] = (job.get('claimCount') or 0) + 1
    job.update({
        'status': 'CLAIMED',
        'workerId': worker_id,
        'claimedAt': _iso(now),
        'startedAt': job.get('startedAt') or _iso(now),
        'currentStage': f"Claimed by Local Qwen Worker ({worker_id}). Preparing Qwen3 inference...",
        'error': None
    })
    _touch_lease(job, now)
    _save(repo, job)
    print(f"[WORKER_CLAIM_SUCCESS] Worker {worker_id} claimed job {job['id']} (claim #{job['claimCount']}).", flush=True)

    claimed = dict(job)
    claimed['existingQuestions'] = [
        {'text': t} for t in repo.existing_question_texts(job.get('subject'), job.get('chapterId'), job.get('chapter'))
    ]
    return claimed


def _owned_job(repo: JobRepository, job_id: str, worker_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    job = repo.get(job_id)
    if not job:
        return None, 'Job not found', 404
    if job.get('status') not in LEASED_STATUSES:
        return None, f"Job is {job.get('status')}; lease no longer valid", 409
    if not worker_id or job.get('workerId') != worker_id:
        return None, f"Job is leased to another worker ({job.get('workerId')})", 409
    return job, None, 200


def update_job_progress_from_worker(job_id: str, worker_id: str, progress: Dict[str, Any], data: Dict[str, Any],
                                    save_callback: Any = None, sync_callback: Any = None) -> Tuple[bool, Optional[str], int]:
    """Apply a worker progress report (after every batch): stage, counters and newly verified questions."""
    repo = JobRepository(data, save_callback, sync_callback)
    job, err, code = _owned_job(repo, job_id, worker_id)
    if not job:
        return False, err, code

    job['status'] = _STAGE_TO_STATUS.get(str(progress.get('stage') or '').lower(), 'GENERATING')
    new_qs = [q for q in (progress.get('newQuestions') or []) if isinstance(q, dict) and q.get('id')]
    if new_qs:
        saved = job.setdefault('generatedQuestions', [])
        known = {q.get('id') for q in saved}
        saved.extend(q for q in new_qs if q['id'] not in known)
    verified = len(job.get('generatedQuestions') or [])
    job['generatedCount'] = verified
    job['currentQuestionIndex'] = verified
    try:
        pct = int(progress.get('progressPct'))
    except (TypeError, ValueError):
        pct = job.get('progressPct') or 5
    job['progressPct'] = min(98, max(job.get('progressPct') or 0, pct))
    if progress.get('status'):
        job['currentStage'] = str(progress['status'])[:300]
    if isinstance(progress.get('questionStatuses'), list):
        job['questionStatuses'] = progress['questionStatuses']
    _touch_lease(job, _now_ts())
    _save(repo, job)
    return True, None, 200


def complete_job_from_worker(job_id: str, worker_id: str, questions: List[Dict[str, Any]], metrics: Dict[str, Any],
                             data: Dict[str, Any], save_callback: Any = None,
                             sync_callback: Any = None) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], int]:
    """Host the verified questions as a test and finish the job. Idempotent for the owning worker."""
    repo = JobRepository(data, save_callback, sync_callback)
    existing = repo.get(job_id)
    if existing and existing.get('status') in ('COMPLETED', 'PARTIAL') and existing.get('workerId') == worker_id:
        return True, None, existing.get('result'), 200
    job, err, code = _owned_job(repo, job_id, worker_id)
    if not job:
        return False, err, None, code

    merged = list(job.get('generatedQuestions') or [])
    known = {q.get('id') for q in merged}
    merged.extend(q for q in (questions or []) if isinstance(q, dict) and q.get('id') not in known)
    job['status'] = 'PUBLISHING'
    job['currentStage'] = f"Hosting test with {len(merged)} verified MCQs..."
    metrics = dict(metrics or {})
    metrics['workerId'] = worker_id
    result = _finalize_job(repo, job, merged, metrics)
    return True, None, result, 200


def fail_job_from_worker(job_id: str, worker_id: str, error_msg: str, data: Dict[str, Any],
                         save_callback: Any = None, sync_callback: Any = None) -> Tuple[bool, Optional[str], int]:
    """Worker reports a fatal error. Verified questions already saved are hosted as a PARTIAL test."""
    repo = JobRepository(data, save_callback, sync_callback)
    job, err, code = _owned_job(repo, job_id, worker_id)
    if not job:
        return False, err, code
    saved_qs = job.get('generatedQuestions') or []
    if saved_qs:
        _finalize_job(repo, job, saved_qs, dict(job.get('metrics') or {}), note=f"Worker error: {error_msg}")
    else:
        _finalize_without_worker(repo, job, 'FAILED', str(error_msg)[:500])
    return True, None, 200


# ======================================================================
# FINALISATION & HOSTING
# ======================================================================

def _finalize_without_worker(repo: JobRepository, job: Dict[str, Any], status: str, error: str) -> None:
    job.update({
        'status': status,
        'error': error,
        'currentStage': f"{status.title()}: {error}",
        'completedAt': _iso(),
        'leaseExpiresTs': None,
        'leaseExpiresAt': None
    })
    _save(repo, job)
    _notify_scheduler(repo, job, None)
    print(f"[AI_JOB_{status}] {job['id']}: {error}", flush=True)


def _finalize_job(repo: JobRepository, job: Dict[str, Any], questions: List[Dict[str, Any]],
                  metrics: Dict[str, Any], note: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Host verified questions as a test (COMPLETED / PARTIAL) or fail the job when there are none."""
    count = int(job.get('count') or len(questions) or 1)
    questions = [q for q in questions if isinstance(q, dict)][:count]
    now = _now_ts()
    completed_iso = _iso(now)
    job['completedAt'] = completed_iso
    job['leaseExpiresTs'] = None
    job['leaseExpiresAt'] = None
    job['metrics'] = metrics

    if not questions:
        _finalize_without_worker(repo, job, 'FAILED', note or f"0 of {count} questions could be verified.")
        return None

    test_id = job.get('testId') or f"tst-ai-{int(now * 1000)}"
    job['testId'] = test_id
    marks = float(job.get('marksPerCorrect', 2.0))
    auto_publish = bool(job.get('autoPublish', True))
    for i, q in enumerate(questions, start=1):
        q['testId'] = test_id
        q['number'] = i

    repo.save_questions(questions)

    test_record = {
        'id': test_id,
        'title': job.get('title', 'AI-Generated Practice Test'),
        'description': job.get('description') or f"AI-Generated {job.get('difficulty')} Practice Test for {job.get('chapter') or job.get('topic')}.",
        'subject': job.get('subject'),
        'subjectId': job.get('subjectId') or '',
        'chapter': job.get('chapter', ''),
        'chapterId': job.get('chapterId', ''),
        'topic': job.get('topic'),
        'examLevel': job.get('examLevel', 'CA Foundation'),
        'examLevelId': job.get('examLevelId', 'foundation'),
        'difficulty': job.get('difficulty', 'ICAI Exam Standard'),
        'questionCategory': job.get('questionCategory', 'Direct Questions'),
        'questionSpeed': job.get('questionSpeed', 'Quick'),
        'durationMinutes': int(job.get('durationMinutes', 15)),
        'totalQuestions': len(questions),
        'marksPerCorrect': marks,
        'negativeMarksPerWrong': float(job.get('negativeMarksPerWrong', 0.5)),
        'maximumMarks': round(len(questions) * marks, 2),
        'allowedPlans': job.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite']),
        'hideFromNonEligible': False,
        'isPublished': auto_publish,
        'status': 'Published' if auto_publish else 'Draft',
        'pointsPerCorrect': float(job.get('platformXp', 10.0)),
        'platformXp': float(job.get('platformXp', 10.0)),
        'unattemptedMarks': 0.0,
        'maxAttempts': int(job.get('maxAttempts', 3)),
        'aiGenerated': True,
        'aiJobId': job['id'],
        'createdAt': completed_iso,
        'updatedAt': completed_iso
    }
    repo.save_test(test_record)

    complete = len(questions) >= count
    job.update({
        'status': 'COMPLETED' if complete else 'PARTIAL',
        'progressPct': 100,
        'generatedCount': len(questions),
        'validatedCount': len(questions),
        'failedCount': count - len(questions),
        'generatedQuestions': questions,
        'currentStage': ('Test Hosted & Published Successfully!' if complete else
                         f"Partial Success: {len(questions)} of {count} questions verified and hosted."),
        'error': None if complete else (note or f"Partial generation: {len(questions)} of {count} questions verified."),
        'provider': 'LOCAL',
        'model': 'qwen3:8b',
        'runtime': 'Ollama',
        'providersUsed': ['local_qwen'],
        'validationProvidersUsed': ['local'],
    })
    job['result'] = {'test': test_record, 'questions': questions, 'metrics': metrics,
                     'job': {k: v for k, v in job.items() if k not in ('result', 'generatedQuestions')}}

    log_record = {
        'id': f"log-{int(now * 1000)}-{uuid.uuid4().hex[:6]}",
        'jobId': job['id'],
        'testId': test_id,
        'testTitle': test_record['title'],
        'subject': job.get('subject'),
        'topic': job.get('topic'),
        'chapter': job.get('chapter'),
        'provider': 'LOCAL',
        'model': 'qwen3:8b',
        'runtime': 'Ollama',
        'workerId': job.get('workerId'),
        'questionCategory': job.get('questionCategory'),
        'questionSpeed': job.get('questionSpeed'),
        'requestedCount': count,
        'generatedCount': len(questions),
        'failedCount': count - len(questions),
        'questionStatuses': metrics.get('questionStatuses', job.get('questionStatuses', [])),
        'rejectedDuplicates': metrics.get('rejectedDuplicates', 0),
        'rejectedValidation': metrics.get('rejectedValidation', 0),
        'regenerationAttempts': metrics.get('regenerationAttempts', 0),
        'durationSeconds': metrics.get('durationSeconds', 0),
        'providersUsed': ['local_qwen'],
        'validationProvidersUsed': ['local'],
        'status': job['status'],
        'isPublished': auto_publish,
        'timestamp': completed_iso
    }
    repo.add_generation_log(log_record)

    _save(repo, job)
    _notify_scheduler(repo, job, test_record)
    print(f"[AI_JOB_{job['status']}] {job['id']} hosted test {test_id} with {len(questions)}/{count} MCQs.", flush=True)
    return job['result']


def _notify_scheduler(repo: JobRepository, job: Dict[str, Any], test_record: Optional[Dict[str, Any]]) -> None:
    """Propagate a finished job to its Auto-Pilot task (if any)."""
    if not job.get('scheduledTaskId'):
        return
    import ai_scheduler  # local import: ai_scheduler imports this module
    ai_scheduler.apply_job_outcome_to_task(job, test_record, repo.data, repo.sync_callback)
    repo.persist()
