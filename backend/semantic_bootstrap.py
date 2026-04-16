"""
semantic_bootstrap.py — Haiku-powered linguistic model generation from schema profiling.

Takes a SchemaProfile and an LLM provider, prompts the model for synonyms,
phrasings, and sample questions, then returns a LinguisticModel dict with all
entries status='suggested'.

This module is intentionally crash-proof: any failure (LLM error, parse error,
malformed JSON) returns a valid but empty model.  Callers must never crash due
to bootstrap failures — the linguistic model is optional enrichment.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any, Dict, List, Optional

from schema_intelligence import SchemaProfile, TableProfile
from join_graph import JoinGraph

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Empty model factory
# ---------------------------------------------------------------------------

def _empty_model() -> Dict[str, Any]:
    """Return a valid LinguisticModel dict with version=1 and no entries."""
    return {
        "version": 1,
        "synonyms": {
            "tables": {},
            "columns": {},
            "values": {},
        },
        "phrasings": [],
        "sampleQuestions": [],
    }


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _build_prompt(schema_profile: SchemaProfile, query_history: Optional[List[str]]) -> str:
    """Build a structured prompt asking the LLM for linguistic enrichment."""
    lines: List[str] = []

    lines.append(
        "You are a database linguistics expert. Given a database schema, "
        "generate linguistic enrichments that help users ask questions in natural language."
    )
    lines.append("")
    lines.append("## Schema")
    lines.append("")

    for table in schema_profile.tables:
        row_count = table.row_count_estimate
        row_label = f"{row_count:,} rows" if row_count >= 0 else "row count unknown"
        lines.append(f"### Table: {table.name}  ({row_label})")

        if table.primary_keys:
            lines.append(f"Primary keys: {', '.join(table.primary_keys)}")

        if table.foreign_keys:
            fk_parts = []
            for fk in table.foreign_keys:
                # fk dict shape varies by dialect; normalise gracefully
                constrained = fk.get("constrained_columns") or fk.get("from") or []
                referred_table = fk.get("referred_table") or fk.get("table", "?")
                referred_cols = fk.get("referred_columns") or fk.get("to") or []
                if isinstance(constrained, list):
                    constrained = ", ".join(constrained)
                if isinstance(referred_cols, list):
                    referred_cols = ", ".join(referred_cols)
                fk_parts.append(f"{constrained} → {referred_table}.{referred_cols}")
            lines.append(f"Foreign keys: {'; '.join(fk_parts)}")

        lines.append("Columns:")
        for col in table.columns:
            name = col.get("name", "?")
            col_type = col.get("type", "unknown")
            nullable = "nullable" if col.get("nullable", True) else "not null"

            # Sample values — optional field on TableProfile; may not exist
            # depending on connector version.  Access defensively.
            sample_vals: List[Any] = []
            sv_field = getattr(table, "sample_values", None)
            if isinstance(sv_field, dict):
                raw = sv_field.get(name, [])
                if isinstance(raw, list):
                    sample_vals = raw[:3]
            # list-indexed or missing: skip — sample_vals stays empty

            sample_str = ""
            if sample_vals:
                sample_str = f"  e.g. {sample_vals}"

            lines.append(f"  - {name} ({col_type}, {nullable}){sample_str}")

        lines.append("")

    if query_history:
        lines.append("## Past queries (anonymised)")
        for q in query_history[:20]:  # cap to keep prompt short
            lines.append(f"  - {q}")
        lines.append("")

    # ── Join paths discovered from FK graph ──────────────────────────────────
    # Build the join graph once and surface reachable paths between all table
    # pairs.  This gives the LLM accurate joinPath data for phrasing templates
    # without hallucinating column names.  Capped to avoid prompt bloat.
    try:
        _join_graph = JoinGraph(schema_profile)
        _all_tables = _join_graph.all_tables()
        _join_lines: List[str] = []
        _seen_pairs: set = set()
        for _src in _all_tables:
            for _tgt in _all_tables:
                if _src == _tgt:
                    continue
                _pair = tuple(sorted((_src, _tgt)))
                if _pair in _seen_pairs:
                    continue
                _seen_pairs.add(_pair)
                _sql = _join_graph.get_join_sql(_src, _tgt)
                if _sql:
                    _join_lines.append(f"  {_src} → {_tgt}: {_sql}")
        if _join_lines:
            lines.append("## Discoverable JOIN paths (from foreign keys)")
            lines.append(
                "Use these accurate join paths when generating phrasing templates "
                "and sample questions that require data from multiple tables:"
            )
            # Cap at 20 paths to keep prompt size bounded
            for _jl in _join_lines[:20]:
                lines.append(_jl)
            lines.append("")
    except Exception as _jg_exc:
        logger.debug("semantic_bootstrap: join graph failed (non-fatal): %s", _jg_exc)

    lines.append("## Task")
    lines.append(
        "Return ONLY valid JSON (no markdown prose, no explanation) with exactly "
        "these top-level keys:"
    )
    lines.append("")
    lines.append(
        "```json\n"
        "{\n"
        '  "table_synonyms": {\n'
        '    "<table_name>": ["<synonym1>", "<synonym2>"]\n'
        "  },\n"
        '  "column_synonyms": {\n'
        '    "<table_name>.<column_name>": ["<synonym1>"]\n'
        "  },\n"
        '  "value_synonyms": {\n'
        '    "<table_name>.<column_name>.<value>": ["<synonym1>"]\n'
        "  },\n"
        '  "phrasings": [\n'
        "    {\n"
        '      "type": "aggregation|filter|comparison|trend|ranking",\n'
        '      "template": "show me the {metric} by {dimension}",\n'
        '      "entities": ["metric", "dimension"],\n'
        '      "joinPath": ["orders", "customers"]\n'
        "    }\n"
        "  ],\n"
        '  "sample_questions": [\n'
        "    {\n"
        '      "table": "<primary_table_name>",\n'
        '      "question": "How many orders were placed last month?"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "```"
    )
    lines.append("")
    lines.append(
        "Generate 3–5 table synonyms per table, 2–3 column synonyms for key columns, "
        "5–8 phrasings covering different query types, and 5–10 sample questions "
        "representative of real analyst questions."
    )
    lines.append(
        "Respond with ONLY the JSON object. No markdown fences, no comments, no extra text."
    )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# JSON extraction helpers
# ---------------------------------------------------------------------------

def _extract_json(raw: str) -> str:
    """Strip optional markdown code fences and return the JSON string inside."""
    # Try ```json ... ``` or ``` ... ``` fences first
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()

    # Fall back to finding the outermost { ... } block
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return raw[start : end + 1]

    return raw.strip()


# ---------------------------------------------------------------------------
# LinguisticModel builder
# ---------------------------------------------------------------------------

def _build_linguistic_model(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """Convert the LLM-parsed JSON dict to a LinguisticModel dict."""
    model = _empty_model()

    # -- synonyms -----------------------------------------------------------
    table_syns = parsed.get("table_synonyms", {})
    if isinstance(table_syns, dict):
        model["synonyms"]["tables"] = {
            k: v for k, v in table_syns.items() if isinstance(v, list)
        }

    col_syns = parsed.get("column_synonyms", {})
    if isinstance(col_syns, dict):
        model["synonyms"]["columns"] = {
            k: v for k, v in col_syns.items() if isinstance(v, list)
        }

    val_syns = parsed.get("value_synonyms", {})
    if isinstance(val_syns, dict):
        model["synonyms"]["values"] = {
            k: v for k, v in val_syns.items() if isinstance(v, list)
        }

    # -- phrasings ----------------------------------------------------------
    raw_phrasings = parsed.get("phrasings", [])
    if isinstance(raw_phrasings, list):
        phrasings: List[Dict[str, Any]] = []
        for p in raw_phrasings:
            if not isinstance(p, dict):
                continue
            phrasings.append({
                "id": str(uuid.uuid4()),
                "type": p.get("type", ""),
                "template": p.get("template", ""),
                "entities": p.get("entities", []),
                "joinPath": p.get("joinPath", []),
                "status": "suggested",
            })
        model["phrasings"] = phrasings

    # -- sample questions ---------------------------------------------------
    raw_questions = parsed.get("sample_questions", [])
    if isinstance(raw_questions, list):
        questions: List[Dict[str, Any]] = []
        for q in raw_questions:
            if not isinstance(q, dict):
                continue
            questions.append({
                "id": str(uuid.uuid4()),
                "table": q.get("table", ""),
                "question": q.get("question", ""),
                "status": "suggested",
            })
        model["sampleQuestions"] = questions

    return model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def bootstrap_linguistic(
    schema_profile: SchemaProfile,
    provider,               # ModelProvider with .complete(*, model, system, messages, max_tokens)
    query_history: Optional[List[str]] = None,
    model: str = "claude-haiku-4-5-20251001",
    max_tokens: int = 2000,
) -> Dict[str, Any]:
    """Return a LinguisticModel dict with version=1, all entries status='suggested'.

    Parameters
    ----------
    schema_profile:
        Enriched schema metadata for the connected database.
    provider:
        LLM provider implementing ModelProvider.  Must expose
        ``.complete(*, model, system, messages, max_tokens)`` returning an
        object with a ``.text`` attribute (ProviderResponse).
    query_history:
        Optional list of anonymised past query strings to seed sample
        questions with real analyst patterns.
    model:
        Model ID to use for generation.  Defaults to Haiku for cost efficiency.
    max_tokens:
        Max output tokens for the LLM call.

    Returns
    -------
    dict
        LinguisticModel dict.  Always returns a valid (possibly empty) model —
        never raises.
    """
    # Degenerate case: no tables → empty model immediately
    if not schema_profile.tables:
        logger.debug("bootstrap_linguistic: schema has no tables; returning empty model.")
        return _empty_model()

    try:
        prompt = _build_prompt(schema_profile, query_history)
    except Exception as exc:
        logger.warning("bootstrap_linguistic: prompt build failed: %s", exc)
        return _empty_model()

    try:
        response = provider.complete(
            model=model,
            system=(
                "You are a database linguistics expert. "
                "Always respond with valid JSON only — no prose, no markdown fences."
            ),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        # ProviderResponse exposes .text; guard against both .text and .content
        # for forward-compatibility with alternate provider adapters.
        raw_content: str = ""
        if hasattr(response, "text") and response.text:
            raw_content = response.text
        elif hasattr(response, "content") and response.content:
            raw_content = response.content
        else:
            logger.warning("bootstrap_linguistic: provider returned empty response.")
            return _empty_model()
    except Exception as exc:
        logger.warning("bootstrap_linguistic: LLM call failed: %s", exc)
        return _empty_model()

    try:
        json_str = _extract_json(raw_content)
        parsed = json.loads(json_str)
        if not isinstance(parsed, dict):
            logger.warning("bootstrap_linguistic: parsed JSON is not a dict.")
            return _empty_model()
    except Exception as exc:
        logger.warning("bootstrap_linguistic: JSON parse failed: %s", exc)
        return _empty_model()

    try:
        model_dict = _build_linguistic_model(parsed)
    except Exception as exc:
        logger.warning("bootstrap_linguistic: model build failed: %s", exc)
        return _empty_model()

    logger.info(
        "bootstrap_linguistic: generated %d phrasings, %d sample questions for conn_id=%s",
        len(model_dict.get("phrasings", [])),
        len(model_dict.get("sampleQuestions", [])),
        schema_profile.conn_id,
    )
    return model_dict
