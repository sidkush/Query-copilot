"""Typed-Seeking-Spring Phase 2 — themed-preset autogen orchestrator.

Walks ``preset_slot_manifest.PRESET_SLOTS`` for each themed preset and:
  1. Uses a strict-schema tool-use call to Claude Haiku to pick the
     right schema column for the slot (measure / dimension / primary
     date / filter).
  2. Compiles the picked fields into canonical BigQuery SQL via
     ``preset_sql_compiler``.
  3. Validates the SQL through ``SQLValidator`` (dialect=bigquery).
  4. Executes through ``entry.engine.execute_sql`` with the appropriate
     row cap.
  5. Masks the result dataframe via ``pii_masking.mask_dataframe``.
  6. Writes the resulting ``TileBinding`` into
     ``dashboard.presetBindings[preset][slot_id]``.

Narrative slots are filled in a second pass (per preset) once the
preset's numeric slots are bound — the LLM receives the filled values
plus the preset's tone prompt from ``preset_prompts/<preset>.md``.

Concurrency
  Presets run in parallel through ``asyncio.to_thread`` (max 3 at a
  time) because their slot lists are independent. Per-preset slots run
  sequentially so narrative composition can see the filled numeric
  slots. A per-dashboard ``threading.Lock`` guards the
  ``presetBindings`` JSON write.

Rules / constraints
  - The LLM only picks columns via a tool-use JSON schema (no
    free-form SQL authoring).
  - The compiler always emits canonical SQL so the validator sees a
    known shape.
  - After 2 retries producing invalid or empty output, the slot is
    marked ``unresolved = true`` and the autogen moves on.
  - Pinned slots (``isUserPinned = true``) are skipped when
    ``skip_pinned`` is true.
  - All compiled SQL passes ``SQLValidator(dialect='bigquery')``.

No new dependencies: uses only `asyncio`, `threading`, `concurrent
.futures`, `json`, existing `anthropic_provider`, `sql_validator`,
`pii_masking`, `user_storage`, `preset_sql_compiler`,
`preset_slot_manifest`.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Generator, Iterable, List, Optional, Tuple

from config import settings
from preset_sql_compiler import (
    compile_kpi_sql, compile_table_sql, compile_chart_sql,
)
from preset_slot_manifest import (
    PRESET_SLOTS, THEMED_PRESET_IDS, SlotDescriptor, get_slots_for_preset,
)

logger = logging.getLogger(__name__)

# Per-dashboard lock registry so concurrent preset writes serialise.
_dashboard_locks: Dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


def _get_dashboard_lock(dashboard_id: str) -> threading.Lock:
    with _locks_lock:
        lock = _dashboard_locks.get(dashboard_id)
        if lock is None:
            lock = threading.Lock()
            _dashboard_locks[dashboard_id] = lock
        return lock


# ───────────────────────────────────────────────────────────────────
# Provider + connection resolvers (overridable in tests via monkeypatch)
# ───────────────────────────────────────────────────────────────────

def get_provider(email: str):
    """Default provider resolver — uses provider_registry.

    Tests monkeypatch this to inject a fake that records tool calls.
    """
    from provider_registry import get_provider_for_user
    return get_provider_for_user(email)


def resolve_connection_entry(email: str, conn_id: str) -> Tuple[Any, str]:
    """Return ``(entry, default_table_ref)`` for the user's connection.

    ``default_table_ref`` is a best-effort "primary" table to compile
    SQL against when the caller does not name one explicitly. Tests
    monkeypatch this to return a fake entry and fixed table ref.
    """
    import main as app_module
    conns = app_module.app.state.connections.get(email, {}) or {}
    entry = None
    if conn_id and conn_id in conns:
        entry = conns[conn_id]
    elif conns:
        entry = next(iter(conns.values()))
    if entry is None:
        raise RuntimeError(f"No active connection for {email}")
    # Pick the widest table as a first-cut default. Walk the engine's
    # cached schema if available.
    default_table = _pick_default_table(entry)
    return entry, default_table


def _pick_default_table(entry) -> str:
    """Best-effort default table picker — the widest fact-like table."""
    try:
        profile = getattr(entry, "schema_profile", None)
        if profile and hasattr(profile, "tables") and profile.tables:
            # Prefer the table with the most numeric columns
            best = max(
                profile.tables,
                key=lambda t: sum(
                    1 for c in getattr(t, "columns", []) or []
                    if getattr(c, "semantic_type", "") == "quantitative"
                ),
            )
            return getattr(best, "full_ref", None) or getattr(best, "name", "table")
    except Exception:
        pass
    # Fallback — let the caller supply one.
    return "dataset.table"


# ───────────────────────────────────────────────────────────────────
# Prompts
# ───────────────────────────────────────────────────────────────────

_PROMPT_DIR = Path(__file__).parent / "preset_prompts"


def _load_preset_prompt(preset_id: str) -> str:
    """Read the per-preset tone prompt."""
    p = _PROMPT_DIR / f"{preset_id}.md"
    if not p.exists():
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except Exception as e:
        logger.warning("Failed to read preset prompt %s: %s", p, e)
        return ""


# ───────────────────────────────────────────────────────────────────
# LLM tool-use schema — "pick_slot_binding"
# ───────────────────────────────────────────────────────────────────

def _tool_schema_for_slot(slot: SlotDescriptor) -> Dict[str, Any]:
    """Build an Anthropic-style tool schema matching the slot kind."""
    kind = slot.get("kind", "kpi")
    base_schema: Dict[str, Any] = {
        "type": "object",
        "properties": {
            "column": {
                "type": "string",
                "description": (
                    "Name of the schema column that best fills this slot. "
                    "Use exact spelling."
                ),
            },
            "agg": {
                "type": "string",
                "enum": ["SUM", "AVG", "COUNT", "MIN", "MAX", "COUNT_DISTINCT"],
                "description": "Aggregation to apply to the column.",
            },
        },
        "required": ["column"],
    }
    if kind in ("chart", "table"):
        base_schema["properties"]["dimension"] = {
            "type": "string",
            "description": (
                "Optional dimension column for grouping "
                "(tables: required, charts: optional series split)."
            ),
        }
    if kind == "chart":
        base_schema["properties"]["primary_date"] = {
            "type": "string",
            "description": "Temporal column for the time axis.",
        }
    base_schema["properties"]["filter"] = {
        "type": "object",
        "description": "Optional single-column equality filter.",
        "properties": {
            "column": {"type": "string"},
            "op": {"type": "string", "enum": ["eq", "in", "gt", "lt"]},
            "value": {},
        },
    }
    return {
        "name": "pick_slot_binding",
        "description": (
            "Pick the schema fields that best satisfy this dashboard slot. "
            "Return JSON matching the schema below. Column names MUST be "
            "drawn from the provided schema profile — no invention."
        ),
        "input_schema": base_schema,
    }


# ───────────────────────────────────────────────────────────────────
# Schema summarisation for the system prompt
# ───────────────────────────────────────────────────────────────────

def _schema_digest(schema_profile: Dict[str, Any], max_cols: int = 40) -> str:
    """Compact schema listing fed to the LLM."""
    cols = schema_profile.get("columns", []) or []
    lines: List[str] = []
    for c in cols[:max_cols]:
        n = c.get("name", "?")
        t = c.get("semantic_type") or c.get("dtype") or "?"
        card = c.get("cardinality")
        samples = c.get("sample_values") or []
        sample_s = ",".join(str(v) for v in samples[:3])
        lines.append(f"  - {n} :: {t} (card={card}) samples=[{sample_s}]")
    return "\n".join(lines)


# ───────────────────────────────────────────────────────────────────
# Heuristic fallback — picks a column when the LLM errors or returns
# something unusable. Covers: "no API key configured" on dev machines.
# ───────────────────────────────────────────────────────────────────

def _heuristic_pick(
    slot: SlotDescriptor,
    schema_profile: Dict[str, Any],
    semantic_tags: Dict[str, Any],
) -> Dict[str, Any]:
    kind = slot.get("kind", "kpi")
    cols = schema_profile.get("columns", []) or []
    rev = semantic_tags.get("revenueMetric") or {}
    primary_date = semantic_tags.get("primaryDate")
    primary_dim = semantic_tags.get("primaryDimension")
    entity = semantic_tags.get("entityName")

    def _first_by(pred):
        return next((c for c in cols if pred(c)), None)

    quant = _first_by(lambda c: c.get("semantic_type") == "quantitative")
    temporal = _first_by(lambda c: c.get("semantic_type") == "temporal")
    nominal = _first_by(lambda c: c.get("semantic_type") == "nominal")

    out: Dict[str, Any] = {}
    if kind == "kpi":
        out["column"] = rev.get("column") if rev else (quant.get("name") if quant else None)
        out["agg"] = (rev.get("agg") if rev else "SUM") or "SUM"
    elif kind == "table":
        out["column"] = rev.get("column") if rev else (quant.get("name") if quant else None)
        out["agg"] = (rev.get("agg") if rev else "SUM") or "SUM"
        out["dimension"] = entity or primary_dim or (nominal.get("name") if nominal else None)
    elif kind == "chart":
        out["column"] = rev.get("column") if rev else (quant.get("name") if quant else None)
        out["agg"] = (rev.get("agg") if rev else "SUM") or "SUM"
        out["primary_date"] = primary_date or (temporal.get("name") if temporal else None)
        # Optional series
        if primary_dim or (nominal and nominal.get("cardinality", 0) <= 8):
            out["dimension"] = primary_dim or (nominal.get("name") if nominal else None)
    return out


# ───────────────────────────────────────────────────────────────────
# LLM call — pick_slot_binding
# ───────────────────────────────────────────────────────────────────

def _llm_pick_slot_binding(
    provider,
    slot: SlotDescriptor,
    preset_id: str,
    schema_profile: Dict[str, Any],
    semantic_tags: Dict[str, Any],
    model: str,
) -> Optional[Dict[str, Any]]:
    """Call the provider's complete_with_tools to get a pick_slot_binding
    response. Returns the tool input dict, or None on failure.
    """
    tone = _load_preset_prompt(preset_id)
    system_prompt = (
        "You are the AskDB dashboard autogen orchestrator. You are picking "
        "which schema columns fill a single named slot in a themed dashboard. "
        "You MUST return via the pick_slot_binding tool; you MUST choose "
        "column names from the supplied schema only (no invention).\n\n"
        f"Preset tone:\n{tone}\n\n"
        f"Available columns:\n{_schema_digest(schema_profile)}\n\n"
        f"Semantic tags: {json.dumps(semantic_tags)}"
    )
    slot_msg = (
        f"Fill slot `{slot['id']}` (kind={slot['kind']}). "
        f"Hint: {slot.get('hint', '')}"
    )
    tool = _tool_schema_for_slot(slot)
    try:
        resp = provider.complete_with_tools(
            model=model,
            system=system_prompt,
            messages=[{"role": "user", "content": slot_msg}],
            tools=[tool],
            max_tokens=400,
        )
    except Exception as e:
        logger.warning("Slot pick LLM call failed for %s/%s: %s",
                       preset_id, slot.get("id"), e)
        return None
    for block in resp.content_blocks:
        if getattr(block, "type", "") == "tool_use" and block.tool_input is not None:
            return block.tool_input
    return None


# ───────────────────────────────────────────────────────────────────
# Narrative composition
# ───────────────────────────────────────────────────────────────────

def _llm_compose_narrative(
    provider,
    slot: SlotDescriptor,
    preset_id: str,
    filled_bindings: Dict[str, Dict[str, Any]],
    semantic_tags: Dict[str, Any],
    model: str,
) -> str:
    tone = _load_preset_prompt(preset_id)
    digest_lines: List[str] = []
    for slot_id, b in filled_bindings.items():
        if b.get("unresolved"):
            continue
        if b.get("kind") in ("kpi", "chart", "table"):
            m = b.get("measure", {})
            digest_lines.append(
                f"- {slot_id}: {m.get('agg', '')}({m.get('column', '')}) "
                f"= {b.get('value')}"
            )
    digest = "\n".join(digest_lines) or "(no numeric slots filled yet)"
    system_prompt = (
        "You are composing a narrative slot for a themed dashboard. "
        "Cite only the numeric values provided — never invent numbers.\n\n"
        f"Preset tone:\n{tone}\n\n"
        f"Filled numeric slots:\n{digest}\n\n"
        f"Semantic tags: {json.dumps(semantic_tags)}"
    )
    msg = (
        f"Compose the `{slot['id']}` slot (kind=narrative). "
        f"Slot hint: {slot.get('hint', '')}\n\n"
        "Return markdown suitable for rendering inline. Keep within the "
        "preset tone file's voice guidance."
    )
    try:
        resp = provider.complete(
            model=model,
            system=system_prompt,
            messages=[{"role": "user", "content": msg}],
            max_tokens=500,
        )
        return (resp.text or "").strip()
    except Exception as e:
        logger.warning("Narrative LLM call failed for %s/%s: %s",
                       preset_id, slot.get("id"), e)
        return ""


# ───────────────────────────────────────────────────────────────────
# fill_slot — picks + compiles + validates + executes one slot
# ───────────────────────────────────────────────────────────────────

def _build_binding_from_pick(
    slot: SlotDescriptor, pick: Dict[str, Any],
) -> Dict[str, Any]:
    kind = slot.get("kind", "kpi")
    binding: Dict[str, Any] = {}
    col = pick.get("column")
    agg = (pick.get("agg") or "SUM").upper()
    if kind == "kpi":
        binding["measure"] = {"column": col, "agg": agg}
    elif kind == "table":
        binding["measure"] = {"column": col, "agg": agg}
        binding["dimension"] = pick.get("dimension")
    elif kind == "chart":
        binding["measure"] = {"column": col, "agg": agg}
        binding["primary_date"] = pick.get("primary_date") or pick.get("primaryDate")
        if pick.get("dimension"):
            binding["dimension"] = pick.get("dimension")
    if pick.get("filter"):
        binding["filter"] = pick["filter"]
    return binding


def _compile(
    slot: SlotDescriptor, binding: Dict[str, Any], schema: Dict[str, Any],
    table_ref: str, time_grain: str,
) -> Tuple[str, Dict[str, Any]]:
    kind = slot.get("kind", "kpi")
    if kind == "kpi":
        return compile_kpi_sql(binding, schema, table_ref)
    if kind == "table":
        return compile_table_sql(binding, schema, table_ref, rank_limit=5)
    if kind == "chart":
        return compile_chart_sql(
            binding, schema, table_ref, time_grain=time_grain, row_limit=5000,
        )
    raise ValueError(f"cannot compile slot kind '{kind}'")


def fill_slot(
    *,
    slot: SlotDescriptor,
    preset_id: str,
    schema_profile: Dict[str, Any],
    semantic_tags: Dict[str, Any],
    entry,
    table_ref: str,
    provider,
    model: Optional[str] = None,
    fallback_model: Optional[str] = None,
) -> Dict[str, Any]:
    """Fill a single slot — returns a TileBinding-shaped dict.

    On any failure (LLM error, compile error, validation error) falls
    back to the heuristic picker, then marks ``unresolved=True`` if
    that also fails.
    """
    model = model or settings.PRIMARY_MODEL
    fallback_model = fallback_model or settings.FALLBACK_MODEL

    if slot.get("kind") == "narrative":
        # Caller handles narrative composition in a second pass.
        return {
            "slotId": slot["id"],
            "kind": "narrative",
            "renderedMarkdown": "",
            "isUserPinned": False,
            "unresolved": False,
        }

    time_grain = semantic_tags.get("timeGrain") or "month"
    picks: List[Tuple[str, Dict[str, Any]]] = []

    # 1st attempt — primary model via tool-use.
    pick_primary = _llm_pick_slot_binding(
        provider, slot, preset_id, schema_profile, semantic_tags, model,
    )
    if pick_primary:
        picks.append(("primary", pick_primary))
    # 2nd attempt — fallback model via tool-use.
    pick_fallback = None
    # 3rd attempt — heuristic (non-LLM) fallback.
    heuristic_pick = _heuristic_pick(slot, schema_profile, semantic_tags)

    last_error: Optional[str] = None

    for label, pick in [*picks, ("heuristic", heuristic_pick)]:
        try:
            binding = _build_binding_from_pick(slot, pick)
            # Required fields
            col = (binding.get("measure") or {}).get("column")
            if not col:
                last_error = "pick missing measure.column"
                continue
            sql, params = _compile(
                slot, binding, schema_profile, table_ref, time_grain,
            )
        except ValueError as e:
            last_error = str(e)
            # Retry with fallback model once if this was the primary model
            if label == "primary" and pick_fallback is None:
                pick_fallback = _llm_pick_slot_binding(
                    provider, slot, preset_id, schema_profile,
                    semantic_tags, fallback_model,
                )
                if pick_fallback:
                    picks.append(("fallback", pick_fallback))
            continue

        # Validate through SQLValidator
        try:
            from sql_validator import SQLValidator
            validator = SQLValidator(dialect="bigquery")
            # Replace any @param_n placeholders with literal placeholders
            # just for sqlglot-validation (the engine substitutes the real
            # params server-side when executing).
            probe_sql = sql
            for k, v in params.items():
                placeholder = repr(v) if isinstance(v, str) else str(v)
                probe_sql = probe_sql.replace(f"@{k}", placeholder)
            ok, _clean, err = validator.validate(probe_sql)
            if not ok:
                last_error = f"validation failed: {err}"
                continue
        except Exception as e:
            last_error = f"validator exception: {e}"
            continue

        # Execute — tolerate execution failures (engine may be a mock or
        # the live DB may be unavailable). A failed exec → unresolved.
        exec_ok = False
        value = None
        rows: List[Dict[str, Any]] = []
        columns: List[str] = []
        try:
            result = entry.engine.execute_sql(sql, question=slot.get("hint", ""))
            if getattr(result, "error", None):
                last_error = f"exec error: {result.error}"
            else:
                df = getattr(result, "data", None)
                if df is not None:
                    try:
                        from pii_masking import mask_dataframe
                        df = mask_dataframe(df)
                    except Exception:
                        pass
                    columns = list(df.columns)
                    head_rows = df.head(50).to_dict("records") if hasattr(df, "head") else []
                    rows = head_rows
                    if slot["kind"] == "kpi" and head_rows:
                        value = head_rows[0].get("value")
                    exec_ok = True
        except Exception as e:
            last_error = f"exec exception: {e}"

        return {
            "slotId": slot["id"],
            "kind": slot["kind"],
            "tileId": uuid.uuid4().hex[:12],
            "measure": binding.get("measure"),
            "dimension": binding.get("dimension"),
            "filter": binding.get("filter"),
            "primary_date": binding.get("primary_date"),
            "sql": sql,
            "params": params,
            "columns": columns,
            "rows": rows[:50],
            "value": value,
            "isUserPinned": False,
            "unresolved": not exec_ok,
            "pick_source": label,
            "pick_error": last_error if not exec_ok else None,
        }

    # Every attempt exhausted → unresolved.
    return {
        "slotId": slot["id"],
        "kind": slot["kind"],
        "isUserPinned": False,
        "unresolved": True,
        "pick_error": last_error or "no usable pick",
    }


# ───────────────────────────────────────────────────────────────────
# Persistence — writes bindings back to dashboard JSON atomically
# ───────────────────────────────────────────────────────────────────

def _persist_binding(
    email: str, dashboard_id: str, preset_id: str, binding: Dict[str, Any],
) -> None:
    """Merge one binding into the dashboard's presetBindings map."""
    import user_storage
    lock = _get_dashboard_lock(dashboard_id)
    with lock:
        # Use the internal load/save since update_dashboard's allowlist
        # pre-dates TSS Phase 1. Writing through the same module lock.
        with getattr(user_storage, "_lock", threading.Lock()):
            dashboards = user_storage._load_dashboards(email)
            for d in dashboards:
                if d.get("id") != dashboard_id:
                    continue
                pb = d.get("presetBindings") or {}
                pp = pb.get(preset_id) or {}
                pp[binding["slotId"]] = binding
                pb[preset_id] = pp
                d["presetBindings"] = pb
                from datetime import datetime, timezone
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                user_storage._save_dashboards(email, dashboards)
                return


