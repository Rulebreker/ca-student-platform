import urllib.request
import json
import time
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'tests'))
import admin_session

LOCAL_BASE = 'http://127.0.0.1:8000'
PROD_BASE = 'https://excellenceca.vercel.app'
FIREBASE_RTDB_URL = 'https://excellenceca-45a9d-default-rtdb.firebaseio.com'
ADMIN_TOKEN = admin_session.admin_token()

def attempt_login(base_url, identifier, password):
    req = urllib.request.Request(f'{base_url}/api/auth/login',
                                data=json.dumps({'identifier': identifier, 'password': password}).encode(),
                                headers={'Content-Type': 'application/json'},
                                method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def main():
    print("=====================================================")
    print("VERIFICATION 1: DATABASE DELETION VERIFICATION")
    print("=====================================================")

    # 1.1 Local backend_data.json
    with open('backend_data.json', encoding='utf-8') as f:
        local_db = json.load(f)

    local_users = local_db.get('users', {})
    matching_local = [k for k, v in local_users.items() if 'test22' in k.lower() or 'test22' in str(v.get('email', '')).lower() or 'test22' in str(v.get('username', '')).lower()]
    print("1.1 backend_data.json users matching test22:", matching_local)
    assert len(matching_local) == 0, "test22 STILL FOUND in local database users!"

    revoked_local = [x for x in local_db.get('revoked_users', []) if 'test22' in str(x).lower() or 'usr-student-1789308526406' in str(x).lower()]
    print("1.1 backend_data.json revoked_users for test22:", revoked_local)
    assert len(revoked_local) > 0, "test22 NOT recorded in revoked_users!"

    # 1.2 Firebase Realtime Database
    req_fb_user = urllib.request.Request(f'{FIREBASE_RTDB_URL}/users/usr-student-1789308526406.json')
    with urllib.request.urlopen(req_fb_user) as resp:
        fb_user = json.loads(resp.read().decode())
    print("1.2 Firebase RTDB users/usr-student-1789308526406:", fb_user)
    assert fb_user is None, "test22 STILL FOUND in Firebase RTDB users/!"

    req_fb_rev = urllib.request.Request(f'{FIREBASE_RTDB_URL}/revoked_users/usr-student-1789308526406.json')
    with urllib.request.urlopen(req_fb_rev) as resp:
        fb_rev_id = json.loads(resp.read().decode())
    print("1.2 Firebase RTDB revoked_users/usr-student-1789308526406:", fb_rev_id)
    assert fb_rev_id is True, "usr-student-1789308526406 NOT in Firebase revoked_users!"

    req_fb_rev_uname = urllib.request.Request(f'{FIREBASE_RTDB_URL}/revoked_users/test22.json')
    with urllib.request.urlopen(req_fb_rev_uname) as resp:
        fb_rev_uname = json.loads(resp.read().decode())
    print("1.2 Firebase RTDB revoked_users/test22:", fb_rev_uname)
    assert fb_rev_uname is True, "test22 NOT in Firebase revoked_users!"

    print("\n>>> DATABASE DELETION VERIFIED: test22@gmail.com is 100% PURGED from both DBs <<<\n")

    print("=====================================================")
    print("VERIFICATION 2: LOCALHOST LOGIN ATTEMPT")
    print("=====================================================")

    # Localhost email login
    code, res = attempt_login(LOCAL_BASE, 'test22@gmail.com', 'TestPassword123!')
    print(f"2.1 Localhost Login (email): status={code}, response={res}")
    assert code == 401 and 'permanently removed' in res.get('error', '').lower(), f"Unexpected localhost email login response: {code} {res}"

    # Localhost username login
    code, res = attempt_login(LOCAL_BASE, 'test22', 'TestPassword123!')
    print(f"2.2 Localhost Login (username): status={code}, response={res}")
    assert code == 401 and 'permanently removed' in res.get('error', '').lower(), f"Unexpected localhost username login response: {code} {res}"

    # Localhost admin directory check
    req_admin = urllib.request.Request(f'{LOCAL_BASE}/api/admin/users', headers={'Authorization': f'Bearer {ADMIN_TOKEN}'})
    with urllib.request.urlopen(req_admin) as resp:
        admin_data = json.loads(resp.read().decode())
    test22_in_admin = [u for u in admin_data.get('users', []) if u.get('email') == 'test22@gmail.com']
    print(f"2.3 Localhost Admin Directory: total={admin_data.get('total')}, students={admin_data.get('students')}, test22_found={len(test22_in_admin)}")
    assert len(test22_in_admin) == 0, "test22 still present in admin users!"

    print("\n>>> LOCALHOST VERIFICATION PASSED: test22 is REJECTED and ABSENT <<<\n")

    print("=====================================================")
    print("VERIFICATION 3: PRODUCTION LOGIN ATTEMPT (VERCEL)")
    print("=====================================================")

    # Production email login
    code, res = attempt_login(PROD_BASE, 'test22@gmail.com', 'TestPassword123!')
    print(f"3.1 Production Login (email): status={code}, response={res}")
    assert code == 401 and 'permanently removed' in res.get('error', '').lower(), f"Unexpected prod email response: {code} {res}"

    # Production username login
    code, res = attempt_login(PROD_BASE, 'test22', 'TestPassword123!')
    print(f"3.2 Production Login (username): status={code}, response={res}")
    assert code == 401 and 'permanently removed' in res.get('error', '').lower(), f"Unexpected prod username response: {code} {res}"

    # Production admin directory check
    req_prod_admin = urllib.request.Request(f'{PROD_BASE}/api/admin/users', headers={'Authorization': f'Bearer {ADMIN_TOKEN}'})
    with urllib.request.urlopen(req_prod_admin) as resp:
        prod_admin_data = json.loads(resp.read().decode())
    test22_in_prod_admin = [u for u in prod_admin_data.get('users', []) if u.get('email') == 'test22@gmail.com']
    print(f"3.3 Production Admin Directory: total={prod_admin_data.get('total')}, students={prod_admin_data.get('students')}, test22_found={len(test22_in_prod_admin)}")
    assert len(test22_in_prod_admin) == 0, "test22 still present in production admin users!"

    print("\n>>> PRODUCTION VERIFICATION PASSED: test22 is REJECTED and ABSENT ON PRODUCTION <<<\n")
    print("ALL VERIFICATION CRITERIA SATISFIED 100%")

if __name__ == '__main__':
    main()
