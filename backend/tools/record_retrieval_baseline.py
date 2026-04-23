"""One-shot script: record pre-Phase-G retrieval token baseline.

Runs the same harness as tests/test_retrieval_budget.py with
hygiene OFF, writes mean+stdev+per-query to
.data/retrieval_budget_baseline.json. Committed so future Phase-G
edits measure against the same fixed snapshot.
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
BACKEND = HERE.parents[1]
sys.path.insert(0, str(BACKEND))

from tests.test_retrieval_budget import _measure, _load_corpus, BASELINE  # noqa: E402


def main() -> None:
    totals = _measure(hygiene_on=False)
    rows = _load_corpus()
    assert len(totals) == len(rows)
    payload = {
        "mean_tokens": statistics.mean(totals),
        "stdev_tokens": statistics.pstdev(totals),
        "per_query": [{"id": r["id"], "tokens": t} for r, t in zip(rows, totals)],
        "n": len(totals),
    }
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"baseline: mean={payload['mean_tokens']:.1f} n={payload['n']}")


if __name__ == "__main__":
    main()