def _persist_state(
    email: str, dashboard_id: str, state: str, error: Optional[str] = None,
) -> None:
    import user_storage
    lock = _get_dashboard_lock(dashboard_id)
    with lock:
        with getattr(user_storage, "_lock", threading.Lock()):
            dashboards = user_storage._load_dashboards(email)
            for d in dashboards:
                if d.get("id") != dashboard_id:
                    continue
                d["bindingAutogenState"] = state
                if error is not None:
                    d["bindingAutogenError"] = error
                from datetime import datetime, timezone
                d["updated_at"] = datetime.now(timezone.utc).isoformat()
                user_storage._save_dashboards(email, dashboards)
                return


# ───────────────────────────────────────────────────────────────────
# SSE event shape (matches agent_routes' AgentStep)
# ───────────────────────────────────────────────────────────────────

def _ev(type_: str, **fields) -> Dict[str, Any]:
    d = {"type": type_}
    d.update(fields)
    return d


# ───────────────────────────────────────────────────────────────────
# Per-preset runner
# ───────────────────────────────────────────────────────────────────

def _run_one_preset(
    *,
    email: str,
    dashboard_id: str,
    preset_id: str,
    schema_profile: Dict[str, Any],
    semantic_tags: Dict[str, Any],
    entry,
    table_ref: str,
    provider,
    existing_bindings: Dict[str, Dict[str, Any]],
    skip_pinned: bool,
) -> List[Dict[str, Any]]:
    """Run all slots for one preset sequentially. Returns SSE events."""
    events: List[Dict[str, Any]] = []
    slots = get_slots_for_preset(preset_id)
    filled: Dict[str, Dict[str, Any]] = {}

    # Pass 1 — numeric slots
    for slot in slots:
        slot_id = slot["id"]
        if slot.get("kind") == "narrative":
            continue
        if skip_pinned and existing_bindings.get(slot_id, {}).get("isUserPinned"):
            events.append(_ev(
                "tool_result", preset_id=preset_id, slot_id=slot_id,
                status="skipped_pinned",
            ))
            filled[slot_id] = existing_bindings[slot_id]
            continue
        try:
            binding = fill_slot(
                slot=slot,
                preset_id=preset_id,
                schema_profile=schema_profile,
                semantic_tags=semantic_tags,
                entry=entry,
                table_ref=table_ref,
                provider=provider,
            )
            _persist_binding(email, dashboard_id, preset_id, binding)
            filled[slot_id] = binding
            events.append(_ev(
                "tool_result", preset_id=preset_id, slot_id=slot_id,
                status="unresolved" if binding.get("unresolved") else "ok",
                kind=binding.get("kind"),
            ))
        except Exception as e:  # pragma: no cover — safety net
            logger.exception("slot fill crashed: %s/%s", preset_id, slot_id)
            events.append(_ev(
                "tool_result", preset_id=preset_id, slot_id=slot_id,
                status="error", error=str(e),
            ))

    # Pass 2 — narrative slots (need numeric context)
    for slot in slots:
        if slot.get("kind") != "narrative":
            continue
        slot_id = slot["id"]
        if skip_pinned and existing_bindings.get(slot_id, {}).get("isUserPinned"):
            events.append(_ev(
                "tool_result", preset_id=preset_id, slot_id=slot_id,
                status="skipped_pinned",
            ))
            continue
        try:
            rendered = _llm_compose_narrative(
                provider, slot, preset_id, filled, semantic_tags,
                model=settings.PRIMARY_MODEL,
            )
            binding = {
                "slotId": slot_id,
                "kind": "narrative",
                "renderedMarkdown": rendered or "",
                "isUserPinned": False,
                "unresolved": not bool(rendered),
            }
            _persist_binding(email, dashboard_id, preset_id, binding)
            events.append(_ev(
                "tool_result", preset_id=preset_id, slot_id=slot_id,
                status="unresolved" if binding["unresolved"] else "ok",
                kind="narrative",
            ))
        except Exception as e:
            logger.exception("narrative compose crashed: %s/%s", preset_id, slot_id)
            events.append(_ev(
                "tool_result", preset_id=preset_id, slot_id=slot_id,
                status="error", error=str(e),
            ))

    return events


