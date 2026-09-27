"""
exam_levels.py - the one canonical exam-level model shared by students, MCQ tests, test papers,
scheduled MCQs / Auto-Pilot and the leaderboard.

Canonical internal value: the syllabus exam-level id ('foundation', 'intermediate', 'final'; see
syllabus_hierarchy.EXAM_LEVELS). Display names come from the same registry ('CA Foundation', ...).
Older records carry free-text variants ('CA FOUNDATION', 'CA INTER', 'CA Intermediate', ...); they are
resolved here and nowhere else.

Exam level (what content a student sees) is independent of the subscription tier (what they may open).
"""
from typing import Any, Dict, Iterable, Optional

import syllabus_hierarchy

# The three exam levels; every one is a full level for students, content and leaderboards
STUDENT_SELECTABLE_LEVEL_IDS = ('foundation', 'intermediate', 'final')

_NAMES = {lvl['id']: lvl['name'] for lvl in syllabus_hierarchy.EXAM_LEVELS}
# Exact aliases only (no substring guessing): ids, display names, legacy user values, enum-style
_ALIASES = {}
for _lvl in syllabus_hierarchy.EXAM_LEVELS:
    for _alias in (_lvl['id'], _lvl['name'], _lvl['code'], f"ca_{_lvl['id']}"):
        _ALIASES[_alias.strip().lower()] = _lvl['id']
_ALIASES.update({'ca inter': 'intermediate', 'inter': 'intermediate', 'ca fnd': 'foundation'})

# Legacy user.caLevel strings kept for older clients / admin screens
_LEGACY_USER_LABELS = {'foundation': 'CA FOUNDATION', 'intermediate': 'CA INTERMEDIATE', 'final': 'CA FINAL'}


def canonical_id(value: Any) -> Optional[str]:
    """'CA INTER' / 'CA Intermediate' / 'intermediate' -> 'intermediate'; None if not an exam level."""
    if value is None:
        return None
    return _ALIASES.get(str(value).strip().lower())


def display_name(level_id: Optional[str]) -> Optional[str]:
    return _NAMES.get(level_id) if level_id else None


def legacy_user_label(level_id: Optional[str]) -> Optional[str]:
    return _LEGACY_USER_LABELS.get(level_id) if level_id else None


def is_student_selectable(level_id: Optional[str]) -> bool:
    return level_id in STUDENT_SELECTABLE_LEVEL_IDS


def _subject_level(subject_id: Any, subjects: Optional[Iterable[Dict[str, Any]]] = None) -> Optional[str]:
    if not subject_id:
        return None
    for s in subjects or []:
        if isinstance(s, dict) and s.get('id') == subject_id:
            return canonical_id(s.get('levelId')) or canonical_id(s.get('level'))
    canonical = syllabus_hierarchy.get_subject_by_id(subject_id)
    return canonical_id(canonical.get('levelId')) if canonical else None


def record_level_id(record: Optional[Dict[str, Any]], subjects: Optional[Iterable[Dict[str, Any]]] = None) -> Optional[str]:
    """Exam level of a test / paper / scheduled task: explicit examLevelId, then examLevel / level,
    then the level of its subject. None = unknown (legacy record without any level information)."""
    if not isinstance(record, dict):
        return None
    for key in ('examLevelId', 'examLevel', 'level'):
        lvl = canonical_id(record.get(key))
        if lvl:
            return lvl
    return _subject_level(record.get('subjectId'), subjects)


def stamp_record(record: Dict[str, Any], subjects: Optional[Iterable[Dict[str, Any]]] = None) -> Optional[str]:
    """Give a content record the canonical pair (examLevelId + matching examLevel display name)."""
    lvl = record_level_id(record, subjects)
    if lvl:
        record['examLevelId'] = lvl
        record['examLevel'] = display_name(lvl)
    return lvl


def user_level_id(user: Optional[Dict[str, Any]]) -> Optional[str]:
    """A user's exam level: examLevelId, else resolved from the legacy caLevel text."""
    if not isinstance(user, dict):
        return None
    return canonical_id(user.get('examLevelId')) or canonical_id(user.get('caLevel'))


def stamp_user(user: Dict[str, Any], level_id: str) -> None:
    user['examLevelId'] = level_id
    user['caLevel'] = legacy_user_label(level_id)


def content_scope(user: Optional[Dict[str, Any]]) -> Optional[str]:
    """The exam level whose content this user's student-facing listings are limited to, or None for
    no restriction (visitors, admins, teachers, and a student account whose level cannot be read)."""
    if not isinstance(user, dict) or user.get('role') in ('admin', 'teacher'):
        return None
    lvl = user_level_id(user)
    return lvl if is_student_selectable(lvl) else None


def level_conflict(record: Dict[str, Any], subjects: Optional[Iterable[Dict[str, Any]]] = None) -> Optional[str]:
    """Error text if the record's explicit exam level disagrees with its subject's level (e.g. a CA
    Foundation subject saved as CA Intermediate content), else None."""
    explicit = canonical_id(record.get('examLevelId')) or canonical_id(record.get('examLevel'))
    subject = _subject_level(record.get('subjectId'), subjects)
    if explicit and subject and explicit != subject:
        return f"The selected subject belongs to {display_name(subject)}, not {display_name(explicit)}."
    return None


def in_scope(record: Dict[str, Any], scope: Optional[str], subjects: Optional[Iterable[Dict[str, Any]]] = None) -> bool:
    """True if the record belongs to the scope's level. Records with no level information at all stay
    visible (never guessed into a level)."""
    if not scope:
        return True
    lvl = record_level_id(record, subjects)
    return lvl is None or lvl == scope
