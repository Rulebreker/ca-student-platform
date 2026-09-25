import os
import json
import time
import uuid
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import ai_provider_manager
import ai_document_indexer
import ai_mcq_engine
import syllabus_hierarchy

# Active jobs in memory cache
_active_jobs: Dict[str, Dict[str, Any]] = {}
_active_workers: Dict[str, threading.Thread] = {}
_jobs_lock = threading.Lock()

def save_job_record(
    job_record: Dict[str, Any],
    data: Optional[Dict[str, Any]] = None,
    save_callback: Optional[Any] = None,
    firebase_sync_callback: Optional[Any] = None
):
    """
    Authoritative persistence for AI Generation Jobs across:
    1. In-memory dictionary cache
    2. Persistent local data store (data['ai_generation_jobs'])
    3. Firebase Realtime Database (/ai_generation_jobs/{job_id})
    """
    job_id = job_record.get('id')
    if not job_id:
        return
    now_utc_iso = datetime.now(timezone.utc).isoformat()
    if 'lastHeartbeatAt' not in job_record or job_record.get('status') in ['QUEUED', 'PROCESSING', 'GENERATING']:
        job_record['lastHeartbeatAt'] = now_utc_iso
    job_record['updatedAt'] = now_utc_iso
    job_record['updatedTs'] = time.time()
    with _jobs_lock:
        _active_jobs[job_id] = dict(job_record)
    
    if data is not None and isinstance(data, dict):
        jobs_list = data.setdefault('ai_generation_jobs', [])
        found = False
        for idx, j in enumerate(jobs_list):
            if isinstance(j, dict) and j.get('id') == job_id:
                jobs_list[idx] = dict(job_record)
                found = True
                break
        if not found:
            jobs_list.insert(0, dict(job_record))
            if len(jobs_list) > 50:
                data['ai_generation_jobs'] = jobs_list[:50]
        
        if save_callback:
            try:
                save_callback(data)
            except Exception as e:
                print(f"[AI_JOB_SAVE_WARNING] Failed to save backend data: {e}", flush=True)

    if firebase_sync_callback:
        try:
            # Sync to Firebase non-blocking or sync
            firebase_sync_callback(f"ai_generation_jobs/{job_id}", job_record, method='PUT', sync=False)
        except Exception as fb_err:
            print(f"[AI_JOB_FB_WARNING] Failed to sync job to Firebase: {fb_err}", flush=True)

