# Golden Eval Baseline Regeneration Ceremony

> **Do NOT regenerate `.data/eval_baseline.json` without following this ceremony.**

## When regeneration is legitimate

- A new trap question is added (baseline must grow).
- A prior trap is deliberately removed (retired oracle).
- A deliberate agent-behavior change makes a prior-expected-fail now pass (rare).

## When regeneration is NOT legitimate

- A trap is failing in CI and you want green. **Regeneration masks the bug.** Fix the underlying code instead.
- "Local machine differs from CI." Investigate why; do not paper over.
- PII snuck into the baseline via real queries. Do NOT commit; fix the trap generator.

## Ceremony steps

1. Open a PR titled `eval: regenerate baseline — <reason>`.
2. Include in the PR body: the specific reason, which traps changed, and a linked issue.
3. Run the PII scanner (automatic via `.github/workflows/pii-scan.yml`).
4. Obtain approval from **two** committers, one of whom has commit access to `backend/tests/trap_*.jsonl`.
5. Never use `git commit --no-verify` (the CI will reject it anyway).

## Sign-off

Approvers must post this line in the PR:
> `eval-baseline-regen-approved by <handle>, reason=<short>`

The GitHub Actions `agent-traps` workflow will refuse to merge if fewer than 2 approvals post this line.
