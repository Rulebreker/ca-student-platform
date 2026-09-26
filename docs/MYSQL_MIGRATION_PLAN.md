# MySQL Migration Plan

Status: **plan only** — nothing here is applied yet. No MySQL server is required to read or review it.
Working checkpoint: commit `8e66611` (Local Qwen worker architecture). Draft DDL: [`docs/mysql/001_schema.sql`](mysql/001_schema.sql).

Target end state: MySQL is the single production source of truth. Firebase RTDB, MongoDB Atlas and
`backend_data.json` / `/tmp/backend_data.json` are removed from production reads and writes.

---

## 1. What the job repository needs (`job_repository.py`)

`ai_job_manager` touches production state only through `JobRepository`:

| Repository method | Data today (`backend_data` key) | MySQL table |
|---|---|---|
| `list_jobs`, `get`, `save` | `ai_generation_jobs` (list, capped at 50, active jobs never dropped) | `ai_generation_jobs` |
| `get_worker_status`, `save_worker_status` | `ai_worker_status` (single dict) | `ai_worker_status` (one row per worker) |
| `existing_question_texts` | `questions` (read, same subject + chapter) | `questions` (`idx_questions_chapter`) |
| `save_questions` | `questions` (append, idempotent by id) | `questions` |
| `save_test` | `tests` (upsert, newest first) | `tests` |
| `add_generation_log` | `ai_generation_logs` (prepend) | `ai_generation_logs` |
| `persist` | whole-file JSON write | transaction commit |

Related state touched *around* the repository (not yet behind it):

| Where | Data | Table |
|---|---|---|
| `ai_scheduler.apply_job_outcome_to_task` (called from `_notify_scheduler` with `repo.data`) | `ai_scheduled_tasks`, `tests` (live window) | `ai_scheduled_tasks`, `tests` |
| `ai_scheduler.process_due_tasks` / `dispatch_scheduled_task` | `ai_scheduled_tasks`, `ai_autopilot_config`, `tests` (expiry) | `ai_scheduled_tasks`, `app_settings`, `tests` |
| `server.py` job endpoints | wrap calls in `job_repository.STORE_LOCK` + `load_backend_data()` | transactions |

**Concurrency contract for the MySQL implementation.** Today every job mutation is a
read-modify-write under the process-local `STORE_LOCK`, which is correct for one process only.
In MySQL each of these must be one transaction:

- **claim**: `SELECT … FROM ai_generation_jobs WHERE status='QUEUED' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`, then `UPDATE … SET status='CLAIMED', worker_id=?, lease_expires_at=?, claim_count=claim_count+1 WHERE id=? AND status='QUEUED'` (affected rows = 1 ⇒ claimed).
- **lease renewal / progress / complete / fail**: `UPDATE … WHERE id=? AND worker_id=? AND status IN (leased statuses)`; 0 affected rows ⇒ HTTP 409 (lease lost) — exactly today's `_owned_job` semantics.
- **stale-lease recovery** (`expire_stale_jobs`): `UPDATE … WHERE status IN (leased) AND lease_expires_at < NOW(3)` — idempotent, safe from any instance.
- **complete**: questions + test + log + job status + scheduled-task outcome in one transaction.

Job payload sizing: `generatedQuestions` is kept inside `doc` only while a job is active; on
completion the questions live in `questions` and `doc.result.questions` should be trimmed to ids
(today 39 jobs = 895 KB of JSON, mostly duplicated question text).

## 2. Every remaining Firebase / MongoDB / JSON-store dependency

### 2.1 Browser → Firebase RTDB (direct, bypassing the server) — the biggest blocker

`index.html` loads the Firebase SDK (app, database, storage) plus `js/firebase-config.js` and
`js/firebase-sync.js`. The browser **writes production data straight into RTDB**:

| `firebaseSync` method | Called from | RTDB path |
|---|---|---|
| `saveUser`, `deleteUser` | store.js, auth.js, admin-dashboard.js | `users/{id}` (full user object, including `password`) |
| `saveTest`, `deleteTest`, `saveQuestion`, `deleteQuestion` | store.js | `tests`, `questions` |
| `saveSubscription`, `saveSubscriptionPlans` | store.js, subscription.js | `subscriptions`, `subscription_plans` |
| `savePaymentSession`, `savePaymentChannels` | store.js | `payment_sessions`, `payment_channels` |
| `saveAssignment`, `deleteAssignment`, `saveSubmission` | store.js | `assignments`, `submissions` |
| `saveXpTransaction`, `saveXpResetSettings`, `saveXpResetEvent` | store.js, admin-dashboard.js | `xp_transactions`, `xp_reset_settings`, `xp_reset_history` |
| `saveReferral` | store.js, auth.js | `referrals` |
| `saveNotification`, `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`, `clearNotifications` | store.js | `notifications` |
| `saveBookmark`, `deleteBookmark` | store.js | `bookmarks` |
| `saveSubject`, `deleteSubject` | store.js | `subjects` |
| `saveAdminAuditLog` | store.js | `admin_audit_logs` |
| `uploadToFirebaseStorage` | admin-dashboard.js (explanation images) | Firebase **Storage** |
| `checkAndSeedDatabase` | firebase-sync.js | overwrites `users`/`tests`/`questions`/`assignments`/`subjects` from the browser's local store when RTDB is empty |

