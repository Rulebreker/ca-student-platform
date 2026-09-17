import os
import sys
import json
import time
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

def test_active_job_recovery_endpoint():
    print("--- 1. Testing GET /api/admin/ai/jobs/active ---")
    status, res = api_request('/api/admin/ai/jobs/active')
    assert status == 200, f"Expected 200, got {status}: {res}"
    assert res.get('success') is True
    assert 'hasActiveJob' in res
    print(f"  [OK] /api/admin/ai/jobs/active responded successfully: hasActiveJob={res.get('hasActiveJob')}")

def test_incremental_persistence_unit():
    print("\n--- 2. Testing ai_job_manager incremental persistence and lifecycle ---")
    import ai_job_manager

    mock_data = {
        'tests': [],
        'questions': [],
        'ai_generation_jobs': [],
        'ai_generation_logs': []
    }
    persisted_states = []

    def mock_save(data):
        persisted_states.append({
            'test_count': len(data.get('tests', [])),
            'q_count': len(data.get('questions', [])),
            'job_count': len(data.get('ai_generation_jobs', []))
        })

    # Test complete failure purge: 0 questions produces NO empty test in DB
    params_fail = {
        'title': 'Test Failure Clean Purge',
        'subject': 'Law',
        'topic': 'Contract Act',
        'count': 2
    }
    # Mock engine pipeline to return empty list
    original_pipeline = getattr(ai_job_manager.ai_mcq_engine, 'generate_exact_mcqs_pipeline', None)
    try:
        ai_job_manager.ai_mcq_engine.generate_exact_mcqs_pipeline = lambda **kwargs: ([], {'provider_used': 'mock'})
        success, err, result = ai_job_manager.execute_ai_generation_job_sync(
            params_fail, mock_data, mock_save, None
        )
        assert not success, "Expected failure when 0 questions produced"
        assert len(mock_data['tests']) == 0, f"Expected empty test to be purged, but found {len(mock_data['tests'])} tests"
        print("  [OK] Complete failure properly purged empty test from database")

        # Test partial success: generates 2 questions when 4 requested
        mock_data['tests'] = []
        mock_data['questions'] = []
        mock_q1 = {
            'id': 'mock-q-1',
            'text': 'What is consideration?',
            'optionA': 'Something in return',
            'optionB': 'Free gift',
            'optionC': 'Coercion',
            'optionD': 'Void',
            'correctOption': 'A',
            'explanation': 'Quid pro quo'
        }
        mock_q2 = {
            'id': 'mock-q-2',
            'text': 'What is minor agreement?',
            'optionA': 'Valid',
            'optionB': 'Void ab initio',
            'optionC': 'Voidable',
            'optionD': 'Illegal',
            'correctOption': 'B',
            'explanation': 'Agreement with minor is void ab initio'
        }

        def mock_partial_pipeline(**kwargs):
            cb = kwargs.get('on_question_verified')
            qs = [mock_q1, mock_q2]
            if cb:
                cb(mock_q1, [mock_q1], 1, 4)
                cb(mock_q2, [mock_q1, mock_q2], 2, 4)
            return qs, {'provider_used': 'mock'}

        ai_job_manager.ai_mcq_engine.generate_exact_mcqs_pipeline = mock_partial_pipeline
        params_partial = {
            'title': 'Test Partial Contract Act',
            'subject': 'Law',
            'topic': 'Contract Act',
            'count': 4,
            'autoPublish': True
        }
        success, err, result = ai_job_manager.execute_ai_generation_job_sync(
            params_partial, mock_data, mock_save, None
        )
        assert success is True, f"Expected success with partial MCQs, got error: {err}"
        assert len(mock_data['tests']) == 1, "Expected 1 test record retained"
        saved_test = mock_data['tests'][0]
        assert saved_test['totalQuestions'] == 2, f"Expected 2 totalQuestions, got {saved_test['totalQuestions']}"
        assert saved_test['isPublished'] is True
        assert saved_test['status'] == 'Published'
        assert len(mock_data['questions']) == 2, f"Expected 2 questions persisted, got {len(mock_data['questions'])}"

        # Check job record status
        job_record = result['job']
        assert job_record['status'] == 'PARTIAL', f"Expected PARTIAL status, got {job_record['status']}"
        assert job_record['generatedCount'] == 2
        assert job_record['failedCount'] == 2
        print("  [OK] Partial generation successfully hosted with status 'PARTIAL' and 2 questions")

        # Test active job query
        active_job = ai_job_manager.get_active_generation_job(mock_data)
        assert active_job is None, "Completed/Partial job should not be returned as active"

    finally:
        if original_pipeline:
            ai_job_manager.ai_mcq_engine.generate_exact_mcqs_pipeline = original_pipeline

def run_all():
    print("==================================================")
    print(" REGRESSION SUITE: AI MCQ GENERATION RELIABILITY ")
    print("==================================================")
    test_active_job_recovery_endpoint()
    test_incremental_persistence_unit()
    print("\n>>> ALL AI MCQ GENERATION RELIABILITY TESTS PASSED <<<\n")

if __name__ == '__main__':
    run_all()
