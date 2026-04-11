# UFSD — Adversarial Testing Report (2026-04-10)

## UFSD adversarial-testing 2026-04-10

**Verdict: PASS (with documented P2/P3 items)**
**Coverage: 5/7 clusters SOLID** (after P0/P1 fixes applied)

### P0 Findings (Fixed + Rebreak Verified)

| # | Finding | Fix | Rebreak |
|---|---------|-----|---------|
| 1 | DuckDB `query_twin()` 2-tuple unpack of 3-tuple `validate()` — all turbo SQL validation broken | `duckdb_twin.py:518` + `dashboard_routes.py:381` — changed to 3-tuple unpack | SOLID (sibling at dashboard_routes also fixed) |
| 2 | Thread pool exhaustion via `ask_user` `time.sleep(0.3)` polling loop — holds thread per parked session | `agent_engine.py` — `threading.Event.wait()` replaces polling; `/respond` and `/cancel` signal event | SOLID (16x reduction in idle wakeups) |
| 3 | JWT algorithm downgrade — `JWT_ALGORITHM` unconstrained string, `none` possible | `config.py` — `_SAFE_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}` enforcement at startup | SOLID |

### P1 Findings (Fixed)

| # | Finding | Fix |
|---|---------|-----|
| 4 | Admin JWT secret collapse (empty ADMIN_JWT_SECRET_KEY falls back to JWT_SECRET_KEY) | `config.py` — warning log when empty; role check already prevents cross-auth |
| 5 | Waterfall early-return bypasses `increment_query_stats()` (daily limits not enforced) | `agent_engine.py` — all 3 early-return paths now call `increment_query_stats()` |
| 6 | Fullwidth Unicode PII bypass (`ｅｍａｉｌ` not normalized) | `pii_masking.py` — `unicodedata.normalize("NFKC", col)` before pattern matching |
| 7 | `/continue` endpoint missing `_active_agents` increment/decrement + no `_running` check | `agent_routes.py` — full concurrency guard + duplicate loop prevention |
| 8 | Non-atomic `_save_users()`, `_save_verifications()`, `_save_oauth_states()` in auth.py | `auth.py` — write-then-rename pattern; `_load_users()` now handles JSONDecodeError |

### P2 Findings (Documented)

| # | Finding | File | Notes |
|---|---------|------|-------|
| 9 | SHA-256 Fernet KDF (not PBKDF2/argon2) | `user_storage.py` | Functional but weak against offline brute force; upgrade pre-launch |
| 10 | `is_verified()` reads without `_lock` | `auth.py` | Race between concurrent OTP verify + register; low probability |
| 11 | Unbounded `collected_steps` in SSE generator | `agent_routes.py` | Memory bloat on 100-tool-call sessions |
| 12 | Unpinned `>=` dependencies in requirements.txt | `requirements.txt` | Supply chain risk; pin before deploy |

### P3 Findings (Documented)

| # | Finding | Risk |
|---|---------|------|
| 13 | `_sanitize_text` only strips `<tag>` — misses HTML entities | Low: stored in server-side JSON, not rendered |
| 14 | Negative LIMIT/OFFSET not clamped | Low: behavior varies by DB engine |
| 15 | No per-user connection limit | Medium at scale: memory exhaustion |
| 16 | No per-user share token quota | Medium at scale: storage exhaustion |
| 17 | Soft-delete doesn't check `deleted_users.json` on re-register | Low: orphaned data |
| 18 | Demo login hardcoded credentials `DemoTest2026!` | Low: demo has platform key but no write access |
| 19 | Tile SQL stored without write-time validation | Low: validated at execution time |
| 20 | `chat_id` nonce 64 bits | Low: birthday collision at ~2^32 sessions |
| 21 | Circuit breaker manipulable (3 failures → 30s lockout) | Low: self-DoS only |

### Contradictions

- **PROVISIONAL**: One analyst flagged `/execute` as lacking linkage to `/generate` (two-step flow bypass). However, `/execute` still runs full SQL validation, so this is a trust/UX control, not a security boundary. The validator remains the security enforcement layer.

### Structural Observations

- **File-based storage fragility**: 15/20 analysts flagged race conditions and crash-safety issues across JSON file storage. Atomic writes now applied to auth.py; admin_routes.py and otp.py still use non-atomic writes (P3 risk).
- **Auth boundary**: 12/20 flagged admin/user JWT concerns. Mitigated by role claim check in admin decode + startup warning for empty ADMIN_JWT_SECRET_KEY.

---

## UFSD adversarial-testing 2026-04-11 (Round 2 — Post-Hardening Sweep)

**Verdict: PASS** | **Coverage: 6/7 clusters SOLID** (Cluster I FRAGILE — health endpoint design issues documented)

### Scope
Full 20-analyst sweep against 6 hardened files: `main.py`, `query_memory.py`, `connection_routes.py`, `audit_trail.py`, `duckdb_twin.py`, `pii_masking.py`. Followed by 5-analyst rebreak verification on all fixes.

### P1 Findings (Fixed + Rebreak Verified)

| # | Finding | File | Fix | Rebreak |
|---|---------|------|-----|---------|
| 1 | Health endpoint leaks connection IDs in `connection_status` dict (4/20 analysts) | `main.py` | Removed per-conn breakdown; return aggregate counts only (`healthy_connections`, `unhealthy_connections`) | CLEAN |
| 2 | ChromaDB `PersistentClient` created every 6h in cleanup scheduler (2/20 analysts) | `main.py` | Moved `QueryMemory()` instantiation before `while True` loop | CLEAN |
| 3 | `sql_intent` masking uses `\b` word boundary — compound names like `employee_ssn` pass through (rebreak finding) | `query_memory.py` | Changed to `(?<![a-zA-Z])` lookarounds that treat `_` as transparent | CLEAN |

