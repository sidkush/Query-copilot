# Baseline Rebuild — 2026-04-26

## Why

Three changes shipped 2026-04-26 invalidate prior trap-suite + golden-eval
baselines:

1. **Rule 11 AGGREGATE_IN_GROUP_BY** added to `scope_validator.py`. Some
   pre-existing trap suite questions that previously passed validation
   may now block on Rule 11. (Per A20 adversarial finding.)
2. **`FEATURE_DIALECT_BRIDGE` flipped False → True**. LiveTier now
   transpiles source-dialect → target-dialect via sqlglot. Trap suites
   captured in source-dialect mode see post-transpile SQL. Rule 7
   `RULE_DIALECT_FALLTHROUGH` semantics invert (was: parse-error on
   target-dialect SQL → block; now: transpile-error → block).
3. **Dialect-aware parse** in `correction_reviewer.py` +
   `query_decomposer.py` + `scope_validator.py:_resolve_view_base`.
   Pre-fix calls used ANSI fallback; post-fix calls use the connection's
   dialect. Some classifications may shift between safe_dedup ↔
   semantic_change.

Without rebuild, `RESIDUAL_RISK_1_TRAP_FN_RATE_MAX_PCT = 2.0` will trip
on legitimate flip PRs because trap-suite verdict shape changed for
reasons unrelated to a regression.

## Affected baseline files

- `backend/.data/eval_baseline.json` (golden eval)
- `backend/.data/planner_baseline.json` (Ring 8 planner — if exists)
- `backend/.data/hallucination_baseline.json`
- `backend/.data/escalation_baseline.json`
- `backend/.data/budget_baseline.json`

## Procedure

1. **Pre-flip snapshot** — copy current baselines to
   `backend/.data/baselines.pre-2026-04-26.tar.gz`. Commit. This is the
   audit anchor.
2. **Run trap suites under new code paths**:
   ```bash
   cd backend
   python -m pytest tests/test_trap_grader*.py -v --tb=short --json-report
   ```
   Store JSON output as `.data/trap_run.2026-04-26.json`.
3. **Compare verdict deltas** between pre and post. Acceptable: ≤2%
   per-suite verdict shift if traceable to one of the 3 changes above.
   Beyond 2%: investigate, possibly roll back or fix.
4. **Admin ceremony promotion** — invoke
   `scripts/promote_baseline.py --reason "2026-04-26 Rule-11 + dialect-bridge cutover"`.
   Requires 2 admin approvals per `PROMOTION_ADMIN_CEREMONY_REQUIRED`.
   Per-admin daily quota (`PROMOTION_CEREMONY_PER_ADMIN_DAILY_LIMIT=20`)
   leaves room for retries.
5. **Update `.data/eval_baseline.json`** atomically (write-then-rename).
   Audit ledger appends a `baseline_promotion` entry chained to prior
   state.

## Roll-back

If post-flip verdict drift > 2%, set `FEATURE_DIALECT_BRIDGE=False` and
`RULE_AGGREGATE_IN_GROUP_BY=False` via env override (no code change),
restart, and investigate. Baselines remain valid for the previous
behaviour.

## Verification

After ceremony:

```bash
cd backend
python -m pytest tests/ -k "trap" -v          # full trap suite green
python scripts/verify_phase_j.py              # Phase J flag verifier
python scripts/verify_audit_ledger.py         # H24 chain integrity
```

All three must return zero non-zero exits before merging the flip PR.
