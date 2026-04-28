"""BIRD-Mini-Dev smoke 10 harness.

Loops over the 10 stratified questions in benchmarks/bird/smoke10_seed42.json,
runs each through AgentEngine under BENCHMARK_MODE, computes Execution Accuracy
via BIRD's OFFICIAL calculate_ex (imported from mini_dev/evaluation/), and
captures full per-question trace JSONL for failure clustering.

Caps:
  - Total spend: $1.50 across all 10
  - Per-question spend: $0.30 (halt + categorize as cost_cap)
  - Per-question wall-clock: 90s (halt + categorize as wall_clock)
  - Mid-run EX guard: after Q >= 3, halt if running EX < 35%
    (signals wiring/harness bug, not model quality)

Output:
  - benchmarks/bird/traces/smoke10/{qid}.jsonl per question
  - End-of-run summary: EX, per-difficulty breakdown, failure cluster table,
    bypass counts, total spend, total wall-clock

Usage (follows benchmarks/bird/HARNESS_DISCIPLINE.md):
    cd backend
    python -u scripts/run_bird_smoke10.py > /tmp/bird_smoke10.log 2>&1 &
    tail -F /tmp/bird_smoke10.log     # in another pane
"""
from __future__ import annotations

import os
os.environ["BENCHMARK_MODE"] = "true"
# 2026-04-27 (Phase 1 OR-coerce removal): retrieval flags must be set
# explicitly. BENCHMARK_MODE no longer auto-coerces hybrid/minilm.
# 2026-04-28 (Phase 1 Capability 3): doc-enrichment OR-coerce also removed.
os.environ["FEATURE_HYBRID_RETRIEVAL"] = "true"
os.environ["FEATURE_MINILM_SCHEMA_COLLECTION"] = "true"
os.environ["FEATURE_RETRIEVAL_DOC_ENRICHMENT"] = "true"

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
import threading
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

print = functools.partial(print, flush=True)  # noqa: A001

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_BACKEND_DIR) not in _sys.path:
    _sys.path.insert(0, str(_BACKEND_DIR))

# Import BIRD's OFFICIAL EX calculator + sql executor (provenance: any future
# challenge "your EX number doesn't match BIRD's" answered by "we use their
# literal function"). Newer mini_dev layout puts these in evaluation/, not llm/src/.
_BIRD_EVAL_DIR = _REPO_ROOT / "benchmarks" / "bird" / "mini_dev" / "evaluation"
if str(_BIRD_EVAL_DIR) not in _sys.path:
    _sys.path.insert(0, str(_BIRD_EVAL_DIR))
from evaluation_ex import calculate_ex          # noqa: E402  the official EX comparator
from evaluation_utils import execute_sql        # noqa: E402  the official runner

# Sample file + trace dir + caps + guards overridable via env so the same
# harness drives smoke 10, pilot 50, main 150 without forking. Defaults
# match smoke 10. Pilot 50 sets BIRD_SAMPLE_FILE/BIRD_TRACE_DIR/BIRD_TOTAL_CAP_USD
# to point at pilot50_seed42.json + traces/pilot50/ + $15 cap.
SAMPLE_FILE = Path(os.environ.get(
    "BIRD_SAMPLE_FILE",
    str(_REPO_ROOT / "benchmarks" / "bird" / "smoke10_seed42.json"),
))
DB_ROOT = _REPO_ROOT / "benchmarks" / "bird" / "mini_dev" / "llm" / "mini_dev_data" / "minidev" / "MINIDEV" / "dev_databases"
TRACE_DIR = Path(os.environ.get(
    "BIRD_TRACE_DIR",
    str(_REPO_ROOT / "benchmarks" / "bird" / "traces" / "smoke10"),
))

