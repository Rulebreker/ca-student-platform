import urllib.request
import urllib.error
import json
import time

SERVER_URL = "http://127.0.0.1:8000"
TOKEN = "token_admin_excellenceca_secret"

def post(path, body):
    url = f"{SERVER_URL}{path}"
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

def get(path):
    url = f"{SERVER_URL}{path}"
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', f'Bearer {TOKEN}')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))

print("=================================================================")
print(" STARTING REAL PRODUCTION 10-MCQ BATCH VERIFICATION RUN")
print(" Subject: Business Economics | Chapter: Introduction to Business Economics")
print("=================================================================")

batch_payload = {
    'title': 'Production Hardening 10-MCQ Verification Test',
    'subject': 'Business Economics',
    'subjectId': 'sub-3',
    'chapter': 'Introduction to Business Economics',
    'chapterId': 'ch-fnd-eco-1',
    'topic': 'Nature and Scope of Business Economics',
    'examLevel': 'CA Foundation',
    'examLevelId': 'foundation',
    'difficulty': 'ICAI Exam Standard',
    'questionCategory': 'Direct Questions',
    'questionSpeed': 'Quick',
    'count': 10,
    'durationMinutes': 15,
    'marksPerCorrect': 2.0,
    'negativeMarksPerWrong': 0.5,
    'autoPublish': False
}

st, res = post('/api/admin/ai/jobs/generate', batch_payload)
print(f"Trigger Response Status: {st}")
if not res.get('success'):
    print(f"Error starting job: {res}")
    exit(1)

job = res['job']
job_id = job['id']
print(f"Job started successfully: ID = {job_id}")

start_time = time.time()
last_stage = None
last_verified = -1

while True:
    time.sleep(3.0)
    elapsed = time.time() - start_time
    st, status_res = get(f'/api/admin/ai/jobs/status?jobId={job_id}&_t={int(time.time()*1000)}')
    if st != 200:
        print(f"[{elapsed:.1f}s] Error fetching status: {status_res}")
        continue

    cur_job = status_res.get('job', {})
    status = cur_job.get('status')
    stage = cur_job.get('currentStage')
    verified = cur_job.get('generatedCount', 0)
    slots = cur_job.get('questionStatuses', [])
    
    # Print status updates when stage or verified count changes
    if stage != last_stage or verified != last_verified:
        slot_str = " | ".join([f"Q{s.get('number')}:{s.get('status','?').upper()}" for s in slots]) if slots else ""
        print(f"[{elapsed:.1f}s] Status: {status} | Verified: {verified}/10 | Stage: {stage} | Slots: [{slot_str}]")
        last_stage = stage
        last_verified = verified

    if status in ['COMPLETED', 'FAILED', 'PARTIAL']:
        print(f"\n>>> JOB REACHED TERMINAL STATE: {status} in {elapsed:.1f}s <<<")
        print("\n--- Question Slot Summary ---")
        for s in slots:
            print(f"  Question {s.get('number')}: status={s.get('status')} provider={s.get('provider')} error={s.get('error')}")

        print("\n--- Final Metrics ---")
        metrics = cur_job.get('metrics', {})
        print(f"  Requested: {metrics.get('requestedCount')}")
        print(f"  Generated: {metrics.get('generatedCount')}")
        print(f"  Failed: {metrics.get('failedCount')}")
        print(f"  Qwen Generation Calls: {metrics.get('qwenGenerationCalls')}")
        print(f"  Validation Calls: {metrics.get('validationCalls')}")
        print(f"  Validation Provider: {metrics.get('validationProvider')}")
        print(f"  Validation Providers Used: {metrics.get('validationProvidersUsed')}")
        print(f"  Providers Used: {metrics.get('providersUsed')}")
        print(f"  Duration: {metrics.get('durationSeconds')}s")
        break

    if elapsed > 300:
        print(f"\n[TIMEOUT] Job did not complete within 300 seconds.")
        break
