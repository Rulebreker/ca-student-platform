import os
import sys
import json
import time
import urllib.request
import urllib.error
import base64

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
        with urllib.request.urlopen(req, timeout=40.0) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}

def test_ai_suite():
    print("=== STEP 1: Test GET /api/admin/ai/providers ===")
    status, res = api_request('/api/admin/ai/providers')
    print(f"Status: {status}, Success: {res.get('success')}")
    assert status == 200, f"Expected 200, got {status}"
    providers = res.get('providers', [])
    assert [p['id'] for p in providers] == ['local_qwen'], f"Only Local Qwen may be listed, got {[p['id'] for p in providers]}"
    for p in providers:
        print(f"  Provider {p['id']}: name={p['name']}, status={p.get('status')}, latency={p.get('lastLatencyMs')}")

    print("\n=== STEP 2: Test POST /api/admin/ai/providers/test (requires a running Local Qwen Worker) ===")
    status, res = api_request('/api/admin/ai/providers/test', method='POST', body={'providerId': 'local_qwen'})
    print(f"Status: {status}, Result: {res}")
    assert status == 200, f"Expected 200, got {status}"
    assert res.get('success') is True, f"Provider test failed: {res}"

    print("\n=== STEP 3: Test GET & POST /api/admin/ai/autopilot ===")
    status, res = api_request('/api/admin/ai/autopilot')
    print(f"Status: {status}, Autopilot config: {res.get('config')}")
    assert status == 200
    cfg = res.get('config', {})
    assert 'dailyTime' in cfg

    status, res = api_request('/api/admin/ai/autopilot', method='POST', body={'questionCount': 6, 'dailyTime': '21:00'})
    assert status == 200
    assert res.get('config', {}).get('questionCount') == 6

    print("\n=== STEP 4: Test POST /api/admin/ai/documents/upload ===")
    sample_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 120 >>\nstream\n"
        b"BT /F1 14 Tf 50 700 Td (Chapter 1: Nature and Scope of Business Economics. Economics deals with scarcity of resources and alternative uses. Microeconomics focuses on individual decision making and market equilibrium.) Tj ET\n"
        b"endstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000216 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n410\n%%EOF\n"
    )
    b64_pdf = base64.b64encode(sample_pdf).decode('utf-8')
    status, res = api_request('/api/admin/ai/documents/upload', method='POST', body={
        'filename': 'economics_unit1.pdf',
        'fileData': b64_pdf,
        'subject': 'Business Economics',
        'examLevel': 'CA Foundation'
    })
    print(f"Status: {status}, Indexed: {res.get('success')}, Doc ID: {res.get('document', {}).get('id')}")
    assert status == 200, f"Upload failed: {res}"
    doc_id = res.get('document', {}).get('id')

    print("\n=== STEP 5: Test GET /api/admin/ai/documents ===")
    status, res = api_request('/api/admin/ai/documents')
    assert status == 200
    docs = res.get('documents', [])
    assert any(d.get('id') == doc_id for d in docs), "Uploaded document not in documents list"
    print(f"Total indexed docs: {len(docs)}")

    print("\n=== STEP 6: Test POST /api/admin/ai/jobs/generate (2 MCQs) ===")
    status, res = api_request('/api/admin/ai/jobs/generate', method='POST', body={
        'title': 'AI Business Economics Conceptual Sprint',
        'subject': 'Business Economics',
        'topic': 'Nature and Scope of Business Economics',
        'examLevel': 'CA Foundation',
        'difficulty': 'ICAI Exam Standard',
        'count': 2,
        'durationMinutes': 10,
        'marksPerCorrect': 2.0,
        'negativeMarksPerWrong': 0.5,
        'autoPublish': True,
        'allowedPlans': ['free', 'trial', 'pro', 'elite']
    })
    print(f"Status: {status}, Job queued: {res.get('job', {}).get('id')}")
    assert status == 200, f"Job creation failed: {res}"
    job_id = res.get('job', {}).get('id')

    print("\n=== STEP 7: Polling Job Status ===")
    completed = False
    for attempt in range(150):
        time.sleep(2)
        s_code, s_res = api_request(f'/api/admin/ai/jobs/status?jobId={job_id}')
        job = s_res.get('job', {})
        print(f"  Poll {attempt+1}: Status={job.get('status')}, Progress={job.get('progressPct')}%, Stage={job.get('currentStage')}")
        if job.get('status') == 'COMPLETED':
            completed = True
            break
        elif job.get('status') in ('FAILED', 'EXPIRED', 'PARTIAL'):
            raise AssertionError(f"Job failed: {job.get('error')}")

    assert completed, "Job did not complete in time"

    print("\n=== STEP 8: Verify Test & Questions Hosted in ExcellenceCA ===")
    res_data = job.get('result', {})
    test_obj = res_data.get('test', {})
    qs = res_data.get('questions', [])
    print(f"Created Test ID: {test_obj.get('id')}, Title: {test_obj.get('title')}, TotalQs: {test_obj.get('totalQuestions')}, isPublished: {test_obj.get('isPublished')}")
    assert test_obj.get('isPublished') is True, "Test must be published!"
    assert test_obj.get('status') == 'Published', "Status must be Published!"
    assert len(qs) == 2, f"Expected exactly 2 questions, got {len(qs)}"

    for i, q in enumerate(qs):
        print(f"\nQuestion {i+1}:")
        print(f"  Prompt: {q.get('text')}")
        print(f"  A: {q.get('optionA')}")
        print(f"  B: {q.get('optionB')}")
        print(f"  C: {q.get('optionC')}")
        print(f"  D: {q.get('optionD')}")
        print(f"  Correct: {q.get('correctOption')}")
        print(f"  Explanation: {q.get('explanation')[:100]}...")
        assert q.get('correctOption') in ['A', 'B', 'C', 'D']
        assert q.get('testId') == test_obj.get('id')

    print("\n=== STEP 9: Verify Telemetry Logs ===")
    status, res = api_request('/api/admin/ai/jobs/logs')
    assert status == 200
    logs = res.get('logs', [])
    assert any(l.get('jobId') == job_id for l in logs), "Job not found in telemetry logs"
    print(f"Telemetry log verified. Total logs: {len(logs)}")

    print("\nALL BACKEND AUTOMATION TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    test_ai_suite()
