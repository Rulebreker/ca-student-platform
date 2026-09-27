/**
 * exam-levels.js - the one exam-level model used by every student-facing listing (MCQ tests, test
 * papers, leaderboard), registration, the profile and the admin scheduler filter.
 * Mirrors exam_levels.py on the server: the canonical value is the syllabus id
 * ('foundation' | 'intermediate' | 'final'); display names and legacy caLevel labels derive from it.
 * The server enforces the same scope on /api/tests and /api/papers; this file keeps the UI consistent.
 */
(function () {
  const LEVELS = [
    { id: 'foundation', name: 'CA Foundation', legacy: 'CA FOUNDATION' },
    { id: 'intermediate', name: 'CA Intermediate', legacy: 'CA INTERMEDIATE' },
    { id: 'final', name: 'CA Final', legacy: 'CA FINAL' }
  ];
  const STUDENT_SELECTABLE = ['foundation', 'intermediate', 'final'];
  const ALIASES = {};
  LEVELS.forEach(l => {
    [l.id, l.name, l.legacy, `ca_${l.id}`].forEach(a => { ALIASES[a.toLowerCase()] = l.id; });
  });
  Object.assign(ALIASES, { 'ca inter': 'intermediate', 'inter': 'intermediate', 'fnd': 'foundation' });

  function canonicalId(value) {
    if (value === null || value === undefined) return null;
    return ALIASES[String(value).trim().toLowerCase()] || null;
  }
  function displayName(id) {
    const l = LEVELS.find(x => x.id === id);
    return l ? l.name : null;
  }
  function legacyLabel(id) {
    const l = LEVELS.find(x => x.id === id);
    return l ? l.legacy : null;
  }
  function isStudentSelectable(id) {
    return STUDENT_SELECTABLE.includes(id);
  }
  /** Level of a test / paper / scheduled task: explicit field, else its subject's level; null if unknown. */
  function recordLevelId(record) {
    if (!record) return null;
    for (const key of ['examLevelId', 'examLevel', 'level']) {
      const id = canonicalId(record[key]);
      if (id) return id;
    }
    const subject = record.subjectId && window.store && typeof window.store.getSubjectById === 'function'
      ? window.store.getSubjectById(record.subjectId) : null;
    return subject ? (canonicalId(subject.levelId) || canonicalId(subject.level)) : null;
  }
  function userLevelId(user) {
    if (!user) return null;
    return canonicalId(user.examLevelId) || canonicalId(user.caLevel);
  }
  /** Level a student's listings are limited to; null = unrestricted (visitors, staff, unreadable level). */
  function contentScope(user) {
    if (!user || user.role === 'admin' || user.role === 'teacher') return null;
    const id = userLevelId(user);
    return isStudentSelectable(id) ? id : null;
  }
  function currentScope() {
    const user = window.auth && typeof window.auth.getCurrentUser === 'function' ? window.auth.getCurrentUser() : null;
    return contentScope(user);
  }
  /** Records without any level information stay visible (never guessed into a level). */
  function inScope(record, scope) {
    if (!scope) return true;
    const id = recordLevelId(record);
    return id === null || id === scope;
  }
  /** Filter value ('all' | display name | id) matches a record. */
  function matchesFilter(record, filterValue) {
    if (!filterValue || String(filterValue).toLowerCase() === 'all') return true;
    return recordLevelId(record) === canonicalId(filterValue);
  }

  window.ExamLevels = {
    LEVELS, STUDENT_SELECTABLE, canonicalId, displayName, legacyLabel, isStudentSelectable,
    recordLevelId, userLevelId, contentScope, currentScope, inScope, matchesFilter
  };
})();
