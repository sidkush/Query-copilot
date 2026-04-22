"""CLI: python -m backend.tests.run_traps <suite.jsonl> <baseline.json>

Runs every trap in the suite against the mock provider, grades each, and either:
- Writes baseline.json (first run) if --write-baseline flag passed, OR
- Compares against committed baseline and exits non-zero on regression.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

from backend.tests.fixtures.mock_anthropic_provider import MockAnthropicProvider
from backend.tests.fixtures.eval_seed import seed
from backend.tests.trap_grader import grade_trap, TrapResult, _resolve_db_path


def load_suite(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _canned_responses_from_suite(suite: list[dict]) -> dict[str, str]:
    """For Phase A mock runs, canned SQL mirrors the expected_sql_contains hint.

    Real CI will replace this with fixture-derived SQL, but the stub ensures
    the grader oracle is what actually decides pass/fail — not the mock.
    """
    out: dict[str, str] = {}
    for trap in suite:
        needs = trap.get("expected_sql_contains", [])
        # Emit SQL that contains the expected substrings + references the oracle table.
        table = trap.get("oracle", {}).get("table", "january_trips")
        snippet = " ".join(needs) if needs else "SELECT 1"
        out[trap["nl"].strip().lower()] = f"{snippet} FROM {table}"
    return out


def _ensure_fixture(db_path: Path) -> Path:
    """Resolve /tmp paths on Windows and seed if missing."""
    resolved = _resolve_db_path(db_path)
    if not resolved.exists():
        seed(resolved)
    return resolved


def run_suite(
    suite_path: Path, db_path: Path, baseline_path: Path, write_baseline: bool
) -> int:
    suite = load_suite(suite_path)
    canned = _canned_responses_from_suite(suite)
    mock = MockAnthropicProvider(responses=canned)

    resolved_db = _ensure_fixture(db_path)

    results: list[TrapResult] = []
    for trap in suite:
        emitted = mock.generate_sql(trap["nl"])
        results.append(grade_trap(trap, emitted, resolved_db))

    summary = {
        "suite": suite_path.name,
        "total": len(results),
        "passed": sum(1 for r in results if r.passed),
        "per_question": {r.trap_id: {"passed": r.passed, "reason": r.reason} for r in results},
    }

    if write_baseline:
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(json.dumps(summary, indent=2))
        print(f"Wrote baseline: {baseline_path}")
        return 0

    if not baseline_path.exists():
        print(f"ERROR: baseline missing at {baseline_path}. Run with --write-baseline first.", file=sys.stderr)
        return 2

    baseline = json.loads(baseline_path.read_text())
    regressions = []
    for trap_id, cur in summary["per_question"].items():
        prior = baseline["per_question"].get(trap_id)
        if prior and prior["passed"] and not cur["passed"]:
            regressions.append((trap_id, cur["reason"]))

    if regressions:
        print("REGRESSIONS:")
        for tid, reason in regressions:
            print(f"  {tid}: {reason}")
        return 1
    print(f"OK — {summary['passed']}/{summary['total']} pass (no regressions vs baseline)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("suite", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--db", type=Path, default=Path("/tmp/eval_fixture.sqlite"))
    parser.add_argument("--write-baseline", action="store_true")
    args = parser.parse_args()
    return run_suite(args.suite, args.db, args.baseline, args.write_baseline)


if __name__ == "__main__":
    raise SystemExit(main())
