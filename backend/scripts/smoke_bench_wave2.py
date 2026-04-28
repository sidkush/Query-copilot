"""Wave 2 integration smoke — verifies planner+ladder+cache wire correctly.

Acceptance criteria (all must pass):
(a) plan_artifact event fires before any run_sql tool call — both runs
(b) Recovery tier (if it triggers) resolves to claude-sonnet-4-6, not Opus
(c) Plan cache writes to a 60-char collection name with tenant prefix
(d) Generated SQL executes against the SQLite without error — both runs
(e) With-evidence run uses Free_Meal_Count_K_12 / Enrollment_K_12 in SQL
(f) No-evidence run does NOT have access to the formula (must derive or fail
    gracefully)
(g) Total spend across both runs < $0.30; halt and report if exceeded

NOT a benchmark — wiring smoke only. Real BIRD scoring happens in Phase 3.

Usage (follows benchmarks/bird/HARNESS_DISCIPLINE.md):
    cd backend
    # GOOD — unbuffered, direct file redirect, run in background
    python -u scripts/smoke_bench_wave2.py > /tmp/smoke.log 2>&1 &
    # then watch live in another pane:
    #   tail -F /tmp/smoke.log

    # BAD — pipe-to-tail buffers everything until exit (20-min invisible hang risk):
    #   python scripts/smoke_bench_wave2.py 2>&1 | tail -120
"""
from __future__ import annotations

# CRITICAL: set BENCHMARK_MODE env BEFORE any backend imports so config loads correctly.
import os
os.environ["BENCHMARK_MODE"] = "true"

# Force stdout to utf-8 with replacement so any unicode chars from agent output
# (e.g. warning sign emoji in result banners) don't crash the harness on Windows.
# Also force line-buffered so output flushes after each newline even when stdout
# is redirected to a file (defense vs. operator forgetting `python -u`).
import sys as _sys
try:
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    _sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

import functools
import json
import re
import sqlite3
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# All harness output must flush. Belt + braces on top of `python -u` rule
# from benchmarks/bird/HARNESS_DISCIPLINE.md.
print = functools.partial(print, flush=True)  # noqa: A001

# Allow running from project root or from backend/
_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

FIXTURE = _REPO_ROOT / "benchmarks" / "bird" / "fixtures" / "synthetic_ca_schools.sqlite"
SPEND_CAP_USD = 0.30

# Heartbeat cadence — emits even mid-API-call so silence reliably means hang.
HEARTBEAT_SECONDS = 10.0
# Per-question wall clock. Smoke is short — relative-percentile budgeting
# (Rule 5 in HARNESS_DISCIPLINE.md) lands in the Phase 2 pilot harness; smoke
# uses an absolute floor.
PER_QUESTION_WALL_CLOCK_S = 90.0


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _heartbeat_loop(state: dict, stop_event: threading.Event, interval: float) -> None:
    """Emit timestamped heartbeat every interval s until stop_event is set.

    Rule 4 of HARNESS_DISCIPLINE.md — runs in a daemon thread so the main
    loop can be inside a blocking Anthropic call and we still get a pulse.
    """
    while not stop_event.wait(interval):
        elapsed = time.time() - state["q_start"]
        print(
            f"  [hb {_utc_iso()}] run={state['name']} "
            f"elapsed={elapsed:.1f}s spend=${state['spend']:.4f} "
            f"events={state['events']} api_calls={state['api_calls']}"
        )

