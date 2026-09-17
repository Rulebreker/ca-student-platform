import urllib.request
import json
import time
import sys

BASE = 'http://127.0.0.1:8000'
ADMIN_TOKEN = 'token_admin_excellenceca_secret'

def req(url, data=None, headers=None, method='GET'):
    h = {'Content-Type': 'application/json'}
    if headers:
        h.update(headers)
    body = json.dumps(data).encode('utf-8') if data is not None else None
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=5) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, {'error': str(e)}

def run_suite():
    print("=== STARTING REGRESSION TEST SUITE (LOCALHOST:8000) ===")

    ts = int(time.time())
    test_email = f'regtest_{ts}@castudent.in'
    test_uname = f'regtest_{ts}'
    old_pass = 'InitialPass123!'
    new_pass = 'NewSecurePass456!'

    # Cleanup if previously left over
    req(f'{BASE}/api/admin/users/delete', {'email': test_email}, {'Authorization': f'Bearer {ADMIN_TOKEN}'}, 'POST')

    # Step 0: Provision test student
    code, res = req(f'{BASE}/api/admin/users', {
        'name': 'Regression Test Student',
        'username': test_uname,
        'email': test_email,
        'password': old_pass,
        'role': 'student',
        'caLevel': 'CA FOUNDATION'
    }, {'Authorization': f'Bearer {ADMIN_TOKEN}'}, 'POST')
    print(f"[TEST 0] Provision student: status={code}, success={res.get('success')}")
    assert code == 200, f"Failed provisioning: {res}"
    st_id = res['user']['id']

    # Test 1: Initial Login with password
    code, res = req(f'{BASE}/api/auth/login', {'identifier': test_email, 'password': old_pass}, method='POST')
    print(f"[TEST 1] Initial Login: status={code}, success={res.get('success')}")
    assert code == 200 and res.get('success') is True, f"Login failed: {res}"
    initial_token = res['token']

    # Test 2: Admin Resets Password
    code, res = req(f'{BASE}/api/admin/users/reset-password', {'userId': st_id, 'newPassword': new_pass}, {'Authorization': f'Bearer {ADMIN_TOKEN}'}, 'POST')
    print(f"[TEST 2] Admin Reset Password: status={code}, success={res.get('success')}")
    assert code == 200 and res.get('success') is True, f"Reset password failed: {res}"

    # Test 3: Old session token should be invalidated/revoked
    code, res = req(f'{BASE}/api/auth/verify', headers={'Authorization': f'Bearer {initial_token}'})
    print(f"[TEST 3] Old Token Invalidation: status={code}, error={res.get('error')}")
    assert code == 401, f"Expected 401 for old token, got {code}: {res}"

    # Test 4: Login with old password rejected
    code, res = req(f'{BASE}/api/auth/login', {'identifier': test_email, 'password': old_pass}, method='POST')
    print(f"[TEST 4] Login With Old Password: status={code}, error={res.get('error')}")
    assert code == 401, f"Expected 401 for old password, got {code}: {res}"

    # Test 5: Login with new password succeeds with fresh token
    code, res = req(f'{BASE}/api/auth/login', {'identifier': test_email, 'password': new_pass}, method='POST')
    print(f"[TEST 5] Login With New Password: status={code}, success={res.get('success')}")
    assert code == 200 and res.get('success') is True, f"Login failed: {res}"
    new_token = res['token']
    assert new_token and new_token != initial_token, "Token was not renewed"

    # Test 6: Verify new token immediately and after delay (1s, 3s)
    code, res = req(f'{BASE}/api/auth/verify', headers={'Authorization': f'Bearer {new_token}'})
    print(f"[TEST 6.1] Immediate Verify (0s): status={code}, auth={res.get('authenticated')}")
    assert code == 200 and res.get('authenticated') is True, f"Verify failed at 0s: {res}"

    time.sleep(1.2)
    code, res = req(f'{BASE}/api/auth/verify', headers={'Authorization': f'Bearer {new_token}'})
    print(f"[TEST 6.2] Delayed Verify (1.2s): status={code}, auth={res.get('authenticated')}")
    assert code == 200 and res.get('authenticated') is True, f"Verify failed at 1.2s: {res}"

    time.sleep(2.0)
    code, res = req(f'{BASE}/api/auth/verify', headers={'Authorization': f'Bearer {new_token}'})
    print(f"[TEST 6.3] Delayed Verify (3.2s): status={code}, auth={res.get('authenticated')}")
    assert code == 200 and res.get('authenticated') is True, f"Verify failed at 3.2s: {res}"

    # Test 7: Access protected resource with valid new token
    code, res = req(f'{BASE}/api/subscriptions/my', headers={'Authorization': f'Bearer {new_token}'})
    print(f"[TEST 7] Protected Resource Access: status={code}, success={res.get('success')}")
    assert code == 200 and res.get('success') is True, f"Access to protected resource failed: {res}"

    # Test 8: Admin Deletes User
    code, res = req(f'{BASE}/api/admin/users/delete', {'studentId': st_id}, {'Authorization': f'Bearer {ADMIN_TOKEN}'}, 'POST')
    print(f"[TEST 8] Admin Deletes User: status={code}, success={res.get('success')}")
    assert code == 200 and res.get('success') is True, f"Deletion failed: {res}"

    # Test 9: Active token of deleted user is rejected with 401
    code, res = req(f'{BASE}/api/auth/verify', headers={'Authorization': f'Bearer {new_token}'})
    print(f"[TEST 9.1] Verify Deleted User Token: status={code}, error={res.get('error')}")
    assert code == 401, f"Expected 401 for deleted user token, got {code}: {res}"

    code, res = req(f'{BASE}/api/subscriptions/my', headers={'Authorization': f'Bearer {new_token}'})
    print(f"[TEST 9.2] Protected Resource with Deleted User: status={code}, error={res.get('error')}")
    assert code == 401, f"Expected 401 for deleted user, got {code}: {res}"

    # Test 10: Deleted user cannot log in
    code, res = req(f'{BASE}/api/auth/login', {'identifier': test_email, 'password': new_pass}, method='POST')
    print(f"[TEST 10] Login Attempt For Deleted User: status={code}, error={res.get('error')}")
    assert code == 401, f"Expected 401 for deleted user login, got {code}: {res}"

    print("\n>>> ALL 10 REGRESSION TESTS PASSED PERFECTLY ON LOCALHOST <<<")

if __name__ == '__main__':
    run_suite()
