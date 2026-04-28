"""Stratified BIRD-Mini-Dev sampler.

Smoke 10 (default): 1 question per database for 10 of the 11 dbs (skip
california_schools), difficulty mix 4 simple / 4 moderate / 2 challenging.

Pilot 50 (--n 50 --include-all-dbs): 50 questions across all 11 dbs,
difficulty mix proportional to BIRD's global distribution
(148/250/102 of 500 → 15 simple / 25 moderate / 10 challenging at n=50).
Stratification: difficulty quotas hard, db distribution random uniform
within each difficulty (all 11 dbs represented).

Random seed 42 for reproducibility regardless of n.

Output: benchmarks/bird/{smoke10,pilot50}_seed42.json
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BIRD_JSON = REPO_ROOT / "benchmarks" / "bird" / "mini_dev" / "llm" / "mini_dev_data" / "minidev" / "MINIDEV" / "mini_dev_sqlite.json"

SEED = 42

# BIRD global distribution: 148/250/102 of 500 = 29.6% / 50.0% / 20.4%
GLOBAL_DIFFICULTY_FRACTIONS = {"simple": 148/500, "moderate": 250/500, "challenging": 102/500}

# Smoke 10 (default n=10): explicit per-tier counts per spec
SMOKE10_DIFFICULTY_MIX = {"simple": 4, "moderate": 4, "challenging": 2}
SMOKE10_SKIP_DB = "california_schools"  # tied-smallest pool + shape collision with Wave 2 synthetic


def _smoke10_sample(rng, by_db_diff, all_dbs):
    """Smoke 10 mode: explicit per-tier counts, skip california_schools, 1 per db."""
    eligible_dbs = [d for d in all_dbs if d != SMOKE10_SKIP_DB]
    assert len(eligible_dbs) == 10, f"Expected 10 eligible dbs, got {len(eligible_dbs)}"
    shuffled = list(eligible_dbs)
    rng.shuffle(shuffled)
    assignments = []
    cursor = 0
    for diff, count in SMOKE10_DIFFICULTY_MIX.items():
        for _ in range(count):
            db = shuffled[cursor]
            cursor += 1
            available = by_db_diff.get((db, diff), [])
            if not available:
                raise RuntimeError(
                    f"db={db} has 0 questions of difficulty={diff} (seed={SEED}). "
                    f"Pick a different seed or relax DIFFICULTY_MIX."
                )
            picked = rng.choice(available)
            assignments.append((db, diff, picked))
    return assignments


def _proportional_sample(rng, by_db_diff, n, all_dbs):
    """Pilot/main mode: stratified by (db × difficulty).

    Two-pass:
      1. Reserve 1 question per db from its largest available difficulty bucket
         (guarantees every db represented, honors "stratified by db_id × difficulty").
      2. Fill remainder by difficulty quotas proportional to BIRD's global
         distribution, sampling uniformly across all dbs within each difficulty.

    Pilot 50 → 11 reserved + 39 proportional → ~15s/25m/10c global mix
    with all 11 dbs guaranteed at least 1 representation.
    """
    selected_qids: set = set()
    assignments: list = []

    # Pass 1: reserve 1 per db (largest available difficulty bucket per db, randomized)
    for db in sorted(all_dbs, key=lambda d: rng.random()):  # randomize iteration order
        # Find largest difficulty bucket for this db
        candidates = []
        for (b_db, b_diff), qs in by_db_diff.items():
            if b_db == db:
                candidates.extend((b_diff, q) for q in qs)
        if not candidates:
            continue  # db has zero questions (shouldn't happen)
        diff, q = rng.choice(candidates)
        assignments.append((db, diff, q))
        selected_qids.add(q["question_id"])

    # Pass 2: fill remainder honoring global difficulty quotas
    diff_targets = {diff: int(n * pct) for diff, pct in GLOBAL_DIFFICULTY_FRACTIONS.items()}
    remainder = n - sum(diff_targets.values())
    fractional = sorted(
        GLOBAL_DIFFICULTY_FRACTIONS.items(),
        key=lambda kv: -((n * kv[1]) - int(n * kv[1])),
    )
    for diff, _ in fractional[:remainder]:
        diff_targets[diff] += 1
    # Subtract what pass 1 already placed
    placed_per_diff = Counter(diff for _, diff, _ in assignments)
    remaining_per_diff = {
        diff: max(0, target - placed_per_diff.get(diff, 0))
        for diff, target in diff_targets.items()
    }
    # If pass 1 over-placed in any difficulty (rare), pull excess back
    over_placed = sum(max(0, placed_per_diff.get(d, 0) - diff_targets[d]) for d in diff_targets)
    # Re-distribute extra slots to under-filled difficulties
    short_total = sum(remaining_per_diff.values())
    if over_placed > 0 and short_total > 0:
        # Order short difficulties by largest deficit first
        for diff in sorted(remaining_per_diff, key=lambda d: -remaining_per_diff[d]):
            while over_placed > 0 and remaining_per_diff[diff] > 0:
                remaining_per_diff[diff] -= 1
                over_placed -= 1
                if over_placed == 0:
                    break
            if over_placed == 0:
                break

    for diff, target in remaining_per_diff.items():
        if target == 0:
            continue
        pool = []
        for (b_db, b_diff), qs in by_db_diff.items():
            if b_diff != diff:
                continue
            for q in qs:
                if q["question_id"] not in selected_qids:
                    pool.append((b_db, diff, q))
        rng.shuffle(pool)
        for db, d, q in pool[:target]:
            assignments.append((db, d, q))
            selected_qids.add(q["question_id"])

    if len(assignments) != n:
        raise RuntimeError(
            f"sampling produced {len(assignments)} assignments, expected n={n}. "
            f"Likely cause: pass 1 over-placed in a difficulty with too-tight quota."
        )
    return assignments


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=10,
                        help="Sample size. n=10 → smoke10 mode (default). n>10 → proportional mode.")
    parser.add_argument("--out", type=str, default=None,
                        help="Output filename (default: smoke10_seed42.json or pilot{n}_seed42.json).")
    args = parser.parse_args()

    if not BIRD_JSON.exists():
        print(f"FATAL: BIRD data not found at {BIRD_JSON}")
        return 2

    rng = random.Random(SEED)
    data = json.load(open(BIRD_JSON))

    by_db_diff: dict[tuple[str, str], list] = defaultdict(list)
    for entry in data:
        by_db_diff[(entry["db_id"], entry["difficulty"])].append(entry)
    all_dbs = sorted({entry["db_id"] for entry in data})

    if args.n == 10:
        out_name = args.out or "smoke10_seed42.json"
        assignments = _smoke10_sample(rng, by_db_diff, all_dbs)
        skipped_label = SMOKE10_SKIP_DB
        target_mix = SMOKE10_DIFFICULTY_MIX
    else:
        out_name = args.out or f"pilot{args.n}_seed42.json"
        assignments = _proportional_sample(rng, by_db_diff, args.n, all_dbs)
        skipped_label = "(none — all 11 dbs included)"
        target_mix = {diff: sum(1 for _, d, _ in assignments if d == diff)
                      for diff in GLOBAL_DIFFICULTY_FRACTIONS}

    out_path = REPO_ROOT / "benchmarks" / "bird" / out_name
    selected = [entry for _, _, entry in assignments]
    out_payload = {
        "seed": SEED,
        "n": args.n,
        "skipped_db": skipped_label,
        "difficulty_mix": target_mix,
        "stratification": [
            {"db_id": db, "difficulty": diff, "question_id": entry["question_id"]}
            for db, diff, entry in assignments
        ],
        "questions": selected,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(out_payload, f, indent=2)

    print(f"BIRD-Mini-Dev sample n={args.n} (seed={SEED})")
    print(f"  source:        {BIRD_JSON.relative_to(REPO_ROOT)}")
    print(f"  output:        {out_path.relative_to(REPO_ROOT)}")
    print(f"  skipped db:    {skipped_label}")
    print(f"  total picked:  {len(selected)}")
    print()
    diff_counts = Counter(diff for _, diff, _ in assignments)
    db_counts = Counter(db for db, _, _ in assignments)
    print(f"  difficulty distribution: {dict(diff_counts)}")
    print(f"  db distribution: {dict(db_counts)}")
    if args.n <= 30:  # print full table only for smaller samples
        print()
        print(f"  {'#':>3}  {'db_id':<26}  {'difficulty':<12}  {'qid':>5}  question_excerpt")
        print(f"  {'-'*3}  {'-'*26}  {'-'*12}  {'-'*5}  {'-'*40}")
        for i, (db, diff, entry) in enumerate(assignments, 1):
            excerpt = entry["question"][:55] + ("..." if len(entry["question"]) > 55 else "")
            print(f"  {i:>3}  {db:<26}  {diff:<12}  {entry['question_id']:>5}  {excerpt}")
    if args.n == 10:
        if diff_counts == Counter(target_mix):
            print(f"  [OK] matches spec target: {target_mix}")
        else:
            print(f"  [FAIL] DIVERGENCE from target {target_mix}")
            return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