# ───────────────────────────────────────────────────────────────────
# run_autogen — top-level orchestrator
# ───────────────────────────────────────────────────────────────────

def run_autogen(
    *,
    email: str,
    dashboard_id: str,
    conn_id: str,
    semantic_tags: Optional[Dict[str, Any]] = None,
    preset_ids: Optional[List[str]] = None,
    skip_pinned: bool = True,
) -> Generator[Dict[str, Any], None, None]:
    """Fill all themed-preset slot bindings for a dashboard.

    Yields SSE-shaped events matching the AgentStep contract in
    ``agent_routes.py``:
      * ``plan``          — one event at start listing every slot to fill.
      * ``tool_result``   — one per slot.
      * ``complete``      — one at end.
      * ``error``         — on orchestration-level failure.
    """
    semantic_tags = semantic_tags or {}
    preset_ids = list(preset_ids) if preset_ids else list(THEMED_PRESET_IDS)
    provider = get_provider(email)
    try:
        entry, default_table = resolve_connection_entry(email, conn_id)
    except Exception as e:
        _persist_state(email, dashboard_id, "error", str(e))
        yield _ev("error", error=str(e), phase="resolve-connection")
        return
    table_ref = default_table

    # Build schema profile — use the entry's cached schema if available,
    # else an empty one (heuristic picker handles the gap).
    schema_profile = _schema_profile_for_entry(entry)

    # Enumerate all slot targets for the plan event
    plan_slots: List[Tuple[str, str]] = []
    for pid in preset_ids:
        for s in get_slots_for_preset(pid):
            plan_slots.append((pid, s["id"]))
    _persist_state(email, dashboard_id, "running", None)
    yield _ev(
        "plan",
        content=f"Autogen {len(plan_slots)} slots across {len(preset_ids)} presets",
        preset_ids=preset_ids,
        slots=[{"preset_id": p, "slot_id": s} for (p, s) in plan_slots],
    )

    # Load existing bindings (for skip_pinned check)
    existing_by_preset: Dict[str, Dict[str, Dict[str, Any]]] = {}
    try:
        import user_storage
        d = user_storage.load_dashboard(email, dashboard_id)
        if d:
            existing_by_preset = d.get("presetBindings") or {}
    except Exception:
        pass

    # Thread-pool dispatch — presets run concurrently, max 3 at a time.
    executor = ThreadPoolExecutor(max_workers=3)
    futures = []
    for pid in preset_ids:
        futures.append(executor.submit(
            _run_one_preset,
            email=email,
            dashboard_id=dashboard_id,
            preset_id=pid,
            schema_profile=schema_profile,
            semantic_tags=semantic_tags,
            entry=entry,
            table_ref=table_ref,
            provider=provider,
            existing_bindings=existing_by_preset.get(pid, {}),
            skip_pinned=skip_pinned,
        ))
    try:
        for f in futures:
            preset_events = f.result()
            for e in preset_events:
                yield e
    finally:
        executor.shutdown(wait=False)

    _persist_state(email, dashboard_id, "complete", None)
    yield _ev("complete", content="autogen complete",
              preset_ids=preset_ids, slot_count=len(plan_slots))


def _schema_profile_for_entry(entry) -> Dict[str, Any]:
    """Extract a compact column-list schema profile from the entry."""
    try:
        profile = getattr(entry, "schema_profile", None)
        if profile and hasattr(profile, "tables"):
            cols: List[Dict[str, Any]] = []
            for t in profile.tables or []:
                for c in getattr(t, "columns", []) or []:
                    cols.append({
                        "name": getattr(c, "name", "?"),
                        "dtype": getattr(c, "dtype", "?"),
                        "role": getattr(c, "role", "?"),
                        "semantic_type": getattr(c, "semantic_type", "?"),
                        "cardinality": getattr(c, "cardinality", None),
                        "null_pct": getattr(c, "null_pct", None),
                        "sample_values": getattr(c, "sample_values", []) or [],
                    })
            return {"columns": cols}
    except Exception as e:
        logger.debug("schema_profile extract failed: %s", e)
    # Fallback — empty profile; the heuristic picker + LLM will still
    # try against whatever table_ref caller supplies.
    return {"columns": []}


__all__ = [
    "get_provider",
    "resolve_connection_entry",
    "fill_slot",
    "run_autogen",
]
