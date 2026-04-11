# Plan: Adversarial Hardening Backlog Resolution
**Spec**: `docs/ultraflow/specs/UFSD-2026-04-10-adversarial-testing.md`
**UFSD**: Same file (Round 1 + Round 2 results)
**Approach**: Milestone-driven resolution — group all open adversarial findings by deployment milestone, fix in priority order within each milestone
**Branch**: `fix/adversarial-hardening-backlog`

## Assumption Registry
- ASSUMPTION: Python 3.10+ is the deployment target — validated by `config.py` use of Pydantic v2
- ASSUMPTION: Windows is the primary dev environment but Linux is the production target — validated by `os.chmod` issues and codebase comments
- ASSUMPTION: `hmac` stdlib module is available for OTP hashing — validated (Python stdlib)
- ASSUMPTION: `cryptography` library's Fernet is the only encryption layer for saved passwords — validated by `user_storage.py`
- ASSUMPTION: No existing `requirements.txt` lock file (pip freeze) exists — UNVALIDATED — risk item: pinning may break existing installs
- ASSUMPTION: ChromaDB `PersistentClient` is not thread-safe for concurrent instantiation — UNVALIDATED — risk item: singleton may need locking

## Invariant List
- Invariant-1: Read-only DB enforcement (driver + SQL validator + connector)
- Invariant-2: PII masking must run before any data reaches users or the LLM
- Invariant-5: Separate ChromaDB collection per conn_id
- Invariant-6: Atomic file writes (write-then-rename) for crash safety
- Invariant-7: SSE step types are additive (don't remove existing types)

## Failure Mode Map
1. **FM-1**: OTP hash migration breaks existing pending verifications — old plaintext codes become unverifiable after switching to HMAC
2. **FM-2**: Pinning dependencies to exact versions may conflict with `chromadb` or `pydantic-settings` transitive dependencies
3. **FM-3**: QueryMemory singleton creates import-time side effects (ChromaDB client init at module load)
4. **FM-4**: Word-boundary-aware PII matching regex becomes complex enough to introduce ReDoS or false negatives
5. **FM-5**: refresh_twin atomic swap with DuckDB may fail on Windows due to file locking (open DuckDB connection holds file lock)

---

## Sprint A: Pre-Launch (before first paying customer)
*Estimated total: ~4 hours. All tasks independent unless noted.*

### Task A1: OTP hash storage (~5 min)
- **Files**: `backend/otp.py` (modify), `backend/tests/test_adv_otp_hash.py` (create)
- **Intent**: Replace plaintext OTP storage with `hmac.new(JWT_SECRET_KEY, code, 'sha256').hexdigest()`. Store hash in `pending_verifications.json` instead of raw code. Verify by comparing `hmac(submitted_code) == stored_hash`.
- **Invariants**: none
- **Assumptions**: HMAC with JWT_SECRET_KEY is sufficient (not a password — 6-digit OTP with 10-min TTL)
- **Test**: `cd backend && python -m pytest tests/test_adv_otp_hash.py -v` → expects all pass
- **Commit**: `fix: store OTP codes as HMAC hashes instead of plaintext`

### Task A2: Pin dependencies to exact versions (~5 min)
- **Files**: `backend/requirements.txt` (modify)
- **Intent**: Run `pip freeze` on the working environment, replace all `>=` version specifiers with `==` exact pins. Keep the dependency list clean (no transitive dev dependencies).
- **Invariants**: none
- **Assumptions**: Current installed versions are known-good — UNVALIDATED (risk: frozen versions may not be latest security patches)
- **Test**: `cd backend && pip install -r requirements.txt --dry-run` → expects no conflicts
- **Commit**: `chore: pin all dependencies to exact versions for reproducible builds`

### Task A3: Fernet KDF upgrade (SHA-256 → PBKDF2) (~5 min)
- **Files**: `backend/user_storage.py` (modify), `backend/tests/test_adv_fernet_kdf.py` (create)
- **Intent**: Replace `hashlib.sha256(key).digest()` Fernet key derivation with `cryptography.hazmat.primitives.kdf.pbkdf2.PBKDF2HMAC` (SHA-256, 480K iterations, static salt derived from app identity). Must remain deterministic (same key → same Fernet key) so existing encrypted passwords still decrypt.
- **Invariants**: Invariant-6 (atomic writes for re-encrypted data if migration needed)
- **Assumptions**: Static salt is acceptable because the key material is already high-entropy (JWT_SECRET_KEY)
- **Test**: `cd backend && python -m pytest tests/test_adv_fernet_kdf.py -v` → expects pass + backward compat test
- **Invariant-Check**: `python -c "from user_storage import encrypt_password, decrypt_password; assert decrypt_password(encrypt_password('test')) == 'test'"` → confirms encryption round-trip
- **Commit**: `fix: upgrade Fernet KDF from SHA-256 to PBKDF2 (480K iterations)`

### Task A4: Windows-aware twin file permissions (~5 min)
- **Files**: `backend/duckdb_twin.py` (modify), `backend/tests/test_adv_twin_file_permissions_win.py` (create)
- **Intent**: After `os.chmod`, detect Windows (`sys.platform == 'win32'`) and attempt `icacls` to restrict to current user. Log clear guidance if neither method succeeds. This replaces the current no-op chmod with a best-effort platform-aware approach.
- **Invariants**: none
- **Test**: `cd backend && python -m pytest tests/test_adv_twin_file_permissions_win.py -v` → expects pass (source inspection test)
- **Commit**: `fix: platform-aware twin file permissions (icacls on Windows, chmod on POSIX)`

---

## Sprint B: Scale (50+ concurrent users / SOC 2)
*Estimated total: ~3 hours. Tasks B1-B3 independent; B4 depends on B3.*

### Task B1: In-memory OTP rate limiter (~5 min)
- **Files**: `backend/otp.py` (modify), `backend/tests/test_adv_otp_ratelimit.py` (create)
- **Intent**: Replace file-based rate limiting with `collections.defaultdict(list)` + TTL eviction. Track `{identifier: [timestamp, ...]}` in memory. Evict entries older than window on each check. Thread-safe with `threading.Lock`.
- **Invariants**: none
- **Test**: `cd backend && python -m pytest tests/test_adv_otp_ratelimit.py -v` → expects pass
- **Commit**: `fix: replace file-based OTP rate limiter with in-memory TTL eviction`

### Task B2: Cap collected_steps in SSE generator (~3 min)
- **Files**: `backend/routers/agent_routes.py` (modify), `backend/tests/test_adv_collected_steps_cap.py` (create)
- **Intent**: Add a `MAX_COLLECTED_STEPS = 200` constant. When `len(collected_steps) > MAX_COLLECTED_STEPS`, trim oldest entries (keep last 200). This prevents memory bloat on long agent sessions (100+ tool calls).
- **Invariants**: Invariant-7 (SSE step types additive — don't change step format, just limit history)
- **Test**: `cd backend && python -m pytest tests/test_adv_collected_steps_cap.py -v` → expects pass (source inspection)
- **Invariant-Check**: Verify no SSE step types are removed from the code
- **Commit**: `fix: cap collected_steps at 200 to prevent memory bloat on long sessions`

### Task B3: QueryMemory module-level singleton (~5 min)
- **Files**: `backend/query_memory.py` (modify), `backend/routers/query_routes.py` (modify), `backend/agent_engine.py` (modify), `backend/main.py` (modify), `backend/tests/test_adv_qm_singleton.py` (create)
- **Intent**: Add `_singleton_qm = None` + `def get_query_memory() -> QueryMemory` factory at module level. Replace all `QueryMemory()` calls with `get_query_memory()`. Thread-safe with `threading.Lock`. Cleanup scheduler in `main.py` already creates one instance — redirect to use the singleton.
- **Invariants**: Invariant-5 (per-conn collections preserved — singleton still creates per-conn collections internally)
- **Assumptions**: ChromaDB PersistentClient is not thread-safe for instantiation — UNVALIDATED (risk: may need locking)
- **Test**: `cd backend && python -m pytest tests/test_adv_qm_singleton.py -v` → expects pass
- **Invariant-Check**: `grep -c "QueryMemory()" backend/query_routes.py backend/agent_engine.py` → expects 0 (all replaced with singleton)
- **Commit**: `refactor: use QueryMemory singleton to prevent ChromaDB client proliferation`

### Task B4: refresh_twin atomic swap (~5 min)
- **Files**: `backend/duckdb_twin.py` (modify), `backend/tests/test_adv_refresh_atomic.py` (create)
- **Intent**: Change `refresh_twin()` to create a new twin at a `.refresh.tmp.duckdb` path, then `os.replace()` over the existing `.duckdb` file. This eliminates the delete-then-create window where concurrent queries fail. Must close the old DuckDB connection before rename on Windows (file locking).
- **Invariants**: Invariant-6 (atomic write via rename)
- **Assumptions**: FM-5 risk — DuckDB file locking on Windows may prevent atomic swap while queries are in-flight
- **Test**: `cd backend && python -m pytest tests/test_adv_refresh_atomic.py -v` → expects pass (source inspection)
- **Invariant-Check**: Verify `refresh_twin` uses `os.replace` (not `unlink` + `create_twin`)
- **Commit**: `fix: atomic swap in refresh_twin to eliminate unavailability window`

---

## Sprint C: Multi-Tenant / Quality of Life
*Estimated total: ~2 hours. All tasks independent.*

### Task C1: Word-boundary-aware PII substring matching (~5 min)
- **Files**: `backend/pii_masking.py` (modify), `backend/query_memory.py` (modify), `backend/tests/test_adv_pii_word_boundary.py` (create)
- **Intent**: Change substring matching from `any(p in col_lower for p in PATTERNS)` to a compiled regex that checks for pattern surrounded by non-alpha boundaries: `re.compile(r'(?<![a-z])(?:' + '|'.join(PATTERNS) + r')(?![a-z])')`. This catches `employee_ssn` and `user_salary` but NOT `business` (the `sin` in `business` is surrounded by alpha chars).
- **Invariants**: Invariant-2 (PII masking must run — false negatives are worse than false positives)
- **Assumptions**: FM-4 risk — regex complexity; mitigated by precompilation and bounded pattern count (30 patterns)
- **Test**: `cd backend && python -m pytest tests/test_adv_pii_word_boundary.py -v` → expects: `employee_ssn` masked, `business` NOT masked, `ssn` masked
- **Invariant-Check**: `python -c "from pii_masking import mask_dataframe; import pandas as pd; df = pd.DataFrame({'ssn': ['123']}); assert '*' in str(mask_dataframe(df)['ssn'].iloc[0])"` → confirms exact-match PII still masked
- **Commit**: `fix: word-boundary-aware PII matching to reduce false positives`

### Task C2: Health endpoint degraded status (~3 min)
- **Files**: `backend/main.py` (modify), `backend/tests/test_adv_health_status_logic.py` (create)
- **Intent**: Change the `"status"` field logic: `"healthy"` if all connections healthy OR no connections, `"degraded"` if some unhealthy, `"unhealthy"` if all unhealthy. Enables load balancer health checks.
- **Invariants**: none
- **Test**: `cd backend && python -m pytest tests/test_adv_health_status_logic.py -v` → expects all pass
- **Commit**: `fix: health endpoint returns degraded/unhealthy status when connections fail`

### Task C3: is_verified() lock guard (~3 min)
- **Files**: `backend/auth.py` (modify), `backend/tests/test_adv_verified_lock.py` (create)
- **Intent**: Wrap `is_verified()` reads of `pending_verifications.json` with the existing `_verif_lock`. Prevents race between concurrent OTP verify + register.
- **Invariants**: Invariant-6 (file access patterns)
- **Test**: `cd backend && python -m pytest tests/test_adv_verified_lock.py -v` → expects all pass
- **Commit**: `fix: guard is_verified() reads with _verif_lock to prevent TOCTOU race`

---

## Sprint D: Low Priority / Backlog
*Items to address when time permits. No milestone urgency.*

### Task D1: schema_profile threading.Event for readiness (~5 min)
- **Files**: `backend/models.py` (modify), `backend/routers/connection_routes.py` (modify), `backend/tests/test_adv_schema_ready_event.py` (create)
- **Intent**: Add a `schema_ready: threading.Event` field to `ConnectionEntry`. Background profiling thread calls `entry.schema_ready.set()` when done. Readers can `entry.schema_ready.wait(timeout=0)` for non-blocking check or `wait(timeout=5)` for blocking.
- **Invariants**: none
- **Test**: `cd backend && python -m pytest tests/test_adv_schema_ready_event.py -v` → expects all pass
- **Commit**: `feat: add schema_ready Event to ConnectionEntry for safe bg profiling`

### Task D2: _sanitize_text HTML entity handling (~3 min)
- **Files**: `backend/auth.py` (modify)
- **Intent**: In `_sanitize_text()` (line 92), add `html.unescape()` before tag stripping, and `html.escape()` on output. Preserves safe text but neutralizes entity-encoded injection.
- **Test**: `cd backend && python -m pytest tests/test_bug_2_5_sanitize_text.py -v` → expects all pass (tests already exist)
- **Commit**: `fix: _sanitize_text handles HTML entities`

### Task D3: Clamp negative LIMIT/OFFSET (~3 min)
- **Files**: `backend/sql_validator.py` (modify)
- **Intent**: In the LIMIT enforcement layer, clamp any parsed LIMIT/OFFSET to `max(0, value)`.
- **Test**: `cd backend && python -c "from sql_validator import SQLValidator; v = SQLValidator(); r = v.validate('SELECT * FROM t LIMIT -5'); print(r)"` → expects validation passes with clamped LIMIT
- **Commit**: `fix: clamp negative LIMIT/OFFSET to zero`

### Task D4: Per-user connection limit (~3 min)
- **Files**: `backend/routers/connection_routes.py` (modify)
- **Intent**: Check `len(user_conns) < settings.MAX_CONNECTIONS_PER_USER` before allowing new connections. Config already defines `MAX_CONNECTIONS_PER_USER = 10`.
- **Test**: `cd backend && grep -c "MAX_CONNECTIONS_PER_USER" routers/connection_routes.py` → expects >=1 (config consumed)
- **Commit**: `fix: enforce MAX_CONNECTIONS_PER_USER limit on connect`

### Task D5: Per-user share token quota (~3 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Before creating a share token, count existing active tokens for the user. Reject if exceeding a reasonable cap (e.g., 50 active tokens per user).
- **Test**: `cd backend && grep -c "share.*quota\|max.*share\|token.*limit" routers/dashboard_routes.py` → expects >=1
- **Commit**: `fix: enforce per-user share token quota`

### Task D6: Soft-delete re-registration guard (~3 min)
- **Files**: `backend/auth.py` (modify)
- **Intent**: In `create_user()`, check `deleted_users.json` for the email before creating. Return an appropriate error if the email was previously soft-deleted (already partially addressed — test exists at `test_bug_4_1_reregistration_guard.py`).
- **Test**: `cd backend && python -m pytest tests/test_bug_4_1_reregistration_guard.py -v` → expects all pass
- **Commit**: `fix: check deleted_users.json on re-registration`

### Task D7: Remaining P3 items (documented, no code change)
- **Files**: none (documentation only)
- **Intent**: Document the following items as accepted risk in the UFSD with rationale:
  - R1 #18: Demo login hardcoded creds — demo user has platform key but no write access, DEMO_ENABLED defaults to False
  - R1 #19: Tile SQL stored without write-time validation — validated at execution time by the same SQL validator
  - R1 #20: chat_id 64-bit nonce — birthday collision at ~2^32 sessions; acceptable for current scale
  - R1 #21: Circuit breaker manipulable — self-DoS only; attacker would need valid API key
- **Test**: N/A (documentation task)
- **Commit**: `docs: document accepted P3 risk items in UFSD`

---

## Scope Validation
Tasks in scope: A1-A4 (pre-launch), B1-B4 (scale), C1-C3 (quality), D1-D7 (backlog)
Tasks flagged: none — all items sourced from adversarial testing findings

## Counterfactual Gate
**Strongest argument AGAINST this plan:** The Fernet KDF upgrade (Task A3) with a static salt and deterministic derivation may give a false sense of security — PBKDF2 with a static salt is only marginally better than SHA-256 against offline brute force when the attacker knows the salt derivation scheme. The real fix is a per-user random salt, which requires a migration path for existing encrypted passwords.

**We accept this plan because:** The JWT_SECRET_KEY is the key material, not a user password — it's a 64+ character random string (per setup instructions). PBKDF2's 480K iterations add ~200ms of compute per derivation attempt even with known salt, raising the cost of brute force by ~5 orders of magnitude vs. bare SHA-256. A per-user salt is a better long-term solution but requires a password re-encryption migration that's out of scope for this hardening pass.

> Impact estimates are REASONED, not PROVEN — assumption chain: [JWT_SECRET_KEY is high-entropy → PBKDF2 iterations dominate attack cost → static salt acceptable for high-entropy keys].

## MVP-Proof
No performance or scalability claims made. All tasks are security hardening and correctness fixes.

## Fingerprint
All adversarial testing P2/P3 items (Round 1 #9-21, Round 2 #8-12) resolved or documented with milestone triggers across 4 sprints (18 tasks); 109+ tests passing; OTP hardened with HMAC + in-memory rate limiting; Fernet KDF upgraded to PBKDF2; twin files platform-aware permissioned; QueryMemory singleton; PII matching word-boundary-aware; health endpoint status-aware; per-user connection + share token limits enforced; accepted-risk P3 items documented in UFSD.
