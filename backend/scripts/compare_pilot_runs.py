"""Compare two pilot 50 _index_v2.jsonl re-attribution files.

Surfaces:
  - Regressions (PASS in run A, FAIL in run B)
  - Recoveries (FAIL in run A, PASS in run B)
  - Persistent failures (FAIL in both)
  - Clean passes (PASS in both)

Usage (from backend/):
    python scripts/compare_pilot_runs.py <run_a> <run_b>

Where run_a/run_b are paths to trace dirs containing _index_v2.jsonl.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def _load(path: Path) -> dict:
    """qid -> record dict"""
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            out[rec["qid"]] = rec
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: compare_pilot_runs.py <run_a_dir> <run_b_dir>")
        return 2
    a_dir = Path(sys.argv[1])
    b_dir = Path(sys.argv[2])
    a = _load(a_dir / "_index_v2.jsonl")
    b = _load(b_dir / "_index_v2.jsonl")

    common = sorted(set(a.keys()) & set(b.keys()))
    regressions = []
    recoveries = []
    for qid in common:
        ra = a[qid]
        rb = b[qid]
        if ra["ex_pass"] and not rb["ex_pass"]:
            regressions.append((qid, ra, rb))
        elif not ra["ex_pass"] and rb["ex_pass"]:
            recoveries.append((qid, ra, rb))

    print(f"\n{'='*70}\n PILOT 50 - DIFF\n{'='*70}")
    print(f"  run_a: {a_dir.name}  ({sum(1 for r in a.values() if r['ex_pass'])}/{len(a)} pass)")
    print(f"  run_b: {b_dir.name}  ({sum(1 for r in b.values() if r['ex_pass'])}/{len(b)} pass)")
    print(f"  net delta: {len(recoveries)} recoveries - {len(regressions)} regressions = "
          f"{len(recoveries) - len(regressions):+d}")

    if regressions:
        print(f"\n REGRESSIONS ({len(regressions)}):")
        print(f"   {'qid':>5}  {'db_id':<26}  {'diff':<12}  {'a-b':<14}  attrib_a -> attrib_b")
        for qid, ra, rb in regressions:
            atr_a = ra.get("theme_attribution_v2") or "-"
            atr_b = rb.get("theme_attribution_v2") or "-"
            diff = ra.get("difficulty", "?")
            db = ra.get("db_id", "?")
            print(f"   {qid:>5}  {db:<26}  {diff:<12}  PASS->FAIL      {atr_a} -> {atr_b}")

    if recoveries:
        print(f"\n RECOVERIES ({len(recoveries)}):")
        print(f"   {'qid':>5}  {'db_id':<26}  {'diff':<12}  {'a-b':<14}  attrib_a -> attrib_b")
        for qid, ra, rb in recoveries:
            atr_a = ra.get("theme_attribution_v2") or "-"
            atr_b = rb.get("theme_attribution_v2") or "-"
            diff = ra.get("difficulty", "?")
            db = ra.get("db_id", "?")
            print(f"   {qid:>5}  {db:<26}  {diff:<12}  FAIL->PASS      {atr_a} -> {atr_b}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