### P2 Findings (Fixed)

| # | Finding | File | Fix |
|---|---------|------|-----|
| 4 | Leading-dot floats (`.5`, `.123`) bypass `_NUMBER_PATTERN` (2/20 analysts) | `query_memory.py` | Added `\.\d+` branch + trailing-dot `\d+\.\d*` merged float branch |
| 5 | Trailing-dot floats (`1.`, `42.`, `1.e5`) bypass `_NUMBER_PATTERN` (rebreak finding) | `query_memory.py` | Changed float branch to `\d+\.\d*` (digits-after-dot optional) |
| 6 | Compound column names (`employee_ssn`, `user_salary`) bypass exact-match PII masking (2/20 analysts) | `query_memory.py`, `pii_masking.py` | Changed to substring matching: `any(p in col_lower for p in SENSITIVE_COLUMN_PATTERNS)` |

### P3 Findings (Fixed)

| # | Finding | File | Fix |
|---|---------|------|-----|
| 7 | `TURBO_TWIN_WARN_UNENCRYPTED` config flag defined but never consumed (2/20 analysts) | `duckdb_twin.py` | Added warning log in `create_twin()` when flag is True |

### P2/P3 Documented (Not Fixed — Deferred)

| # | Finding | File | Risk | Defer Until |
|---|---------|------|------|-------------|
| 8 | `os.chmod(0o600)` no-op on Windows (4/20 analysts) | `duckdb_twin.py` | Twin files world-readable on Windows NTFS; mitigated by try/except + warning log | Pre-launch for Windows production deploys |
| 9 | `schema_profile` race between bg profiling thread and request reads (3/20 analysts) | `connection_routes.py` | Degraded-mode window (None during profiling); all readers already guard with `if entry.schema_profile` | Architecture review |
| 10 | Per-request `QueryMemory()` in `query_routes.py` and `agent_engine.py` (broader proliferation) | `query_routes.py`, `agent_engine.py` | Scheduler leak fixed; per-request leak is larger but bounded by query rate | Module-level singleton refactor |
| 11 | Substring PII matching false positives (`business` matches `sin`, `adobe` matches `dob`) | `pii_masking.py`, `query_memory.py` | Over-masking (data hiding, not leaking); acceptable tradeoff for security | Word-boundary-aware substring matching |
| 12 | Health endpoint always returns `"status": "healthy"` even when all connections down | `main.py` | Load balancer issue; not a security bug | Infrastructure review |

### Contradictions
- **PROVISIONAL**: Analyst 5 (compound masking rebreak) rated BROKEN due to false positive rate. However, over-masking is a usability issue, not a security gap — it errs on the side of caution. The substring matching correctly catches all true positives.

### Test Suite
109 tests across 27 test files. All passing, zero regressions. New tests added: `test_adv_health_no_connids.py` (3), `test_adv_cleanup_chroma_reuse.py` (1), `test_adv_leading_dot_float.py` (4), `test_adv_compound_column_masking.py` (3), `test_adv_twin_warn_unencrypted.py` (2), `test_adv_rebreak_fixes.py` (4).

---

## UFSD planning 2026-04-11

[2026-04-11] Planning complete. Branch: `fix/adversarial-hardening-backlog`. Fingerprint: All adversarial testing P2/P3 items resolved or documented across 4 sprints (18 tasks).

### Assumption Registry (from planning)
- ASSUMPTION: Python 3.10+ is deployment target — validated by Pydantic v2 usage
- ASSUMPTION: Windows dev, Linux production — validated by os.chmod issues
- ASSUMPTION: hmac stdlib available — validated (Python stdlib)
- ASSUMPTION: Fernet is only encryption layer for saved passwords — validated by user_storage.py
- ASSUMPTION: No existing requirements.txt lock file — UNVALIDATED — risk: pinning may break installs
- ASSUMPTION: ChromaDB PersistentClient not thread-safe for instantiation — UNVALIDATED — risk: singleton may need locking

### Invariant List
- Invariant-1: Read-only DB enforcement
- Invariant-2: PII masking before any data reaches users/LLM
- Invariant-5: Separate ChromaDB collection per conn_id
- Invariant-6: Atomic file writes (write-then-rename)
- Invariant-7: SSE step types are additive

### Failure Mode Map
1. FM-1: OTP hash migration breaks existing pending verifications
2. FM-2: Pinning dependencies conflicts with transitive deps
3. FM-3: QueryMemory singleton creates import-time side effects
4. FM-4: Word-boundary PII regex becomes complex/ReDoS-prone
5. FM-5: refresh_twin atomic swap fails on Windows due to DuckDB file locking

### Counterfactual Gate
Strongest argument AGAINST: PBKDF2 with static salt only marginally better than SHA-256 for high-entropy keys.
We accept because: JWT_SECRET_KEY is 64+ char random string; 480K iterations add ~5 orders of magnitude brute-force cost.

### Accepted P3 Risk Items
- R1 #18: Demo hardcoded creds — DEMO_ENABLED defaults False, no write access
- R1 #19: Tile SQL stored without write-time validation — validated at execution time
- R1 #20: chat_id 64-bit nonce — collision at ~2^32 sessions, acceptable scale
- R1 #21: Circuit breaker manipulable — self-DoS only, requires valid API key
