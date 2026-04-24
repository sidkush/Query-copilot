"""Ring 8 — SemanticRegistryBootstrap.

Seeds the SemanticRegistry (Phase D) with canonical measures + dimensions
inferred from schema metadata + query-memory history.

Inference rules:
- Every table emits `<table>_row_count` measure: `SELECT COUNT(*) FROM <table>`.
- Each date/timestamp column emits a time-grain dimension.
- Each low-cardinality categorical (non-PII) emits a category dimension.
- PII columns (email, phone, ssn, etc.) are SKIPPED.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


_PII_HINTS = (
    "email", "phone", "ssn", "social", "dob", "birth",
    "address", "zip", "credit", "card", "passport",
)

_DATE_TYPE_TOKENS = ("DATE", "TIME", "TIMESTAMP")
_CATEGORICAL_TYPE_TOKENS = ("CHAR", "TEXT", "VARCHAR", "ENUM", "STRING")


@dataclass(frozen=True)
class InferredDefinition:
    name: str
    kind: str                 # "measure" or "dimension"
    sql: str                  # canonical SQL fragment
    table: str
    time_grain: Optional[str] = None
    source: str = "schema"    # "schema" or "memory"


def _is_pii(col_name: str) -> bool:
    low = col_name.lower()
    return any(h in low for h in _PII_HINTS)


def _type_matches(data_type: str, tokens: tuple) -> bool:
    up = (data_type or "").upper()
    return any(tok in up for tok in tokens)


class SemanticRegistryBootstrap:
    """Generates InferredDefinition objects. Caller persists via SemanticRegistry.register."""

    def from_schema(self, conn_id: str, schema_profile: dict) -> list:
        defns: list = []
        for tbl in schema_profile.get("tables", []):
            tname = tbl.get("name", "")
            if not tname:
                continue
            cols = tbl.get("columns", [])
            # rowcount measure.
            defns.append(InferredDefinition(
                name=f"{tname}_row_count",
                kind="measure",
                sql=f"SELECT COUNT(*) FROM {tname}",
                table=tname,
                source="schema",
            ))
            for col in cols:
                cname = col.get("name", "")
                ctype = col.get("type") or col.get("data_type", "")
                if not cname:
                    continue
                if _is_pii(cname):
                    continue
                if _type_matches(ctype, _DATE_TYPE_TOKENS):
                    defns.append(InferredDefinition(
                        name=f"{tname}_by_{cname}_month",
                        kind="dimension",
                        sql=f"DATE_TRUNC('month', {cname})",
                        table=tname,
                        time_grain="month",
                        source="schema",
                    ))
                elif _type_matches(ctype, _CATEGORICAL_TYPE_TOKENS):
                    defns.append(InferredDefinition(
                        name=f"{tname}_by_{cname}",
                        kind="dimension",
                        sql=f"{cname}",
                        table=tname,
                        source="schema",
                    ))
        return defns

    def from_query_memory(self, conn_id: str, memory_hits: list) -> list:
        """Extract canonical patterns from successful queries in ChromaDB history.
        Each hit: {"nl": str, "sql": str, "feedback": int}.
        """
        defns: list = []
        for hit in memory_hits:
            sql = hit.get("sql", "")
            nl = hit.get("nl", "")
            feedback = hit.get("feedback", 0)
            if feedback <= 0 or not sql or not nl:
                continue
            slug = "_".join(w.lower() for w in nl.split()[:4] if w.isalnum())
            if not slug:
                continue
            defns.append(InferredDefinition(
                name=f"custom_{slug}",
                kind="measure",
                sql=sql,
                table="(inferred)",
                source="memory",
            ))
        return defns
