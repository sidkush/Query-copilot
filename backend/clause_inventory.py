"""Ring 4 — ClauseInventory.

extract_clauses(nl) uses an LLM (injectable for tests) to turn the user's NL
question into a short list of clauses with semantic roles.

validate_mapping(clauses, sql) walks the SQL AST and verifies that each
clause is covered by one or more SQL nodes. Unmapped clauses flow into the
IntentEchoCard as warnings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


_KIND_CHOICES = {
    "cohort_filter", "metric", "groupby", "temporal",
    "baseline", "ordering", "limit", "join",
}


@dataclass(frozen=True)
class Clause:
    text: str
    kind: str

    def __post_init__(self):
        if self.kind not in _KIND_CHOICES:
            raise ValueError(f"Clause.kind must be one of {_KIND_CHOICES!r}")


@dataclass
class ClauseInventory:
    extracted: list = field(default_factory=list)
    unmapped: list = field(default_factory=list)
    sql: str = ""


def extract_clauses(nl: str, llm_fn: Callable) -> list:
    """Call the injected LLM function with the NL. Returns list[Clause]."""
    if not callable(llm_fn):
        return []
    try:
        result = llm_fn(nl)
    except Exception:
        return []
    return [c for c in (result or []) if isinstance(c, Clause)]


def validate_mapping(clauses: list, sql: str, dialect: str = "sqlite") -> list:
    """Return clauses that have no corresponding SQL element."""
    import sqlglot
    import sqlglot.expressions as exp
    try:
        ast = sqlglot.parse_one(sql, dialect=dialect)
    except Exception:
        return list(clauses)

    has_groupby = bool(list(ast.find_all(exp.Group)))
    has_where = bool(list(ast.find_all(exp.Where)))
    has_order = bool(list(ast.find_all(exp.Order)))
    has_limit = bool(ast.args.get("limit")) if isinstance(ast, exp.Select) else bool(list(ast.find_all(exp.Limit)))
    has_join = bool(list(ast.find_all(exp.Join)))

    unmapped = []
    for clause in clauses:
        kind = clause.kind
        if kind == "groupby" and not has_groupby:
            unmapped.append(clause)
        elif kind == "cohort_filter" and not has_where:
            unmapped.append(clause)
        elif kind == "ordering" and not has_order:
            unmapped.append(clause)
        elif kind == "limit" and not has_limit:
            unmapped.append(clause)
        elif kind == "join" and not has_join:
            unmapped.append(clause)
        elif kind == "temporal" and not has_where:
            unmapped.append(clause)

    return unmapped
