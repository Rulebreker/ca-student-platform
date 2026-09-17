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

def test_onetime_scheduling_validation():
    print("--- 1. Testing Past Date Rejection ---")
    past_task = {
        'name': 'Past Event Should Fail',
        'scheduleType': 'one_time',
        'scheduledDate': '2020-01-01',
        'scheduledTime': '10:00',
        'subject': 'Accounting',
        'topic': 'Depreciation',
        'questionCount': 5
    }
    status, res = api_request('/api/admin/ai/scheduler/tasks', method='POST', body=past_task)
    assert status == 400, f"Expected 400 for past date, got {status}: {res}"
    assert res.get('success') is False
    print(f"  [OK] Server rejected past date with HTTP 400: {res.get('error')}")

    print("\n--- 2. Testing Future One-Time Event Creation in IST ---")
    # Generate tomorrow's date in IST (UTC+05:30)
    now_utc = datetime.now(timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    tomorrow_ist = now_utc.astimezone(ist_tz) + timedelta(days=1)
    date_str = tomorrow_ist.strftime('%Y-%m-%d')
    time_str = '11:30'

    future_task = {
        'name': 'Valid One-Time IST Exam Event',
        'scheduleType': 'one_time',
        'scheduledDate': date_str,
        'scheduledTime': time_str,
        'isLiveEvent': True,
        'liveDurationMinutes': 90,
        'subject': 'Business Law',
        'topic': 'Sale of Goods Act',
        'examLevel': 'CA Foundation',
        'questionCount': 5,
        'durationMinutes': 30,
        'marksPerCorrect': 2.0,
        'negativeMarksPerWrong': 0.5,
        'autoPublish': True
    }
    status, res = api_request('/api/admin/ai/scheduler/tasks', method='POST', body=future_task)
    assert status == 200, f"Expected 200 for valid future date, got {status}: {res}"
    assert res.get('success') is True
    created = res.get('task', {})
    task_id = created.get('id')
    assert task_id, "Task must have an ID"
    assert created.get('scheduleType') == 'one_time'
    assert created.get('scheduledDate') == date_str
    assert created.get('scheduledTime') == time_str
    assert created.get('isLiveEvent') is True
    assert created.get('liveDurationMinutes') == 90
    assert 'startsAt' in created and created['startsAt']
    assert 'expiresAt' in created and created['expiresAt']
    assert 'nextRunAt' in created and created['nextRunAt']
    print(f"  [OK] Successfully created one-time task: ID={task_id}, startsAt={created['startsAt']}, expiresAt={created['expiresAt']}")

    # Clean up created task
    del_status, del_res = api_request('/api/admin/ai/scheduler/tasks/delete', method='POST', body={'taskId': task_id})
    assert del_status == 200 and del_res.get('success') is True

def run_all():
    print("==================================================")
    print(" REGRESSION SUITE: ONE-TIME SCHEDULING (IST)      ")
    print("==================================================")
    test_onetime_scheduling_validation()
    print("\n>>> ALL ONE-TIME SCHEDULING TESTS PASSED <<<\n")

if __name__ == '__main__':
    run_all()
