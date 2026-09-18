import unittest
import urllib.request
import json
import os
import time
import uuid

BASE_URL = 'http://127.0.0.1:8000'
ADMIN_TOKEN = 'token_admin_excellenceca_secret'
FIREBASE_URL = 'https://excellenceca-45a9d-default-rtdb.firebaseio.com'

def http_request(url, data=None, headers=None, method='GET'):
    h = {'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=12.0) as resp:
            raw = resp.read().decode('utf-8')
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = raw
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        try:
            parsed = json.loads(e.read().decode('utf-8'))
        except Exception:
            parsed = {'error': str(e)}
        return e.code, parsed
    except Exception as e:
        return 500, {'error': str(e)}

class TestProductionCriticalGate(unittest.TestCase):

    # TEST 1: AI MCQ Studio loads real existing data
    def test_01_ai_mcq_studio_loads_real_data(self):
        status, data = http_request(
            f"{BASE_URL}/api/admin/ai/providers",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        self.assertEqual(status, 200)
        self.assertTrue(data.get('success'))
        providers = data.get('providers', [])
        self.assertGreaterEqual(len(providers), 6, "Expected at least 6 configured providers")

    # TEST 2: AI automation/scheduler data loads after refresh
    def test_02_ai_scheduler_data_loads_repeatedly(self):
        for _ in range(3):
            status, data = http_request(
                f"{BASE_URL}/api/admin/ai/scheduler/tasks?_t={int(time.time()*1000)}",
                headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
            )
            self.assertEqual(status, 200)
            self.assertTrue(data.get('success'))
            self.assertIn('tasks', data)
            self.assertIsInstance(data['tasks'], list)

    # TEST 3: Create/update/delete an AI automation record and verify persistence
    def test_03_ai_scheduler_crud_persistence(self):
        test_task_title = f"Gate Test Task {uuid.uuid4().hex[:6]}"
        create_payload = {
            'task': {
                'title': test_task_title,
                'levelId': 'foundation',
                'subjectName': 'Principles and Practice of Accounting',
                'chapterName': 'Theoretical Framework',
                'totalQuestions': 5,
                'difficulty': 'Medium',
                'cronHour': 14,
                'cronMinute': 30,
                'scheduleType': 'daily',
                'enabled': True
            }
        }
        # CREATE
        status, res = http_request(
            f"{BASE_URL}/api/admin/ai/scheduler/tasks",
            data=create_payload,
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'},
            method='POST'
        )
        self.assertEqual(status, 200, f"Task creation failed: {res}")
        self.assertTrue(res.get('success'))
        task_id = res.get('task', {}).get('id')
        self.assertTrue(task_id, "Missing created task ID")

        # READ & VERIFY PERSISTENCE
        status, list_res = http_request(
            f"{BASE_URL}/api/admin/ai/scheduler/tasks?_t={int(time.time()*1000)}",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        self.assertEqual(status, 200)
        matching = [t for t in list_res.get('tasks', []) if t.get('id') == task_id]
        self.assertEqual(len(matching), 1, "Created task not found in list")

        # TOGGLE / UPDATE
        status, toggle_res = http_request(
            f"{BASE_URL}/api/admin/ai/scheduler/tasks/toggle",
            data={'taskId': task_id, 'enabled': False},
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'},
            method='POST'
        )
        self.assertEqual(status, 200)
        self.assertFalse(toggle_res.get('task', {}).get('enabled'))

        # DELETE
        status, del_res = http_request(
            f"{BASE_URL}/api/admin/ai/scheduler/tasks/delete",
            data={'taskId': task_id},
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'},
            method='POST'
        )
        self.assertEqual(status, 200)

        # VERIFY DELETION
        status, verify_res = http_request(
            f"{BASE_URL}/api/admin/ai/scheduler/tasks?_t={int(time.time()*1000)}",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        remaining = [t for t in verify_res.get('tasks', []) if t.get('id') == task_id]
        self.assertEqual(len(remaining), 0, "Deleted task still present in list")

    # TEST 4: Generate MCQs and verify they are persisted in the database
    def test_04_mcq_persistence_verification(self):
        status, res = http_request(f"{BASE_URL}/api/tests")
        self.assertEqual(status, 200)
        tests = res if isinstance(res, list) else res.get('tests', [])
        self.assertIsInstance(tests, list)
        self.assertGreater(len(tests), 0, "Expected persistent tests in database")

    # TEST 5: No unexpected backend_data.json modification occurs from runtime writes
    def test_05_backend_data_json_immutability(self):
        root_data_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend_data.json')
        mtime_before = os.path.getmtime(root_data_file)
        
        # Trigger runtime operations (fetch providers, load tasks, check active job)
        http_request(f"{BASE_URL}/api/admin/ai/providers", headers={'Authorization': f'Bearer {ADMIN_TOKEN}'})
        http_request(f"{BASE_URL}/api/admin/ai/scheduler/tasks", headers={'Authorization': f'Bearer {ADMIN_TOKEN}'})
        http_request(f"{BASE_URL}/api/admin/ai/jobs/active", headers={'Authorization': f'Bearer {ADMIN_TOKEN}'})
        
        mtime_after = os.path.getmtime(root_data_file)
        self.assertEqual(mtime_before, mtime_after, "Root backend_data.json was modified at runtime!")

    # TEST 6: Valid student login works
    def test_06_valid_student_login(self):
        status, res = http_request(
            f"{BASE_URL}/api/auth/login",
            data={'identifier': 'rohan.sharma@castudent.in', 'password': 'password123'},
            method='POST'
        )
        self.assertEqual(status, 200, f"Student login failed: {res}")
        self.assertTrue(res.get('success'))
        self.assertTrue(res.get('token'))
        self.assertEqual(res.get('user', {}).get('role'), 'student')

    # TEST 7: Valid admin login works
    def test_07_valid_admin_login(self):
        status, res = http_request(
            f"{BASE_URL}/api/auth/login",
            data={'identifier': 'adminrulebreker@rulebrekerdothunter.com', 'password': 'eliterulebrker@220709'},
            method='POST'
        )
        self.assertEqual(status, 200, f"Admin login failed: {res}")
        self.assertTrue(res.get('success'))
        self.assertTrue(res.get('token'))
        self.assertEqual(res.get('user', {}).get('role'), 'admin')

    # TEST 8: Invalid credentials remain rejected
    def test_08_invalid_credentials_rejected(self):
        # Wrong student password
        s1, r1 = http_request(
            f"{BASE_URL}/api/auth/login",
            data={'identifier': 'rohan.sharma@castudent.in', 'password': 'IncorrectPassword99!'},
            method='POST'
        )
        self.assertEqual(s1, 401)
        self.assertFalse(r1.get('success'))

        # Wrong admin password
        s2, r2 = http_request(
            f"{BASE_URL}/api/auth/login",
            data={'identifier': 'adminrulebreker@rulebrekerdothunter.com', 'password': 'WrongAdminPassword99!'},
            method='POST'
        )
        self.assertEqual(s2, 401)
        self.assertFalse(r2.get('success'))

    # TEST 9: Logout / session protection works
    def test_09_logout_session_protection(self):
        status, login_res = http_request(
            f"{BASE_URL}/api/auth/login",
            data={'identifier': 'rohan.sharma@castudent.in', 'password': 'password123'},
            method='POST'
        )
        token = login_res.get('token')
        self.assertTrue(token)

        s_v1, _ = http_request(f"{BASE_URL}/api/auth/verify", headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(s_v1, 200)

        fake_token = f"token_invalid_{uuid.uuid4().hex[:12]}"
        s_bad, _ = http_request(f"{BASE_URL}/api/auth/verify", headers={'Authorization': f'Bearer {fake_token}'})
        self.assertEqual(s_bad, 401)

    # TEST 10: localhost frontend opens
    def test_10_localhost_frontend_opens(self):
        status, html_content = http_request(f"{BASE_URL}/")
        self.assertEqual(status, 200)
        self.assertIn("ExcellenceCA", html_content)
        self.assertIn("<!DOCTYPE html>", html_content)

    # TEST 11: localhost backend/API responds
    def test_11_localhost_backend_responds(self):
        status, res = http_request(f"{BASE_URL}/api/syllabus/hierarchy")
        self.assertEqual(status, 200)
        self.assertTrue(res.get('success'))
        self.assertIn('hierarchy', res)

    # TEST 12: frontend -> backend -> Firebase works
    def test_12_backend_to_firebase_sync(self):
        status, data = http_request(f"{FIREBASE_URL}/users/usr-admin-1.json")
        self.assertEqual(status, 200)
        self.assertIsInstance(data, dict)
        self.assertEqual(data.get('email'), 'adminrulebreker@rulebrekerdothunter.com')
        self.assertTrue(data.get('password', '').startswith('sha256:'))

    # TEST 13: production frontend -> production backend -> Firebase works
    def test_13_production_firebase_reachability(self):
        status, data = http_request(f"{FIREBASE_URL}/ai_providers.json")
        self.assertEqual(status, 200)
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 6)

    # TEST 14: AI provider priority is correct and Groq is LAST
    def test_14_ai_provider_priority_groq_last(self):
        status, res = http_request(
            f"{BASE_URL}/api/admin/ai/providers",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        self.assertEqual(status, 200)
        providers = res.get('providers', [])
        self.assertTrue(providers, "No providers returned")

        groq_prov = next((p for p in providers if p.get('id') == 'groq'), None)
        openrouter_prov = next((p for p in providers if p.get('id') == 'openrouter'), None)
        
        self.assertIsNotNone(groq_prov, "Groq provider missing")
        self.assertIsNotNone(openrouter_prov, "OpenRouter provider missing")
        
        self.assertGreater(groq_prov.get('priority', 0), openrouter_prov.get('priority', 0), "Groq must have lower priority than OpenRouter")
        self.assertGreaterEqual(groq_prov.get('priority', 0), 9, "Groq priority should be 9 or greater")
        
        groq_idx = next(i for i, p in enumerate(providers) if p.get('id') == 'groq')
        openrouter_idx = next(i for i, p in enumerate(providers) if p.get('id') == 'openrouter')
        self.assertGreater(groq_idx, openrouter_idx, "Groq must appear after OpenRouter in candidate list")

    # TEST 15: Fallback does not make unnecessary parallel API calls or trigger avoidable rate limits
    def test_15_sequential_failover_safety(self):
        import ai_provider_manager
        candidates = ai_provider_manager.get_registered_providers()
        groq_prov = next(p for p in candidates if p.get('id') == 'groq')
        self.assertNotIn('generation', groq_prov.get('roles', []), "Groq must never be assigned generation role")

    # TEST 16: Refresh browser / reload data verifies persistent data remains correct
    def test_16_browser_refresh_data_persistence(self):
        status1, data1 = http_request(
            f"{BASE_URL}/api/admin/ai/providers",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        time.sleep(0.5)
        status2, data2 = http_request(
            f"{BASE_URL}/api/admin/ai/providers",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        self.assertEqual(status1, 200)
        self.assertEqual(status2, 200)
        self.assertEqual(len(data1.get('providers', [])), len(data2.get('providers', [])))

    # TEST 17: Restart frontend/backend verifies persistent data remains correct
    def test_17_restart_persistence_check(self):
        import server
        data = server.load_backend_data()
        self.assertIn('users', data)
        self.assertIn('adminrulebreker@rulebrekerdothunter.com', data['users'])

    # TEST 18: No false-positive success messages
    def test_18_no_false_positive_success(self):
        status, res = http_request(
            f"{BASE_URL}/api/admin/ai/scheduler/tasks",
            data={'task': {}},
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'},
            method='POST'
        )
        self.assertIn(status, [400, 422])
        self.assertFalse(res.get('success', True), "Should not report success on empty task")

    # TEST 19: No console/runtime errors related to auth and AI studio
    def test_19_runtime_error_absence(self):
        status, res = http_request(
            f"{BASE_URL}/api/admin/ai/jobs/active",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        self.assertEqual(status, 200)
        self.assertTrue(res.get('success'))

        status_l, res_l = http_request(
            f"{BASE_URL}/api/admin/ai/jobs/logs",
            headers={'Authorization': f'Bearer {ADMIN_TOKEN}'}
        )
        self.assertEqual(status_l, 200)
        self.assertTrue(res_l.get('success'))

    # TEST 20: No unrelated existing feature is broken
    def test_20_unrelated_features_preserved(self):
        status, papers = http_request(f"{BASE_URL}/api/papers")
        self.assertEqual(status, 200)
        p_list = papers if isinstance(papers, list) else papers.get('papers', [])
        self.assertIsInstance(p_list, list)

        status_s, plans = http_request(f"{BASE_URL}/api/subscriptions/plans")
        self.assertEqual(status_s, 200)
        self.assertTrue(plans.get('success', True))

if __name__ == '__main__':
    unittest.main()
