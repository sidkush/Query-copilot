"""Plan 8d T10 — LLM-backed calc suggestion.

Claude Haiku via the user's BYOK provider (never imports anthropic directly
— resolves through provider_registry). System prompt is cache-stable
(function catalogue + grounding rules are fixed per request); the user
message carries only the NL description + schema summary + context.

Response contract — the LLM MUST return a single JSON object with keys:
  formula (str), explanation (str), confidence (float in [0,1]).
Any deviation → ValueError → HTTP 422 from the caller. The returned
formula is ground-checked here (every field ref present in schema_ref,
every param in parameters, every function in the Plan 8a catalogue)
before being surfaced to the user.

Auditing: every call emits an audit row `calc_suggest` with user,
description length, inferred field refs, and model usage — NEVER raw
schema or NL content.

BYOK invariant: this module MUST NOT `import anthropic`. All LLM calls
flow through `provider_registry.get_provider_for_user`.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from threading import Lock

from audit_trail import _append_entry as _audit_append, _utc_now_iso
from config import settings
from provider_registry import get_provider_for_user
from vizql.calc_functions import FUNCTIONS


# ── per-user sliding-window rate limit ────────────────────────────────
_RL_LOCK = Lock()
_RL: dict[str, list[float]] = {}


def _audit(event_type: str, data: dict) -> None:
    """Thin indirection so tests can monkeypatch. Writes through the same
    JSONL log used by every other audit writer (append-only, rotate-safe)."""
    entry = {"timestamp": _utc_now_iso(), "event_type": event_type, **data}
    _audit_append(entry)


def _rate_limit(email: str) -> None:
    now = time.time()
    cap = settings.CALC_SUGGEST_RATE_LIMIT_PER_60S
    with _RL_LOCK:
        ts = [t for t in _RL.get(email, []) if t > now - 60.0]
        if len(ts) >= cap:
            raise PermissionError(f"calc_suggest rate limit: {cap}/60s")
        ts.append(now)
        _RL[email] = ts


@dataclass
class SuggestResult:
    formula: str
    explanation: str
    confidence: float


SYSTEM_TEMPLATE = """You are AskDB's calc suggestion engine.

HARD RULES — violating any one of these means your output is rejected:
1. Return ONE JSON object with EXACTLY these keys: formula, explanation, confidence.
2. formula MUST use only functions listed in the function catalogue below.
3. formula MUST use only fields from the `schema_ref` in the user message.
4. Parameters MUST be referenced as [Parameters].[ParamName] and MUST exist.
5. Never invent fields, functions, or parameters. If the user's description cannot
   be satisfied, set confidence to 0 and explain why in `explanation`.
6. Never output prose outside the JSON object. No markdown, no code fences.

Function catalogue (name — category — signature — doc):
{catalogue}

LOD syntax:
- FIXED:   {{FIXED [dim1], [dim2] : SUM([m])}}
- INCLUDE: {{INCLUDE [dim] : SUM([m])}}
- EXCLUDE: {{EXCLUDE [dim] : SUM([m])}}