def get_job_status(job_id: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Retrieve job status by ID, checking memory cache, data store, and cloud sync.
    Synchronizes memory cache with DB/Firebase data so polling always reflects fresh state.
    """
    db_job = None
    if data and isinstance(data, dict):
        jobs = data.get('ai_generation_jobs', [])
        if isinstance(jobs, dict):
            jobs = list(jobs.values())
        elif not isinstance(jobs, list):
            jobs = []
        for j in jobs:
            if isinstance(j, dict) and j.get('id') == job_id:
                db_job = dict(j)
                break

    with _jobs_lock:
        mem_job = _active_jobs.get(job_id)
        if mem_job and db_job:
            db_count = db_job.get('generatedCount', 0)
            mem_count = mem_job.get('generatedCount', 0)
            db_status = db_job.get('status', '')
            mem_status = mem_job.get('status', '')

            if (db_count > mem_count) or (db_status in ['COMPLETED', 'FAILED'] and mem_status not in ['COMPLETED', 'FAILED']) or (db_job.get('progressPct', 0) > mem_job.get('progressPct', 0)):
                _active_jobs[job_id] = dict(db_job)
                return dict(db_job)
            return dict(mem_job)
        elif mem_job:
            return dict(mem_job)
        elif db_job:
            _active_jobs[job_id] = dict(db_job)
            return dict(db_job)

    return None

def get_active_generation_job(data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Retrieve the most recent active generation job (QUEUED, PROCESSING, GENERATING)
    created within the last 15 minutes to restore UI on page refresh.
    Synchronizes memory cache with freshest DB/Firebase records.
    """
    now_ts = time.time()
    active_statuses = {'QUEUED', 'PROCESSING', 'GENERATING'}

    db_jobs = {}
    if data and isinstance(data, dict):
        try:
            jobs = data.get('ai_generation_jobs', [])
            if isinstance(jobs, dict):
                jobs = list(jobs.values())
            elif not isinstance(jobs, list):
                jobs = []
            for j in jobs:
                if isinstance(j, dict) and j.get('id'):
                    db_jobs[j['id']] = dict(j)
        except Exception:
            pass

    with _jobs_lock:
        for j_id, db_j in db_jobs.items():
            if j_id in _active_jobs:
                mem_j = _active_jobs[j_id]
                if (db_j.get('generatedCount', 0) > mem_j.get('generatedCount', 0) or
                    db_j.get('progressPct', 0) > mem_j.get('progressPct', 0) or
                    db_j.get('status') in ['COMPLETED', 'FAILED']):
                    _active_jobs[j_id] = dict(db_j)
            else:
                _active_jobs[j_id] = dict(db_j)

        all_candidates = list(_active_jobs.values())

    sorted_candidates = sorted(
        all_candidates,
        key=lambda x: (x.get('createdTs', 0) or 0),
        reverse=True
    )

    for j in sorted_candidates:
        c_ts = j.get('createdTs', 0)
        status = j.get('status')
        j_id = j.get('id')
        if status in active_statuses:
            worker = _active_workers.get(j_id)
            if worker and worker.is_alive():
                return dict(j)

            # Check heartbeat timestamp
            last_hb = j.get('lastHeartbeatAt')
            last_hb_ts = 0
            if last_hb:
                try:
                    last_hb_ts = datetime.fromisoformat(last_hb.replace('Z', '+00:00')).timestamp()
                except Exception:
                    last_hb_ts = 0
            if not last_hb_ts:
                last_hb_ts = j.get('updatedTs') or c_ts

            # If heartbeat is within 120s, the job is actively processing in another worker/thread
            if (now_ts - last_hb_ts) <= 120:
                return dict(j)

            # If heartbeat is older than 120s, the job has truly stalled
            verified_qs = j.get('generatedQuestions', [])
            if len(verified_qs) > 0:
                j['status'] = 'PARTIAL'
                j['currentStage'] = f"Partially Completed: {len(verified_qs)} questions preserved"
                j['error'] = f"Job interrupted: worker heartbeat timed out (>120s). {len(verified_qs)} questions preserved."
            else:
                j['status'] = 'FAILED'
                j['error'] = 'Job interrupted by server restart / worker timeout (>120s)'
            with _jobs_lock:
                _active_jobs[j_id] = dict(j)

            if data and isinstance(data, dict):
                for orig_j in data.get('ai_generation_jobs', []):
                    if orig_j.get('id') == j_id:
                        orig_j['status'] = j['status']
                        orig_j['currentStage'] = j['currentStage']
                        orig_j['error'] = j['error']
                test_id = j.get('testId')
                if test_id and len(verified_qs) > 0:
                    for t in data.get('tests', []):
                        if t.get('id') == test_id:
                            t['questions'] = list(verified_qs)
            continue

    return None

def cancel_generation_job(
    job_id: str,
    data: Optional[Dict[str, Any]] = None,
    save_callback: Optional[Any] = None,
    firebase_sync_callback: Optional[Any] = None
) -> Tuple[bool, Optional[str]]:
    """Cancel an active generation job and persist status."""
    with _jobs_lock:
        job = _active_jobs.get(job_id)
        if not job and data and isinstance(data.get('ai_generation_jobs'), list):
            job = next((j for j in data['ai_generation_jobs'] if j.get('id') == job_id), None)
        if not job:
            return False, "Job not found"
        
        job['status'] = 'FAILED'
        job['error'] = 'Job cancelled by administrator'
        job['currentStage'] = 'Generation Cancelled'
        _active_jobs[job_id] = dict(job)

    save_job_record(job, data, save_callback, firebase_sync_callback)
    return True, None

def create_generation_job(
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any,
    firebase_sync_callback: Any,
    queue_only: bool = False,
    scheduledTaskId: Optional[str] = None
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate parameters and queue a background MCQ generation job.
    Persists job record immediately to production DB before launching worker.
    In queue_only mode, saves the job as QUEUED for an external local worker to claim.
    """
    title = str(params.get('title', '')).strip()
    subject = str(params.get('subject', '')).strip()
    topic = str(params.get('topic', '')).strip()
    count = int(params.get('count', 5))
    
    if not title or not subject or not topic:
        return False, "Title, Subject, and Topic are mandatory.", None
    if count < 1 or count > 50:
        return False, "Question count must be between 1 and 50.", None

    # Idempotency guard: prevent duplicate jobs within 10 seconds
    now_ts = time.time()
    with _jobs_lock:
        for j in _active_jobs.values():
            if (j.get('title') == title and 
                j.get('subject') == subject and 
                j.get('topic') == topic and 
                (now_ts - j.get('createdTs', 0)) < 10 and 
                j.get('status') in ['QUEUED', 'PROCESSING', 'GENERATING', 'CLAIMED']):
                return True, None, j

    job_id = f"job-ai-{int(now_ts * 1000)}-{uuid.uuid4().hex[:6]}"
    chapter = params.get('chapter', '') or params.get('chapterName', '')
    chapter_id = params.get('chapterId', '')
    exam_level_id = params.get('examLevelId', 'foundation')
    platform_xp = float(params.get('platformXp', 10))
    allowed_plans = params.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite'])
    question_category = str(params.get('questionCategory') or 'Direct Questions').strip()
    question_speed = str(params.get('questionSpeed') or 'Quick').strip()
    scheduled_task_id = params.get('scheduledTaskId')

    stage_text = 'Waiting for Local Qwen Worker to claim...' if queue_only else 'Initializing Generation Pipeline...'

    job_record = {
        'id': job_id,
        'jobId': job_id,
        'title': title,
        'subject': subject,
        'subjectId': params.get('subjectId', 'sub-1'),
        'chapter': chapter,
        'chapterId': chapter_id,
        'topic': topic,
        'scheduledTaskId': scheduled_task_id,
        'sourceDocumentId': params.get('sourceDocId') or params.get('sourceDocumentId'),
        'sourceDocId': params.get('sourceDocId') or params.get('sourceDocumentId'),
        'examLevel': params.get('examLevel', 'CA Foundation'),
        'examLevelId': exam_level_id,
        'difficulty': params.get('difficulty', 'ICAI Exam Standard'),
        'questionCategory': question_category,
        'questionSpeed': question_speed,
        'durationMinutes': int(params.get('durationMinutes', 15)),
        'count': count,
        'requestedCount': count,
        'generatedCount': 0,
        'validatedCount': 0,
        'rejectedCount': 0,
        'failedCount': 0,
        'retryCount': 0,
        'marksPerCorrect': float(params.get('marksPerCorrect', 2.0)),
        'negativeMarksPerWrong': float(params.get('negativeMarksPerWrong', 0.5)),
        'platformXp': platform_xp,
        'maxAttempts': int(params.get('maxAttempts', 3)),
        'allowedPlans': allowed_plans,
        'autoPublish': bool(params.get('autoPublish', True)),
        'status': 'QUEUED',
        'progressPct': 5,
        'currentStage': stage_text,
        'currentQuestionIndex': 0,
        'totalQuestions': count,
        'generatedQuestions': [],
        'questionStatuses': [{'number': s, 'status': 'pending', 'error': None, 'provider': None} for s in range(1, count + 1)],
        'testId': None,
        'createdTs': now_ts,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'startedAt': None,
        'completedAt': None,
        'lastHeartbeatAt': datetime.now(timezone.utc).isoformat(),
        'error': None,
        'result': None,
        'scheduledTaskId': scheduledTaskId or params.get('scheduledTaskId')
    }

    # Persist job record immediately in DB & Firebase
    save_job_record(job_record, data, save_callback, firebase_sync_callback)

    # In queue-only mode (serverless/worker mode), do not spawn an in-process worker thread
    if not queue_only:
        worker_thread = threading.Thread(
            target=_run_generation_job_worker,
            args=(job_id, params, data, save_callback, firebase_sync_callback),
            daemon=True
        )
        with _jobs_lock:
            _active_workers[job_id] = worker_thread
        worker_thread.start()

    return True, None, job_record

def run_generation_job_synchronous(
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any,
    firebase_sync_callback: Any
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate parameters and execute an MCQ generation and hosting job synchronously.
    Guarantees completion and database persistence before returning.
    """
    title = str(params.get('title', '')).strip()
    subject = str(params.get('subject', '')).strip()
    topic = str(params.get('topic', '')).strip()
    count = int(params.get('count', 5))
    
    if not title or not subject or not topic:
        return False, "Title, Subject, and Topic are mandatory.", None
    if count < 1 or count > 50:
        return False, "Question count must be between 1 and 50.", None

    now_ts = time.time()
    job_id = f"job-ai-sync-{int(now_ts * 1000)}-{uuid.uuid4().hex[:6]}"
    chapter = params.get('chapter', '') or params.get('chapterName', '')
    chapter_id = params.get('chapterId', '')
    exam_level_id = params.get('examLevelId', 'foundation')
    platform_xp = float(params.get('platformXp', 10))
    allowed_plans = params.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite'])

    question_category = str(params.get('questionCategory') or 'Direct Questions').strip()
    question_speed = str(params.get('questionSpeed') or 'Quick').strip()

    job_record = {
        'id': job_id,
        'jobId': job_id,
        'title': title,
        'subject': subject,
        'subjectId': params.get('subjectId', 'sub-1'),
        'chapter': chapter,
        'chapterId': chapter_id,
        'topic': topic,
        'sourceDocumentId': params.get('sourceDocId') or params.get('sourceDocumentId'),
        'sourceDocId': params.get('sourceDocId') or params.get('sourceDocumentId'),
        'examLevel': params.get('examLevel', 'CA Foundation'),
        'examLevelId': exam_level_id,
        'difficulty': params.get('difficulty', 'ICAI Exam Standard'),
        'questionCategory': question_category,
        'questionSpeed': question_speed,
        'durationMinutes': int(params.get('durationMinutes', 15)),
        'count': count,
        'requestedCount': count,
        'generatedCount': 0,
        'validatedCount': 0,
        'rejectedCount': 0,
        'failedCount': 0,
        'retryCount': 0,
        'marksPerCorrect': float(params.get('marksPerCorrect', 2.0)),
        'negativeMarksPerWrong': float(params.get('negativeMarksPerWrong', 0.5)),
        'platformXp': platform_xp,
        'maxAttempts': int(params.get('maxAttempts', 3)),
        'allowedPlans': allowed_plans,
        'autoPublish': bool(params.get('autoPublish', True)),
        'status': 'QUEUED',
        'progressPct': 5,
        'currentStage': 'Initializing Generation Pipeline (Synchronous)...',
        'currentQuestionIndex': 0,
        'totalQuestions': count,
        'generatedQuestions': [],
        'questionStatuses': [{'number': s, 'status': 'pending', 'error': None, 'provider': None} for s in range(1, count + 1)],
        'testId': None,
        'createdTs': now_ts,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'startedAt': None,
        'completedAt': None,
        'lastHeartbeatAt': datetime.now(timezone.utc).isoformat(),
        'error': None,
        'result': None
    }
    save_job_record(job_record, data, save_callback, firebase_sync_callback)

    # Run directly on current thread
    _run_generation_job_worker(job_id, params, data, save_callback, firebase_sync_callback)

    final_job = get_job_status(job_id, data) or {}
    if final_job.get('status') in ['COMPLETED', 'PARTIAL']:
        return True, None, final_job.get('result')
    else:
        err = final_job.get('error') or "Generation job failed to generate questions."
        return False, err, None

execute_ai_generation_job_sync = run_generation_job_synchronous

def _run_generation_job_worker(
    job_id: str,
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any,
    firebase_sync_callback: Any
):
    print(f"[AI_JOB_START] Job {job_id} initiated for '{params.get('title')}'.", flush=True)
    
    job_record = get_job_status(job_id, data) or {}
    job_record['status'] = 'GENERATING'
    job_record['progressPct'] = 10
    job_record['currentStage'] = 'Loading Source Documents & Initializing Test Container...'
    save_job_record(job_record, data, save_callback, firebase_sync_callback)

    test_record = None
    test_id = f"tst-ai-{int(time.time() * 1000)}"

    try:
        # 1. Fetch source documents & existing questions for duplicate checking
        source_docs = data.get('ai_source_documents', [])
        existing_qs = data.get('questions', [])

        count = int(params.get('count', 5))
        chapter = params.get('chapter', '') or params.get('chapterName', '')
        chapter_id = params.get('chapterId', '')
        exam_level_id = params.get('examLevelId', 'foundation')
        platform_xp = float(params.get('platformXp', 10))
        allowed_plans = params.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite'])
        max_attempts = int(params.get('maxAttempts', 3))
        auto_publish = bool(params.get('autoPublish', True))
        marks_per_correct = float(params.get('marksPerCorrect', 2.0))
        negative_marks = float(params.get('negativeMarksPerWrong', 0.5))
        question_category = str(params.get('questionCategory') or job_record.get('questionCategory') or 'Direct Questions').strip()
        question_speed = str(params.get('questionSpeed') or job_record.get('questionSpeed') or 'Quick').strip()
        admin_description = str(params.get('description') or params.get('adminDescription') or '').strip()

        # Resolve Authoritative Chapter Metadata
        chapter_metadata = syllabus_hierarchy.get_authoritative_chapter_metadata(
            chapter_id=chapter_id,
            chapter_name=chapter or params.get('topic', ''),
            subject=params.get('subject', ''),
            exam_level=params.get('examLevel', ''),
            data=data
        )
        if chapter_metadata:
            chapter = chapter_metadata.get('chapterName', chapter)
            chapter_id = chapter_metadata.get('chapterId', chapter_id)
            if chapter_metadata.get('subjectId'):
                sub_id = chapter_metadata['subjectId']
            if chapter_metadata.get('subject') and not params.get('subject'):
                params['subject'] = chapter_metadata['subject']
            if chapter_metadata.get('examLevel') and not params.get('examLevel'):
                params['examLevel'] = chapter_metadata['examLevel']

        sub_id = params.get('subjectId') or sub_id
        if not sub_id:
            sub_map = {
                'Accounting': 'sub-1',
                'Business Law': 'sub-2',
                'Business Economics': 'sub-3',
                'Quantitative Aptitude': 'sub-4'
            }
            sub_id = sub_map.get(params.get('subject'), 'sub-1')

        # 2. Create and persist Draft Test record immediately in production DB
        now_utc = datetime.now(timezone.utc)
        now_iso = now_utc.isoformat()

        test_record = {
            'id': test_id,
            'title': params.get('title'),
            'description': params.get('description') or f"AI-Generated {params.get('difficulty')} Practice Test for {chapter or params.get('topic')}.",
            'subject': params.get('subject'),
            'subjectId': sub_id,
            'chapter': chapter,
            'chapterId': chapter_id,
            'topic': params.get('topic'),
            'examLevel': params.get('examLevel', 'CA Foundation'),
            'examLevelId': exam_level_id,
            'difficulty': params.get('difficulty', 'ICAI Exam Standard'),
            'questionCategory': question_category,
            'questionSpeed': question_speed,
            'durationMinutes': int(params.get('durationMinutes', 15)),
            'totalQuestions': 0,
            'marksPerCorrect': marks_per_correct,
            'negativeMarksPerWrong': negative_marks,
            'maximumMarks': 0.0,
            'allowedPlans': allowed_plans,
            'hideFromNonEligible': False,
            'isPublished': False,
            'status': 'Draft',
            'pointsPerCorrect': platform_xp,
            'platformXp': platform_xp,
            'unattemptedMarks': 0.0,
            'maxAttempts': max_attempts,
            'aiGenerated': True,
            'aiJobId': job_id,
            'createdAt': now_iso,
            'updatedAt': now_iso
        }

        if 'tests' not in data:
            data['tests'] = []
        if 'questions' not in data:
            data['questions'] = []

        data['tests'].insert(0, test_record)
        job_record['testId'] = test_id
        
        if save_callback:
            save_callback(data)
        if firebase_sync_callback:
            firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=False)
        save_job_record(job_record, data, save_callback, firebase_sync_callback)

        # 3. Incremental persistence callback: Persists each question to DB the instant it is verified
        def _on_question_verified_cb(q_record, all_qs, current_idx, total_count):
            q_record['testId'] = test_id
            q_record['points'] = platform_xp
            q_record['xp'] = platform_xp
            q_record['chapter'] = chapter
            q_record['chapterId'] = chapter_id
            q_record['examLevel'] = params.get('examLevel', 'CA Foundation')
            q_record['category'] = question_category
            q_record['questionCategory'] = question_category
            q_record['estimatedThinkingLevel'] = question_speed
            q_record['questionSpeed'] = question_speed

            # Insert question into authoritative data store
            data['questions'].append(q_record)
            
            # Incrementally update test record
            test_record['totalQuestions'] = len(all_qs)
            test_record['maximumMarks'] = round(len(all_qs) * marks_per_correct, 2)
            test_record['updatedAt'] = datetime.now(timezone.utc).isoformat()

            # Update job telemetry
            job_record['generatedCount'] = len(all_qs)
            job_record['currentQuestionIndex'] = len(all_qs)
            job_record['currentStage'] = f"Formulated & Verified Question {len(all_qs)} of {total_count}"
            job_record['progressPct'] = min(92, int((len(all_qs) / total_count) * 82) + 10)
            job_record['generatedQuestions'] = all_qs

            # Incremental DB & Cloud writes
            if save_callback:
                save_callback(data)
            if firebase_sync_callback:
                firebase_sync_callback(f"questions/{q_record['id']}", q_record, method='PUT', sync=False)
                firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=False)
            save_job_record(job_record, data, save_callback, firebase_sync_callback)

        def _on_progress_cb(p_info):
            job_record['currentStage'] = p_info.get('status', 'Generating MCQs...')
            if 'questionStatuses' in p_info:
                job_record['questionStatuses'] = p_info['questionStatuses']
            if 'progressPct' in p_info:
                job_record['progressPct'] = p_info['progressPct']
            if 'verifiedCount' in p_info:
                job_record['generatedCount'] = p_info['verifiedCount']
                job_record['currentQuestionIndex'] = p_info['verifiedCount']
            elif 'current' in p_info:
                job_record['currentQuestionIndex'] = len(job_record.get('generatedQuestions', []))
            if 'current' in p_info:
                job_record['currentSlotIndex'] = p_info['current']
            save_job_record(job_record, data, save_callback, firebase_sync_callback)

        # 4. Run MCQ Engine with incremental persistence and recovery
        questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject=params.get('subject', 'Accounting'),
            topic=params.get('topic', 'General'),
            count=count,
            exam_level=params.get('examLevel', 'CA Foundation'),
            difficulty=params.get('difficulty', 'ICAI Exam Standard'),
            question_category=question_category,
            question_speed=question_speed,
            test_id=test_id,
            source_documents=source_docs,
            existing_questions=existing_qs,
            job_id=job_id,
            marks_per_correct=marks_per_correct,
            negative_marks=negative_marks,
            progress_callback=_on_progress_cb,
            data=data,
            exam_level_id=exam_level_id,
            subject_id=sub_id,
            chapter=chapter,
            chapter_id=chapter_id,
            on_question_verified=_on_question_verified_cb,
            admin_description=admin_description,
            chapter_metadata=chapter_metadata
        )

        completed_iso = datetime.now(timezone.utc).isoformat()

        # 5. Finalize Test & Job States
        job_record['questionStatuses'] = metrics.get('questionStatuses', job_record.get('questionStatuses', []))
        job_record['metrics'] = metrics
        job_record['geminiGenerationCalls'] = metrics.get('geminiGenerationCalls', 0)
        job_record['validationCalls'] = metrics.get('validationCalls', 0)
        job_record['validationProvider'] = metrics.get('validationProvider', 'local')
        job_record['regenerationCount'] = metrics.get('regenerationCount', 0)

        job_record['completedAt'] = completed_iso
        job_record['lastHeartbeatAt'] = completed_iso
        job_record['validatedCount'] = len(questions)
        job_record['rejectedCount'] = metrics.get('rejectedDuplicates', 0) + metrics.get('rejectedValidation', 0)
        job_record['providersUsed'] = list(metrics.get('providersUsed', [])) or ['local_qwen']
        job_record['provider'] = 'LOCAL'
        job_record['model'] = 'qwen3:8b'
        job_record['runtime'] = 'Ollama'
        job_record['validationProvidersUsed'] = list(metrics.get('validationProvidersUsed', [])) or ['local']

        # Ensure all verified questions are preserved in data['questions']
        if data is not None and isinstance(data, dict):
            existing_q_ids = {q.get('id') for q in data.get('questions', []) if isinstance(q, dict)}
            for q in questions:
                if isinstance(q, dict) and q.get('id') and q.get('id') not in existing_q_ids:
                    data.setdefault('questions', []).append(q)
                    existing_q_ids.add(q.get('id'))
                    if firebase_sync_callback:
                        try:
                            firebase_sync_callback(f"questions/{q['id']}", q, method='PUT', sync=False)
                        except Exception:
                            pass

        if len(questions) == count:
            # Full completion: exactly requested count generated and verified
            test_record['totalQuestions'] = len(questions)
            test_record['maximumMarks'] = round(len(questions) * marks_per_correct, 2)
            test_record['isPublished'] = auto_publish
            test_record['status'] = 'Published' if auto_publish else 'Draft'
            test_record['updatedAt'] = completed_iso

            job_record['status'] = 'COMPLETED'
            job_record['progressPct'] = 100
            job_record['currentStage'] = 'Test Hosted & Published Successfully!'
            job_record['generatedCount'] = len(questions)
            job_record['failedCount'] = 0
            job_record['result'] = {
                'test': test_record,
                'questions': questions,
                'metrics': metrics,
                'job': dict(job_record)
            }
            if firebase_sync_callback:
                firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=False)

        elif len(questions) > 0:
            # Partial completion: persist verified questions, update test record, never freeze or silently discard
            test_record['totalQuestions'] = len(questions)
            test_record['maximumMarks'] = round(len(questions) * marks_per_correct, 2)
            test_record['isPublished'] = auto_publish
            test_record['status'] = 'Published' if auto_publish else 'Draft'
            test_record['updatedAt'] = completed_iso

            job_record['status'] = 'PARTIAL'
            job_record['progressPct'] = int((len(questions) / count) * 100) if count > 0 else 50
            job_record['currentStage'] = f"Partial Success: {len(questions)} of {count} questions verified and hosted."
            job_record['generatedCount'] = len(questions)
            job_record['failedCount'] = count - len(questions)
            job_record['error'] = f"Partial generation: {len(questions)} of {count} questions verified after retries."
            job_record['result'] = {
                'test': test_record,
                'questions': questions,
                'metrics': metrics,
                'job': dict(job_record)
            }
            if firebase_sync_callback:
                firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=False)

        else:
            # 0 questions generated: Clean up empty test container
            data['tests'] = [t for t in data.get('tests', []) if t.get('id') != test_id]
            if firebase_sync_callback:
                try:
                    firebase_sync_callback(f"tests/{test_id}", None, method='DELETE', sync=True)
                except Exception:
                    pass

            job_record['status'] = 'FAILED'
            job_record['error'] = f"Incomplete generation: 0 of {count} questions could be verified."
            job_record['currentStage'] = f"Failed: 0 of {count} questions verified."
            job_record['generatedCount'] = 0
            job_record['failedCount'] = count
            job_record['progressPct'] = 0
            job_record['result'] = None

        # 6. Telemetry Log
        if 'ai_generation_logs' not in data:
            data['ai_generation_logs'] = []

        log_record = {
            'id': f"log-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
            'jobId': job_id,
            'testId': test_id,
            'testTitle': test_record.get('title', 'MCQ Test') if len(questions) > 0 else 'Failed Generation',
            'subject': params.get('subject'),
            'topic': params.get('topic'),
            'chapter': params.get('chapter', chapter or ''),
            'provider': 'LOCAL',
            'model': 'qwen3:8b',
            'runtime': 'Ollama',
            'questionCategory': question_category,
            'questionSpeed': question_speed,
            'requestedCount': count,
            'generatedCount': len(questions),
            'failedCount': metrics.get('failedCount', count - len(questions)),
            'questionStatuses': metrics.get('questionStatuses', []),
            'rejectedDuplicates': metrics.get('rejectedDuplicates', 0),
            'rejectedValidation': metrics.get('rejectedValidation', 0),
            'regenerationAttempts': metrics.get('regenerationAttempts', 0),
            'durationSeconds': metrics.get('durationSeconds', 0),
            'providersUsed': list(metrics.get('providersUsed', [])) or ['local_qwen'],
            'validationProvidersUsed': list(metrics.get('validationProvidersUsed', [])) or ['local'],
            'status': job_record['status'],
            'isPublished': auto_publish if len(questions) > 0 else False,
            'timestamp': completed_iso
        }
        data['ai_generation_logs'].insert(0, log_record)

        # 7. Authoritative Sync
        if save_callback:
            save_callback(data)

        if firebase_sync_callback:
            if len(questions) > 0:
                firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=True)
            firebase_sync_callback(f"ai_generation_logs/{log_record['id']}", log_record, method='PUT', sync=False)

        save_job_record(job_record, data, save_callback, firebase_sync_callback)
        print(f"[AI_JOB_COMPLETE] Job {job_id} finished with status '{job_record['status']}'. Created test {test_id} with {len(questions)} MCQs.", flush=True)

    except Exception as e:
        err_msg = str(e)
        print(f"[AI_JOB_ERROR] Job {job_id} failed with exception: {err_msg}", flush=True)
        job_record['status'] = 'FAILED'
        job_record['error'] = err_msg
        job_record['currentStage'] = f"Error: {err_msg}"
        
        # Purge empty test if 0 questions generated
        if test_record and test_record.get('totalQuestions', 0) == 0:
            data['tests'] = [t for t in data.get('tests', []) if t.get('id') != test_id]
            if firebase_sync_callback:
                try:
                    firebase_sync_callback(f"tests/{test_id}", None, method='DELETE', sync=True)
                except Exception:
                    pass

        save_job_record(job_record, data, save_callback, firebase_sync_callback)