Realtime listeners (`attachListeners`, `attachCurrentUserListener`) stream `assignments`, `tests`,
`subjects`, `users` (admin), `submissions`, `admin_audit_logs`, `xp_reset_settings`,
`subscriptions/{uid}` and `users/{uid}` into the UI.

**Login fallback**: `js/auth.js` (≈ lines 357–430) authenticates against RTDB *in the browser*:
it reads `users` (all users) and compares passwords client-side when the API is unavailable.

> **Unverified, check now:** whether the RTDB security rules allow public reads. The existing
> `tests/test_production_critical_gate.py` reads `users/…json` without credentials, which suggests
> they do. Combined with the plaintext passwords below, that would expose user credentials to the
> internet. Check *Firebase console → Realtime Database → Rules*.

### 2.2 Server → MongoDB Atlas

| Location | Use |
|---|---|
| `mongodb_manager.py` | client (hard-coded credentials in `DEFAULT_MONGODB_URI`), `sync_document_to_mongo`, `load_collection_from_mongo` |
| `server.py` `sync_to_database` / alias `sync_to_firebase` (59 call sites) + `JobRepository.mirror` | every write is mirrored to Mongo in a background thread (lost when Vercel freezes the function) |
| `server.py` `sync_collections_from_firebase` (≈1019) and cold-start seed in `load_backend_data` (≈1373) | Mongo → local merge. **Both merge blocks are unreachable code** (after `continue`), so production never actually reads Mongo back |
| `server.py` `/api/admin/ai/jobs/status` (≈3143) | direct `find_one` of a single job |
| `scratch_prune_jobs.py` | ad-hoc script writing to production Mongo |

Note: despite the names, server code does **not** talk to Firebase any more — `sync_to_firebase`
writes to MongoDB.

### 2.3 JSON store (`backend_data.json`)

| Location | Use |
|---|---|
| `server.py` `DATA_STORE_FILE` (line 35) | `/tmp/backend_data.json` on Vercel (per-instance, ephemeral), `private_storage/backend_data.json` locally |
| `server.py` `load_backend_data` (99 call sites) / `save_backend_data` (59 call sites) | whole-document read/write on every request |
| repo root `backend_data.json` (tracked in git, deployed) | cold-start seed copied into `/tmp` on Vercel |
| `scripts/migrate_qr_codes.py`, `scratch_prune_jobs.py` | read/write the JSON file directly |

## 3. Data inventory (from `backend_data.json`, 2026-09-26)

30 top-level keys. Row counts (tracked seed / local dev store):

| Key | Shape | Rows | Notes |
|---|---|---|---|
| users | dict keyed by **email** | 71 / 69 | **duplicate id** `usr-teacher-1` on two emails; duplicate username `prof_rajesh`; **26 plaintext passwords**; static `token` field per user |
| tests | list | 47 / 56 | |
| questions | list | 252 / 294 | 42–50 distinct fields; every question has an existing test |
| test_attempts | list | 36 | 3 reference deleted tests |
| ai_generation_jobs | list | 19 / 39 | 673–895 KB (embedded questions) |
| ai_generation_logs, ai_scheduled_tasks, deleted_scheduled_tasks | list | 30 / 3 / 5 | |
| ai_source_documents | list | 11 | 337 KB, chunks embedded |
| subscriptions | dict keyed by user id | 5 | |
| subscription_plans | dict keyed by plan id | 7 | |
| payment_sessions | list | 116 | **no `id` field** — key is `paymentSessionId` (unique). Mongo sync falls back to positional ids `payment_sessions_{index}`, which overwrite each other when the list changes |
| payment_channels | list | 9 | QR images |
| assignments, papers | list | 4 / 4 | same shape; **base64 PDFs embedded** (`questionPdfData`) |
| notifications | list | 54 / 731 | |
| xp_transactions | list | 115 | `idempotencyKey` |
| referrals, xp_reset_history, subjects, bookmarks, submissions | list | 6 / 4 / 15 / 0 / 0 | |
| admin_audit_logs | list | 149 / 269 | |
| revoked_tokens, revoked_users | list of strings | 45 / 18 | |
| ai_autopilot_config, referral_settings, xp_reset_settings | dict (singleton) | — | → `app_settings` |
| ai_providers | list | 2 | obsolete — not migrated |
| ai_worker_status | dict | — | runtime state |

## 4. Schema approach

See `docs/mysql/001_schema.sql` (MySQL 8.0, InnoDB, utf8mb4). Each table keeps the full application
document in a `doc JSON` column (lossless, so existing dict-based code keeps working) and promotes the
columns that are filtered, joined or locked (`status`, `worker_id`, `lease_expires_at`, `test_id`,
`user_id`, `email`, timestamps …) into typed, indexed columns. Constraints enforce what the JSON store
cannot: unique email/username, unique `idempotency_key`, `questions.test_id` FK, one subscription per user.

