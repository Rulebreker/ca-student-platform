import os
import sys
import json
import time
import urllib.request
import urllib.error
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'tests'))
import admin_session

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

ADMIN_TOKEN = admin_session.admin_token()
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

def run_test():
    print("=== TEST 1: GET /api/admin/ai/scheduler/tasks ===")
    status, res = api_request('/api/admin/ai/scheduler/tasks')
    print(f"Status: {status}, Success: {res.get('success')}, Initial tasks count: {len(res.get('tasks', []))}")
    assert status == 200, f"Expected 200, got {status}"
    assert res.get('success') is True
    assert 'serverTimeUtc' in res
    assert 'serverTimeIst' in res

    print("\n=== TEST 2: Create Multiple Independent Scheduled Tasks ===")
    task1_data = {
        'name': 'Daily Accounts MCQ Sprint',
        'scheduleType': 'recurring',
        'dailyTime': '09:00',
        'subject': 'Accounting',
        'subjectId': 'sub-1',
        'chapter': 'Theoretical Framework',
        'chapterId': 'ch-fnd-acc-1',
        'topic': 'Accounting Concepts & Principles',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'difficulty': 'ICAI Exam Standard',
        'questionCount': 1,
        'durationMinutes': 10,
        'marksPerCorrect': 2.0,
        'negativeMarksPerWrong': 0.5,
        'platformXp': 10,
        'maxAttempts': 3,
        'allowedPlans': ['free', 'trial', 'core', 'plus', 'elite'],
        'autoPublish': True
    }
    status, res1 = api_request('/api/admin/ai/scheduler/tasks', method='POST', body=task1_data)
    assert status == 200, f"Expected 200, got {status}: {res1}"
    task1 = res1.get('task', {})
    task1_id = task1.get('id')
    assert task1_id, "Task 1 must have an ID"
    print(f"  [Created Task 1]: ID={task1_id}, Name={task1.get('name')}, NextRun={task1.get('nextRunAt')}")

    task2_data = {
        'name': 'Business Law Afternoon Sprint',
        'scheduleType': 'recurring',
        'dailyTime': '14:00',
        'subject': 'Business Law',
        'subjectId': 'sub-2',
        'chapter': 'Indian Regulatory Framework',
        'chapterId': 'ch-fnd-law-1',
        'topic': 'Legal System of India',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'difficulty': 'ICAI Exam Standard',
        'questionCount': 3,
        'durationMinutes': 10,
        'marksPerCorrect': 2.0,
        'negativeMarksPerWrong': 0.5,
        'platformXp': 10,
        'maxAttempts': 3,
        'allowedPlans': ['trial', 'core', 'plus', 'elite'],
        'autoPublish': True
    }
    status, res2 = api_request('/api/admin/ai/scheduler/tasks', method='POST', body=task2_data)
    assert status == 200, f"Expected 200, got {status}: {res2}"
    task2 = res2.get('task', {})
    task2_id = task2.get('id')
    assert task2_id, "Task 2 must have an ID"
    assert task2_id != task1_id, "Task IDs must be distinct"
    print(f"  [Created Task 2]: ID={task2_id}, Name={task2.get('name')}, NextRun={task2.get('nextRunAt')}")

    task3_data = {
        'name': 'Economics One-Time Practice',
        'scheduleType': 'one_time',
        'scheduledDate': '2026-09-25',
        'scheduledTime': '16:30',
        'subject': 'Business Economics',
        'subjectId': 'sub-3',
        'chapter': 'Theory of Demand and Supply',
        'chapterId': 'ch-fnd-eco-2',
        'topic': 'Price Elasticity',
        'examLevel': 'CA Foundation',
        'examLevelId': 'foundation',
        'difficulty': 'ICAI Exam Standard',
        'questionCount': 3,
        'durationMinutes': 10,
        'marksPerCorrect': 2.0,
        'negativeMarksPerWrong': 0.5,
        'platformXp': 15,
        'maxAttempts': 2,
        'allowedPlans': ['core', 'plus', 'elite'],
        'autoPublish': True
    }
    status, res3 = api_request('/api/admin/ai/scheduler/tasks', method='POST', body=task3_data)
    assert status == 200, f"Expected 200, got {status}: {res3}"
    task3 = res3.get('task', {})
    task3_id = task3.get('id')
    assert task3_id, "Task 3 must have an ID"
    print(f"  [Created Task 3]: ID={task3_id}, Name={task3.get('name')}, NextRun={task3.get('nextRunAt')}")

    print("\n=== TEST 3: Verify All Tasks Coexist Independently ===")
    status, list_res = api_request('/api/admin/ai/scheduler/tasks')
    assert status == 200
    tasks = list_res.get('tasks', [])
    ids = [t.get('id') for t in tasks]
    assert task1_id in ids, "Task 1 must exist in task list"
    assert task2_id in ids, "Task 2 must exist in task list"
    assert task3_id in ids, "Task 3 must exist in task list"
    print(f"  Successfully verified {len(tasks)} independent tasks coexist without collision.")

    print("\n=== TEST 4: Toggle Task 2 (Pause & Resume) ===")
    status, toggle_res = api_request('/api/admin/ai/scheduler/tasks/toggle', method='POST', body={'id': task2_id, 'enabled': False})
    assert status == 200
    assert toggle_res.get('task', {}).get('status') == 'paused'
    assert toggle_res.get('task', {}).get('nextRunAt') is None

    # Resume task 2
    status, toggle_res2 = api_request('/api/admin/ai/scheduler/tasks/toggle', method='POST', body={'id': task2_id, 'enabled': True})
    assert status == 200
    assert toggle_res2.get('task', {}).get('status') == 'scheduled'
    assert toggle_res2.get('task', {}).get('nextRunAt') is not None
    print(f"  Task 2 paused and resumed successfully. Next run: {toggle_res2.get('task', {}).get('nextRunAt')}")

    print("\n=== TEST 5: POST /api/admin/ai/scheduler/tasks/run-now (Synchronous Hosting) ===")
    status, run_res = api_request('/api/admin/ai/scheduler/tasks/run-now', method='POST', body={'id': task1_id})
    print(f"Status: {status}, Success: {run_res.get('success')}")
    assert status == 200, f"Expected 200 from run-now, got {status}: {run_res}"
    assert run_res.get('success') is True
    updated_t1 = run_res.get('task', {})
    assert updated_t1.get('lastRunAt') is not None, "lastRunAt must be recorded"
    assert updated_t1.get('lastTestId') is not None, "lastTestId must be recorded"
    assert updated_t1.get('executionCount') == 1, "executionCount must increment"
    print(f"  [Run Now Success]: Test ID: {updated_t1.get('lastTestId')}, Title: '{updated_t1.get('lastTestTitle')}'")
    print(f"  Next scheduled run advanced to: {updated_t1.get('nextRunAt')}")

    # Verify that the test exists in tests collection
    test_id = updated_t1.get('lastTestId')
    status, test_data = api_request(f'/api/tests')
    tests_list = test_data.get('tests', []) if isinstance(test_data, dict) else test_data
    found_test = next((t for t in tests_list if t.get('id') == test_id), None)
    assert found_test is not None, f"Generated test {test_id} was not found in data['tests']!"
    print(f"  Verified test record {test_id} exists in database tests collection.")
    print(f"  Test status: {found_test.get('status')}, Questions: {found_test.get('totalQuestions')}, Allowed plans: {found_test.get('allowedPlans')}")

    print("\n=== TEST 6: Tick Runner Endpoint ===")
    status, tick_res = api_request('/api/admin/ai/scheduler/tick', method='GET')
    assert status == 200
    assert tick_res.get('success') is True
    print(f"  Tick executed successfully: {tick_res}")

    print("\n=== TEST 7: Delete Task 3 ===")
    status, del_res = api_request('/api/admin/ai/scheduler/tasks/delete', method='POST', body={'id': task3_id})
    assert status == 200
    assert del_res.get('deletedId') == task3_id

    # Verify task 3 is gone
    status, list_after = api_request('/api/admin/ai/scheduler/tasks')
    ids_after = [t.get('id') for t in list_after.get('tasks', [])]
    assert task3_id not in ids_after, "Task 3 should be deleted"
    assert task1_id in ids_after, "Task 1 should remain"
    assert task2_id in ids_after, "Task 2 should remain"
    print(f"  Task 3 deleted cleanly. Remaining tasks: {len(ids_after)}")

    print("\n=======================================================")
    print(" ALL 7 MULTI-TASK SCHEDULER TESTS PASSED WITH 100% SUCCESS!")
    print("=======================================================")

if __name__ == '__main__':
    run_test()
