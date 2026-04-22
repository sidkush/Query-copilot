"""Shadow eval: runs first 20 trap questions against REAL Anthropic (staging key).

Exits non-zero on >5% divergence from mock baseline. Used in CI on trusted
branches only (never forked PRs).
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

from backend.tests.run_traps import load_suite
from backend.tests.trap_grader import grade_trap


def _call_anthropic(api_key: str, model: str, nl: str, schema_hint: str) -> str:
    # Real provider call. Minimal system prompt for determinism.
    import anthropic  # type: ignore

    client = anthropic.Anthropic(api_key=api_key)
    system = (
        "You are AskDB. Emit ONLY valid SQL for the user's question. "
        "Available tables + columns:\n" + schema_hint
    )
    resp = client.messages.create(
        model=model,
        max_tokens=400,
        system=system,
        messages=[{"role": "user", "content": nl}],
    )
    parts = [b.text for b in resp.content if getattr(b, "type", "") == "text"]
    return "".join(parts).strip()


def main() -> int:
    api_key = os.environ.get("ANTHROPIC_STAGING_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: no staging key", file=sys.stderr)
        return 2

    suite_path = Path("backend/tests/trap_temporal_scope.jsonl")
    baseline_path = Path(".data/eval_baseline.json")
    db_path = Path("/tmp/eval_fixture.sqlite")

    suite = load_suite(suite_path)[:20]   # 20-Q subset per H13
    schema_hint = (
        "january_trips(id INT, rider_type TEXT, started_at TEXT, duration_sec INT)\n"
        "-- note: table name is misleading; data spans Dec 2023 through Oct 2025\n"
    )

    baseline = json.loads(baseline_path.read_text())
    divergences = 0
    for trap in suite:
        emitted = _call_anthropic(api_key, "claude-haiku-4-5-20251001", trap["nl"], schema_hint)
        result = grade_trap(trap, emitted, db_path)
        prior = baseline["per_question"].get(trap["id"], {}).get("passed")
        if prior is True and not result.passed:
            divergences += 1
            print(f"DIVERGENCE {trap['id']}: {result.reason}")

    threshold = max(1, int(0.05 * len(suite)))
    if divergences > threshold:
        print(f"FAIL: {divergences} divergences (threshold {threshold})")
        return 1
    print(f"OK: {divergences} divergences (threshold {threshold})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