# Anthropic pricing per 1M tokens (input/output) — Apr 2026
PRICING = {
    "claude-haiku-4-5-20251001": (1.00, 5.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet-4-5-20250514": (3.00, 15.00),
    "claude-opus-4-7-1m-20260115": (15.00, 75.00),
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    in_rate, out_rate = PRICING.get(model, (3.0, 15.0))  # conservative default
    return (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000.0


@dataclass
class SmokeRun:
    name: str
    question: str
    evidence: Optional[str]
    events: list = field(default_factory=list)
    api_calls: list = field(default_factory=list)  # (model, in_tokens, out_tokens, $cost)
    plan_collection_name: Optional[str] = None
    final_sql: Optional[str] = None
    sql_executed_ok: bool = False
    sql_exec_error: Optional[str] = None
    sql_result_rows: int = 0
    # BIRD-prep BENCHMARK_MODE bypass counts (read from engine after run)
    bypass_ask_user: int = 0
    bypass_gate_c: int = 0
    bypass_cascade: int = 0


def install_spend_tracker(provider, on_call):
    """Wrap provider's underlying _client.messages.create + .stream to track spend.

    Captures every Anthropic API call (planner, agent steps, recovery, etc.)
    regardless of which provider method routes through it.
    """
    client = provider._client
    orig_create = client.messages.create
    orig_stream = client.messages.stream

    def tracked_create(*args, **kwargs):
        model = kwargs.get("model", "unknown")
        resp = orig_create(*args, **kwargs)
        usage = getattr(resp, "usage", None)
        in_tok = getattr(usage, "input_tokens", 0) or 0
        out_tok = getattr(usage, "output_tokens", 0) or 0
        on_call(model, in_tok, out_tok)
        return resp

    def tracked_stream(*args, **kwargs):
        model = kwargs.get("model", "unknown")
        ctx = orig_stream(*args, **kwargs)
        # Intercept the context manager's __exit__ to capture final usage
        orig_exit = ctx.__exit__

        def patched_exit(exc_type, exc_val, exc_tb):
            try:
                msg = ctx.get_final_message()
                usage = getattr(msg, "usage", None)
                in_tok = getattr(usage, "input_tokens", 0) or 0
                out_tok = getattr(usage, "output_tokens", 0) or 0
                on_call(model, in_tok, out_tok)
            except Exception:
                pass
            return orig_exit(exc_type, exc_val, exc_tb)

        ctx.__exit__ = patched_exit
        return ctx

    client.messages.create = tracked_create
    client.messages.stream = tracked_stream


def build_engine_for_smoke():
    """Construct AgentEngine + dependencies against the synthetic SQLite."""
    from config import settings, DBType
    from db_connector import DatabaseConnector
    from query_engine import QueryEngine
    from models import ConnectionEntry
    from anthropic_provider import AnthropicProvider
    from agent_engine import AgentEngine, SessionMemory

    assert settings.BENCHMARK_MODE is True, (
        "BENCHMARK_MODE must be True — env not loaded correctly"
    )

    conn_uri = f"sqlite:///{FIXTURE.as_posix()}"
    connector = DatabaseConnector(db_type=DBType.SQLITE, connection_uri=conn_uri)
    connector.connect()
    provider = AnthropicProvider(
        api_key=settings.ANTHROPIC_API_KEY,
        default_model=settings.PRIMARY_MODEL,
        fallback_model=settings.FALLBACK_MODEL,
    )
    qe = QueryEngine(db_connector=connector, namespace="smoke", provider=provider)

    entry = ConnectionEntry(
        conn_id="smoke-conn-uuid-0001",
        connector=connector,
        engine=qe,
        db_type="sqlite",
        database_name="synthetic_ca_schools",
    )
    # Real benchmark identity — NOT a sentinel substitute. Wave 2 contract:
    # _maybe_emit_plan SKIPS planner entirely when tenant_id is missing/empty
    # (no sentinel substitution to prevent cross-tenant cache leaks). To
    # exercise the planner path, the harness must explicitly set a real
    # tenant identity here.
    entry.tenant_id = "bird-benchmark-synthetic"

    memory = SessionMemory(chat_id="smoke-chat-001", owner_email="smoke@local", provider=provider)
    # Production passes entry.engine (= QueryEngine), NOT the SQLAlchemy Engine.
    # See routers/agent_routes.py:486.
    engine = AgentEngine(
        engine=qe,
        email="smoke@local",
        connection_entry=entry,
        provider=provider,
        memory=memory,
        auto_execute=True,
        permission_mode="autonomous",
    )
    engine.agent_context = "query"
    return engine, provider, connector


def run_one(name: str, question: str, evidence: Optional[str], cumulative_spend: list) -> SmokeRun:
    """Single smoke run; raises RuntimeError if cumulative spend exceeds cap."""
    print(f"\n{'='*70}\n RUN: {name} [{_utc_iso()}]\n  question: {question}\n  evidence: {evidence!r}\n{'='*70}")
    run = SmokeRun(name=name, question=question, evidence=evidence)

    engine, provider, connector = build_engine_for_smoke()

    # Inject evidence into the question text Adobe-BIRD-style if present.
    composed_question = question
    if evidence:
        composed_question = f"{question}\nEvidence: {evidence}"

    # Shared mutable state read by the heartbeat thread.
    hb_state = {
        "name": name,
        "q_start": time.time(),
        "spend": cumulative_spend[0],
        "events": 0,
        "api_calls": 0,
    }

    def on_api_call(model: str, in_tok: int, out_tok: int):
        cost = estimate_cost(model, in_tok, out_tok)
        run.api_calls.append((model, in_tok, out_tok, cost))
        cumulative_spend[0] += cost
        hb_state["spend"] = cumulative_spend[0]
        hb_state["api_calls"] = len(run.api_calls)
        print(f"  [api {_utc_iso()}] model={model} in={in_tok} out={out_tok} cost=${cost:.4f} cumulative=${cumulative_spend[0]:.4f}")
        if cumulative_spend[0] > SPEND_CAP_USD:
            raise RuntimeError(
                f"Cumulative spend ${cumulative_spend[0]:.4f} exceeds cap ${SPEND_CAP_USD:.2f} — halting"
            )

    install_spend_tracker(provider, on_api_call)

    # Capture plan cache collection name AFTER ring8 attach (already done in __init__)
    if engine._planner is not None and getattr(engine._planner, "_cache", None) is not None:
        try:
            run.plan_collection_name = engine._planner._cache._chroma.name
        except Exception as exc:
            run.plan_collection_name = f"<introspect-failed: {exc}>"

    # Start heartbeat thread — keeps stdout alive even when Anthropic is slow.
    hb_stop = threading.Event()
    hb_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(hb_state, hb_stop, HEARTBEAT_SECONDS),
        daemon=True,
        name=f"hb-{name}",
    )
    hb_thread.start()

    # Run the agent loop, collecting events
    last_run_sql: Optional[str] = None
    start = hb_state["q_start"]
    budget_aborted = False
    try:
        for step in engine.run(composed_question):
            # AgentStep — extract type + minimal fields for inspection
            event = {"type": getattr(step, "type", "unknown")}
            content = getattr(step, "content", None)
            if isinstance(content, str) and content:
                event["content_snippet"] = content[:200]
            tool = getattr(step, "tool_name", None) or getattr(step, "name", None)
            if tool:
                event["tool"] = tool
            tool_input = getattr(step, "tool_input", None) or getattr(step, "input", None)
            if isinstance(tool_input, dict) and "sql" in tool_input:
                last_run_sql = tool_input["sql"]
            run.events.append(event)
            hb_state["events"] = len(run.events)
            # Compact trace with timestamp
            print(f"  [event {_utc_iso()}] {event}")
            elapsed = time.time() - start
            if elapsed > PER_QUESTION_WALL_CLOCK_S:
                budget_aborted = True
                print(
                    f"  [BUDGET_ABORT {_utc_iso()}] run={name} elapsed={elapsed:.1f}s "
                    f"budget={PER_QUESTION_WALL_CLOCK_S:.0f}s — killing agent loop"
                )
                break
    except RuntimeError as e:
        if "Cumulative spend" in str(e):
            raise
        print(f"  [error {_utc_iso()}] agent run raised: {e}")
    except Exception as e:
        print(f"  [error {_utc_iso()}] unexpected: {type(e).__name__}: {e}")
    finally:
        hb_stop.set()
        hb_thread.join(timeout=HEARTBEAT_SECONDS + 1.0)

    if budget_aborted:
        run.sql_exec_error = run.sql_exec_error or "wall_clock_exceeded"

    # BIRD-prep BENCHMARK_MODE bypass counts (visibility into how often each
    # production pause point fired during this run; informs Phase 2 calibration).
    run.bypass_ask_user = getattr(engine, "_benchmark_bypass_count", 0)
    run.bypass_gate_c = getattr(engine, "_benchmark_gate_c_bypass_count", 0)
    run.bypass_cascade = getattr(engine, "_benchmark_cascade_bypass_count", 0)

    run.final_sql = last_run_sql

    # Execute generated SQL against the SQLite to confirm it runs
    if run.final_sql:
        try:
            c = sqlite3.connect(FIXTURE)
            cursor = c.execute(run.final_sql)
            rows = cursor.fetchall()
            run.sql_executed_ok = True
            run.sql_result_rows = len(rows)
            c.close()
        except Exception as exc:
            run.sql_exec_error = f"{type(exc).__name__}: {exc}"

    return run


def check_acceptance(runs: list[SmokeRun]) -> dict:
    """Evaluate the 7 acceptance criteria. Return a dict of pass/fail + notes."""
    results = {}

    # (a) plan_artifact before any run_sql — both runs
    a_pass = True
    a_notes = []
    for r in runs:
        plan_idx = next(
            (i for i, e in enumerate(r.events) if e["type"] == "plan_artifact"),
            None,
        )
        run_sql_idx = next(
            (i for i, e in enumerate(r.events)
             if e["type"] in ("tool_call", "tool_use", "run_sql")
             and e.get("tool") == "run_sql"),
            None,
        )
        if plan_idx is None:
            a_pass = False
            a_notes.append(f"{r.name}: no plan_artifact event found")
        elif run_sql_idx is None:
            a_notes.append(f"{r.name}: no run_sql event (plan_artifact at {plan_idx})")
        elif plan_idx >= run_sql_idx:
            a_pass = False
            a_notes.append(f"{r.name}: plan_artifact at {plan_idx} NOT before run_sql at {run_sql_idx}")
        else:
            a_notes.append(f"{r.name}: plan_artifact[{plan_idx}] < run_sql[{run_sql_idx}]")
    results["a_plan_before_sql"] = (a_pass, a_notes)

    # (b) Recovery model is sonnet-4-6 not opus
    b_pass = True
    b_notes = []
    for r in runs:
        opus_calls = [c for c in r.api_calls if "opus" in c[0].lower()]
        if opus_calls:
            b_pass = False
            b_notes.append(f"{r.name}: OPUS detected in {len(opus_calls)} call(s) — BENCHMARK_MODE override failed")
        else:
            models = sorted(set(c[0] for c in r.api_calls))
            b_notes.append(f"{r.name}: models used = {models}")
    results["b_recovery_is_sonnet"] = (b_pass, b_notes)

    # (c) Plan cache collection name is 60-char with tenant prefix
    c_pass = True
    c_notes = []
    for r in runs:
        n = r.plan_collection_name
        if not n:
            c_pass = False
            c_notes.append(f"{r.name}: no plan_cache collection (FEATURE_PLAN_CACHE off?)")
        elif len(n) != 60 or not re.match(r"^plan_cache_[a-f0-9]{16}_[a-f0-9]{32}$", n):
            c_pass = False
            c_notes.append(f"{r.name}: collection name '{n}' (len={len(n)}) does NOT match new format")
        else:
            c_notes.append(f"{r.name}: '{n}' ✓ (60 chars, tenant_<16>_conn_<32>)")
    results["c_collection_60_char"] = (c_pass, c_notes)

    # (d) Generated SQL executes — both runs
    d_pass = all(r.sql_executed_ok for r in runs)
    d_notes = [
        f"{r.name}: {'OK' if r.sql_executed_ok else 'FAIL'} ({r.sql_result_rows} rows)"
        + (f" err={r.sql_exec_error}" if r.sql_exec_error else "")
        for r in runs
    ]
    results["d_sql_executes"] = (d_pass, d_notes)

    # (e) With-evidence run uses Free_Meal_Count_K_12 / Enrollment_K_12
    with_evidence = next((r for r in runs if r.evidence), None)
    if with_evidence and with_evidence.final_sql:
        sql = with_evidence.final_sql
        e_pass = ("Free_Meal_Count_K_12" in sql and "Enrollment_K_12" in sql)
        e_notes = [
            "uses Free_Meal_Count_K_12: " + str("Free_Meal_Count_K_12" in sql),
            "uses Enrollment_K_12: " + str("Enrollment_K_12" in sql),
        ]
    else:
        e_pass = False
        e_notes = ["with-evidence run produced no SQL"]
    results["e_evidence_in_sql"] = (e_pass, e_notes)

    # (f) No-evidence + with-evidence produce DIFFERENT SQL (proves evidence path is wired)
    no_ev = next((r for r in runs if not r.evidence), None)
    with_ev = next((r for r in runs if r.evidence), None)
    if no_ev and with_ev and no_ev.final_sql and with_ev.final_sql:
        f_pass = no_ev.final_sql.strip() != with_ev.final_sql.strip()
        f_notes = [f"SQLs differ: {f_pass}"]
        if not f_pass:
            f_notes.append("BOTH SQLs are identical — evidence injection path may be broken")
    elif no_ev and not no_ev.final_sql:
        # No-evidence "fail gracefully" path is also acceptable per spec
        f_pass = True
        f_notes = ["no-evidence run failed gracefully (no SQL produced) — acceptable per spec"]
    else:
        f_pass = False
        f_notes = ["could not compare runs"]
    results["f_evidence_changes_sql"] = (f_pass, f_notes)

    return results


def main():
    if not FIXTURE.exists():
        print(f"FATAL: fixture missing at {FIXTURE}")
        print("Run: python benchmarks/bird/fixtures/build_synthetic_ca_schools.py")
        return 2

    cumulative = [0.0]
    runs = []

    # NOTE: question contains "compare" + "across" so AskDB's planner heuristic
    # (agent_engine.py:3395 complex_keywords) flags is_complex=True and the
    # planner code path fires — this exercises plan_artifact emission. For real
    # BIRD harness, Phase 5 needs a separate force-planner gate (BIRD questions
    # don't always contain trigger keywords).
    QUESTION = (
        "Compare schools across districts by their eligible free rate for K-12 "
        "students; show the top 5 with the highest rates."
    )
    EVIDENCE = "Eligible free rate = Free_Meal_Count_K_12 / Enrollment_K_12"

    try:
        runs.append(run_one("with_evidence", QUESTION, EVIDENCE, cumulative))
        runs.append(run_one("no_evidence", QUESTION, None, cumulative))
    except RuntimeError as e:
        print(f"\nHALTED: {e}")
        if runs:
            print(f"Completed {len(runs)} run(s) before halt.")

    print(f"\n{'='*70}\n SMOKE COMPLETE — total spend: ${cumulative[0]:.4f} / ${SPEND_CAP_USD:.2f}\n{'='*70}")

    # BIRD-prep BENCHMARK_MODE bypass-counts summary line per spec
    total_ask = sum(r.bypass_ask_user for r in runs)
    total_gc = sum(r.bypass_gate_c for r in runs)
    total_csc = sum(r.bypass_cascade for r in runs)
    print(f"\n Bypasses fired: ask_user={total_ask}, gate_c={total_gc}, cascade={total_csc}")
    if total_ask + total_gc + total_csc == 0:
        print(" (all zero = bypass paths are precautionary for this question; "
              "not load-bearing yet)")

    print("\n--- SQL produced ---")
    for r in runs:
        print(f"\n[{r.name}] collection={r.plan_collection_name}")
        print(f"  events: {len(r.events)} (types: {sorted(set(e['type'] for e in r.events))})")
        print(f"  api_calls: {len(r.api_calls)}")
        print(f"  SQL:\n    {(r.final_sql or '<none>').replace(chr(10), chr(10)+'    ')}")
        print(f"  exec: {'OK' if r.sql_executed_ok else 'FAIL'} ({r.sql_result_rows} rows){' err=' + r.sql_exec_error if r.sql_exec_error else ''}")

    print("\n--- ACCEPTANCE ---")
    results = check_acceptance(runs)
    for criterion, (passed, notes) in results.items():
        marker = "PASS" if passed else "FAIL"
        print(f"\n  [{marker}] {criterion}")
        for n in notes:
            print(f"    - {n}")

    g_pass = cumulative[0] < SPEND_CAP_USD
    print(f"\n  [{'PASS' if g_pass else 'FAIL'}] g_spend_under_cap")
    print(f"    - cumulative ${cumulative[0]:.4f} {'<' if g_pass else '>='} cap ${SPEND_CAP_USD:.2f}")

    all_pass = all(p for p, _ in results.values()) and g_pass
    print(f"\n{'='*70}")
    print(f" OVERALL: {'ALL PASS' if all_pass else 'FAILURES PRESENT — review before D1'}")
    print(f"{'='*70}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
