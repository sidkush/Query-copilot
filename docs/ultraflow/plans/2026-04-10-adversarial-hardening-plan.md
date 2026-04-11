# Adversarial Hardening Plan — 2026-04-10

> Resolution plan for all remaining findings from the 20-analyst adversarial testing + existing deferred security items.

## What Was Already Fixed (This Session)

| ID | Fix | Files Changed |
|----|-----|---------------|
| P0-1 | DuckDB `query_twin()` tuple unpacking (+ sibling in dashboard_routes) | `duckdb_twin.py:518`, `dashboard_routes.py:381` |
| P0-2 | Thread pool exhaustion — `time.sleep(0.3)` → `threading.Event.wait()` | `agent_engine.py`, `agent_routes.py` |
| P0-3 | JWT algorithm downgrade — `_SAFE_JWT_ALGORITHMS` allowlist at startup | `config.py` |
| P1-1 | Admin JWT secret collapse — startup warning + role check confirmed | `config.py` |
| P1-2 | Waterfall early-return bypasses query limits — 3 paths fixed | `agent_engine.py` |
| P1-3 | Fullwidth Unicode PII bypass — `unicodedata.normalize("NFKC")` | `pii_masking.py` |
| P1-4 | `/continue` missing concurrency guard — full `_active_agents` lifecycle | `agent_routes.py` |
| P1-5 | Non-atomic file writes — write-then-rename for users/verifications/oauth | `auth.py` |

---

## Phase 1: Quick Wins (P2 — each <10 min)

### 1.1 `is_verified()` lockless read
- **File:** `auth.py:126-131`
- **What:** `is_verified()` reads `pending_verifications.json` without acquiring `_lock`, creating a TOCTOU race with concurrent OTP verification.
- **Fix:** Wrap `_load_verifications()` call inside `with _lock:` block in `is_verified()` and `check_verification_status()`.
- **Effort:** 5 min
- **Risk if skipped:** Stale read allows double-registration in a narrow window.

### 1.2 Unbounded `collected_steps` in SSE generators
- **File:** `agent_routes.py` — both `/run` and `/continue` `event_generator()` functions
- **What:** `collected_steps` list grows without bound during long agent sessions (100 tool calls with large results).
- **Fix:** Cap `collected_steps` to last 200 entries. When persisting, only store the last 200 steps.
- **Effort:** 5 min
- **Risk if skipped:** Memory bloat on long-running agent sessions, potential OOM under concurrent load.

### 1.3 Pin dependencies in requirements.txt
- **File:** `requirements.txt`
- **What:** All dependencies use `>=` version constraints, allowing unexpected upgrades on `pip install`.
- **Fix:** Run `pip freeze > requirements.lock` alongside the existing `requirements.txt`. Add a comment in `requirements.txt` pointing to `.lock` for reproducible deploys. Or change `>=` to `==` for critical packages (anthropic, fastapi, pydantic, sqlglot, cryptography, python-jose, bcrypt).
- **Effort:** 10 min
- **Risk if skipped:** Supply chain attack via malicious package update; non-reproducible builds.

### 1.4 Negative LIMIT/OFFSET clamping
- **File:** `sql_validator.py`
- **What:** `LIMIT -1` passes validation. On SQLite this returns all rows, bypassing `MAX_ROWS`.
- **Fix:** In the LIMIT enforcement section, clamp negative values to 0 (effectively no LIMIT → apply MAX_ROWS default).
- **Effort:** 5 min
- **Risk if skipped:** `MAX_ROWS` bypass on SQLite/MySQL.

---

## Phase 2: Security Hardening (Pre-Launch Critical)

### 2.1 OTP hash storage (Deferred #1)
- **File:** `otp.py`
- **What:** OTP codes stored as plaintext in `otp_store.json`. If file is read (even by backup), codes are exposed.
- **Fix:** Store `hmac(server_secret, code)` instead. On verification, HMAC the submitted code and compare. Use `hmac.compare_digest()` for timing-safe comparison.
- **Effort:** 30 min
- **Milestone:** Pre-launch (before first paying customer)

