-- =============================================================================
-- ExcellenceCA — MySQL 8.0 schema (DRAFT, not applied anywhere yet)
-- See docs/MYSQL_MIGRATION_PLAN.md.
--
-- Design: every table keeps the application document losslessly in `doc` (JSON) and
-- promotes the columns that are queried, filtered, joined or locked into typed columns.
-- The application keeps reading/writing documents, so the existing dict-based code can move
-- over without reshaping records; typed columns are written from the document on every save.
-- Charset utf8mb4 (question text contains ₹ and other non-ASCII symbols).
-- =============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- PHASE A — job repository and the content a generation job publishes
-- ---------------------------------------------------------------------------

CREATE TABLE ai_generation_jobs (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    status             VARCHAR(16)  NOT NULL,            -- QUEUED CLAIMED GENERATING VALIDATING PUBLISHING COMPLETED PARTIAL FAILED EXPIRED
    worker_id          VARCHAR(96)  NULL,
    claim_count        INT          NOT NULL DEFAULT 0,
    lease_expires_at   DATETIME(3)  NULL,
    last_heartbeat_at  DATETIME(3)  NULL,
    scheduled_task_id  VARCHAR(64)  NULL,
    test_id            VARCHAR(64)  NULL,
    subject            VARCHAR(120) NULL,
    chapter_id         VARCHAR(64)  NULL,
    requested_count    INT          NOT NULL,
    generated_count    INT          NOT NULL DEFAULT 0,
    created_at         DATETIME(3)  NOT NULL,
    updated_at         DATETIME(3)  NOT NULL,
    completed_at       DATETIME(3)  NULL,
    doc                JSON         NOT NULL,            -- full job record incl. generatedQuestions while active
    KEY idx_jobs_status_created (status, created_at),
    KEY idx_jobs_worker (worker_id, status),
    KEY idx_jobs_lease (status, lease_expires_at),
    KEY idx_jobs_task (scheduled_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_worker_status (
    worker_id          VARCHAR(96)  NOT NULL PRIMARY KEY,
    status             VARCHAR(16)  NOT NULL,            -- idle / busy (online/offline is derived from last_heartbeat_at)
    model              VARCHAR(64)  NOT NULL,
    ollama_healthy     TINYINT(1)   NOT NULL DEFAULT 0,
    last_latency_ms    DECIMAL(10,1) NULL,               -- NULL = unavailable (UI shows N/A)
    current_job_id     VARCHAR(64)  NULL,
    last_heartbeat_at  DATETIME(3)  NOT NULL,
    doc                JSON         NOT NULL,
    KEY idx_worker_heartbeat (last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tests (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    title              VARCHAR(255) NOT NULL,
    subject            VARCHAR(120) NULL,
    subject_id         VARCHAR(32)  NULL,
    chapter_id         VARCHAR(64)  NULL,
    status             VARCHAR(24)  NULL,                -- Draft / Published / Scheduled / Live / Expired
    is_published       TINYINT(1)   NOT NULL DEFAULT 0,
    is_live            TINYINT(1)   NOT NULL DEFAULT 0,
    live_expires_at    DATETIME(3)  NULL,
    ai_job_id          VARCHAR(64)  NULL,
    created_at         DATETIME(3)  NULL,
    updated_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_tests_status (status, is_published),
    KEY idx_tests_live (is_live, live_expires_at),
    KEY idx_tests_job (ai_job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE questions (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    test_id            VARCHAR(64)  NOT NULL,
    number             INT          NULL,
    subject            VARCHAR(120) NULL,
    chapter_id         VARCHAR(64)  NULL,
    correct_option     CHAR(1)      NULL,
    ai_job_id          VARCHAR(64)  NULL,
    stem_hash          CHAR(64)     NULL,                -- sha256 of normalised stem: exact-duplicate lookups
    created_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_questions_test (test_id, number),
    KEY idx_questions_chapter (subject, chapter_id),
    KEY idx_questions_stem (stem_hash),
    CONSTRAINT fk_questions_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_generation_logs (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    job_id             VARCHAR(64)  NULL,
    test_id            VARCHAR(64)  NULL,
    status             VARCHAR(16)  NULL,
    created_at         DATETIME(3)  NOT NULL,
    doc                JSON         NOT NULL,
    KEY idx_logs_created (created_at),
    KEY idx_logs_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_scheduled_tasks (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    status             VARCHAR(16)  NOT NULL,            -- scheduled processing live completed failed paused cancelled CLAIMING
    enabled            TINYINT(1)   NOT NULL DEFAULT 1,
    schedule_type      VARCHAR(16)  NOT NULL,            -- one_time / recurring
    next_run_at        DATETIME(3)  NULL,
    active_job_id      VARCHAR(64)  NULL,
    updated_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_tasks_due (enabled, status, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE deleted_scheduled_tasks (
    task_id            VARCHAR(64)  NOT NULL PRIMARY KEY,
    deleted_at         DATETIME(3)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Singleton / settings documents: ai_autopilot_config, referral_settings, xp_reset_settings,
-- _xp_historical_synced, last_runtime_test_ts
CREATE TABLE app_settings (
    setting_key        VARCHAR(64)  NOT NULL PRIMARY KEY,
    value              JSON         NOT NULL,
    updated_at         DATETIME(3)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- PHASE B — remaining production state (everything else in backend_data.json)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    email              VARCHAR(255) NOT NULL,
    username           VARCHAR(120) NULL,
    role               VARCHAR(16)  NOT NULL,            -- admin / teacher / student
    is_active          TINYINT(1)   NOT NULL DEFAULT 1,
    is_deleted         TINYINT(1)   NOT NULL DEFAULT 0,
    password_hash      VARCHAR(255) NULL,                -- NEVER plaintext: hashed during migration
    total_xp           INT          NOT NULL DEFAULT 0,
    created_at         DATETIME(3)  NULL,
    updated_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,            -- profile WITHOUT password / token fields
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username),
    KEY idx_users_role (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Replaces the static per-user `token` field and revoked_tokens list
CREATE TABLE auth_sessions (
    token_hash         CHAR(64)     NOT NULL PRIMARY KEY, -- sha256(token); raw tokens are never stored
    user_id            VARCHAR(64)  NOT NULL,
    created_at         DATETIME(3)  NOT NULL,
    expires_at         DATETIME(3)  NULL,
    revoked_at         DATETIME(3)  NULL,
    KEY idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE revoked_identities (                          -- revoked_users (email / username / id)
    identifier         VARCHAR(255) NOT NULL PRIMARY KEY,
    revoked_at         DATETIME(3)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE subscription_plans (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    tier               VARCHAR(16)  NOT NULL,
    is_active          TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order         INT          NULL,
    doc                JSON         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE subscriptions (
    user_id            VARCHAR(64)  NOT NULL PRIMARY KEY,  -- current document is one per user (history inside doc)
    plan_id            VARCHAR(64)  NULL,
    plan_tier          VARCHAR(16)  NULL,
    status             VARCHAR(16)  NOT NULL,
    expires_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_subs_expiry (status, expires_at),
    CONSTRAINT fk_subs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE payment_sessions (
    payment_session_id VARCHAR(64)  NOT NULL PRIMARY KEY,  -- source records have no `id`; this is their key
    user_id            VARCHAR(64)  NULL,
    plan_id            VARCHAR(64)  NULL,
    status             VARCHAR(24)  NOT NULL,
    amount             DECIMAL(10,2) NULL,
    created_at         DATETIME(3)  NULL,
    expires_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_payments_user (user_id, created_at),
    KEY idx_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE payment_channels (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    is_active          TINYINT(1)   NOT NULL DEFAULT 1,
    is_primary         TINYINT(1)   NOT NULL DEFAULT 0,
    sort_order         INT          NULL,
    doc                JSON         NOT NULL                -- QR images referenced by URL, not embedded
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE test_attempts (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    test_id            VARCHAR(64)  NULL,                  -- NULL when the test was deleted (3 such rows today)
    user_id            VARCHAR(64)  NOT NULL,
    attempt_number     INT          NULL,
    submitted_at       DATETIME(3)  NULL,
    final_score        DECIMAL(8,2) NULL,
    doc                JSON         NOT NULL,              -- keeps testTitle for orphaned attempts
    KEY idx_attempts_user (user_id, submitted_at),
    KEY idx_attempts_test_user (test_id, user_id),
    CONSTRAINT fk_attempts_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE xp_transactions (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    user_id            VARCHAR(64)  NOT NULL,
    idempotency_key    VARCHAR(191) NULL,
    points             INT          NOT NULL,
    created_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    UNIQUE KEY uq_xp_idempotency (idempotency_key),
    KEY idx_xp_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE xp_reset_history (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    created_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE referrals (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    referrer_id        VARCHAR(64)  NULL,
    referred_id        VARCHAR(64)  NULL,
    created_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_referrals_referrer (referrer_id),
    KEY idx_referrals_referred (referred_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    user_id            VARCHAR(64)  NULL,
    is_read            TINYINT(1)   NOT NULL DEFAULT 0,
    created_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_notifications_user (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE bookmarks (
    id                 VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id            VARCHAR(64)  NOT NULL,
    doc                JSON         NOT NULL,
    KEY idx_bookmarks_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- assignments and papers currently embed base64 PDFs (questionPdfData); the migration moves the
-- binaries to object storage and keeps only the URL in doc.
CREATE TABLE assignments (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    kind               VARCHAR(16)  NOT NULL,              -- 'assignment' / 'paper' (both collections share one shape)
    is_published       TINYINT(1)   NOT NULL DEFAULT 0,
    is_live            TINYINT(1)   NOT NULL DEFAULT 0,
    deadline           DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_assignments_kind (kind, is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE submissions (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    assignment_id      VARCHAR(64)  NULL,
    user_id            VARCHAR(64)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_submissions_assignment (assignment_id),
    KEY idx_submissions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE subjects (
    id                 VARCHAR(32)  NOT NULL PRIMARY KEY,
    level_id           VARCHAR(32)  NULL,
    doc                JSON         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE admin_audit_logs (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    admin_id           VARCHAR(64)  NULL,
    action             VARCHAR(64)  NULL,
    created_at         DATETIME(3)  NULL,
    doc                JSON         NOT NULL,
    KEY idx_audit_created (created_at),
    KEY idx_audit_admin (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_source_documents (
    id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
    subject            VARCHAR(120) NULL,
    chapter_id         VARCHAR(64)  NULL,
    status             VARCHAR(16)  NULL,
    content_hash       CHAR(64)     NULL,
    uploaded_at        DATETIME(3)  NULL,
    doc                JSON         NOT NULL,              -- metadata WITHOUT chunks
    KEY idx_sourcedocs_chapter (subject, chapter_id),
    KEY idx_sourcedocs_hash (content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_source_chunks (
    document_id        VARCHAR(64)  NOT NULL,
    chunk_index        INT          NOT NULL,
    text               MEDIUMTEXT   NOT NULL,
    doc                JSON         NOT NULL,              -- heading, pages, topic, chunkId
    PRIMARY KEY (document_id, chunk_index),
    CONSTRAINT fk_chunks_document FOREIGN KEY (document_id) REFERENCES ai_source_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Not migrated: ai_providers (cloud providers were removed in commit 8e66611).
