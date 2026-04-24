# Changelog

## [v6.0.0] — 2026-05-25 — Grounding Stack v6

### Rings (new defensive layers)

- **Ring 1 — Empirical grounding (Phase B).** `DataCoverageCard` per table: actual row count, min/max dates, distinct-value samples, injected into agent system prompt. Eliminates the class of failures where agents infer data scope from table names.
- **Ring 3 — Pre-execution validator (Phase C).** Ten deterministic `sqlglot`-AST rules fire between SQL generation and execution. Range mismatch, fan-out inflation, LIMIT-before-ORDER, timezone-naive, soft-delete missing, negation-as-join, dialect fallthrough, view walker, conjunction selectivity, expression-predicate.
- **Ring 4 — Intent echo (Phase D).** Operational-definition card emerges between SQL gen and streaming when ambiguity ≥ 0.3. Three modes: auto-proceed (< 0.3), proceed-button (0.3–0.7), mandatory-choice pills (> 0.7). Receipts pin outside compaction window.
- **Ring 5 — Provenance chip (Phase E).** Every answer carries Live / Turbo-stale / Sample / Unverified-scope tag rendered before first streamed token. Multi-table staleness = worst across joined tables. Skew guard forces median in summary when p99/p50 > 10.
- **Ring 6 — Tenant fortress (Phase E).** Every cache / namespace / session key is composite `(tenant, conn, user)`. BYOK rebinds to requester per turn. Per-tenant encoder LRU.
- **Ring 7 — Regression harness (Phase A onwards).** Nine trap suites totaling ~135 parameterized questions. CI gates all on every PR.

### Hardening bands (cross-cutting security/resilience)

- **H1–H3** Trust-stamped cards, content-value PII classifier, cold-start probe (Phase B).
- **H4–H5** Ambiguity-gated intent-echo with auto-downgrade telemetry; non-interactive conservative mode + voice TTS readback (Phase D).
- **H6** Locale parser, fail-open validator, per-rule compat matrix, replan budget, famous-dataset detector, Sonnet-parity CI (Phase C).
- **H7** Tenant composite keys across every cache/namespace (Phase E).
- **H8** Chaos isolation: jittered backoff, singleflight, per-tenant cost breaker, resumable SSE cursor (Phase E).
- **H9** Validator lifecycle state machine, behavioral contract matrix, `>=` boundary fixes (Phase C).
- **H10** Always-on observability: empty-cause disambiguator, MAX_ROWS truncation warning, Turbo↔Live sanity cross-check (Phase E).
- **H11** Sampling-aware correctness: HLL COUNT DISTINCT, sentinel detection, adaptive stratification, VizQL hex-bin swap above 20K rows (Phase E).
- **H12** Semantic versioning: metric definitions with `valid_from`/`valid_until`, drift detection for mergers + fiscal-calendar mismatch (Phase D).
- **H13** Eval integrity: baselines committed in git, PII scanner, shadow-eval against real Anthropic (Phase A).
- **H14** Embedding migration: per-vector embedder tag, versioned collections, ensemble cap, sanitization, safetensors-only loader (Phase A).
- **H15** Self-improvement anchors: immutable golden set, AST-normalized diversity, 2-admin promotion ceremony, rate-limited approvals (Phase F).
- **H16** Alert manager with dedup sliding window, multi-hour accumulator, dynamic KL divergence, idempotency keys (Phase I).
- **H17** Phase-boundary discipline: forward/backward migrations, 72h gate, HMAC-signed version header (Phase A+).
- **H18** Validator universal coverage: view-walker recursive, conjunction selectivity, expression-predicate mark, tier universality (Phase C).
- **H19** Supply chain: pip `--require-hashes`, lock-file-driven installs, `pull_request_target` banned in CI (Phase H).
- **H20** Identity hardening: JWT tenant_id server-verify, OAuth state HMAC, Stripe signature, `actor_type` in audit, disposable-email blocker, server-enforced trial quota (Phase H).
- **H21** Infrastructure resilience: PVC-backed SQLite, ChromaDB write ACL, DR consensus, stale-backup detection (Phase H).
- **H22** Accessibility: WCAG 2.1 AA — keyboard-nav, aria, icons + text, `prefers-reduced-motion` respected (Phase H).
- **H23** Support + trial safeguards: justification + expiry + actor_type on impersonation, demo isolation, disposable-email list (Phase H).
- **H24** Observability self-defense: audit log checksum + size-assertion, non-LLM trap grader, monitoring-silent alert (Phase H / A).
- **H25** Transport + protocol hardening: CL XOR TE enforcement, HTTP/2 rapid-reset bind, `X-Accel-Buffering: no`, UTF-8-only (Phase H).
- **H26** Export + A/B + cancellation hygiene: export paths through Ring 3, variant-id dedup, warmup per variant, two-phase commit async cancellation (Phase H).
- **H27** Auth version + SSO hardening: unified middleware, deprecated routes → 410, `defusedxml` + sig-then-parse, JWT ±5s leeway, Redis nonce cache, PCI/HIPAA flags enforced (Phase H).

### Operations (Phase I)

- Ten residual-risk detectors with per-signal thresholds and runbook references.
- Two ops alerts (telemetry-source-missing + alert-dispatch-failure).
- Admin-only, per-tenant cache-stats dashboard at `/admin/cache-stats`.
- Slack webhook dispatcher with retry using `chaos_isolation.jittered_backoff`.

### Breaking changes

None. v6 is additive. Every new layer is independently feature-flagged; a fresh deploy with all flags off matches v5 behavior.

### Upgrade notes

See `docs/grounding-stack-v6/migration-guide.md`. No manual migration steps required for end users.

### Metrics (from Phase-level exit gates)

- Backend test suite: ~1700 tests pass, 1 skip.
- Nine trap suites pass with zero regressions against committed baselines.
- Retrieval token budget reduced ≥ 30% (Phase G measurement harness).
- All 12 SLA alerts fire end-to-end via `scripts/test_alert_fire.py` (Phase I).
