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

# Active jobs in memory cache
_active_jobs: Dict[str, Dict[str, Any]] = {}
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
    """
    with _jobs_lock:
        job = _active_jobs.get(job_id)
        if job:
            return dict(job)
    if data and isinstance(data, dict):
        jobs = data.get('ai_generation_jobs', [])
        if isinstance(jobs, dict):
            jobs = list(jobs.values())
        elif not isinstance(jobs, list):
            jobs = []
        for j in jobs:
            if isinstance(j, dict) and j.get('id') == job_id:
                with _jobs_lock:
                    _active_jobs[job_id] = dict(j)
                return dict(j)
    return None

def get_active_generation_job(data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Retrieve the most recent active generation job (QUEUED, PROCESSING, GENERATING)
    created within the last 15 minutes to restore UI on page refresh.
    """
    now_ts = time.time()
    active_statuses = {'QUEUED', 'PROCESSING', 'GENERATING'}
    
    with _jobs_lock:
        for j in sorted(_active_jobs.values(), key=lambda x: x.get('createdTs', 0), reverse=True):
            if j.get('status') in active_statuses and (now_ts - j.get('createdTs', 0)) < 900:
                return dict(j)

    if data and isinstance(data, dict):
        try:
            jobs = data.get('ai_generation_jobs', [])
            if isinstance(jobs, dict):
                jobs = list(jobs.values())
            elif not isinstance(jobs, list):
                jobs = []
            for j in sorted(jobs, key=lambda x: (isinstance(x, dict) and x.get('createdTs', 0)) or 0, reverse=True):
                if isinstance(j, dict) and j.get('status') in active_statuses and (now_ts - j.get('createdTs', 0)) < 900:
                    with _jobs_lock:
                        _active_jobs[j['id']] = dict(j)
                    return dict(j)
        except Exception:
            pass
    return None

def create_generation_job(
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any,
    firebase_sync_callback: Any
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate parameters and queue a background MCQ generation job.
    Persists job record immediately to production DB before launching worker.
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
                j.get('status') in ['QUEUED', 'PROCESSING', 'GENERATING']):
                return True, None, j

    job_id = f"job-ai-{int(now_ts * 1000)}-{uuid.uuid4().hex[:6]}"
    chapter = params.get('chapter', '') or params.get('chapterName', '')
    chapter_id = params.get('chapterId', '')
    exam_level_id = params.get('examLevelId', 'foundation')
    platform_xp = float(params.get('platformXp', 10))
    allowed_plans = params.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite'])
    question_category = str(params.get('questionCategory') or 'Direct Questions').strip()
    question_speed = str(params.get('questionSpeed') or 'Quick').strip()

    job_record = {
        'id': job_id,
        'title': title,
        'subject': subject,
        'subjectId': params.get('subjectId', 'sub-1'),
        'chapter': chapter,
        'chapterId': chapter_id,
        'topic': topic,
        'examLevel': params.get('examLevel', 'CA Foundation'),
        'examLevelId': exam_level_id,
        'difficulty': params.get('difficulty', 'ICAI Exam Standard'),
        'questionCategory': question_category,
        'questionSpeed': question_speed,
        'durationMinutes': int(params.get('durationMinutes', 15)),
        'count': count,
        'requestedCount': count,
        'generatedCount': 0,
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
        'currentStage': 'Initializing Generation Pipeline...',
        'currentQuestionIndex': 0,
        'totalQuestions': count,
        'generatedQuestions': [],
        'questionStatuses': [{'number': s, 'status': 'pending', 'error': None, 'provider': None} for s in range(1, count + 1)],
        'testId': None,
        'createdTs': now_ts,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'error': None,
        'result': None
    }

    # Persist job record immediately in DB & Firebase
    save_job_record(job_record, data, save_callback, firebase_sync_callback)

    # Launch worker in background thread
    worker_thread = threading.Thread(
        target=_run_generation_job_worker,
        args=(job_id, params, data, save_callback, firebase_sync_callback),
        daemon=True
    )
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
        'title': title,
        'subject': subject,
        'subjectId': params.get('subjectId', 'sub-1'),
        'chapter': chapter,
        'chapterId': chapter_id,
        'topic': topic,
        'examLevel': params.get('examLevel', 'CA Foundation'),
        'examLevelId': exam_level_id,
        'difficulty': params.get('difficulty', 'ICAI Exam Standard'),
        'questionCategory': question_category,
        'questionSpeed': question_speed,
        'durationMinutes': int(params.get('durationMinutes', 15)),
        'count': count,
        'requestedCount': count,
        'generatedCount': 0,
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
        'error': None,
        'result': None
    }
    save_job_record(job_record, data, save_callback, firebase_sync_callback)

    # Run directly on current thread
    _run_generation_job_worker(job_id, params, data, save_callback, firebase_sync_callback)

    final_job = get_job_status(job_id, data) or {}
    if final_job.get('status') in ['COMPLETED', 'PARTIAL', 'PARTIALLY_COMPLETED']:
        return True, None, final_job.get('result')
    else:
        err = final_job.get('error') or "Generation job failed to complete."
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

        sub_id = params.get('subjectId')
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
            admin_description=admin_description
        )

        completed_iso = datetime.now(timezone.utc).isoformat()

        # 5. Finalize Test & Job States
        job_record['questionStatuses'] = metrics.get('questionStatuses', job_record.get('questionStatuses', []))
        job_record['metrics'] = metrics
        job_record['geminiGenerationCalls'] = metrics.get('geminiGenerationCalls', 0)
        job_record['validationCalls'] = metrics.get('validationCalls', 0)
        job_record['validationProvider'] = metrics.get('validationProvider', 'local')
        job_record['regenerationCount'] = metrics.get('regenerationCount', 0)

        if len(questions) == count:
            # Full completion
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

        elif len(questions) > 0:
            # Partial completion: some MCQs generated safely
            test_record['totalQuestions'] = len(questions)
            test_record['maximumMarks'] = round(len(questions) * marks_per_correct, 2)
            test_record['isPublished'] = auto_publish
            test_record['status'] = 'Published' if auto_publish else 'Draft'
            test_record['updatedAt'] = completed_iso

            job_record['status'] = 'PARTIAL'
            job_record['progressPct'] = 100
            job_record['currentStage'] = f"Partially Completed: {len(questions)} of {count} MCQs generated & hosted."
            job_record['generatedCount'] = len(questions)
            job_record['failedCount'] = count - len(questions)
            job_record['result'] = {
                'test': test_record,
                'questions': questions,
                'metrics': metrics,
                'job': dict(job_record)
            }

        else:
            # Complete failure: 0 questions produced
            # Purge empty test from DB so no empty test is displayed
            data['tests'] = [t for t in data.get('tests', []) if t.get('id') != test_id]
            if firebase_sync_callback:
                firebase_sync_callback(f"tests/{test_id}", None, method='DELETE', sync=True)

            job_record['status'] = 'FAILED'
            job_record['error'] = 'Failed to generate valid questions after maximum attempts.'
            job_record['currentStage'] = 'Failed: No valid questions generated.'
            job_record['failedCount'] = count

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
            'providersUsed': list(metrics.get('providersUsed', [])),
            'validationProvidersUsed': list(metrics.get('validationProvidersUsed', [])),
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
