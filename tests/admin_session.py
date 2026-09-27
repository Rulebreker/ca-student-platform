"""
Real admin session for the HTTP test scripts.

The static admin token and identifier aliases (admin, usr-admin-1, emails, ...) no longer
authenticate, so tests log in like the browser does. Credentials come from the environment only:
    EXCELLENCECA_TEST_ADMIN_EMAIL, EXCELLENCECA_TEST_ADMIN_PASSWORD   (an admin account of the target server)
    EXCELLENCECA_TEST_BASE_URL                                        (default http://127.0.0.1:8000)
"""
import json
import os
import urllib.error
import urllib.request

_cache = {}


def admin_token(base_url=None):
    base = (base_url or os.environ.get('EXCELLENCECA_TEST_BASE_URL') or 'http://127.0.0.1:8000').rstrip('/')
    if base in _cache:
        return _cache[base]
    email = os.environ.get('EXCELLENCECA_TEST_ADMIN_EMAIL')
    password = os.environ.get('EXCELLENCECA_TEST_ADMIN_PASSWORD')
    if not email or not password:
        raise SystemExit('Set EXCELLENCECA_TEST_ADMIN_EMAIL and EXCELLENCECA_TEST_ADMIN_PASSWORD to run this HTTP test.')
    req = urllib.request.Request(f"{base}/api/auth/login", method='POST',
                                 data=json.dumps({'identifier': email, 'password': password}).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Admin login failed for the test run (HTTP {e.code}).")
    token = res.get('token')
    if not token or (res.get('user') or {}).get('role') != 'admin':
        raise SystemExit('Admin login did not return an admin session token.')
    _cache[base] = token
    return token
