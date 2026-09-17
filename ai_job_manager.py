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

# Active jobs in memory
_active_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _active_jobs.get(job_id)
        if job:
            return dict(job)
    return None

def create_generation_job(
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any,
    firebase_sync_callback: Any
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate parameters and queue a background MCQ generation job.
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
            'durationMinutes': int(params.get('durationMinutes', 15)),
            'count': count,
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
            'createdTs': now_ts,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'error': None,
            'result': None
        }
        _active_jobs[job_id] = job_record

    # Launch worker in background thread
    worker_thread = threading.Thread(
        target=_run_generation_job_worker,
        args=(job_id, params, data, save_callback, firebase_sync_callback),
        daemon=True
    )
    worker_thread.start()

    return True, None, job_record

def _run_generation_job_worker(
    job_id: str,
    params: Dict[str, Any],
    data: Dict[str, Any],
    save_callback: Any,
    firebase_sync_callback: Any
):
    print(f"[AI_JOB_START] Job {job_id} initiated for '{params.get('title')}'.", flush=True)
    
    with _jobs_lock:
        if job_id in _active_jobs:
            _active_jobs[job_id]['status'] = 'PROCESSING'
            _active_jobs[job_id]['progressPct'] = 10
            _active_jobs[job_id]['currentStage'] = 'Loading Source Documents & Analyzing Knowledge Base...'

    try:
        # 1. Fetch source documents & existing questions for duplicate checking
        source_docs = data.get('ai_source_documents', [])
        existing_qs = data.get('questions', [])

        def _on_progress(p_info):
            with _jobs_lock:
                if job_id in _active_jobs:
                    _active_jobs[job_id]['status'] = 'GENERATING'
                    _active_jobs[job_id]['progressPct'] = p_info.get('progressPct', 20)
                    _active_jobs[job_id]['currentStage'] = p_info.get('status', 'Generating MCQs...')
                    _active_jobs[job_id]['currentQuestionIndex'] = p_info.get('current', 0)

        # 2. Run MCQ Engine with recovery loop
        count = int(params.get('count', 5))
        test_id = f"tst-ai-{int(time.time() * 1000)}"
        
        chapter = params.get('chapter', '') or params.get('chapterName', '')
        chapter_id = params.get('chapterId', '')
        exam_level_id = params.get('examLevelId', 'foundation')
        platform_xp = float(params.get('platformXp', 10))
        allowed_plans = params.get('allowedPlans', ['free', 'trial', 'core', 'plus', 'elite'])
        max_attempts = int(params.get('maxAttempts', 3))

        # Map subjectId if needed
        sub_id = params.get('subjectId')
        if not sub_id:
            sub_map = {
                'Accounting': 'sub-1',
                'Business Law': 'sub-2',
                'Business Economics': 'sub-3',
                'Quantitative Aptitude': 'sub-4'
            }
            sub_id = sub_map.get(params.get('subject'), 'sub-1')

        questions, metrics = ai_mcq_engine.generate_exact_mcqs_pipeline(
            subject=params.get('subject', 'Accounting'),
            topic=params.get('topic', 'General'),
            count=count,
            exam_level=params.get('examLevel', 'CA Foundation'),
            difficulty=params.get('difficulty', 'ICAI Exam Standard'),
            test_id=test_id,
            source_documents=source_docs,
            existing_questions=existing_qs,
            job_id=job_id,
            marks_per_correct=float(params.get('marksPerCorrect', 2.0)),
            negative_marks=float(params.get('negativeMarksPerWrong', 0.5)),
            progress_callback=_on_progress,
            data=data,
            exam_level_id=exam_level_id,
            subject_id=sub_id,
            chapter=chapter,
            chapter_id=chapter_id
        )

        with _jobs_lock:
            if job_id in _active_jobs:
                _active_jobs[job_id]['generatedQuestions'] = questions
                _active_jobs[job_id]['status'] = 'SAVING'
                _active_jobs[job_id]['progressPct'] = 92
                _active_jobs[job_id]['currentStage'] = 'Hosting Test and Saving to Database...'

        # 3. Create Test Record
        now_utc = datetime.now(timezone.utc)
        now_iso = now_utc.isoformat()
        auto_publish = bool(params.get('autoPublish', True))
        marks_per_correct = float(params.get('marksPerCorrect', 2.0))
        max_marks = float(len(questions) * marks_per_correct)

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
            'durationMinutes': int(params.get('durationMinutes', 15)),
            'totalQuestions': len(questions),
            'marksPerCorrect': marks_per_correct,
            'negativeMarksPerWrong': float(params.get('negativeMarksPerWrong', 0.5)),
            'maximumMarks': max_marks,
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
            'createdAt': now_iso,
            'updatedAt': now_iso
        }

        # 4. Insert Test and Questions into memory data store
        if 'tests' not in data:
            data['tests'] = []
        if 'questions' not in data:
            data['questions'] = []
            
        data['tests'].insert(0, test_record)
        for q in questions:
            q['testId'] = test_id
            q['points'] = platform_xp
            q['xp'] = platform_xp
            q['chapter'] = chapter
            q['chapterId'] = chapter_id
            q['examLevel'] = params.get('examLevel', 'CA Foundation')
            data['questions'].append(q)

        # 5. Create Telemetry Log
        if 'ai_generation_logs' not in data:
            data['ai_generation_logs'] = []

        log_record = {
            'id': f"log-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
            'jobId': job_id,
            'testId': test_id,
            'testTitle': test_record['title'],
            'subject': test_record['subject'],
            'topic': test_record['topic'],
            'requestedCount': count,
            'generatedCount': len(questions),
            'rejectedDuplicates': metrics.get('rejectedDuplicates', 0),
            'rejectedValidation': metrics.get('rejectedValidation', 0),
            'regenerationAttempts': metrics.get('regenerationAttempts', 0),
            'durationSeconds': metrics.get('durationSeconds', 0),
            'providersUsed': metrics.get('providersUsed', []),
            'validationProvidersUsed': metrics.get('validationProvidersUsed', []),
            'status': 'COMPLETED' if len(questions) == count else 'PARTIALLY_FAILED',
            'isPublished': auto_publish,
            'timestamp': now_iso
        }
        data['ai_generation_logs'].insert(0, log_record)

        # 6. Synchronous Persistence to disk and Firebase RTDB
        if save_callback:
            save_callback(data)

        if firebase_sync_callback:
            firebase_sync_callback(f"tests/{test_id}", test_record, method='PUT', sync=True)
            for q in questions:
                firebase_sync_callback(f"questions/{q['id']}", q, method='PUT', sync=True)
            firebase_sync_callback(f"ai_generation_logs/{log_record['id']}", log_record, method='PUT', sync=True)

        # 7. Complete job state
        with _jobs_lock:
            if job_id in _active_jobs:
                _active_jobs[job_id]['status'] = 'COMPLETED'
                _active_jobs[job_id]['progressPct'] = 100
                _active_jobs[job_id]['currentStage'] = 'Test Hosted & Published Successfully!'
                _active_jobs[job_id]['result'] = {
                    'test': test_record,
                    'questions': questions,
                    'metrics': metrics,
                    'log': log_record
                }

        print(f"[AI_JOB_COMPLETE] Job {job_id} finished successfully. Created test {test_id} with {len(questions)} MCQs.", flush=True)

    except Exception as e:
        err_msg = str(e)
        print(f"[AI_JOB_ERROR] Job {job_id} failed: {err_msg}", flush=True)
        with _jobs_lock:
            if job_id in _active_jobs:
                _active_jobs[job_id]['status'] = 'FAILED'
                _active_jobs[job_id]['error'] = err_msg
                _active_jobs[job_id]['currentStage'] = f"Error: {err_msg}"
