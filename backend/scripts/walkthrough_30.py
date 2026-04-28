"""Stratified walkthrough — pull 30 main_150_v3 questions across 11 DBs × 3 difficulties.

For each: extract question, evidence, predicted_sql, gold_sql, ex_pass.
Save to walkthrough_30.jsonl for manual categorization (no peeking at gold during
classification — load question+evidence+predicted only).
"""
from __future__ import annotations

import json
import random
import sys
from collections import defaultdict
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent

TRACE_DIR = _REPO_ROOT / "benchmarks" / "bird" / "traces" / "main150_v3"
SEED = 42


def main() -> int:
    qid_files = sorted(p for p in TRACE_DIR.glob("*.jsonl") if not p.name.startswith("_"))
    by_cell: dict = defaultdict(list)

    for path in qid_files:
        meta = result = None
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if rec.get("type") == "meta":
                        meta = rec
                    elif rec.get("type") == "result":
                        result = rec
        except FileNotFoundError:
            continue
        if not meta or not result:
            continue
        cell = (meta.get("db_id"), meta.get("difficulty"))
        by_cell[cell].append({
            "qid": meta.get("qid"),
            "db_id": meta.get("db_id"),
            "difficulty": meta.get("difficulty"),
            "question": meta.get("question"),
            "evidence": meta.get("evidence"),
            "predicted_sql": result.get("predicted_sql"),
            "gold_sql": meta.get("gold_sql"),
            "ex_pass": result.get("ex_pass"),
            "ex_diagnostic": result.get("ex_diagnostic"),
        })

    rng = random.Random(SEED)
    # Aim for 30 stratified across cells. 11 DBs × 3 difficulties = 33 max.
    # Per cell: pick 1 question if available (some cells empty).
    sampled = []
    for (db, diff), questions in sorted(by_cell.items()):
        if not questions:
            continue
        # Prefer 1 PASS + 1 FAIL per cell where possible — shows full distribution
        passes = [q for q in questions if q["ex_pass"]]
        fails = [q for q in questions if not q["ex_pass"]]
        if passes:
            sampled.append(rng.choice(passes))
        if fails and len(sampled) < 30:
            sampled.append(rng.choice(fails))
        if len(sampled) >= 30:
            break

    out_path = _REPO_ROOT / "benchmarks" / "bird" / "walkthrough_30.jsonl"
    with open(out_path, "w", encoding="utf-8") as f:
        for q in sampled[:30]:
            f.write(json.dumps(q, default=str) + "\n")

    print(f"Sampled {len(sampled[:30])} questions stratified by db×difficulty.")
    print(f"Distribution:")
    diff_counts = defaultdict(int)
    for q in sampled[:30]:
        diff_counts[(q["db_id"], q["difficulty"], q["ex_pass"])] += 1
    for (db, diff, ex), n in sorted(diff_counts.items()):
        ex_str = "PASS" if ex else "FAIL"
        print(f"  {db:<26} {diff:<12} {ex_str}  {n}")
    print(f"\nWrote: {out_path.relative_to(_REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
