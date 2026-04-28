"""Model distribution audit on main_150_v3 (re-attributed) failures.

For each FAILED qid:
  - Read api_call events + agent_step tool_call events from per-qid JSONL
  - Identify the model that wrote the FINAL run_sql call (api_call immediately
    preceding the last agent_step where tool=run_sql)
  - Count Haiku vs Sonnet escalations within the question
  - Detect bypass_summary terminations

Output: matrix (failure_class × final_SQL_model) and per-qid breakdown.
$0 API spend. Pure trace analysis.
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent

TRACE_DIR = _REPO_ROOT / "benchmarks" / "bird" / "traces" / "main150_v3"


def _classify_model(model: str) -> str:
    if not model:
        return "unknown"
    m = model.lower()
    if "haiku" in m:
        return "haiku"
    if "sonnet" in m:
        return "sonnet"
    if "opus" in m:
        return "opus"
    return "unknown"


def _audit_qid(qid_path: Path) -> dict | None:
    """Walk per-qid trace, return audit fields."""
    events = []
    try:
        with open(qid_path, encoding="utf-8") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                events.append(rec)
    except FileNotFoundError:
        return None

    meta = next((e for e in events if e.get("type") == "meta"), None)
    result = next((e for e in events if e.get("type") == "result"), None)
    if not meta or not result:
        return None

    # Walk in order, track last run_sql tool_call and last api_call before it
    last_run_sql_idx = -1
    last_api_call_before_sql = None
    most_recent_api = None
    api_calls_by_model = Counter()
    saw_escalation = False
    saw_haiku = False
    saw_sonnet = False
    bypass_summary = False

    for i, e in enumerate(events):
        if e.get("type") == "api_call":
            mdl = _classify_model(e.get("model", ""))
            api_calls_by_model[mdl] += 1
            if mdl == "haiku":
                saw_haiku = True
            if mdl == "sonnet":
                saw_sonnet = True
            most_recent_api = e
        if e.get("type") == "agent_step":
            tool = e.get("tool")
            tool_input = e.get("tool_input") or {}
            if tool == "run_sql" and isinstance(tool_input, dict) and tool_input.get("sql"):
                last_run_sql_idx = i
                last_api_call_before_sql = most_recent_api
        if e.get("type") == "bypass_summary":
            # Check if cascade was non-zero — indicates the bypass-summary
            # path (cascade resolved 'summarize') terminated the run
            if (e.get("cascade", 0) or 0) > 0:
                bypass_summary = True

    # Escalation = Haiku appears earlier, Sonnet appears later (or both)
    if saw_haiku and saw_sonnet:
        # Find first Haiku and first Sonnet api_call indices
        first_haiku = next((i for i, e in enumerate(events) if e.get("type") == "api_call" and _classify_model(e.get("model", "")) == "haiku"), -1)
        first_sonnet = next((i for i, e in enumerate(events) if e.get("type") == "api_call" and _classify_model(e.get("model", "")) == "sonnet"), -1)
        if first_haiku >= 0 and first_sonnet >= 0 and first_sonnet > first_haiku:
            saw_escalation = True

    final_sql_model = "no_run_sql"
    if last_api_call_before_sql is not None:
        final_sql_model = _classify_model(last_api_call_before_sql.get("model", ""))

    return {
        "qid": meta.get("qid"),
        "db_id": meta.get("db_id"),
        "difficulty": meta.get("difficulty"),
        "ex_pass": result.get("ex_pass"),
        "failure_category": result.get("failure_category"),
        "final_sql_model": final_sql_model,
        "haiku_calls": api_calls_by_model.get("haiku", 0),
        "sonnet_calls": api_calls_by_model.get("sonnet", 0),
        "escalation": saw_escalation,
        "bypass_summary": bypass_summary,
    }


def main() -> int:
    if not TRACE_DIR.exists():
        print(f"FATAL: trace dir missing: {TRACE_DIR}")
        return 2

    # Load re-attribution to get canonical theme_attribution_v2
    index_path = TRACE_DIR / "_index_v2.jsonl"
    qid_to_theme = {}
    if index_path.exists():
        with open(index_path, encoding="utf-8") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                qid_to_theme[rec.get("qid")] = rec.get("theme_attribution_v2")

    qid_files = sorted(p for p in TRACE_DIR.glob("*.jsonl") if not p.name.startswith("_"))

    audits = []
    for path in qid_files:
        a = _audit_qid(path)
        if a is None:
            continue
        a["theme_v2"] = qid_to_theme.get(a["qid"], a.get("failure_category"))
        audits.append(a)

    # Filter to failures only
    failures = [a for a in audits if not a["ex_pass"]]
    passes = [a for a in audits if a["ex_pass"]]

    print(f"\n{'='*70}\n MODEL DISTRIBUTION AUDIT — main_150_v3 (re-attributed)\n{'='*70}")
    print(f" Total: {len(audits)} questions ({len(passes)} pass, {len(failures)} fail)\n")

    # Matrix: theme_v2 × final_sql_model (failures only)
    matrix = defaultdict(Counter)
    for a in failures:
        matrix[a["theme_v2"]][a["final_sql_model"]] += 1

    print(f" Failure matrix (rows=theme, cols=final_sql_model):")
    all_models = ["haiku", "sonnet", "opus", "no_run_sql", "unknown"]
    print(f"   {'theme':<20} {'haiku':>7} {'sonnet':>7} {'opus':>7} {'no_sql':>7} total")
    for theme, counts in sorted(matrix.items(), key=lambda kv: -sum(kv[1].values())):
        row = [theme or "?"]
        for m in all_models:
            row.append(counts.get(m, 0))
        total = sum(counts.values())
        print(f"   {row[0]:<20} {row[1]:>7} {row[2]:>7} {row[3]:>7} {row[4]:>7} {total:>5}")

    # Specific counts the protocol requested
    print()
    sql_logic_failures = [a for a in failures if a["theme_v2"] == "sql_logic"]
    sql_logic_haiku = [a for a in sql_logic_failures if a["final_sql_model"] == "haiku"]
    sql_logic_sonnet = [a for a in sql_logic_failures if a["final_sql_model"] == "sonnet"]
    schema_linking_failures = [a for a in failures if a["theme_v2"] == "schema_linking"]

    print(f" Specific counts (protocol-requested):")
    print(f"   sql_logic failures (total)      : {len(sql_logic_failures)}")
    print(f"   sql_logic where Haiku wrote SQL : {len(sql_logic_haiku)}  &lt;- routing target")
    print(f"   sql_logic where Sonnet wrote SQL: {len(sql_logic_sonnet)} &lt;- routing won't help")
    print(f"   schema_linking failures         : {len(schema_linking_failures)}")
    print(f"   ... where Haiku planned         : {sum(1 for a in schema_linking_failures if a['final_sql_model']=='haiku')}")
    print(f"   ... where Sonnet planned        : {sum(1 for a in schema_linking_failures if a['final_sql_model']=='sonnet')}")

    print(f"\n Escalation pattern in failures:")
    escalated = sum(1 for a in failures if a["escalation"])
    print(f"   Haiku -> Sonnet during question: {escalated} of {len(failures)}")

    print(f"\n Bypass termination:")
    bypass_count = sum(1 for a in failures if a["bypass_summary"])
    print(f"   Bypass-summary terminations    : {bypass_count} of {len(failures)}")

    # Compare model usage in passes vs failures (selection effect check)
    print(f"\n Model usage rate — passes vs failures:")
    pass_haiku = sum(1 for a in passes if a["final_sql_model"] == "haiku")
    pass_sonnet = sum(1 for a in passes if a["final_sql_model"] == "sonnet")
    fail_haiku = sum(1 for a in failures if a["final_sql_model"] == "haiku")
    fail_sonnet = sum(1 for a in failures if a["final_sql_model"] == "sonnet")
    print(f"   Passes:   haiku={pass_haiku} ({100.0*pass_haiku/max(len(passes),1):.0f}%)  "
          f"sonnet={pass_sonnet} ({100.0*pass_sonnet/max(len(passes),1):.0f}%)")
    print(f"   Failures: haiku={fail_haiku} ({100.0*fail_haiku/max(len(failures),1):.0f}%)  "
          f"sonnet={fail_sonnet} ({100.0*fail_sonnet/max(len(failures),1):.0f}%)")

    # Write per-qid audit
    out_path = TRACE_DIR / "_model_audit.jsonl"
    with open(out_path, "w", encoding="utf-8") as f:
        for a in audits:
            f.write(json.dumps(a, default=str) + "\n")
    print(f"\n Wrote per-qid audit: {out_path.relative_to(_REPO_ROOT)}")

    # Decision
    if len(sql_logic_haiku) > 15:
        print(f"\n DECISION: {len(sql_logic_haiku)} > 15 sql_logic failures Haiku-written.")
        print(f"           Routing change (Sonnet for SQL gen) is HIGH LEVERAGE.")
        print(f"           Estimated +5-10pt direct lift on those questions.")
    else:
        print(f"\n DECISION: {len(sql_logic_haiku)} <= 15 sql_logic failures Haiku-written.")
        print(f"           Routing change is LOW LEVERAGE — most failures are Sonnet-written.")
        print(f"           Different lever needed.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
