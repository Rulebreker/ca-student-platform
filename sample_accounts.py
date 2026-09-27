"""
sample_accounts.py - built-in demo / sample student accounts.

The platform ships sample students (server.INITIAL_USERS, the bundled backend_data.json and accounts
created by test scripts), all on the reserved demo e-mail domain below. They are useful for local
development but must not be ranked against real students or be re-created in production.

Sample data is OFF unless the environment explicitly opts in:
    EXCELLENCECA_SAMPLE_DATA=1   (local development / demos only)
Nothing here deletes or edits any stored account; callers only skip sample accounts.
"""
import os
from typing import Any, Dict, Optional, Set, Tuple

SAMPLE_EMAIL_DOMAINS = ('castudent.in',)
ENV_FLAG = 'EXCELLENCECA_SAMPLE_DATA'

# (id, email) of the seed sample students, registered by server.py from INITIAL_USERS
_seed_keys: Set[Tuple[str, str]] = set()


def sample_data_enabled() -> bool:
    return os.environ.get(ENV_FLAG, '').strip().lower() in ('1', 'true', 'yes', 'on')


def register_seed_users(users: Dict[str, Dict[str, Any]]) -> None:
    for u in (users or {}).values():
        if isinstance(u, dict) and u.get('role') == 'student':
            _seed_keys.add((str(u.get('id') or '').lower(), str(u.get('email') or '').lower()))


def is_sample_account(user: Optional[Dict[str, Any]]) -> bool:
    """True for a demo/sample student. An explicit isSample flag wins (False keeps a real account that
    happens to use the demo domain); otherwise the reserved demo domain or a seed sample identity."""
    if not isinstance(user, dict):
        return False
    flag = user.get('isSample', user.get('isDemo'))
    if flag is not None:
        return bool(flag)
    email = str(user.get('email') or '').strip().lower()
    if email.rsplit('@', 1)[-1] in SAMPLE_EMAIL_DOMAINS and '@' in email:
        return True
    return (str(user.get('id') or '').lower(), email) in _seed_keys


def is_seed_sample_student(user: Dict[str, Any]) -> bool:
    return isinstance(user, dict) and user.get('role') == 'student' and is_sample_account(user)


def without_sample_students(users: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Seed users that may be created in this environment (all of them when sample data is enabled)."""
    if sample_data_enabled():
        return dict(users)
    return {k: v for k, v in users.items() if not is_seed_sample_student(v)}