# ======================================================================
# OUTBOUND LOCAL QWEN WORKER INTEGRATION (FOR PRODUCTION / VERCEL)
# ======================================================================

def update_worker_heartbeat(
    worker_payload: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any = None,
    firebase_sync_callback: Any = None
) -> Dict[str, Any]:
    """
    Record heartbeat received outbound from local administrator machine worker.
    """
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    now_ts = now_utc.timestamp()

    worker_id = str(worker_payload.get('workerId', 'worker-laptop-01')).strip()
    status_obj = {
        'workerId': worker_id,
        'status': 'online',
        'model': str(worker_payload.get('model', 'qwen3:8b')),
        'runtime': str(worker_payload.get('runtime', 'Ollama (127.0.0.1:11434 on Admin Machine)')),
        'ollamaUrl': str(worker_payload.get('ollamaUrl', 'http://127.0.0.1:11434')),
        'ollamaHealthy': bool(worker_payload.get('ollamaHealthy', True)),
        'lastLatencyMs': worker_payload.get('lastLatencyMs'),
        'currentJobId': worker_payload.get('currentJobId'),
        'currentJobTitle': worker_payload.get('currentJobTitle'),
        'system': worker_payload.get('system', {}),
        'lastHeartbeatAt': now_iso,
        'lastHeartbeatTs': now_ts
    }
    
    if data is not None and isinstance(data, dict):
        data['ai_worker_status'] = status_obj
        if save_callback:
            try:
                save_callback(data)
            except Exception:
                pass

    if firebase_sync_callback:
        try:
            firebase_sync_callback('ai_worker_status', status_obj, method='PUT', sync=False)
        except Exception:
            pass

    return status_obj