Deliberate structural changes:
- `users.password_hash` only — plaintext is hashed during migration; `password`/`token` removed from `doc`.
- per-user static tokens → `auth_sessions` (sha256 of token), `revoked_tokens` → `revoked_at`.
- `payment_sessions` keyed by `payment_session_id`.
- `assignments` + `papers` → one `assignments` table with `kind`; PDFs and QR images → object storage (URL in `doc`).
- `ai_source_documents.chunks` → `ai_source_chunks`.
- singletons → `app_settings`.

## 5. Data fixes required before import (decisions for the owner)

1. `usr-teacher-1` is shared by `prof.sharma@…` and `rajesh.teacher@…` (same username `prof_rajesh`) — merge them or assign a new id to one (and re-point their attempts/audit rows).
2. Hash the 26 plaintext passwords with the current `sha256:salt:hash` scheme, then remove the plaintext fallback in `server.verify_password`. Treat those passwords as exposed (they are in git history).
3. 3 `test_attempts` whose test was deleted → `test_id = NULL`, keep `testTitle` in `doc`.
4. Reconcile the three copies of production data (next section) before choosing which record wins.

## 6. Migration tooling (to build next; runs without touching production until `--apply`)

`scripts/migrate_to_mysql.py`
1. **Export** read-only snapshots of all three sources: MongoDB Atlas collections, Firebase RTDB (`/.json` per top-level key) and the deployed `backend_data.json`.
2. **Reconcile** per collection and id: pick the newest `updatedAt`/`createdAt`; write a conflict report (ids present in only one source, divergent documents). Browser writes go to RTDB and server writes go to Mongo, so neither alone is complete.
3. **Transform** documents → rows (typed columns derived from `doc`), apply the §5 fixes, move blobs to object storage.
4. **Dry run** (default): print per-table row counts, constraint violations and the conflict report — no MySQL needed.
5. **Apply**: idempotent `INSERT … ON DUPLICATE KEY UPDATE` in dependency order (users → tests → questions → attempts …).
6. **Verify**: per-table counts vs source, sha256 of canonical JSON per document, FK/orphan checks, login check for sample users, sample test render.

## 7. Code boundaries to add (next phase, behaviour-preserving)

1. `STORAGE_BACKEND` env (`json` | `mysql`, default `json`) and a factory that returns the repository implementation. `MYSQL_HOST/PORT/DATABASE/USER/PASSWORD/SSL_MODE` from env only.
2. `MySQLJobRepository` implementing the §1 contract with the §1 transactions; run the existing `tests/test_qwen_job_lifecycle.py` against both implementations.
3. Move the scheduler hand-off (`apply_job_outcome_to_task`) and task reads/writes behind a `ScheduledTaskRepository`.
4. For the ~150 `load_backend_data`/`save_backend_data` call sites: an interim `DataStore` adapter with the same `load(collections)` / `save(data)` interface backed by MySQL (load only requested collections, save only changed documents), then migrate hot paths (auth, tests, attempts, payments) to real repositories.
5. Replace every browser → RTDB write in §2.1 with an authenticated server API call; replace realtime listeners with polling (or SSE); remove the client-side login fallback.

## 8. Cutover

1. Freeze writes (maintenance flag), export + reconcile + apply + verify.
2. Deploy with `STORAGE_BACKEND=mysql`; smoke test login, subscriptions/payments, tests/attempts, leaderboard/XP, referrals, admin, Generate & Host, Auto-Pilot.
3. Unfreeze. Rollback = redeploy with `STORAGE_BACKEND=json` (sources are not modified by the migration).
4. After a stable period: remove MongoDB (`mongodb_manager.py`, `pymongo`, `sync_to_*`), the JSON store and seed file, then Firebase (§9).

## 9. What must be done before Firebase can be removed

1. Every browser → RTDB write/listener in §2.1 replaced by server APIs (≈30 methods in store.js, auth.js, admin-dashboard.js, subscription.js), including the client-side login fallback in auth.js.
2. Explanation-image uploads moved from Firebase Storage to the new object storage.
3. RTDB data reconciled and imported into MySQL (§6) — RTDB currently holds browser-written records that exist nowhere else.
4. Server persistence on MySQL (§7) so the app does not depend on the JSON store / Mongo either.
5. Then delete: SDK tags in `index.html`, `js/firebase-config.js`, `js/firebase-sync.js`, `firebaseSync` call sites, `tests/test_production_critical_gate.py::test_13`, `tests/verify_test22.py` RTDB checks, `scripts/migrate_qr_codes.py` RTDB part; rename `sync_to_firebase`.
6. Security hygiene regardless of timing: lock RTDB rules to deny public reads now; rotate the MongoDB password, admin password and master token; remove plaintext passwords from the tracked `backend_data.json`.
