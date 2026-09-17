import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

def test_live_event_lifecycle_unit():
    print("--- 1. Testing Live Event State Machine in ai_scheduler ---")
    import ai_scheduler

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    # Schedule starts 1 minute ago, live duration 10 minutes
    starts_iso = (now_utc - timedelta(minutes=1)).isoformat()
    expires_iso = (now_utc + timedelta(minutes=9)).isoformat()

    mock_data = {
        'ai_scheduled_tasks': [
            {
                'id': 'task-live-demo',
                'name': 'One-Time Live Sprint',
                'scheduleType': 'one_time',
                'enabled': True,
                'status': 'scheduled',
                'startsAt': starts_iso,
                'expiresAt': expires_iso,
                'nextRunAt': starts_iso,
                'isLiveEvent': True,
                'liveDurationMinutes': 10,
                'subject': 'Accounting',
                'topic': 'Depreciation Accounting',
                'examLevel': 'CA Foundation',
                'questionCount': 1,
                'durationMinutes': 10,
                'marksPerCorrect': 2.0,
                'negativeMarksPerWrong': 0.5,
                'autoPublish': True,
                'executionCount': 0
            }
        ],
        'tests': [],
        'questions': [],
        'ai_generation_jobs': [],
        'ai_generation_logs': []
    }

    # Mock engine pipeline to return 1 question quickly
    original_pipeline = getattr(ai_scheduler.ai_job_manager.ai_mcq_engine, 'generate_exact_mcqs_pipeline', None)
    try:
        mock_q = {
            'id': 'q-live-1',
            'text': 'What is written down value method?',
            'optionA': 'Diminishing balance',
            'optionB': 'Straight line',
            'optionC': 'Annuity',
            'optionD': 'Sinking fund',
            'correctOption': 'A',
            'explanation': 'Diminishing balance method'
        }
        ai_scheduler.ai_job_manager.ai_mcq_engine.generate_exact_mcqs_pipeline = lambda **kwargs: ([mock_q], {'provider_used': 'mock'})

        # Execute scheduled task synchronously
        task = mock_data['ai_scheduled_tasks'][0]
        success, err, res = ai_scheduler.execute_scheduler_task_sync(task, mock_data, None, None)
        assert success is True, f"Expected task execution to succeed, got {err}"
        test_record = res.get('test') if res else None
        assert test_record is not None
        print(f"  [Executed Task]: Test created ID={test_record.get('id')}")

        # Check that test is configured as LIVE
        assert test_record.get('isLive') is True, "Test record should have isLive=True"
        assert test_record.get('status') == 'Live', f"Expected status 'Live', got {test_record.get('status')}"
        assert test_record.get('liveStartsAt') is not None
        assert test_record.get('liveExpiresAt') is not None
        assert task.get('status') == 'live', f"Task status should be 'live', got {task.get('status')}"
        print("  [OK] Test record and task successfully transitioned to LIVE state")

        # Now simulate time expiration: set expiresAt in the past
        past_expires_iso = (now_utc - timedelta(minutes=2)).isoformat()
        task['expiresAt'] = past_expires_iso
        task['nextRunAt'] = past_expires_iso
        test_record['liveExpiresAt'] = past_expires_iso

        # Trigger process_due_tasks to evaluate expiry
        processed_result = ai_scheduler.process_due_tasks(mock_data, None, None)
        assert processed_result.get('executedCount', 0) >= 1, f"Expected at least 1 task processed for expiry, got {processed_result}"

        # Verify test was transitioned to Expired
        assert test_record.get('isLive') is False, "Test record should have isLive=False after expiry"
        assert test_record.get('status') == 'Expired', f"Expected status 'Expired', got {test_record.get('status')}"
        assert task.get('status') == 'completed', f"One-time task status should be 'completed' after expiry, got {task.get('status')}"
        print("  [OK] Test record and task deterministically transitioned to EXPIRED state")

    finally:
        if original_pipeline:
            ai_scheduler.ai_job_manager.ai_mcq_engine.generate_exact_mcqs_pipeline = original_pipeline

def run_all():
    print("==================================================")
    print(" REGRESSION SUITE: AUTHORITATIVE LIVE MCQ EVENTS  ")
    print("==================================================")
    test_live_event_lifecycle_unit()
    print("\n>>> ALL LIVE MCQ EVENT TESTS PASSED <<<\n")

if __name__ == '__main__':
    run_all()
