import urllib.request
import json
import time

PROD = "https://excellenceca.vercel.app"
TOKEN = "token_admin_excellenceca_secret"

def api(path, method="GET", body=None):
    url = f"{PROD}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def main():
    print("=== VERIFICATION 1: GET LIVE TASKS ===")
    st, res = api("/api/admin/ai/scheduler/tasks")
    print(f"Status: {st}, Success: {res.get('success')}, Tasks count: {len(res.get('tasks', []))}, Server IST: {res.get('serverTimeIst')}")
    assert st == 200 and res.get("success") is True

    print("\n=== VERIFICATION 2: CREATE TASK ON LIVE PRODUCTION ===")
    task_data = {
        "name": "Production Live Verification Task",
        "scheduleType": "recurring",
        "dailyTime": "09:00",
        "examLevel": "CA Foundation",
        "examLevelId": "foundation",
        "subject": "Business Economics",
        "subjectId": "sub-3",
        "chapter": "Theory of Demand",
        "chapterId": "ch-fnd-eco-2",
        "topic": "Price Elasticity of Demand",
        "difficulty": "ICAI Exam Standard",
        "questionCount": 1,
        "durationMinutes": 10,
        "marksPerCorrect": 2.0,
        "negativeMarksPerWrong": 0.5,
        "platformXp": 10,
        "maxAttempts": 3,
        "allowedPlans": ["free", "trial", "core", "plus", "elite"],
        "autoPublish": True
    }
    st, res = api("/api/admin/ai/scheduler/tasks", method="POST", body=task_data)
    created_task = res.get("task", {})
    task_id = created_task.get("id")
    print(f"Status: {st}, Created ID: {task_id}, NextRun: {created_task.get('nextRunAt')}")
    assert st == 200 and res.get("success") is True and task_id

    print("\n=== VERIFICATION 3: TOGGLE (PAUSE & RESUME) ON LIVE PRODUCTION ===")
    st, res = api("/api/admin/ai/scheduler/tasks/toggle", method="POST", body={"id": task_id, "enabled": False})
    print(f"Status: {st}, Paused Status: {res.get('task', {}).get('status')}")
    assert st == 200 and res["task"]["status"] == "paused"

    st, res = api("/api/admin/ai/scheduler/tasks/toggle", method="POST", body={"id": task_id, "enabled": True})
    print(f"Status: {st}, Resumed Status: {res.get('task', {}).get('status')}, NextRun: {res.get('task', {}).get('nextRunAt')}")
    assert st == 200 and res["task"]["status"] == "scheduled"

    print("\n=== VERIFICATION 4: LIVE PRODUCTION TICK RUNNER ===")
    st, res = api("/api/admin/ai/scheduler/tick", method="POST")
    print(f"Status: {st}, Executed count: {res.get('executedCount')}, ServerTimeIst: {res.get('serverTimeIst')}")
    assert st == 200 and res.get("success") is True

    print("\n=== VERIFICATION 5: DELETE TASK FROM LIVE PRODUCTION ===")
    st, res = api("/api/admin/ai/scheduler/tasks/delete", method="POST", body={"id": task_id})
    print(f"Status: {st}, Deleted: {res.get('success')}")
    assert st == 200 and res.get("success") is True

    # Verify task is deleted
    st, res = api("/api/admin/ai/scheduler/tasks")
    task_ids = [t.get("id") for t in res.get("tasks", [])]
    assert task_id not in task_ids, "Deleted task should not exist in live tasks list"
    print(f"Confirmed: {task_id} successfully purged from live production database.")

    print("\n=================================================================")
    print(">>> ALL 5 LIVE PRODUCTION VERIFICATION TESTS PASSED 100% <<<")
    print("=================================================================")

if __name__ == '__main__':
    main()