Tableau calc language is canonical. Prefer aggregate + dimension expressions
over raw SQL."""


def _build_system() -> str:
    rows: list[str] = []
    for name, fn in sorted(FUNCTIONS.items()):
        cat = fn.category.value if hasattr(fn.category, "value") else str(fn.category)
        sig = f"{name}({', '.join('arg' for _ in fn.arg_types)})"
        rows.append(f"- {name} — {cat} — {sig} — {fn.docstring or ''}".rstrip())
    return SYSTEM_TEMPLATE.format(catalogue="\n".join(rows))


def _parse_llm_response(text: str) -> SuggestResult:
    # Defensive: strip optional markdown fencing even though the prompt bans it.
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    try:
        obj = json.loads(t)
    except json.JSONDecodeError as exc:
        raise ValueError(f"could not parse LLM response as JSON: {exc}") from exc
    if not isinstance(obj, dict):
        raise ValueError("LLM response must be a JSON object")
    for key in ("formula", "explanation", "confidence"):
        if key not in obj:
            raise ValueError(f"LLM response missing '{key}'")
    try:
        conf = float(obj["confidence"])
    except (TypeError, ValueError) as exc:
        raise ValueError("confidence must be a float") from exc
    if not 0.0 <= conf <= 1.0:
        raise ValueError(f"confidence {conf} not in [0,1]")
    return SuggestResult(
        formula=str(obj["formula"]),
        explanation=str(obj["explanation"]),
        confidence=conf,
    )


# Match [foo] but NOT [Parameters].[foo] (the regex below captures that).
_FIELD_RE = re.compile(r"(?<!\[Parameters\]\.)\[([^\]]+)\]")
_PARAM_RE = re.compile(r"\[Parameters\]\.\[([^\]]+)\]")
_FN_RE    = re.compile(r"\b([A-Z][A-Z0-9_]+)\s*\(")

_CALC_KEYWORDS = frozenset({
    "IF", "THEN", "ELSE", "ELSEIF", "END", "CASE", "WHEN", "AND", "OR", "NOT",
    "IN", "FIXED", "INCLUDE", "EXCLUDE", "TRUE", "FALSE", "NULL",
})


def _ground_check(result: SuggestResult, *, schema_ref: dict, parameters: list) -> None:
    """Reject hallucinations: any `[field]` not in schema_ref, any
    `[Parameters].[p]` not in parameters, any `FN(` not in the Plan 8a
    FUNCTIONS catalogue (keywords excluded)."""
    param_names = {p.get("name") for p in parameters if p.get("name")}
    for m in _FIELD_RE.finditer(result.formula):
        name = m.group(1)
        if name in param_names:
            # Rare: a param name wrapped in plain [] — still valid.
            continue
        if name not in schema_ref:
            raise ValueError(
                f"LLM hallucinated field [{name}] — not in schema_ref"
            )
    for m in _PARAM_RE.finditer(result.formula):
        if m.group(1) not in param_names:
            raise ValueError(
                f"LLM hallucinated parameter [Parameters].[{m.group(1)}]"
            )
    for m in _FN_RE.finditer(result.formula):
        fname = m.group(1)
        if fname in _CALC_KEYWORDS:
            continue
        if fname not in FUNCTIONS:
            raise ValueError(f"LLM hallucinated function {fname}()")


def suggest_calc(
    *, email: str, description: str,
    schema_ref: dict, parameters: list, sets: list, existing_calcs: list,
) -> SuggestResult:
    """Entry point called by the `/api/v1/calcs/suggest` route.

    Raises:
      RuntimeError — feature flag disabled.
      ValueError   — description too long / LLM output invalid / grounding fail.
      PermissionError — rate limit exceeded (caller → 429).
    """
    if not settings.FEATURE_CALC_LLM_SUGGEST:
        raise RuntimeError("calc LLM suggest disabled")
    if len(description) > settings.CALC_SUGGEST_MAX_DESCRIPTION_LEN:
        raise ValueError("description too long")
    _rate_limit(email)

    user_payload = {
        "description": description,
        "schema_ref": schema_ref,
        "parameters": [
            {"name": p.get("name"), "dataType": p.get("dataType")}
            for p in parameters
        ],
        "sets": [{"name": s.get("name")} for s in sets],
        "existing_calcs": [
            {"name": c.get("name"), "formula": c.get("formula")}
            for c in existing_calcs
        ],
    }
    user_msg = {"role": "user", "content": json.dumps(user_payload)}

    provider = get_provider_for_user(email)
    resp = provider.complete(
        model=settings.PRIMARY_MODEL,   # Claude Haiku per config-defaults.md
        system=_build_system(),
        messages=[user_msg],
        max_tokens=800,
        cache=True,
    )

    result = _parse_llm_response(resp.text)
    _ground_check(result, schema_ref=schema_ref, parameters=parameters)

    usage = resp.usage or {}
    _audit("calc_suggest", {
        "user": email,
        "description_len": len(description),
        "fields_used": sorted({
            m.group(1) for m in _FIELD_RE.finditer(result.formula)
        }),
        "confidence": result.confidence,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    })

    return result
