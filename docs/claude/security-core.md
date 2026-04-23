## Scope

The canon. Security invariants (never weaken), hardening status (33 findings resolved), 11 coding rules distilled from adversarial testing. **Always-loaded.**

### Security Invariants (never weaken)

- **Read-only enforcement** — driver, SQL validator, connector layers. All three must agree.
- **PII masking** — `mask_dataframe()` must run before data reaches user or LLM.
- **Two-step query flow** — `/generate` then `/execute`. Never collapse.
- **Config safety rails** — `MAX_ROWS` capped at 50,000 even if `.env` sets higher. Mandatory blocked keywords (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `MERGE`) force-appended if missing from `BLOCKED_KEYWORDS`. JWT default key causes `CRITICAL` log and hard exit in production/staging.
- **OTP-first registration** — email (and optionally phone) must OTP-verify before `create_user()` called. `pending_verifications.json` tracks state.
- **Tile SQL validation** — `dashboard_routes.py` validates SQL through `SQLValidator` at write time (create/update tile), not just execution.
- **`query_twin()` validates SQL** through `SQLValidator` before execution and caps results at 10K rows. Prevents filesystem-reading DuckDB functions and OOM.
- **Query memory stores anonymized SQL intents** — `anonymize_sql()` strips all literals (integers, decimals, floats, scientific, hex, dollar-quoted, escaped quotes). Sensitive column names masked to `[MASKED]` via alpha-only lookarounds (`(?<![a-zA-Z])`) and substring match before ChromaDB storage. Never store raw query results or column values in ChromaDB.
- **Dependencies** — critical packages pinned to exact versions (`==`) in `requirements.txt` to prevent supply chain attacks.
- **Lock-file enforced at install** — CI runs `pip install --require-hashes -r requirements.lock`. `requirements.txt` is input to `pip-compile`, not the install target in CI / production.
- **Safetensors only** — embedder loader rejects unsafe weight formats. No unsafe-serialization weights enter the runtime.
- **`pull_request_target` is banned** in every workflow (forked PRs never see staging secrets).
- **Auth goes through one middleware** — `backend/middleware/auth_middleware.py` is the only place `get_current_user` is called. No per-route drift.
- **Audit log is checksummed** — rotation writes sibling `.sha256` file; restart verifies chain.
- **Transport guards always on** — CL-XOR-TE rejected at ASGI; HTTP/2 rapid-reset capped; SSE sets `X-Accel-Buffering: no`; non-UTF8 body rejected.
- **PCI/HIPAA modes are one-way** — once `ASKDB_PCI_MODE=True` at boot, demo login is hard-rejected; audit-log fsync per write; Redis mandatory.

## Security Hardening Status

Two rounds of 20-analyst adversarial testing (2026-04-10/11) found 33 findings. All P0/P1 fixed with rebreak verification. 112 regression tests guard against regressions. Full journal: `docs/journal-2026-04-11-adversarial-hardening.md`.

**Deferred items:**

| # | Issue | Trigger | Risk |
|---|-------|---------|------|
| 5 | DuckDB twin encryption at rest (`duckdb_twin.py`) | Pre-launch for healthcare/finance | PHI/PII in plaintext on disk; `TURBO_TWIN_WARN_UNENCRYPTED` logs warning |
| 12 | PII substring false positives — `business`→`sin`, `adobe`→`dob` | When complaints arrive | Over-masking only (safe tradeoff) |
| 13 | Per-request QueryMemory proliferation | Singleton refactor | Bounded by query rate; scheduler leak fixed |

## Security Coding Rules (from adversarial testing)

Established after 33 findings. See `docs/journal-2026-04-11-adversarial-hardening.md` for root cause analysis.

- **Never use `\b` for SQL/code identifiers** — treats `_` as word char, so `\bssn\b` won't match `employee_ssn`. Use `(?<![a-zA-Z])` / `(?![a-zA-Z])` lookarounds.
- **PII matching must be substring-based** — exact set membership misses compound names. Over-masking > under-masking.
- **Normalize Unicode before security checks** — `unicodedata.normalize("NFKC", text)` before pattern match.
- **Multi-value returns must use NamedTuple** — bare tuple unpacking silently breaks when return signatures change.
- **Fast paths must preserve side effects** — cache hits/early returns must still run rate limiting, stats, audit logging.
- **File state writes must be atomic** — write to `{path}.tmp`, flush, then `os.replace(tmp, path)`.
- **Config values are untrusted input** — validate at startup against explicit allowlists (not blocklists).
- **Never use `time.sleep()` polling in thread pool** — use `threading.Event.wait()`, `Queue.get()`, or async primitives.
- **Health endpoints must not leak identifiers** — aggregate counts only.
- **Every config flag must be consumed** — dead flags mislead users. Test that flags are read.
- **New endpoints must inherit guards** — extract shared security logic into decorators or middleware.

## See also
- `config-defaults.md` — the constants these rules protect (MAX_ROWS, JWT allowlist, Fernet iterations).
- `arch-backend.md` — the three read-only enforcement layers.
- `constraints-agent-auth.md` — agent + auth rules that stack on top of the invariants.