### 2.2 In-memory OTP rate limiter (Deferred #2)
- **File:** `otp.py`
- **What:** Rate limiting uses a log file that can be deleted to reset limits.
- **Fix:** Replace with `collections.defaultdict(list)` keyed by identifier, with TTL eviction (check timestamps, remove entries older than window). Add a background cleanup every 5 min via the existing APScheduler.
- **Effort:** 1-2 hrs
- **Milestone:** Before compliance audit

### 2.3 SHA-256 Fernet KDF upgrade
- **File:** `user_storage.py` — `_fernet()` function
- **What:** `SHA256(JWT_SECRET_KEY)` used to derive Fernet key. No salt, no iterations.
- **Fix:** Use `cryptography.hazmat.primitives.kdf.pbkdf2.PBKDF2HMAC` with a fixed salt derived from the key (for backwards compatibility) and 600,000 iterations. Add a migration path: try new KDF first, fall back to old SHA256 if Fernet decryption fails, then re-encrypt with new KDF.
- **Effort:** 2-3 hrs (including migration logic)
- **Milestone:** Pre-launch

### 2.4 DuckDB twin encryption at rest (Deferred #5)
- **File:** `duckdb_twin.py`
- **What:** `.duckdb` twin files contain sampled production rows in plaintext.
- **Fix:** Use DuckDB's built-in encryption pragma (`PRAGMA add_parquet_key(...)`) or encrypt the file at the filesystem level. Simplest: use a Fernet-derived key to encrypt/decrypt the DuckDB file on open/close. Document that customers with PHI/PII should use encrypted volumes.
- **Effort:** 2-3 hrs
- **Milestone:** Before healthcare/finance customers

### 2.5 `_sanitize_text` hardening
- **File:** `auth.py:86-87`
- **What:** Only strips `<tag>` patterns. HTML entities (`&lt;script&gt;`), `javascript:` URIs, and event handlers pass through.
- **Fix:** Use `html.escape()` on all user-supplied text fields before storage. Add `javascript:`, `data:`, `vbscript:` URI scheme stripping.
- **Effort:** 15 min
- **Milestone:** Pre-launch (stored XSS if any frontend renders user names as raw HTML)

### 2.6 Demo login production guard
- **File:** `auth_routes.py`
- **What:** Demo credentials `DemoTest2026!` hardcoded. Demo user gets platform API key.
- **Fix:** Disable demo login entirely when `ASKDB_ENV` is `production` or `staging`. Add rate limiting to demo login (max 10/hour per IP). Add a `DEMO_ENABLED` config flag.
- **Effort:** 15 min
- **Milestone:** Pre-launch

---

## Phase 3: Resource & Resilience Hardening (Pre-Scale)

### 3.1 Per-user connection limit
- **File:** `connection_routes.py`
- **What:** `app.state.connections[email]` is unbounded — a single user can open unlimited connections.
- **Fix:** Add a `MAX_CONNECTIONS_PER_USER` config setting (default 10). Check before `connect()`. Return 429 if at limit.
- **Effort:** 15 min
- **Milestone:** Before public launch

### 3.2 Per-user share token quota
- **File:** `dashboard_routes.py`
- **What:** Unlimited share tokens per user — storage exhaustion possible.
- **Fix:** Add a per-plan share token limit (free=5, pro=50, enterprise=unlimited). Count existing tokens before creating new ones.
- **Effort:** 20 min
- **Milestone:** Before public launch

### 3.3 `refresh_twin()` atomic swap (Deferred #9)
- **File:** `duckdb_twin.py`
- **What:** Delete-then-create leaves an unavailability window during refresh.
- **Fix:** Create new twin to `.duckdb.new`, then `os.replace()` (atomic rename). Clean up `.new` on failure.
- **Effort:** 1-2 hrs
- **Milestone:** ~10+ concurrent turbo users

