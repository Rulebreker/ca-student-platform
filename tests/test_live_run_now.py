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
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

print("=== STEP 1: CREATE 1-MCQ TEST TASK ON LIVE PRODUCTION ===")
task_data = {
    "name": "Live Production Auto-Pilot E2E Verification",
    "scheduleType": "recurring",
    "dailyTime": "10:00",
    "examLevel": "CA Foundation",
    "examLevelId": "foundation",
    "subject": "Business Economics",
    "subjectId": "sub-3",
    "chapter": "Theory of Demand",
    "chapterId": "ch-fnd-eco-2",
    "topic": "Price Elasticity of Demand",
    "difficulty": "ICAI Exam Standard",
    "questionCount": 1,
    "durationMinutes": 5,
    "marksPerCorrect": 2.0,
    "negativeMarksPerWrong": 0.5,
    "platformXp": 10,
    "maxAttempts": 2,
    "allowedPlans": ["free", "trial", "core", "plus", "elite"],
    "autoPublish": True
}
st, res = api("/api/admin/ai/scheduler/tasks", method="POST", body=task_data)
created_task = res.get("task", {})
task_id = created_task.get("id")
print(f"Status: {st}, Created Task ID: {task_id}, NextRunAt: {created_task.get('nextRunAt')}")
assert st == 200 and task_id

print("\n=== STEP 2: TRIGGER RUN-NOW (SYNCHRONOUS GENERATION & HOSTING) ===")
t0 = time.time()
st, run_res = api("/api/admin/ai/scheduler/tasks/run-now", method="POST", body={"id": task_id})
elapsed = round(time.time() - t0, 2)
print(f"Status: {st}, Elapsed: {elapsed}s")
print(f"Run Result Success: {run_res.get('success')}")
if not run_res.get("success"):
    print(f"ERROR: {run_res.get('error')}")
assert st == 200 and run_res.get("success") is True

task_after = run_res.get("task", {})
test_res = run_res.get("result", {}).get("test", {})
test_id = task_after.get("lastTestId") or test_res.get("id")
print(f"Hosted Test ID: {test_id}")
print(f"Hosted Test Title: {task_after.get('lastTestTitle')}")
print(f"Task Execution Count: {task_after.get('executionCount')}")
print(f"Task Last Run At: {task_after.get('lastRunAt')}")
assert test_id, "Test ID must be populated after synchronous hosting"
assert task_after.get("executionCount", 0) >= 1

print("\n=== STEP 3: CLEAN UP VERIFICATION TASK ===")
st, del_res = api("/api/admin/ai/scheduler/tasks/delete", method="POST", body={"id": task_id})
print(f"Task Deleted Status: {st}, Success: {del_res.get('success')}")
assert st == 200 and del_res.get("success") is True

print("\n=================================================================")
print(f">>> LIVE PRODUCTION RUN-NOW TEST PASSED 100% IN {elapsed}s <<<")
print("=================================================================")
