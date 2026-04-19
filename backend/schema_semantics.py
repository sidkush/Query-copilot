# backend/schema_semantics.py
"""Semantic classification for schema columns.

Consumed by preset_autogen.py's heuristic picker and LLM prompt builder
to keep the dashboard autogen from picking nonsensical aggregations
(SUM(latitude), AVG(user_id), etc.).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, Set, List

_GEO_NAME_RE = re.compile(
    r"(^|_)(lat|latitude|lng|long|longitude)(_|$)", re.IGNORECASE
)
_ID_NAME_RE = re.compile(r"(^|_)id$|_id$", re.IGNORECASE)
_TEMPORAL_TYPE_RE = re.compile(r"^(date|time|timestamp|datetime)", re.IGNORECASE)
_TEMPORAL_NAME_RE = re.compile(
    r"(^|_)(date|time|timestamp|datetime|day|month|year|week|quarter|hour|minute)(_|$)"
    r"|_(at|on)$"
    r"|^(created|updated|started|ended|completed|resolved|posted|published|expired|deleted|received|sent|requested)(_at|_on)?$",
    re.IGNORECASE,
)
_NUMERIC_TYPE_RE = re.compile(
    r"^(int|float|numeric|decimal|double|real|bigint|smallint|tinyint|number)",
    re.IGNORECASE,
)
_STRING_TYPE_RE = re.compile(r"(char|text|string|varchar|str$)", re.IGNORECASE)

_ENTITY_CARDINALITY_FLOOR = 20


@dataclass
class SemanticColumnTags:
    name: str
    dtype: str
    roles: Set[str] = field(default_factory=set)
    forbid_aggs: Set[str] = field(default_factory=set)
    prefer_aggs: Set[str] = field(default_factory=set)
    is_temporal_string: bool = False


def _dtype(col: Dict[str, Any]) -> str:
    return str(col.get("dtype") or col.get("type") or col.get("data_type") or "").strip()


def classify_column(col: Dict[str, Any]) -> SemanticColumnTags:
    name = str(col.get("name") or "")
    dtype = _dtype(col)
    tags = SemanticColumnTags(name=name, dtype=dtype)

    is_numeric = bool(_NUMERIC_TYPE_RE.match(dtype))
    is_string = bool(_STRING_TYPE_RE.search(dtype))

    # Geo
    if _GEO_NAME_RE.search(name):
        tags.roles.add("geo")
        tags.forbid_aggs.update({"SUM", "AVG"})

    # Identifier
    if _ID_NAME_RE.search(name):
        tags.roles.add("identifier")
        tags.forbid_aggs.update({"SUM", "AVG"})
        tags.prefer_aggs.update({"COUNT", "COUNT_DISTINCT"})

    # Temporal
    if _TEMPORAL_TYPE_RE.match(dtype) or _TEMPORAL_NAME_RE.search(name):
        tags.roles.add("temporal")
        if is_string:
            tags.is_temporal_string = True

    # Measure — only if numeric AND not geo/identifier
    if is_numeric and not tags.roles & {"geo", "identifier"}:
        tags.roles.add("measure")

    # Dimension — strings that aren't identifiers/temporal
    if is_string and "identifier" not in tags.roles and "temporal" not in tags.roles:
        tags.roles.add("dimension")
        card = col.get("cardinality")
        if isinstance(card, (int, float)) and card >= _ENTITY_CARDINALITY_FLOOR:
            tags.roles.add("entity_name")

    return tags


def forbid_for_agg(tags: SemanticColumnTags, agg: str) -> bool:
    return agg.upper() in tags.forbid_aggs


def digest_with_semantics(schema_profile: Dict[str, Any], max_cols: int = 60) -> str:
    cols = schema_profile.get("columns", []) or []
    lines: List[str] = []
    for c in cols[:max_cols]:
        t = classify_column(c)
        card = c.get("cardinality")
        samples = c.get("sample_values") or []
        sample_s = ",".join(str(v) for v in samples[:3])
        roles_s = ",".join(sorted(t.roles)) or "untagged"
        note = ""
        if t.forbid_aggs:
            note = f" — DO NOT {('/'.join(sorted(t.forbid_aggs, reverse=True)))}"
            if t.prefer_aggs:
                note += f"; prefer {('/'.join(sorted(t.prefer_aggs)))}"
        lines.append(
            f"  - {t.name} :: {t.dtype or '?'} (card={card}) "
            f"[{roles_s}]{note} samples=[{sample_s}]"
        )
    return "\n".join(lines)