def get_worker_status(data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Check if a local Qwen worker is currently registered and active.
    Heartbeats older than 60s are treated as offline.
    """
    fallback = {
        'online': False,
        'isOnline': False,
        'workerOnline': False,
        'status': 'offline',
        'error': 'Local Qwen Worker Offline',
        'model': 'qwen3:8b',
        'runtime': 'Ollama (127.0.0.1:11434 on Admin Machine)',
        'lastHeartbeatSecondsAgo': 9999,
        'secondsSinceHeartbeat': 9999
    }
    if not data or not isinstance(data, dict):
        return fallback

    w = data.get('ai_worker_status')
    if not w or not isinstance(w, dict):
        return fallback

    last_ts = w.get('lastHeartbeatTs', 0)
    if not last_ts and w.get('lastHeartbeatAt'):
        try:
            last_ts = datetime.fromisoformat(str(w['lastHeartbeatAt']).replace('Z', '+00:00')).timestamp()
        except Exception:
            last_ts = 0

    now_ts = time.time()
    is_fresh = bool(last_ts > 0 and (now_ts - last_ts) <= 60.0)
    ollama_ok = bool(w.get('ollamaHealthy', True))
    sec_ago = round(now_ts - last_ts, 1) if last_ts > 0 else 9999

    w_copy = dict(w)
    w_copy['workerOnline'] = is_fresh
    w_copy['online'] = bool(is_fresh and ollama_ok)
    w_copy['isOnline'] = w_copy['online']
    w_copy['secondsSinceHeartbeat'] = sec_ago
    w_copy['lastHeartbeatSecondsAgo'] = sec_ago

    if not is_fresh:
        w_copy['status'] = 'offline'
        w_copy['error'] = 'Local Qwen Worker Offline'
    elif not ollama_ok:
        w_copy['status'] = 'ollama_offline'
        w_copy['error'] = 'Worker connected, but local Ollama daemon is unreachable'
    else:
        w_copy['status'] = 'online'
        w_copy['error'] = None

    return w_copy

def claim_pending_job_for_worker(
    worker_id: str,
    data: Dict[str, Any],
    save_callback: Any = None,
    firebase_sync_callback: Any = None
) -> Optional[Dict[str, Any]]:
    """
    Atomically claim the oldest pending QUEUED job for an outbound worker.
    Recovers orphaned jobs stalled in CLAIMED status for > 180s.
    """
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    now_ts = now_utc.timestamp()

    with _jobs_lock:
        all_jobs = []
        if data and isinstance(data.get('ai_generation_jobs'), list):
            all_jobs = data['ai_generation_jobs']
        
        # Merge memory jobs
        for mem_j in _active_jobs.values():
            if not any(j.get('id') == mem_j.get('id') for j in all_jobs):
                all_jobs.append(mem_j)

        # Sort by creation time (FIFO)
        def _get_ts(j):
            return j.get('createdTs', 0)
        all_jobs = sorted(all_jobs, key=_get_ts)

        target_job = None
        for j in all_jobs:
            st = j.get('status')
            if st == 'QUEUED':
                target_job = j
                break
            # Check for orphaned claimed job whose previous worker died
            if st in ('CLAIMED', 'PROCESSING'):
                last_hb = j.get('lastHeartbeatAt')
                last_hb_ts = 0
                if last_hb:
                    try:
                        last_hb_ts = datetime.fromisoformat(str(last_hb).replace('Z', '+00:00')).timestamp()
                    except Exception:
                        last_hb_ts = 0
                if (now_ts - last_hb_ts) > 180:
                    print(f"[WORKER_RECOVER_ORPHAN] Re-claiming orphaned job {j.get('id')} (inactive > 180s)", flush=True)
                    target_job = j
                    break

        if not target_job:
            return None

        job_id = target_job.get('id')
        target_job['status'] = 'CLAIMED'
        target_job['workerId'] = worker_id
        target_job['claimedAt'] = now_iso
        target_job['startedAt'] = target_job.get('startedAt') or now_iso
        target_job['lastHeartbeatAt'] = now_iso
        target_job['currentStage'] = f"Claimed by Local Qwen Worker ({worker_id}). Preparing inference..."
        _active_jobs[job_id] = dict(target_job)

    save_job_record(target_job, data, save_callback, firebase_sync_callback)
    print(f"[WORKER_CLAIM_SUCCESS] Worker {worker_id} successfully claimed job {job_id} ('{target_job.get('title')}').", flush=True)
    return dict(target_job)

def update_job_progress_from_worker(
    job_id: str,
    *args,
    **kwargs
) -> Tuple[bool, Optional[str]]:
    """
    Update live execution progress received from worker.
    Supports flexible signatures:
    - (job_id, stage, progress, verified_count, data, save_callback, firebase_sync_callback)
    - (job_id, worker_id, progress_pct, current_stage, verified_count, question_statuses, data, save_callback, firebase_sync_callback)
    - Keyword arguments
    """
    stage = kwargs.get('stage') or kwargs.get('current_stage') or 'Processing...'
    progress = kwargs.get('progress') or kwargs.get('progress_pct', 50)
    verified_count = kwargs.get('verified_count', 0)
    data = kwargs.get('data')
    save_callback = kwargs.get('save_callback')
    firebase_sync_callback = kwargs.get('firebase_sync_callback')
    worker_id = kwargs.get('worker_id')
    question_statuses = kwargs.get('question_statuses')

    if len(args) >= 6 and isinstance(args[5], dict):
        worker_id = args[0]
        progress = args[1]
        stage = args[2]
        verified_count = args[3]
        question_statuses = args[4]
        data = args[5]
        if len(args) > 6: save_callback = args[6]
        if len(args) > 7: firebase_sync_callback = args[7]
    elif len(args) >= 4 and isinstance(args[3], dict):
        stage = args[0]
        progress = args[1]
        verified_count = args[2]
        data = args[3]
        if len(args) > 4: save_callback = args[4]
        if len(args) > 5: firebase_sync_callback = args[5]

    now_iso = datetime.now(timezone.utc).isoformat()
    job = get_job_status(job_id, data)
    if not job:
        return False, "Job not found"

    with _jobs_lock:
        job['status'] = 'PROCESSING'
        if worker_id:
            job['workerId'] = worker_id
        job['progressPct'] = min(95, max(5, int(progress)))
        job['currentStage'] = str(stage)
        job['generatedCount'] = int(verified_count)
        job['lastHeartbeatAt'] = now_iso
        if question_statuses is not None and isinstance(question_statuses, list):
            job['questionStatuses'] = question_statuses
        _active_jobs[job_id] = dict(job)

    save_job_record(job, data, save_callback, firebase_sync_callback)
    return True, None

def complete_job_from_worker(
    job_id: str,
    questions: List[Dict[str, Any]],
    metrics: Dict[str, Any],
    *args,
    **kwargs
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Finalize a job submitted by the local Qwen worker.
    Guarantees idempotency: hosts test, commits questions, logs telemetry, and marks job completed.
    Supports flexible positional arguments:
    - (job_id, questions, metrics, data, save_callback, firebase_sync_callback)
    - (job_id, questions, metrics, worker_id, data, save_callback, firebase_sync_callback)
    """
    worker_id = kwargs.get('worker_id')
    data = kwargs.get('data')
    save_callback = kwargs.get('save_callback')
    firebase_sync_callback = kwargs.get('firebase_sync_callback')

    if len(args) >= 2 and isinstance(args[1], dict):
        worker_id = args[0]
        data = args[1]
        if len(args) > 2: save_callback = args[2]
        if len(args) > 3: firebase_sync_callback = args[3]
    elif len(args) >= 1 and isinstance(args[0], dict):
        data = args[0]
        if len(args) > 1: save_callback = args[1]
        if len(args) > 2: firebase_sync_callback = args[2]

    if not worker_id and metrics and isinstance(metrics, dict):
        worker_id = metrics.get('workerId')

    now_utc = datetime.now(timezone.utc)
    completed_iso = now_utc.isoformat()

    job_record = get_job_status(job_id, data)
    if not job_record:
        return False, "Job not found", None

    # Idempotency check: if job already COMPLETED, return cleanly without duplicating
    if job_record.get('status') == 'COMPLETED':
        return True, None, job_record.get('result')

    count = int(job_record.get('count', len(questions)))
    auto_publish = bool(job_record.get('autoPublish', True))
    marks_per_correct = float(job_record.get('marksPerCorrect', 2.0))
    negative_marks = float(job_record.get('negativeMarksPerWrong', 0.5))
    platform_xp = float(job_record.get('platformXp', 10.0))
    allowed_plans = job_record.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite'])
    max_attempts = int(job_record.get('maxAttempts', 3))
    exam_level_id = job_record.get('examLevelId', 'foundation')
    chapter = job_record.get('chapter', '')
    chapter_id = job_record.get('chapterId', '')

    test_id = job_record.get('testId') or f"tst-ai-{int(now_utc.timestamp() * 1000)}"
    job_record['testId'] = test_id

    # 1. Preserve verified questions in data['questions']
    if data is not None and isinstance(data, dict):
        existing_q_ids = {q.get('id') for q in data.get('questions', []) if isinstance(q, dict)}
        for q in questions:
            if isinstance(q, dict):
                q['testId'] = test_id
                if q.get('id') not in existing_q_ids:
                    data.setdefault('questions', []).append(q)
                    existing_q_ids.add(q.get('id'))
                    if firebase_sync_callback:
                        try:
                            firebase_sync_callback(f"questions/{q['id']}", q, method='PUT', sync=False)
                        except Exception:
                            pass

    # 2. Construct / update Test record
    test_record = None
    if data is not None and isinstance(data.get('tests'), list):
        test_record = next((t for t in data['tests'] if t.get('id') == test_id or t.get('aiJobId') == job_id), None)

    if not test_record:
        test_record = {
            'id': test_id,
            'title': job_record.get('title', 'AI-Generated Practice Test'),
            'description': job_record.get('description') or f"AI-Generated {job_record.get('difficulty')} Practice Test for {chapter or job_record.get('topic')}.",
            'subject': job_record.get('subject'),
            'subjectId': job_record.get('subjectId', 'sub-1'),
            'chapter': chapter,
            'chapterId': chapter_id,
            'topic': job_record.get('topic'),
            'examLevel': job_record.get('examLevel', 'CA Foundation'),
            'examLevelId': exam_level_id,
            'difficulty': job_record.get('difficulty', 'ICAI Exam Standard'),
            'questionCategory': job_record.get('questionCategory', 'Direct Questions'),
            'questionSpeed': job_record.get('questionSpeed', 'Quick'),
            'durationMinutes': int(job_record.get('durationMinutes', 15)),
            'totalQuestions': len(questions),
            'marksPerCorrect': marks_per_correct,
            'negativeMarksPerWrong': negative_marks,
            'maximumMarks': round(len(questions) * marks_per_correct, 2),
            'allowedPlans': allowed_plans,
            'hideFromNonEligible': False,
            'isPublished': auto_publish,
            'status': 'Published' if auto_publish else 'Draft',
            'pointsPerCorrect': platform_xp,
            'platformXp': platform_xp,
            'unattemptedMarks': 0.0,
            'maxAttempts': max_attempts,
            'aiGenerated': True,
            'aiJobId': job_id,
            'generatedQuestions': list(questions),
            'createdAt': completed_iso,
            'updatedAt': completed_iso
        }
        if data is not None and isinstance(data, dict):
            data.setdefault('tests', []).insert(0, test_record)
    else:
        test_record['totalQuestions'] = len(questions)
        test_record['maximumMarks'] = round(len(questions) * marks_per_correct, 2)
        test_record['isPublished'] = auto_publish
        test_record['status'] = 'Published' if auto_publish else 'Draft'
        test_record['updatedAt'] = completed_iso
        test_record['generatedQuestions'] = list(questions)

    # 3. Finalize Job Record
    with _jobs_lock:
        job_record['workerId'] = worker_id
        job_record['completedAt'] = completed_iso
        job_record['lastHeartbeatAt'] = completed_iso
        job_record['generatedCount'] = len(questions)
        job_record['validatedCount'] = len(questions)
        job_record['failedCount'] = max(0, count - len(questions))
        job_record['metrics'] = metrics
        job_record['provider'] = 'LOCAL'
        job_record['model'] = 'qwen3:8b'
        job_record['runtime'] = 'Ollama'
        job_record['providersUsed'] = ['local_qwen']
        job_record['validationProvidersUsed'] = ['local']

        if len(questions) == count:
            job_record['status'] = 'COMPLETED'
            job_record['progressPct'] = 100
            job_record['currentStage'] = 'Test Hosted & Published Successfully!'
        elif len(questions) > 0:
            job_record['status'] = 'PARTIAL'
            job_record['progressPct'] = int((len(questions) / count) * 100) if count > 0 else 50
            job_record['currentStage'] = f"Partial Success: {len(questions)} of {count} questions verified and hosted."
        else:
            job_record['status'] = 'FAILED'
            job_record['progressPct'] = 0
            job_record['currentStage'] = 'Failed: 0 questions verified.'

        job_record['result'] = {
            'test': test_record,
            'questions': questions,
            'metrics': metrics,
            'job': dict(job_record)
        }
        _active_jobs[job_id] = dict(job_record)

    # 4. Record Telemetry Log
    if data is not None and isinstance(data, dict):
        if 'ai_generation_logs' not in data:
            data['ai_generation_logs'] = []
        log_record = {
            'id': f"log-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
            'jobId': job_id,
            'testId': test_id,
            'testTitle': test_record.get('title', 'MCQ Test') if len(questions) > 0 else 'Failed Generation',
            'subject': job_record.get('subject'),
            'topic': job_record.get('topic'),
            'chapter': chapter,
            'provider': 'LOCAL',
            'model': 'qwen3:8b',
            'runtime': 'Ollama',
            'workerId': worker_id,
            'questionCategory': job_record.get('questionCategory', 'Direct Questions'),
            'questionSpeed': job_record.get('questionSpeed', 'Quick'),
            'requestedCount': count,
            'generatedCount': len(questions),
            'failedCount': max(0, count - len(questions)),
            'questionStatuses': metrics.get('questionStatuses', job_record.get('questionStatuses', [])),
            'rejectedDuplicates': metrics.get('rejectedDuplicates', 0),
            'rejectedValidation': metrics.get('rejectedValidation', 0),
            'regenerationAttempts': metrics.get('regenerationAttempts', 0),
            'durationSeconds': metrics.get('durationSeconds', 0),
            'providersUsed': ['local_qwen'],
            'validationProvidersUsed': ['local'],
            'status': job_record['status'],
            'isPublished': auto_publish if len(questions) > 0 else False,
            'timestamp': completed_iso
        }
        data['ai_generation_logs'].insert(0, log_record)

        # 5. Link with Auto-Pilot scheduled task if applicable
        sched_id = job_record.get('scheduledTaskId')
        if sched_id and isinstance(data.get('ai_scheduled_tasks'), list):
            for t in data['ai_scheduled_tasks']:
                if t.get('id') == sched_id:
                    t['lastRunAt'] = completed_iso
                    t['lastJobId'] = job_id
                    t['lastTestId'] = test_id
                    t['lastTestTitle'] = test_record.get('title')
                    t['lastError'] = None
                    t['executionCount'] = t.get('executionCount', 0) + 1
                    t['updatedAt'] = completed_iso
                    if bool(t.get('isLiveEvent', True)):
                        t['status'] = 'live'
                    elif t.get('scheduleType') == 'recurring':
                        t['status'] = 'scheduled'
                    else:
                        t['status'] = 'completed'
                    if firebase_sync_callback:
                        try:
                            firebase_sync_callback(f"ai_scheduled_tasks/{sched_id}", t, method='PUT', sync=True)
                        except Exception:
                            pass
                    break

        if save_callback:
            save_callback(data)

    if firebase_sync_callback:
        try:
            if len(questions) > 0:
                firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=False)
            firebase_sync_callback(f"ai_generation_jobs/{job_id}", job_record, method='PUT', sync=False)
        except Exception:
            pass

    save_job_record(job_record, data, save_callback, firebase_sync_callback)
    print(f"[WORKER_JOB_COMPLETE] Job {job_id} successfully finalized by worker {worker_id}. Created test {test_id} with {len(questions)} MCQs.", flush=True)
    return True, None, job_record.get('result')

