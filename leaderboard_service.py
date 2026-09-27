"""
leaderboard_service.py - server-side leaderboard built from the platform's existing records:
users (students), test_attempts, submissions (evaluated test papers), tests, papers, subjects and
subscriptions. No separate results store.

XP semantics are the ones the browser leaderboard used (js/leaderboard.js calculateStudentXp):
  * MCQ XP     - per test, the student's best attempt (earnedPoints, else grossMarks / finalScore);
                 correct answers counted from that best attempt
  * paper XP   - evaluated submissions (pointsAwarded, else marksObtained)
  * referral   - referralCount x referralXp (overall view only)
  * base XP    - baseXp (subject view: subjectXp[subject], else 25 % of baseXp)
  * overall view: an explicit student.totalXp is authoritative (admin resets / adjustments)
Ranking: totalXp desc, then correct answers desc, then name - ties keep this deterministic order and
share nothing else (same as before).
The exam level only decides WHICH students are ranked together; the caller supplies it from the
authenticated account, never from the request. Demo/sample students (sample_accounts) are never
ranked unless sample data is explicitly enabled for local development.
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import exam_levels
import sample_accounts

DEFAULT_REFERRAL_XP = 500
PUBLIC_FIELDS_DEFAULTS = {'state': 'Uttar Pradesh', 'district': 'Meerut', 'city': 'Meerut'}


def _js_round(x: float) -> int:
    """Math.round semantics (half up), not Python's banker's rounding."""
    return int(math.floor(float(x) + 0.5))


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _subject_index(data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    idx = {}
    for s in data.get('subjects') or []:
        if isinstance(s, dict):
            if s.get('id'):
                idx[s['id']] = s
            if s.get('name'):
                idx[str(s['name']).lower()] = s
    return idx


def _subject_matches(record: Dict[str, Any], subjects: Dict[str, Dict[str, Any]], subject_filter: str) -> bool:
    sub = subjects.get(record.get('subjectId')) or subjects.get(str(record.get('subject') or '').lower())
    name = str((sub or {}).get('name') or record.get('subject') or '').lower()
    return name == subject_filter or str(record.get('subjectId') or '').lower() == subject_filter


def subscription_tier(user_id: str, data: Dict[str, Any], now: Optional[datetime] = None) -> str:
    sub = (data.get('subscriptions') or {}).get(user_id)
    if not isinstance(sub, dict) or sub.get('status') not in ('active', 'manually_granted'):
        return 'free'
    exp = sub.get('expiresAt')
    if exp:
        try:
            exp_dt = datetime.fromisoformat(str(exp).replace('Z', '+00:00'))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt <= (now or datetime.now(timezone.utc)):
                return 'free'
        except ValueError:
            pass
    return str(sub.get('planTier') or sub.get('tier') or 'core').lower()


def student_xp(student: Dict[str, Any], attempts: List[Dict[str, Any]], submissions: List[Dict[str, Any]],
               tests: Dict[str, Dict[str, Any]], papers: Dict[str, Dict[str, Any]],
               subjects: Dict[str, Dict[str, Any]], subject_filter: str = 'all',
               referral_xp_rate: float = DEFAULT_REFERRAL_XP) -> Dict[str, int]:
    subject_filter = (subject_filter or 'all').lower()
    by_subject = subject_filter != 'all'

    best: Dict[str, Dict[str, float]] = {}
    for att in attempts:
        test = tests.get(att.get('testId'))
        if not test or (by_subject and not _subject_matches(test, subjects, subject_filter)):
            continue
        points = _num(att.get('earnedPoints')) if att.get('earnedPoints') is not None \
            else _num(att.get('grossMarks') or att.get('finalScore'))
        if att.get('testId') not in best or points > best[att['testId']]['points']:
            best[att['testId']] = {'points': points, 'correct': _num(att.get('correctCount'))}
    mcq_xp = sum(_js_round(b['points']) for b in best.values())
    correct = int(sum(b['correct'] for b in best.values()))

    descriptive_xp = 0
    for sub in submissions:
        paper = papers.get(sub.get('assignmentId'))
        if not paper or (by_subject and not _subject_matches(paper, subjects, subject_filter)):
            continue
        pts = _num(sub.get('pointsAwarded')) if sub.get('pointsAwarded') is not None else _num(sub.get('marksObtained'))
        descriptive_xp += _js_round(pts)

    referral_xp = 0 if by_subject else int(_num(student.get('referralCount')) * referral_xp_rate)
    if by_subject:
        subj_xp = student.get('subjectXp') or {}
        key = next((k for k in subj_xp if str(k).lower() == subject_filter), None)
        base_xp = int(_num(subj_xp[key])) if key is not None else _js_round(_num(student.get('baseXp')) * 0.25)
    else:
        base_xp = int(_num(student.get('baseXp')))

    total = mcq_xp + descriptive_xp + referral_xp + base_xp
    if not by_subject and student.get('totalXp') is not None:
        total = int(_num(student.get('totalXp')))   # authoritative after admin reset / adjustment
    return {'totalXp': max(0, total), 'mcqXp': mcq_xp, 'descriptiveXp': descriptive_xp,
            'referralXp': referral_xp, 'baseXp': base_xp, 'correctQuestions': correct}


def build_leaderboard(data: Dict[str, Any], level_id: Optional[str], subject: str = 'all',
                      include_samples: bool = False) -> List[Dict[str, Any]]:
    """Ranked public rows for the students of one exam level (level_id None = every level, staff only)."""
    revoked = {str(x).lower().strip() for x in data.get('revoked_users') or []}
    students = []
    for u in (data.get('users') or {}).values():
        if not isinstance(u, dict) or u.get('role') != 'student' or u.get('isActive') is False or u.get('isDeleted'):
            continue
        ids = {str(u.get('id') or '').lower(), str(u.get('email') or '').lower(), str(u.get('username') or '').lower().lstrip('@')}
        if ids & revoked:
            continue
        if not include_samples and sample_accounts.is_sample_account(u):
            continue
        if level_id and exam_levels.user_level_id(u) != level_id:
            continue
        students.append(u)

    attempts_by_user: Dict[str, List[Dict[str, Any]]] = {}
    for a in data.get('test_attempts') or []:
        if isinstance(a, dict) and a.get('userId'):
            attempts_by_user.setdefault(a['userId'], []).append(a)
    subs_by_user: Dict[str, List[Dict[str, Any]]] = {}
    for s in data.get('submissions') or []:
        if isinstance(s, dict) and s.get('studentId') and s.get('status') == 'Evaluated':
            subs_by_user.setdefault(s['studentId'], []).append(s)
    tests = {t['id']: t for t in data.get('tests') or [] if isinstance(t, dict) and t.get('id')}
    papers = {p['id']: p for p in (data.get('papers') or []) + (data.get('assignments') or []) if isinstance(p, dict) and p.get('id')}
    subjects = _subject_index(data)
    rate = _num((data.get('xp_settings') or {}).get('referralXp')) or DEFAULT_REFERRAL_XP
    now = datetime.now(timezone.utc)

    rows = []
    for st in students:
        xp = student_xp(st, attempts_by_user.get(st.get('id'), []), subs_by_user.get(st.get('id'), []),
                        tests, papers, subjects, subject, rate)
        lvl = exam_levels.user_level_id(st)
        rows.append({
            'id': st.get('id'),
            'name': st.get('name') or st.get('username') or 'Student',
            'username': st.get('username') or '',
            'examLevelId': lvl,
            'caLevel': exam_levels.legacy_user_label(lvl) or st.get('caLevel') or 'CA Student',
            'avatar': st.get('avatar') or '',
            'state': st.get('state') or PUBLIC_FIELDS_DEFAULTS['state'],
            'district': st.get('district') or st.get('city') or PUBLIC_FIELDS_DEFAULTS['district'],
            'city': st.get('city') or PUBLIC_FIELDS_DEFAULTS['city'],
            'previousRank': st.get('previousRank'),
            'achievementBadges': st.get('achievementBadges') or [],
            'subscriptionTier': subscription_tier(st.get('id'), data, now),
            **xp,
        })
    rows.sort(key=lambda r: (-r['totalXp'], -r['correctQuestions'], str(r['name']).lower()))
    for i, r in enumerate(rows, start=1):
        r['rank'] = i
    return rows