### 3.4 Auto-schedule `cleanup_stale()` (Deferred #6)
- **File:** `query_memory.py`, `main.py`
- **What:** `cleanup_stale()` is defined but never called automatically. ChromaDB collections grow without bound.
- **Fix:** Add an APScheduler job in `main.py` lifespan startup that calls `cleanup_stale()` every 6 hours for all active connections.
- **Effort:** 1 hr
- **Milestone:** When ChromaDB exceeds 1GB

### 3.5 Schema profiling async (Deferred #7)
- **File:** `connection_routes.py`, `schema_intelligence.py`
- **What:** `profile_connection()` blocks the connect endpoint for slow databases (Snowflake/BigQuery: 30-120s).
- **Fix:** Move profiling to a background task (FastAPI's `BackgroundTasks` or the existing thread pool). Return connection immediately with `schema_status: "profiling"`. Frontend polls `/schema/status` until ready.
- **Effort:** 1-2 hrs
- **Milestone:** Cloud warehouse support

### 3.6 Audit trail fsync optimization (Deferred #10)
- **File:** `audit_trail.py`
- **What:** Per-entry `os.fsync()` under a global lock serializes all routing decisions.
- **Fix:** Buffer writes (flush every 100 entries or 5 seconds, whichever comes first). Use a `threading.Timer` for periodic flush. Keep `fsync` only on the periodic flush, not per-entry.
- **Effort:** 2 hrs
- **Milestone:** ~50+ concurrent users

### 3.7 Circuit breaker hardening
- **File:** `anthropic_provider.py`
- **What:** 3 intentional failures trigger 30s cooldown (self-DoS).
- **Fix:** Track failures per-user, not globally. Increase threshold to 5 failures. Add jitter to cooldown (30-60s random). Only count 5xx/timeout errors, not 4xx.
- **Effort:** 30 min
- **Milestone:** Multi-user deployments

### 3.8 Health check resilience
- **File:** `main.py`
- **What:** `/health` iterates all connections synchronously with no per-connection timeout.
- **Fix:** Add a 5-second per-connection timeout. Run checks concurrently with `asyncio.gather()`. Return partial health status (connection X healthy, connection Y timed out).
- **Effort:** 30 min
- **Milestone:** Production monitoring

---

## Phase 4: Data Integrity & Business Logic (Pre-Monetization)

### 4.1 Soft-delete re-registration guard
- **File:** `auth.py` — `create_user()`
- **What:** Deleted accounts can re-register, creating a fresh account with the same email. Old data orphaned.
- **Fix:** Check `deleted_users.json` during registration. If email found: either block re-registration with a message ("Contact support to reactivate") or restore the archived account.
- **Effort:** 30 min

### 4.2 Model tier gating
- **File:** `provider_registry.py`
- **What:** All Anthropic models available to all users regardless of plan.
- **Fix:** Add a `PLAN_MODEL_ACCESS` mapping in config: `free: [haiku]`, `pro: [haiku, sonnet]`, `enterprise: [haiku, sonnet, opus]`. Filter available models in `get_available_models()`.
- **Effort:** 30 min
- **Milestone:** Before monetization

### 4.3 Tile SQL write-time validation
- **File:** `dashboard_routes.py`
- **What:** Dashboard tiles store raw SQL that's only validated at execution time.
- **Fix:** Run SQL through `SQLValidator.validate()` at tile creation/update time. Reject tiles with invalid SQL before saving.
- **Effort:** 15 min

### 4.4 `chat_id` entropy upgrade
- **File:** `agent_routes.py`
- **What:** `secrets.token_hex(8)` = 64 bits. Birthday collision at ~2^32 sessions.
- **Fix:** Change to `secrets.token_hex(16)` (128 bits). No migration needed — existing sessions expire naturally.
- **Effort:** 1 min

### 4.5 `anonymize_sql` coverage gaps (Deferred #8)
- **File:** `query_memory.py`
- **What:** Hex literals (`0xFF`), scientific notation (`1e10`), dollar-quoted strings (`$$...$$`), and backslash-escape variants leak into shared ChromaDB.
- **Fix:** Add regex branches for these forms in `anonymize_sql()`. Test against a corpus of PostgreSQL/MySQL edge cases.
- **Effort:** 2 hrs
- **Milestone:** Before multi-tenant

### 4.6 PII column-name masking in ChromaDB (Deferred #3)
- **File:** `query_engine.py`, `pii_masking.py`
- **What:** Column names like `ssn`, `salary` visible in vector store metadata.
- **Fix:** Apply the same `SENSITIVE_COLUMN_PATTERNS` check to column names before embedding into ChromaDB. Replace sensitive column names with `[MASKED_COL]` in metadata.
- **Effort:** 2-3 hrs
- **Milestone:** When adding team/multi-tenant features

---

## Implementation Order

**Sprint 1 (immediate — this week):**
- 1.1 `is_verified()` lock (5 min)
- 1.2 Bounded `collected_steps` (5 min)
- 1.4 Negative LIMIT clamping (5 min)
- 4.4 `chat_id` entropy (1 min)
- 2.5 `_sanitize_text` hardening (15 min)
- 2.6 Demo login production guard (15 min)

**Sprint 2 (pre-launch):**
- 2.1 OTP hash storage (30 min)
- 2.2 In-memory rate limiter (1-2 hrs)
- 2.3 Fernet KDF upgrade (2-3 hrs)
- 1.3 Pin dependencies (10 min)
- 3.1 Per-user connection limit (15 min)
- 4.1 Soft-delete re-registration guard (30 min)

**Sprint 3 (pre-monetization):**
- 4.2 Model tier gating (30 min)
- 4.3 Tile SQL write-time validation (15 min)
- 3.2 Per-user share token quota (20 min)
- 3.7 Circuit breaker per-user (30 min)
- 3.8 Health check resilience (30 min)

**Sprint 4 (pre-scale / cloud warehouse):**
- 3.3 `refresh_twin()` atomic swap (1-2 hrs)
- 3.4 Auto-schedule `cleanup_stale()` (1 hr)
- 3.5 Schema profiling async (1-2 hrs)
- 3.6 Audit trail fsync optimization (2 hrs)
- 2.4 DuckDB twin encryption (2-3 hrs)

**Sprint 5 (multi-tenant):**
- 4.5 `anonymize_sql` coverage gaps (2 hrs)
- 4.6 PII column-name masking in ChromaDB (2-3 hrs)

---

## Total Estimated Effort

| Phase | Items | Effort |
|-------|-------|--------|
| Sprint 1 (immediate) | 6 items | ~45 min |
| Sprint 2 (pre-launch) | 6 items | ~5-7 hrs |
| Sprint 3 (pre-monetization) | 5 items | ~2 hrs |
| Sprint 4 (pre-scale) | 5 items | ~8-10 hrs |
| Sprint 5 (multi-tenant) | 2 items | ~4-5 hrs |
| **Total** | **24 items** | **~20-25 hrs** |

---

## Dependencies

```
Sprint 1 (no deps) → Sprint 2 (blocks launch)
                   → Sprint 3 (blocks monetization)
Sprint 2.3 (Fernet KDF) → Sprint 4 (DuckDB encryption reuses KDF)
Sprint 3.1 (connection limit) → Sprint 4 (schema profiling async)
```

## Acceptance Criteria

Each item is considered done when:
1. Code change applied
2. Manual test confirms the fix (no automated test suite)
3. No regression in existing functionality
4. CLAUDE.md deferred security table updated (mark resolved items)
5. UFSD spec updated with fix details
