"""Post-hoc re-attribution of pilot 50 failures.

Theme 5's original capture missed that agent_engine.py prefetches
find_relevant_tables OUTSIDE the agent loop (line 3358) — so no
agent_step event for it; retrieved_tables_first_call ended up empty for
all 50 questions, and the heuristic defaulted everything to 'retrieval'.

This script reads each per-qid trace JSONL, extracts predicted_sql,
and computes a sharper attribution from predicted_sql vs gold_sql tables:
  passed         — EX passed
  no_sql         — agent never produced SQL
  schema_linking — predicted SQL omits required gold tables
  column_linking — exec error mentions 'no such column' / 'unknown column'
  sql_logic      — predicted SQL has right tables, exec ran, but EX fails
  dialect        — syntax_error
  other          — runtime_error not column-related, etc.

Reads:  benchmarks/bird/traces/pilot50_phase_c_bundle/<qid>.jsonl
Writes: benchmarks/bird/traces/pilot50_phase_c_bundle/_index_v2.jsonl
        (corrected attribution; preserves _index.jsonl as-was)
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import os
TRACE_DIR = Path(os.environ.get(
    "REATTR_TRACE_DIR",
    str(_REPO_ROOT / "benchmarks" / "bird" / "traces" / "pilot50_phase_c_bundle"),
))


def _extract_tables_from_sql(sql: str) -> list:
    if not sql:
        return []
    try:
        import sqlglot
        from sqlglot import exp
        parsed = sqlglot.parse_one(sql, read="sqlite")
        return list({t.name for t in parsed.find_all(exp.Table) if t.name})
    except Exception:
        return []


def _attribute(meta: dict, result: dict) -> str:
    if result.get("ex_pass"):
        return "passed"
    pred = result.get("predicted_sql") or ""
    if not pred.strip():
        return "no_sql"
    diag = (result.get("ex_diagnostic") or "").lower()
    fail_cat = result.get("failure_category") or ""

    pred_tables = _extract_tables_from_sql(pred)
    pred_set = {t.lower() for t in pred_tables if t}
    gold_tables = _extract_tables_from_sql(meta.get("gold_sql", ""))
    gold_set = {t.lower() for t in gold_tables if t}

    if gold_set and not gold_set.issubset(pred_set):
        return "schema_linking"  # SQL omits required tables
    if "no such column" in diag or "unknown column" in diag:
        return "column_linking"
    if fail_cat == "syntax_error":
        return "dialect"
    if fail_cat in ("wrong_data", "wrong_count", "empty_result"):
        return "sql_logic"
    return "other"


def main() -> int:
    if not TRACE_DIR.exists():
        print(f"FATAL: trace dir missing: {TRACE_DIR}")
        return 2

    out_lines = []
    counts = Counter()
    fail_counts = Counter()
    by_db = {}  # db_id -> Counter

    qid_files = sorted(TRACE_DIR.glob("*.jsonl"))
    qid_files = [p for p in qid_files if not p.name.startswith("_")]

    for path in qid_files:
        meta = None
        result = None
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
        if meta is None or result is None:
            continue
        attr = _attribute(meta, result)
        counts[attr] += 1
        if attr != "passed":
            fail_counts[attr] += 1
        db = meta.get("db_id", "?")
        by_db.setdefault(db, Counter())[attr] += 1

        line = {
            "qid": meta.get("qid"),
            "db_id": db,
            "difficulty": meta.get("difficulty"),
            "ex_pass": result.get("ex_pass"),
            "failure_category": result.get("failure_category"),
            "theme_attribution_v2": attr,
            "ex_diagnostic": result.get("ex_diagnostic"),
            "predicted_sql_tables": _extract_tables_from_sql(result.get("predicted_sql") or ""),
            "gold_sql_tables": _extract_tables_from_sql(meta.get("gold_sql", "")),
            "wall_s": result.get("wall_s"),
        }
        out_lines.append(line)

    out_path = TRACE_DIR / "_index_v2.jsonl"
    with open(out_path, "w", encoding="utf-8") as f:
        for line in out_lines:
            f.write(json.dumps(line, default=str) + "\n")

    total = len(out_lines)
    pass_n = counts.get("passed", 0)
    print(f"\n{'='*70}\n PILOT 50 — Phase C Bundle (Theme 1+2+5) — RE-ATTRIBUTED\n{'='*70}")
    print(f" EX score: {pass_n}/{total} = {100.0*pass_n/total:.1f}%\n")

    print(" Attribution v2 (from predicted_sql vs gold_sql):")
    for cat, n in counts.most_common():
        tag = " (passed)" if cat == "passed" else ""
        print(f"   {cat:<16}: {n}{tag}")

    if fail_counts:
        print("\n Failure-only attribution (n=%d):" % sum(fail_counts.values()))
        total_fail = sum(fail_counts.values())
        for cat, n in fail_counts.most_common():
            pct = 100.0 * n / total_fail
            print(f"   {cat:<16}: {n} ({pct:.0f}%)")

    print("\n Per-DB breakdown:")
    print(f"   {'db_id':<26} {'pass':>5} {'fail':>5} {'school':>8} {'col':>5} {'logic':>6} {'noSQL':>6} {'other':>6}")
    for db, cnt in sorted(by_db.items()):
        passed = cnt.get("passed", 0)
        failed = sum(cnt.values()) - passed
        sl = cnt.get("schema_linking", 0)
        cl = cnt.get("column_linking", 0)
        lg = cnt.get("sql_logic", 0)
        ns = cnt.get("no_sql", 0)
        ot = cnt.get("other", 0) + cnt.get("dialect", 0)
        print(f"   {db:<26} {passed:>5} {failed:>5} {sl:>8} {cl:>5} {lg:>6} {ns:>6} {ot:>6}")

    print(f"\n Wrote: {out_path.relative_to(_REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
