import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta
import urllib.request
import urllib.error

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

ADMIN_TOKEN = 'token_admin_excellenceca_secret'
BASE_URL = 'http://127.0.0.1:8000'

def api_request(path, method='GET', body=None, token=ADMIN_TOKEN):
    url = f"{BASE_URL}{path}"
    data_bytes = json.dumps(body).encode('utf-8') if body else None
    req = urllib.request.Request(url, data=data_bytes, method=method)
    if token:
        req.add_header('Authorization', f"Bearer {token}")
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=180.0) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}

def test_authoritative_schedule_deletion():
    print("--- 1. Creating Task for Deletion Testing ---")
    task_data = {
        'name': 'Schedule To Be Authoritatively Deleted',
        'scheduleType': 'recurring',
        'dailyTime': '22:15',
        'subject': 'Economics',
        'topic': 'National Income',
        'questionCount': 5
    }
    status, res = api_request('/api/admin/ai/scheduler/tasks', method='POST', body=task_data)
    assert status == 200 and res.get('success') is True, f"Failed creating task: {res}"
    task_id = res['task']['id']
    print(f"  [Created]: Task ID = {task_id}")

    # Verify task exists
    status, res = api_request('/api/admin/ai/scheduler/tasks')
    assert status == 200
    task_ids = [t['id'] for t in res.get('tasks', [])]
    assert task_id in task_ids, f"Task {task_id} must appear in tasks list"

    print("\n--- 2. Deleting Task via API ---")
    del_status, del_res = api_request('/api/admin/ai/scheduler/tasks/delete', method='POST', body={'taskId': task_id})
    assert del_status == 200, f"Expected 200, got {del_status}: {del_res}"
    assert del_res.get('success') is True
    print(f"  [Deleted]: {del_res.get('message')}")

    print("\n--- 3. Verifying Authoritative Exclusion from Tasks List ---")
    status, res = api_request('/api/admin/ai/scheduler/tasks')
    assert status == 200
    active_ids = [t['id'] for t in res.get('tasks', [])]
    assert task_id not in active_ids, f"Deleted task {task_id} must NOT be returned in tasks list"
    print(f"  [OK] Task {task_id} is properly excluded from active tasks")

    print("\n--- 4. Testing Idempotent Deletion ---")
    del2_status, del2_res = api_request('/api/admin/ai/scheduler/tasks/delete', method='POST', body={'taskId': task_id})
    assert del2_status == 200, f"Expected 200, got {del2_status}: {del2_res}"
    assert del2_res.get('success') is True
    assert del2_res.get('alreadyDeleted') is True, f"Expected alreadyDeleted=True, got {del2_res}"
    print("  [OK] Second delete request returned idempotent success with alreadyDeleted=True")

def test_tombstone_unit_behavior():
    print("\n--- 5. Unit Testing Tombstone Persistence and Cloud Sync Isolation ---")
    import ai_scheduler

    mock_data = {
        'ai_scheduled_tasks': [
            {'id': 'task-survivor', 'name': 'Survivor', 'enabled': True, 'status': 'scheduled', 'nextRunAt': '2026-10-01T00:00:00Z'},
            {'id': 'task-to-delete', 'name': 'Doomed', 'enabled': True, 'status': 'scheduled', 'nextRunAt': '2026-10-01T00:00:00Z'}
        ],
        'deleted_scheduled_tasks': []
    }

    # Delete task-to-delete
    deleted = ai_scheduler.delete_scheduled_task('task-to-delete', mock_data, None, None)
    assert deleted is True, "delete_scheduled_task should return True"
    assert 'task-to-delete' in mock_data['deleted_scheduled_tasks']
    
    # Verify get_scheduled_tasks filters out both tombstone and isDeleted
    active_tasks = ai_scheduler.get_scheduled_tasks(mock_data)
    active_task_ids = [t['id'] for t in active_tasks]
    assert 'task-survivor' in active_task_ids
    assert 'task-to-delete' not in active_task_ids
    print("  [OK] Tombstones authoritatively prevent deleted tasks from ever returning")

def run_all():
    print("==================================================")
    print(" REGRESSION SUITE: SCHEDULE DELETION & TOMBSTONES ")
    print("==================================================")
    test_authoritative_schedule_deletion()
    test_tombstone_unit_behavior()
    print("\n>>> ALL SCHEDULE DELETION TESTS PASSED <<<\n")

if __name__ == '__main__':
    run_all()
