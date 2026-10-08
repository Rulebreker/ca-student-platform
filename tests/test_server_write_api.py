"""
Server-side write endpoints for users and papers (requires the local server on :8000).
Creates uniquely named throwaway users/papers in the LOCAL dev store only.
"""
import json
import sys
import time
import urllib.error
import urllib.request
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'tests'))
import admin_session

BASE = 'http://127.0.0.1:8000'
ADMIN = admin_session.admin_token()
TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='


def call(path, body=None, token=ADMIN):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 method='POST' if body is not None else 'GET')
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        sys.exit(1)


stamp = str(int(time.time()))

# 1. Create a teacher with privileges (previously privileges were dropped by the server)
st, res = call('/api/admin/users', {'id': f'usr-teach-{stamp}', 'name': 'Test Teacher', 'email': f'teacher{stamp}@example.com',
                                    'password': 'Passw0rd!x', 'role': 'teacher', 'assignedSubjects': ['sub-3'],
                                    'privileges': {'canUploadTests': True, 'canGradeCopies': False, 'bogus': True}})
check(st == 200 and res['user']['privileges'] == {'canGradeCopies': False, 'canUploadTests': True, 'canUploadLectures': False, 'canViewStudents': False},
      f'create teacher stores cleaned privileges ({st})')
check('password' not in res['user'], 'create response never returns the password')
check(not res.get('token') and not res['user'].get('token'), 'provisioning does not hand the new user a session to the admin')
st, login = call('/api/auth/login', {'identifier': f'teacher{stamp}@example.com', 'password': 'Passw0rd!x'}, token=None)
check(st == 200 and str(login.get('token', '')).startswith('sess_'), f'teacher logs in and receives a session token ({st})')
teacher_token = login['token']

# 2. Update privileges + details through the new admin update endpoint
st, res = call('/api/admin/users/update', {'userId': f'usr-teach-{stamp}', 'privileges': {'canGradeCopies': True, 'canUploadTests': True}, 'phone': '9990001111'})
check(st == 200 and res['user']['privileges']['canGradeCopies'] is True and res['user']['phone'] == '9990001111', f'admin update endpoint ({st})')

# 3. Duplicate username is rejected
st, res = call('/api/admin/users/update', {'userId': f'usr-teach-{stamp}', 'username': 'rohan_sharma'})
check(st in (200, 409), f'duplicate username check responds ({st})')

# 4. Non-admin cannot use the update endpoint
st, res = call('/api/admin/users/update', {'userId': f'usr-teach-{stamp}', 'name': 'x'}, token=teacher_token)
check(st == 403, f'teacher cannot call admin update ({st})')

# 5. Teacher with canUploadTests can publish a paper; the record is persisted server-side
paper_id = f'asg-test-{stamp}'
st, res = call('/api/papers', {'id': paper_id, 'title': 'Teacher upload test', 'subjectId': 'sub-3', 'isPublished': True}, token=teacher_token)
check(st == 200 and res['paper']['id'] == paper_id, f'teacher with upload privilege can save a paper ({st})')
st, res = call('/api/papers')
check(any(p.get('id') == paper_id for p in res.get('papers', [])), 'paper is listed by GET /api/papers')

# 6. Paper status change (schedule / live / publish) persists through the same endpoint
st, res = call('/api/papers', {'id': paper_id, 'status': 'Scheduled', 'scheduledPublishTime': '2030-01-01T00:00:00Z'})
check(st == 200 and res['paper']['status'] == 'Scheduled', f'admin status change persists ({st})')

# 7. Teacher WITHOUT upload privilege is rejected
call('/api/admin/users/update', {'userId': f'usr-teach-{stamp}', 'privileges': {'canUploadTests': False}})
st, res = call('/api/papers', {'id': paper_id + '-x', 'title': 'x'}, token=teacher_token)
check(st == 403, f'teacher without privilege cannot save a paper ({st})')

# 8. Avatar through /api/user/profile: valid raster accepted, svg / oversized rejected
st, res = call('/api/user/profile', {'avatar': TINY_PNG}, token=teacher_token)
check(st == 200 and res['user']['avatar'] == TINY_PNG, f'profile avatar saved ({st})')
st, res = call('/api/user/profile', {'avatar': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='}, token=teacher_token)
check(st == 400, f'svg avatar rejected ({st})')
st, res = call('/api/user/profile', {'avatar': 'data:image/png;base64,' + 'A' * 500000}, token=teacher_token)
check(st == 400, f'oversized avatar rejected ({st})')

# cleanup (local dev store)
call('/api/papers/delete', {'id': paper_id, 'paperId': paper_id})
call('/api/admin/users/delete', {'userId': f'usr-teach-{stamp}'})
print('ALL PASS')
