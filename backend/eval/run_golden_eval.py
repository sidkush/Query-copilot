"""Golden NL->SQL eval harness.

Runs every pair through the current skill + prompt configuration.
Scores by: (a) expected tables appear in generated SQL, (b) regex pattern
matches. Outputs a JSON report.

Usage:
    python -m backend.eval.run_golden_eval [--shadow]
    python -m backend.eval.run_golden_eval --baseline baseline.json --shadow shadow.json --threshold 0.02
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def load_eval_set(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def score_pattern(sql: str, pattern: str) -> bool:
    try:
        return bool(re.search(pattern, sql, re.IGNORECASE))
    except re.error:
        return False


def score_tables(sql: str, expected: list) -> bool:
    sql_lower = sql.lower()
    return all(t.lower() in sql_lower for t in expected)


def is_regression(*, baseline_pass_rate: float, shadow_pass_rate: float, threshold: float) -> bool:
    return (baseline_pass_rate - shadow_pass_rate) > threshold


def run(set_path: Path, sql_generator) -> dict:
    pairs = load_eval_set(set_path)
    results = []
    for p in pairs:
        sql = sql_generator(p["question"], p.get("dialect", "postgresql"))
        passed = score_tables(sql, p["expected_tables"]) and score_pattern(sql, p["expected_pattern"])
        results.append({"id": p["id"], "question": p["question"], "sql": sql, "passed": passed})
    pass_rate = sum(r["passed"] for r in results) / max(len(results), 1)
    return {"pass_rate": pass_rate, "total": len(results), "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--shadow", type=Path)
    parser.add_argument("--threshold", type=float, default=0.02)
    args = parser.parse_args()

    if args.baseline and args.shadow:
        b = json.loads(args.baseline.read_text())
        s = json.loads(args.shadow.read_text())
        regressed = is_regression(
            baseline_pass_rate=b["pass_rate"],
            shadow_pass_rate=s["pass_rate"],
            threshold=args.threshold,
        )
        print(json.dumps({
            "baseline": b["pass_rate"], "shadow": s["pass_rate"],
            "regressed": regressed, "threshold": args.threshold,
        }, indent=2))
        return 1 if regressed else 0

    def _stub(q: str, dialect: str) -> str:
        return "SELECT 1"

    set_path = Path(__file__).resolve().parent / "golden_nl_sql.jsonl"
    report = run(set_path, _stub)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