TOTAL_SPEND_CAP_USD = float(os.environ.get("BIRD_TOTAL_CAP_USD", "1.50"))
PER_QUESTION_SPEND_CAP_USD = float(os.environ.get("BIRD_PER_Q_CAP_USD", "0.30"))
PER_QUESTION_WALL_CLOCK_S = float(os.environ.get("BIRD_PER_Q_WALL_S", "90.0"))
MID_RUN_EX_FLOOR_PCT = float(os.environ.get("BIRD_MID_RUN_EX_FLOOR_PCT", "35.0"))
MID_RUN_GUARD_AFTER_N_QUESTIONS = int(os.environ.get("BIRD_MID_RUN_GUARD_AFTER_N", "3"))
HEARTBEAT_SECONDS = 10.0
TENANT_ID = os.environ.get("BIRD_TENANT_ID", "bird-benchmark-smoke10")

PRICING = {
    "claude-haiku-4-5-20251001": (1.00, 5.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet-4-5-20250514": (3.00, 15.00),
    "claude-opus-4-7-1m-20260115": (15.00, 75.00),
}

# Failure categories — used by Phase 7 clustering. Order matters: more specific first.
FAILURE_CATEGORIES = (
    "no_sql",          # predicted_sql is None/empty
    "bypass_loop",     # BenchmarkBypassLoopError raised
    "wall_clock",      # per-question wall budget exceeded
    "cost_cap",        # per-question cost cap exceeded
    "syntax_error",    # SQL doesn't parse / syntactically invalid
    "runtime_error",   # SQL parses but fails at execute (no such table/column, type mismatch)
    "empty_result",    # SQL executed cleanly but returned 0 rows when gold returned >0
    "wrong_count",     # row counts differ between predicted and gold (both non-zero)
    "wrong_data",      # row counts match but rows differ (semantic miss)
)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    in_rate, out_rate = PRICING.get(model, (3.0, 15.0))
    return (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000.0


@dataclass
class QuestionResult:
    qid: int
    db_id: str
    difficulty: str
    question: str
    evidence: Optional[str]
    gold_sql: str
    predicted_sql: Optional[str] = None
    ex_pass: bool = False
    ex_diagnostic: str = ""
    failure_category: Optional[str] = None
    api_calls: list = field(default_factory=list)  # (model, in, out, $)
    spend_usd: float = 0.0
    wall_s: float = 0.0
    bypass_ask_user: int = 0
    bypass_gate_c: int = 0
    bypass_cascade: int = 0
    event_count: int = 0
    error: Optional[str] = None  # Python-level exception traceback if any
    # Theme 5 (2026-04-27 council): per-question failure-class attribution.
    # Aggregated post-pilot to identify which lever moved which failure class.
    retrieved_tables_first_call: list = field(default_factory=list)
    gold_tables: list = field(default_factory=list)
    theme_helped: Optional[str] = None


# Theme 5 helpers — failure-class attribution for council post-mortem.

_TABLE_RE_FROM_DOC = re.compile(r"Table:\s+(\w+)", re.MULTILINE)


def _extract_tables_from_doc_string(content: str) -> list:
    """Pull table names from find_relevant_tables tool_result content.
    The tool returns docs that start with 'Table: <name>'; this regex
    captures them in retrieval order."""
    if not isinstance(content, str):
        return []
    return _TABLE_RE_FROM_DOC.findall(content)


def _extract_tables_from_sql(sql: str) -> list:
    """Parse SQL and return referenced table names. sqlglot fails open —
    on any parse error returns []. Used to derive 'gold tables' for
    attribution comparison; not for security."""
    if not sql:
        return []
    try:
        import sqlglot
        from sqlglot import exp
        parsed = sqlglot.parse_one(sql, read="sqlite")
        return list({
            t.name for t in parsed.find_all(exp.Table) if t.name
        })
    except Exception:
        return []


def _compute_theme_attribution(r: QuestionResult) -> str:
    """Heuristic mapping from failure shape → which council theme would
    have helped. Aggregate over pilot 50 to attribute aggregate EX shifts
    to specific levers. Categories: passed, no_sql, retrieval, schema_linking,
    sql_logic, dialect, other."""
    if r.ex_pass:
        return "passed"
    if not r.predicted_sql:
        return "no_sql"
    gold_set = {t.lower() for t in (r.gold_tables or []) if t}
    retr_top3 = (r.retrieved_tables_first_call or [])[:3]
    retr_set = {t.lower() for t in retr_top3 if t}
    if gold_set and not gold_set.issubset(retr_set):
        return "retrieval"
    diag = (r.ex_diagnostic or "").lower()
    if "no such column" in diag or "unknown column" in diag:
        return "schema_linking"
    if r.failure_category == "syntax_error":
        return "dialect"
    if r.failure_category in ("wrong_data", "wrong_count", "empty_result"):
        return "sql_logic"
    return "other"


def _write_index_line(trace_dir: Path, result: QuestionResult) -> None:
    """Append one-line summary to <trace_dir>/_index.jsonl. Aggregation point
    for council post-pilot analysis — single grep over this file by qid /
    db_id / theme_helped instead of walking 50 separate JSONLs."""
    trace_dir.mkdir(parents=True, exist_ok=True)
    line = {
        "qid": result.qid,
        "db_id": result.db_id,
        "difficulty": result.difficulty,
        "ex_pass": result.ex_pass,
        "failure_category": result.failure_category,
        "theme_helped": result.theme_helped,
        "retrieved_tables_first_call": result.retrieved_tables_first_call,
        "gold_tables": result.gold_tables,
        "spend_usd": round(result.spend_usd, 4),
        "wall_s": round(result.wall_s, 1),
    }
    with open(trace_dir / "_index.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(line, default=str) + "\n")


def install_spend_tracker(provider, on_call):
    """Wrap provider's _client.messages.create + .stream for spend tracking."""
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


def setup_skill_library_state() -> None:
    """Phase 1 Cap 4 (2026-04-28): replicate main.py lifespan skill bootstrap.

    The BIRD harness instantiates AgentEngine directly without going through
    FastAPI's lifespan, so app.state.skill_library is never set. AgentEngine's
    constructor reads from main.app.state, so we set values there before any
    AgentEngine is built.

    Called once at the top of main() — NOT per question (avoid re-ingest cost).

    Path resolution mirrors main.py:109 — Path(__file__).resolve().parent.parent
    / "askdb-skills" anchored at backend/main.py, here equivalent at backend/
    via _BACKEND_DIR. State stays None on failure (graceful degradation,
    same as production lifespan).
    """
    import importlib
    from config import settings

    main_module = importlib.import_module("main")
    skills_root = _BACKEND_DIR.parent / "askdb-skills"

    try:
        from skill_library import SkillLibrary
        main_module.app.state.skill_library = SkillLibrary(root=skills_root)
        n_skills = len(main_module.app.state.skill_library.all_names())
        print(f"[skills] library loaded: {n_skills} skills from {skills_root.name}/")
    except Exception as exc:
        print(f"[skills] library failed to load: {type(exc).__name__}: {exc}")
        main_module.app.state.skill_library = None

    main_module.app.state.skill_collection = None
    if main_module.app.state.skill_library is not None and settings.SKILL_LIBRARY_ENABLED:
        try:
            import chromadb
            from skill_ingest import maybe_ingest
            chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
            stamp_dir = _BACKEND_DIR / ".data"
            maybe_ingest(main_module.app.state.skill_library, chroma_client, stamp_dir)
            main_module.app.state.skill_collection = chroma_client.get_or_create_collection(
                name="skills_v1"
            )
            print(f"[skills] skills_v1 chroma collection ready")
        except Exception as exc:
            print(f"[skills] ingest failed: {type(exc).__name__}: {exc}")
            main_module.app.state.skill_collection = None
    elif not settings.SKILL_LIBRARY_ENABLED:
        print(f"[skills] SKILL_LIBRARY_ENABLED=False — skills disabled for this run")


def build_engine_for_question(db_id: str):
    """Construct AgentEngine + dependencies pointing at the BIRD SQLite for db_id."""
    from config import settings, DBType
    from db_connector import DatabaseConnector
    from query_engine import QueryEngine
    from models import ConnectionEntry
    from anthropic_provider import AnthropicProvider
    from agent_engine import AgentEngine, SessionMemory

    assert settings.BENCHMARK_MODE is True, "BENCHMARK_MODE must be True (env not loaded)"

    db_path = DB_ROOT / db_id / f"{db_id}.sqlite"
    if not db_path.exists():
        raise FileNotFoundError(f"BIRD database missing: {db_path}")

    conn_uri = f"sqlite:///{db_path.as_posix()}"
    connector = DatabaseConnector(db_type=DBType.SQLITE, connection_uri=conn_uri)
    connector.connect()
    provider = AnthropicProvider(
        api_key=settings.ANTHROPIC_API_KEY,
        default_model=settings.PRIMARY_MODEL,
        fallback_model=settings.FALLBACK_MODEL,
    )
    qe = QueryEngine(db_connector=connector, namespace=f"bird-{db_id}", provider=provider)
    entry = ConnectionEntry(
        conn_id=f"bird-conn-{db_id}",
        connector=connector,
        engine=qe,
        db_type="sqlite",
        database_name=db_id,
    )
    entry.tenant_id = TENANT_ID
    memory = SessionMemory(chat_id=f"bird-chat-{db_id}", owner_email="bird@local", provider=provider)
    engine = AgentEngine(
        engine=qe,
        email="bird@local",
        connection_entry=entry,
        provider=provider,
        memory=memory,
        auto_execute=True,
        permission_mode="autonomous",
    )
    engine.agent_context = "query"
    return engine, provider, connector, db_path


def seed_schema_collection_if_empty(engine) -> tuple[int, bool]:
    """B-minimal: call production's QueryEngine.train_schema() to populate
    schema_collection. Mirrors the production path that fires on user connect.
    Idempotent — skips if collection already has entries (per spec rule 5).

    Returns (tables_indexed, was_skipped_idempotent).

    NOTE on embedder: production schema_collection uses _HashEmbeddingFunction
    directly (query_engine.py:180), NOT MiniLM. D1 only swapped query_memory.py.
    Faithful production benchmark uses what production uses. A future Wave 3
    swap of schema_collection to MiniLM would be a separate measurement.
    """
    qe = engine.engine  # QueryEngine instance
    existing = qe.schema_collection.count()
    if existing > 0:
        return existing, True  # idempotent — prior seed survived
    n = qe.train_schema()  # production seeder, no descriptions arg
    return n, False


def categorize_failure(predicted_sql: Optional[str], db_path: Path, gold_sql: str,
                       budget_aborted: bool, cost_capped: bool, bypass_loop: bool) -> tuple[bool, str, Optional[str]]:
    """Compute EX via BIRD's official calculate_ex + categorize failure if any.

    Returns (ex_pass, diagnostic, failure_category).
    failure_category is None on EX pass.
    """
    if bypass_loop:
        return False, "BenchmarkBypassLoopError raised", "bypass_loop"
    if budget_aborted:
        return False, "wall_clock_exceeded", "wall_clock"
    if cost_capped:
        return False, "cost_cap_exceeded", "cost_cap"
    if not predicted_sql or not predicted_sql.strip():
        return False, "no predicted SQL", "no_sql"

    # Parse-time check: try executing predicted SQL standalone first to
    # distinguish syntax_error from runtime_error.
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.execute(predicted_sql)
        pred_rows = cur.fetchall()
        conn.close()
    except sqlite3.OperationalError as exc:
        msg = str(exc).lower()
        # Sqlite uses OperationalError for both parse + runtime; distinguish by message
        if "syntax" in msg or "unrecognized token" in msg or "near " in msg:
            return False, f"syntax_error: {exc}", "syntax_error"
        return False, f"runtime_error: {exc}", "runtime_error"
    except sqlite3.ProgrammingError as exc:
        return False, f"syntax_error: {exc}", "syntax_error"
    except Exception as exc:
        return False, f"runtime_error: {type(exc).__name__}: {exc}", "runtime_error"

    # Predicted SQL ran. Use BIRD's official execute_sql + calculate_ex.
    try:
        ex = execute_sql(predicted_sql, gold_sql, str(db_path), "SQLite", calculate_ex)
    except Exception as exc:
        # Gold SQL itself errored — should never happen on BIRD official data
        return False, f"gold_sql_error: {exc}", "runtime_error"
    if ex == 1:
        return True, f"match ({len(pred_rows)} rows)", None

    # EX failed — compute a finer-grain diagnostic
    try:
        conn = sqlite3.connect(db_path)
        gold_rows = conn.execute(gold_sql).fetchall()
        conn.close()
    except Exception:
        gold_rows = []
    if not pred_rows and gold_rows:
        return False, f"empty_result (gold had {len(gold_rows)} rows)", "empty_result"
    if len(pred_rows) != len(gold_rows):
        return False, f"wrong_count (pred={len(pred_rows)}, gold={len(gold_rows)})", "wrong_count"
    return False, f"wrong_data (counts match at {len(pred_rows)})", "wrong_data"


def run_one_question(q: dict, cumulative_spend: list, trace_path: Path) -> QuestionResult:
    """Execute one BIRD question end-to-end. Writes trace JSONL. Returns QuestionResult."""
    qid = q["question_id"]
    db_id = q["db_id"]
    composed_question = f"{q['question']}\nEvidence: {q['evidence']}"

    print(f"\n{'='*70}\n Q {qid} [{q['difficulty']}] db={db_id} [{_utc_iso()}]\n  {q['question'][:80]}...\n{'='*70}")

    result = QuestionResult(
        qid=qid, db_id=db_id, difficulty=q["difficulty"],
        question=q["question"], evidence=q.get("evidence"), gold_sql=q["SQL"],
    )

    # Open trace JSONL
    trace_path.parent.mkdir(parents=True, exist_ok=True)
    trace_fh = open(trace_path, "w", encoding="utf-8")

    def emit_trace(record: dict):
        record["ts"] = _utc_iso()
        trace_fh.write(json.dumps(record, default=str) + "\n")
        trace_fh.flush()

    emit_trace({
        "type": "meta", "qid": qid, "db_id": db_id, "difficulty": q["difficulty"],
        "question": q["question"], "evidence": q.get("evidence"),
        "gold_sql": q["SQL"], "tenant_id": TENANT_ID,
    })

    try:
        engine, provider, connector, db_path = build_engine_for_question(db_id)
    except Exception as exc:
        result.error = f"engine_build_failed: {type(exc).__name__}: {exc}"
        emit_trace({"type": "error", "phase": "engine_build", "error": result.error,
                    "traceback": traceback.format_exc()})
        result.ex_pass, result.ex_diagnostic, result.failure_category = False, result.error, "runtime_error"
        trace_fh.close()
        return result

    # Seed schema_collection via production train_schema() — fires only on first
    # encounter per db_id. Idempotent re-runs skip. See seed_schema_collection_if_empty
    # for embedder rationale (hash-v1 to match production deploys).
    try:
        n_seeded, was_skipped = seed_schema_collection_if_empty(engine)
        emit_trace({"type": "schema_seed", "tables_indexed": n_seeded,
                    "skipped_idempotent": was_skipped})
        action = "skipped (idempotent)" if was_skipped else "freshly seeded"
        print(f"  [seed] schema_collection: {n_seeded} table docs ({action})")
    except Exception as exc:
        # Non-fatal — agent can still try via inspect_schema fallback. Log for diagnosis.
        emit_trace({"type": "schema_seed_error", "error": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc()})
        print(f"  [seed-error] {type(exc).__name__}: {exc}; continuing with inspect_schema fallback only")

    cost_capped = [False]
    bypass_loop_raised = [False]

    def on_api_call(model: str, in_tok: int, out_tok: int):
        cost = estimate_cost(model, in_tok, out_tok)
        result.api_calls.append((model, in_tok, out_tok, cost))
        result.spend_usd += cost
        cumulative_spend[0] += cost
        emit_trace({"type": "api_call", "model": model, "in_tokens": in_tok,
                    "out_tokens": out_tok, "cost_usd": cost,
                    "q_spend": result.spend_usd, "total_spend": cumulative_spend[0]})
        print(f"  [api {_utc_iso()}] model={model} in={in_tok} out={out_tok} "
              f"cost=${cost:.4f} q=${result.spend_usd:.4f} total=${cumulative_spend[0]:.4f}")
        if result.spend_usd > PER_QUESTION_SPEND_CAP_USD:
            cost_capped[0] = True
            raise RuntimeError(f"per_question_cost_cap_exceeded: ${result.spend_usd:.4f}")
        if cumulative_spend[0] > TOTAL_SPEND_CAP_USD:
            raise RuntimeError(f"total_spend_cap_exceeded: ${cumulative_spend[0]:.4f}")

    install_spend_tracker(provider, on_api_call)

    last_run_sql: Optional[str] = None
    retrieved_tables_per_call: list = []  # Theme 5: list of [table_names] per find_relevant_tables call
    start = time.time()
    budget_aborted = False
    try:
        from agent_engine import BenchmarkBypassLoopError
        for step in engine.run(composed_question):
            event = {"type": "agent_step", "step_type": getattr(step, "type", "unknown")}
            content = getattr(step, "content", None)
            if isinstance(content, str) and content:
                event["content"] = content[:1500]   # cap to keep traces sane
            tool = getattr(step, "tool_name", None) or getattr(step, "name", None)
            if tool:
                event["tool"] = tool
            tool_input = getattr(step, "tool_input", None) or getattr(step, "input", None)
            if isinstance(tool_input, dict):
                if "sql" in tool_input:
                    last_run_sql = tool_input["sql"]
                event["tool_input"] = {k: (str(v)[:600] if isinstance(v, (str, int, float, bool)) else "<complex>")
                                       for k, v in tool_input.items()}
            # Theme 5: capture retrieved tables from find_relevant_tables tool_result.
            # Tool result content is the rendered doc list (each starts with "Table: <name>").
            step_type = getattr(step, "type", "")
            if (tool == "find_relevant_tables" or step_type == "tool_result") and isinstance(content, str):
                tables = _extract_tables_from_doc_string(content)
                if tables:
                    retrieved_tables_per_call.append(tables)
            emit_trace(event)
            result.event_count += 1
            if time.time() - start > PER_QUESTION_WALL_CLOCK_S:
                budget_aborted = True
                emit_trace({"type": "halt", "reason": "wall_clock_exceeded",
                            "elapsed_s": time.time() - start})
                print(f"  [halt {_utc_iso()}] wall_clock_exceeded after "
                      f"{time.time()-start:.1f}s, budget={PER_QUESTION_WALL_CLOCK_S:.0f}s")
                break
    except BenchmarkBypassLoopError as exc:
        bypass_loop_raised[0] = True
        emit_trace({"type": "halt", "reason": "bypass_loop", "asks_count": exc.asks_count})
        print(f"  [halt {_utc_iso()}] BenchmarkBypassLoopError: {exc}")
    except RuntimeError as exc:
        msg = str(exc)
        if "per_question_cost_cap_exceeded" in msg or "total_spend_cap_exceeded" in msg:
            emit_trace({"type": "halt", "reason": str(exc)})
            print(f"  [halt {_utc_iso()}] {exc}")
            if "total_spend_cap_exceeded" in msg:
                trace_fh.close()
                raise  # propagate to main loop for whole-run halt
        else:
            result.error = f"runtime_error: {exc}"
            emit_trace({"type": "error", "phase": "agent_run", "error": result.error,
                        "traceback": traceback.format_exc()})
    except Exception as exc:
        result.error = f"unexpected_error: {type(exc).__name__}: {exc}"
        emit_trace({"type": "error", "phase": "agent_run", "error": result.error,
                    "traceback": traceback.format_exc()})

    result.wall_s = time.time() - start
    result.predicted_sql = last_run_sql
    result.bypass_ask_user = getattr(engine, "_benchmark_bypass_count", 0)
    result.bypass_gate_c = getattr(engine, "_benchmark_gate_c_bypass_count", 0)
    result.bypass_cascade = getattr(engine, "_benchmark_cascade_bypass_count", 0)

    emit_trace({"type": "bypass_summary",
                "ask_user": result.bypass_ask_user,
                "gate_c": result.bypass_gate_c,
                "cascade": result.bypass_cascade})

    # Compute EX via BIRD official + categorize
    ex_pass, diagnostic, fail_cat = categorize_failure(
        predicted_sql=result.predicted_sql, db_path=db_path,
        gold_sql=result.gold_sql, budget_aborted=budget_aborted,
        cost_capped=cost_capped[0], bypass_loop=bypass_loop_raised[0],
    )
    result.ex_pass, result.ex_diagnostic, result.failure_category = ex_pass, diagnostic, fail_cat

    # Theme 5: per-question failure-class attribution.
    result.retrieved_tables_first_call = (
        retrieved_tables_per_call[0] if retrieved_tables_per_call else []
    )
    result.gold_tables = _extract_tables_from_sql(result.gold_sql)
    result.theme_helped = _compute_theme_attribution(result)

    emit_trace({"type": "result", "predicted_sql": result.predicted_sql,
                "ex_pass": ex_pass, "ex_diagnostic": diagnostic,
                "failure_category": fail_cat,
                "retrieved_tables_first_call": result.retrieved_tables_first_call,
                "gold_tables": result.gold_tables,
                "theme_helped": result.theme_helped,
                "wall_s": result.wall_s, "spend_usd": result.spend_usd,
                "api_call_count": len(result.api_calls)})
    trace_fh.close()

    # Theme 5: append to _index.jsonl for cross-question aggregation.
    _write_index_line(TRACE_DIR, result)

    print(f"  [done] EX={'PASS' if ex_pass else 'FAIL'} ({diagnostic}) "
          f"theme={result.theme_helped} "
          f"wall={result.wall_s:.1f}s spend=${result.spend_usd:.4f}")
    return result


def print_summary(results: list[QuestionResult], cumulative_spend: float,
                  total_wall_s: float, n_total: int):
    print(f"\n{'='*70}\n SMOKE 10 COMPLETE\n{'='*70}")
    print(f" Total spend: ${cumulative_spend:.4f} / ${TOTAL_SPEND_CAP_USD:.2f}")
    print(f" Total wall : {total_wall_s:.1f}s")
    print(f" Questions completed: {len(results)} / {n_total}")

    pass_count = sum(1 for r in results if r.ex_pass)
    ex_pct = (100.0 * pass_count / len(results)) if results else 0.0
    print(f"\n EX score: {pass_count}/{len(results)} = {ex_pct:.1f}%")

    print("\n Per-difficulty:")
    from collections import Counter
    by_diff_total = Counter(r.difficulty for r in results)
    by_diff_pass = Counter(r.difficulty for r in results if r.ex_pass)
    for diff in ("simple", "moderate", "challenging"):
        t, p = by_diff_total.get(diff, 0), by_diff_pass.get(diff, 0)
        if t > 0:
            print(f"   {diff:<12}: {p}/{t} = {100.0*p/t:.1f}%")

    print("\n Failure clusters:")
    fail_cats = Counter(r.failure_category for r in results if r.failure_category)
    if fail_cats:
        for cat, n in fail_cats.most_common():
            print(f"   {cat:<16}: {n}")
    else:
        print("   (none — all questions passed)")

    # Theme 5: per-theme attribution table for council post-mortem.
    print("\n Theme attribution (which lever would have helped):")
    theme_counts = Counter(r.theme_helped for r in results if r.theme_helped)
    fail_theme_counts = Counter(
        r.theme_helped for r in results
        if r.theme_helped and r.theme_helped != "passed"
    )
    if theme_counts:
        for theme, n in theme_counts.most_common():
            tag = " (passed)" if theme == "passed" else ""
            print(f"   {theme:<16}: {n}{tag}")
        if fail_theme_counts:
            print("\n Failure-only attribution:")
            total_fail = sum(fail_theme_counts.values())
            for theme, n in fail_theme_counts.most_common():
                pct = 100.0 * n / total_fail if total_fail else 0.0
                print(f"   {theme:<16}: {n} ({pct:.0f}% of failures)")

    print("\n Per-question table:")
    print(f"   {'qid':>5}  {'db_id':<26}  {'diff':<12}  {'EX':<5}  {'cat':<14}  {'spend':>8}  {'wall':>6}")
    for r in results:
        ex_str = "PASS" if r.ex_pass else "FAIL"
        cat = r.failure_category or "-"
        print(f"   {r.qid:>5}  {r.db_id:<26}  {r.difficulty:<12}  {ex_str:<5}  {cat:<14}  ${r.spend_usd:>6.4f}  {r.wall_s:>4.1f}s")

    total_ask = sum(r.bypass_ask_user for r in results)
    total_gc = sum(r.bypass_gate_c for r in results)
    total_csc = sum(r.bypass_cascade for r in results)
    print(f"\n Bypasses fired (across all {n_total}): ask_user={total_ask}, gate_c={total_gc}, cascade={total_csc}")
    if total_ask + total_gc + total_csc == 0:
        print(" (all zero across smoke 10 = bypass infrastructure precautionary, not load-bearing)")


def main(question_filter: Optional[set] = None) -> int:
    """Run smoke 10. If question_filter is provided, run ONLY those qids
    (for the single-question wiring smoke before full Phase 4)."""
    if not SAMPLE_FILE.exists():
        print(f"FATAL: sample file missing at {SAMPLE_FILE}")
        return 2

    payload = json.load(open(SAMPLE_FILE))
    questions = payload["questions"]
    if question_filter is not None:
        questions = [q for q in questions if q["question_id"] in question_filter]
        if not questions:
            print(f"FATAL: no questions matched filter {question_filter}")
            return 3

    print(f"BIRD smoke 10 harness — {len(questions)} question(s)")
    print(f"  sample:    {SAMPLE_FILE.relative_to(_REPO_ROOT)}")
    print(f"  db_root:   {DB_ROOT.relative_to(_REPO_ROOT)}")
    print(f"  trace_dir: {TRACE_DIR.relative_to(_REPO_ROOT)}")
    print(f"  caps: total=${TOTAL_SPEND_CAP_USD:.2f} per_q=${PER_QUESTION_SPEND_CAP_USD:.2f} wall={PER_QUESTION_WALL_CLOCK_S:.0f}s")
    print(f"  mid-run guard: halt if EX < {MID_RUN_EX_FLOOR_PCT:.0f}% after >= {MID_RUN_GUARD_AFTER_N_QUESTIONS} questions")

    # Phase 1 Cap 4 (2026-04-28) — replicate main.py lifespan skill bootstrap.
    # Without this, AgentEngine reads None from app.state.skill_library and
    # the SKILL_LIBRARY_ENABLED flag is effectively dead in benchmark mode.
    setup_skill_library_state()

    cumulative_spend = [0.0]
    results: list[QuestionResult] = []
    overall_start = time.time()
    halted = False

    for i, q in enumerate(questions, 1):
        trace_path = TRACE_DIR / f"{q['question_id']}.jsonl"
        try:
            r = run_one_question(q, cumulative_spend, trace_path)
            results.append(r)
        except RuntimeError as exc:
            if "total_spend_cap_exceeded" in str(exc):
                print(f"\n[HALT] Total spend cap reached after Q {i}/{len(questions)}: {exc}")
                halted = True
                break
            raise

        # Mid-run EX guard
        if (len(results) >= MID_RUN_GUARD_AFTER_N_QUESTIONS
                and not halted and len(questions) > MID_RUN_GUARD_AFTER_N_QUESTIONS):
            running_ex = 100.0 * sum(1 for r in results if r.ex_pass) / len(results)
            if running_ex < MID_RUN_EX_FLOOR_PCT:
                print(f"\n[HALT] Mid-run EX guard fired: {running_ex:.1f}% < {MID_RUN_EX_FLOOR_PCT:.0f}% "
                      f"after Q {len(results)}. Wiring/harness bug suspected.")
                halted = True
                break

    total_wall_s = time.time() - overall_start
    print_summary(results, cumulative_spend[0], total_wall_s, n_total=len(questions))
    return 0 if not halted else 1


if __name__ == "__main__":
    # If a single qid is passed as arg, run only that question (pre-Phase-4 wiring smoke)
    if len(_sys.argv) > 1:
        try:
            filter_qids = {int(_sys.argv[1])}
        except ValueError:
            print(f"FATAL: invalid qid {_sys.argv[1]!r}")
            _sys.exit(4)
        _sys.exit(main(question_filter=filter_qids))
    _sys.exit(main())
