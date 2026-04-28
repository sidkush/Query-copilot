"""LIMIT 5000 audit — validate or refute council R2's claim that 18-22 of
53 sql_logic failures are caused by the agent appending a hard LIMIT
that does not exist in gold SQL.

Method:
  1. Read main_150_tier1 _index_v2.jsonl, filter to theme_attribution_v2='sql_logic'
  2. For each, read per-qid trace, extract predicted_sql + gold_sql
  3. Detect: predicted has LIMIT N, gold does not
  4. For each match, replay predicted_sql WITHOUT the LIMIT clause against
     the BIRD SQLite db, compare result row set to gold's result row set
     using BIRD's official calculate_ex
  5. Report: how many would PASS if LIMIT were stripped

Decision rule (per Sid's Tier 2 spec):
  - >10 confirmed: add targeted directive (skip LIMIT for COUNT/MAX/MIN/SUM
    single-row aggregates) — TARGETED, not broad steering
  - <5 confirmed: drop the lever entirely
  - 5-10: judgment call

Output:
  - <trace_dir>/_limit_audit.jsonl: one line per qid analyzed
  - stdout summary: count + decision recommendation
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# Use main 150 v3 baseline (not tier1) since tier1 had the Fix 5 regression
# polluting the failure set. v3 is the honest baseline for this audit.
TRACE_DIR = _REPO_ROOT / "benchmarks" / "bird" / "traces" / "main150_v3"
DB_ROOT = _REPO_ROOT / "benchmarks" / "bird" / "mini_dev" / "llm" / "mini_dev_data" / "minidev" / "MINIDEV" / "dev_databases"

_BIRD_EVAL_DIR = _REPO_ROOT / "benchmarks" / "bird" / "mini_dev" / "evaluation"
if str(_BIRD_EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(_BIRD_EVAL_DIR))
from evaluation_ex import calculate_ex          # noqa: E402

# Match LIMIT N at end of SQL (with optional whitespace + semicolon)
_LIMIT_RE = re.compile(r"\s+LIMIT\s+\d+(\s*,\s*\d+)?\s*;?\s*$", re.IGNORECASE | re.MULTILINE)


def _strip_limit(sql: str) -> tuple[str, str | None]:
    """Return (sql_without_limit, captured_limit_clause). None if no LIMIT."""
    m = _LIMIT_RE.search(sql or "")
    if not m:
        return sql, None
    return sql[: m.start()].rstrip().rstrip(";"), m.group(0).strip()


def _execute_against_sqlite(sql: str, db_path: Path) -> tuple[list, str | None]:
    """Execute SQL, return (rows, error). Defensive."""
    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.execute(sql)
        rows = cur.fetchall()
        conn.close()
        return rows, None
    except Exception as exc:
        return [], f"{type(exc).__name__}: {exc}"


def _load_per_qid(qid_path: Path) -> tuple[dict | None, dict | None]:
    """Return (meta_event, result_event) from per-qid trace JSONL."""
    meta = result = None
    try:
        with open(qid_path, encoding="utf-8") as f:
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
        pass
    return meta, result


def main() -> int:
    if not TRACE_DIR.exists():
        print(f"FATAL: trace dir missing: {TRACE_DIR}")
        return 2

    index_path = TRACE_DIR / "_index_v2.jsonl"
    if not index_path.exists():
        print(f"FATAL: _index_v2.jsonl missing — run reattribute_pilot50.py first")
        return 3

    sql_logic_qids = []
    with open(index_path, encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("theme_attribution_v2") == "sql_logic":
                sql_logic_qids.append(rec)

    print(f"\n{'='*70}\n LIMIT 5000 AUDIT — {len(sql_logic_qids)} sql_logic failures\n{'='*70}\n")

    audit_lines = []
    counts = Counter()

    for entry in sql_logic_qids:
        qid = entry["qid"]
        db_id = entry["db_id"]
        qid_path = TRACE_DIR / f"{qid}.jsonl"
        meta, result = _load_per_qid(qid_path)
        if not meta or not result:
            counts["missing_trace"] += 1
            continue

        gold_sql = meta.get("gold_sql", "") or ""
        pred_sql = result.get("predicted_sql") or ""
        if not pred_sql:
            counts["empty_predicted"] += 1
            continue

        pred_no_limit, pred_limit_clause = _strip_limit(pred_sql)
        _, gold_limit_clause = _strip_limit(gold_sql)

        if pred_limit_clause is None:
            counts["no_pred_limit"] += 1
            continue

        if gold_limit_clause is not None:
            # Both have LIMIT — not a LIMIT-corruption candidate
            counts["both_have_limit"] += 1
            continue

        # Predicted has LIMIT, gold does not — replay without LIMIT
        db_path = DB_ROOT / db_id / f"{db_id}.sqlite"
        if not db_path.exists():
            counts["missing_db"] += 1
            continue

        # Replay original predicted (sanity) + stripped variant
        _, pred_err = _execute_against_sqlite(pred_sql, db_path)
        stripped_rows, stripped_err = _execute_against_sqlite(pred_no_limit, db_path)
        if stripped_err:
            counts["stripped_runtime_error"] += 1
            audit_lines.append({
                "qid": qid, "db_id": db_id,
                "pred_limit": pred_limit_clause,
                "stripped_runtime_error": stripped_err,
                "would_pass_without_limit": False,
            })
            continue

        # Compare stripped result vs gold via official BIRD comparator
        # calculate_ex takes (predicted_rows, gold_rows) — we precompute gold once
        gold_rows, gold_err = _execute_against_sqlite(gold_sql, db_path)
        if gold_err:
            counts["gold_error"] += 1
            continue

        try:
            ex = calculate_ex(stripped_rows, gold_rows)
        except Exception as exc:
            counts["compare_error"] += 1
            audit_lines.append({
                "qid": qid, "db_id": db_id,
                "pred_limit": pred_limit_clause,
                "compare_error": f"{type(exc).__name__}: {exc}",
                "would_pass_without_limit": False,
            })
            continue

        passes = bool(ex == 1)
        counts["would_pass_without_limit" if passes else "still_fail_without_limit"] += 1
        audit_lines.append({
            "qid": qid, "db_id": db_id,
            "difficulty": entry.get("difficulty"),
            "pred_limit": pred_limit_clause,
            "pred_rows": len(stripped_rows),
            "gold_rows": len(gold_rows),
            "would_pass_without_limit": passes,
            "ex_diagnostic": result.get("ex_diagnostic"),
        })

    # Write audit
    out_path = TRACE_DIR / "_limit_audit.jsonl"
    with open(out_path, "w", encoding="utf-8") as f:
        for line in audit_lines:
            f.write(json.dumps(line, default=str) + "\n")

    print(f" Audit categories:")
    for cat, n in counts.most_common():
        print(f"   {cat:<28}: {n}")

    would_pass = counts.get("would_pass_without_limit", 0)
    still_fail = counts.get("still_fail_without_limit", 0)
    candidates = would_pass + still_fail

    print(f"\n {'='*60}")
    print(f"  LIMIT-mismatch candidates (pred has LIMIT, gold does not): {candidates}")
    print(f"  Of which, would PASS if LIMIT stripped: {would_pass}")
    print(f"  Still FAIL even without LIMIT: {still_fail}")
    print(f" {'='*60}\n")

    if would_pass > 10:
        print(f" DECISION: {would_pass} > 10 — implement targeted LIMIT-skip directive")
        print(f"           for COUNT/MAX/MIN/SUM single-row aggregates.")
    elif would_pass < 5:
        print(f" DECISION: {would_pass} < 5 — DROP the lever. R2's claim is overstated.")
    else:
        print(f" DECISION: {would_pass} in [5,10] — judgment call. Sid decides.")

    print(f"\n Wrote: {out_path.relative_to(_REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
