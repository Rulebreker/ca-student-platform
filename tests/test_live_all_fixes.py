import urllib.request
import urllib.error
import json
import time
from datetime import datetime, timezone, timedelta

PROD = "https://excellenceca.vercel.app"
TOKEN = "token_admin_excellenceca_secret"

def api(path, method="GET", body=None):
    url = f"{PROD}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}

def test_production_fixes():
    print("===============================================================")
    print(" LIVE PRODUCTION VERIFICATION: ALL 4 FIXES ON EXCELLENCECA")
    print("===============================================================")

    print("\n--- [FIX 1] Testing Active Job Session Recovery ---")
    st, res = api("/api/admin/ai/jobs/active")
    assert st == 200, f"Expected 200, got {st}: {res}"
    assert res.get("success") is True
    assert "hasActiveJob" in res
    print(f"  [PASSE explored_recovery: hasActiveJob={res.get('hasActiveJob')}")

    print("\n--- [FIX 2] Testing One-Time Schedule IST Validation ---")
    past_task = {
        "name": "Prod Past Event Should Fail",
        "scheduleType": "one_time",
        "scheduledDate": "2021-05-15",
        "scheduledTime": "14:00",
        "subject": "Law",
        "topic": "Companies Act",
        "questionCount": 5
    }
    st, res = api("/api/admin/ai/scheduler/tasks", method="POST", body=past_task)
    assert st == 400, f"Expected 400 for past date, got {st}: {res}"
    assert res.get("success") is False
    assert "future" in res.get("error", "").lower()
    print(f"  [PASSE Past IST date rejected with 400: {res.get('error')}")

    ist_tz = timezone(timedelta(hours=5, minutes=30))
    tomorrow_ist = datetime.now(timezone.utc).astimezone(ist_tz) + timedelta(days=2)
    valid_date = tomorrow_ist.strftime("%Y-%m-%d")
    valid_time = "15:30"

    onetime_task = {
        "name": "Prod One-Time Live Mega Mock",
        "scheduleType": "onetime",
        "scheduledDate": valid_date,
        "scheduledTime": valid_time,
        "subject": "Taxation",
        "subjectId": "sub-tax",
        "topic": "GST Registration",
        "questionCount": 5,
        "durationMinutes": 20,
        "isLiveEvent": True,
        "liveDurationMinutes": 60,
        "autoPublish": True
    }
    st, res = api("/api/admin/ai/scheduler/tasks", method="POST", body=onetime_task)
    assert st == 200, f"Expected 200 for valid one-time, got {st}: {res}"
    assert res.get("success") is True
    created = res.get("task", {})
    task_id = created.get("id")
    assert task_id, "Expected created task to have an ID"
    assert created.get("isLiveEvent") is True
    assert created.get("liveDurationMinutes") == 60
    assert created.get("startsAt") is not None
    assert created.get("expiresAt") is not None
    print(f"  [PASS] One-Time Live task created: ID = {task_id}, startsAt={created.get('startsAt')}, expiresAt={created.get('expiresAt')}")

    print("\n--- [FIX 4] Verifying Authoritative Live Window Configuration ---")
    st, res = api("/api/admin/ai/scheduler/tasks")
    assert st == 200
    all_tasks = res.get("tasks", [])
    matching_task = next((t for t in all_tasks if t.get("id") == task_id), None)
    assert matching_task is not None
    assert matching_task.get("isLiveEvent") is True
    assert matching_task.get("liveDurationMinutes") == 60
    print(f"  [PASSE Found task with live window: {matching_task.get('startsAt')} -> {matching_task.get('expiresAt')}")

    print("\n--- [FIX 3] Testing Authoritative Schedule Deletion & Tombstones ---")
    st, res = api("/api/admin/ai/scheduler/tasks/delete", method="POST", body={"id": task_id})
    assert st == 200
    assert res.get("success") is True
    print(f"  [PASS] Deleted task {task_id} via API")

    st, res = api("/api/admin/ai/scheduler/tasks")
    assert st == 200
    current_ids = [t.get("id") for t in res.get("tasks", [])]
    assert task_id not in current_ids, f"Deleted task {task_id} still present!"
    print(f"  [PASS] Verified task {task_id} absent from authoritative task list")

    st, res = api("/api/admin/ai/scheduler/tasks/delete", method="POST", body={"id": task_id})
    assert st == 200
    assert res.get("success") is True
    assert res.get("alreadyDeleted") is True
    print(f"  [PASSE Idempotent second delete returned alreadyDeleted=True")

    print("\n===============================================================")
    print(">>> ALL 4 FIXES VERIFIED AND PASSING 100% ON PRODUCTION! <<<")
    print("==============================================================")

if __name__ == '__main__':
    test_production_fixes()