def fail_job_from_worker(
    job_id: str,
    error_msg: str,
    worker_id: str,
    data: Dict[str, Any],
    save_callback: Any = None,
    firebase_sync_callback: Any = None
) -> bool:
    """
    Mark a job failed as reported by the worker.
    """
    job = get_job_status(job_id, data)
    if not job:
        return False
    with _jobs_lock:
        job['status'] = 'FAILED'
        job['workerId'] = worker_id
        job['error'] = error_msg
        job['currentStage'] = f"Failed by worker: {error_msg}"
        job['lastHeartbeatAt'] = datetime.now(timezone.utc).isoformat()
        _active_jobs[job_id] = dict(job)

    # If linked to scheduled task, update task status as well
    sched_id = job.get('scheduledTaskId')
    if sched_id and data and isinstance(data.get('ai_scheduled_tasks'), list):
        for t in data['ai_scheduled_tasks']:
            if t.get('id') == sched_id:
                t['status'] = 'failed'
                t['lastError'] = error_msg
                t['updatedAt'] = datetime.now(timezone.utc).isoformat()
                if firebase_sync_callback:
                    try:
                        firebase_sync_callback(f"ai_scheduled_tasks/{sched_id}", t, method='PUT', sync=True)
                    except Exception:
                        pass
                break

    save_job_record(job, data, save_callback, firebase_sync_callback)
    return True
