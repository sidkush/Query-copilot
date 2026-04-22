"""Ring 3 — ScopeValidator.

Pre-execution deterministic check between SQL generation and execution.
Fails open on sqlglot parse exception (H6). Each rule independently toggleable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

# sqlglot uses 'postgres' not 'postgresql', 'tsql' not 'mssql', etc.
_DIALECT_ALIASES: dict = {
    "postgresql": "postgres",
    "mssql": "tsql",
    "mariadb": "mysql",
    "cockroachdb": "postgres",
    "supabase": "postgres",
    "redshift": "redshift",
    "clickhouse": "clickhouse",
}


def _normalize_dialect(dialect: str) -> str:
    return _DIALECT_ALIASES.get(dialect.lower(), dialect.lower())


class RuleId(Enum):
    RANGE_MISMATCH = "range_mismatch"
    FANOUT_INFLATION = "fanout_inflation"
    LIMIT_BEFORE_ORDER = "limit_before_order"
    TIMEZONE_NAIVE = "timezone_naive"
    SOFT_DELETE_MISSING = "soft_delete_missing"
    NEGATION_AS_JOIN = "negation_as_join"
    DIALECT_FALLTHROUGH = "dialect_fallthrough"
    VIEW_WALKER = "view_walker"
    CONJUNCTION_SELECTIVITY = "conjunction_selectivity"
    EXPRESSION_PREDICATE = "expression_predicate"


@dataclass(frozen=True)
class Violation:
    rule_id: RuleId
    message: str
    severity: str = "warn"
    evidence: dict = field(default_factory=dict)


@dataclass
class ValidatorResult:
    violations: list
    parse_failed: bool = False
    replan_requested: bool = False

    @property
    def passed(self) -> bool:
        return self.parse_failed or not any(v.severity == "block" for v in self.violations)


class ScopeValidator:
    def __init__(self, dialect: str = "sqlite"):
        self.dialect = _normalize_dialect(dialect)

    def validate(self, sql: str, ctx: dict) -> ValidatorResult:
        try:
            import sqlglot
            ast = sqlglot.parse_one(sql, dialect=self.dialect)
        except Exception:
            return ValidatorResult(violations=[], parse_failed=True)

        violations: list = []
        for rule_fn in _enabled_rules():
            try:
                vio = rule_fn(ast, sql, ctx, self.dialect)
                if vio is not None:
                    violations.append(vio)
            except Exception:
                continue

        return ValidatorResult(violations=violations)


_RULES: list = []


def _register(flag_name: str):
    def wrap(fn):
        fn._flag_name = flag_name
        _RULES.append(fn)
        return fn
    return wrap


def _enabled_rules() -> list:
    try:
        from config import settings
    except Exception:
        return _RULES
    return [fn for fn in _RULES if getattr(settings, fn._flag_name, True)]


# ── Rule 1 — Range mismatch ──────────────────────────────────────────


@_register("RULE_RANGE_MISMATCH")
def _rule_range_mismatch(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    cards = ctx.get("coverage_cards") or []
    if not cards:
        return None

    ranges: dict = {}
    for card in cards:
        col_map: dict = {}
        for dc in card.date_columns:
            if dc.min_value and dc.max_value:
                col_map[dc.column.lower()] = (dc.min_value, dc.max_value)
        if col_map:
            ranges[card.table_name.lower()] = col_map

    if not ranges:
        return None

    for where in ast.find_all(exp.Where):
        for cmp in where.find_all(exp.LT, exp.GT, exp.LTE, exp.GTE, exp.EQ):
            col = cmp.args.get("this")
            lit = cmp.args.get("expression")
            if not isinstance(col, exp.Column) or not isinstance(lit, exp.Literal):
                continue
            col_name = (col.name or "").lower()
            lit_val = lit.this

            for tbl_name, col_map in ranges.items():
                if col_name not in col_map:
                    continue
                if tbl_name not in sql.lower():
                    continue
                mn, mx = col_map[col_name]
                op = cmp.key
                if op in {"lt", "lte"} and lit_val < mn:
                    return Violation(
                        rule_id=RuleId.RANGE_MISMATCH,
                        message=f"WHERE {col_name} {cmp.key} {lit_val!r} narrows below observed min {mn!r} in {tbl_name}",
                        evidence={"column": col_name, "literal": lit_val, "card_min": mn, "card_max": mx},
                    )
                if op in {"gt", "gte"} and lit_val > mx:
                    return Violation(
                        rule_id=RuleId.RANGE_MISMATCH,
                        message=f"WHERE {col_name} {cmp.key} {lit_val!r} narrows above observed max {mx!r} in {tbl_name}",
                        evidence={"column": col_name, "literal": lit_val, "card_min": mn, "card_max": mx},
                    )
    return None


# ── Rule 2 — Fan-out inflation ───────────────────────────────────────


@_register("RULE_FANOUT_INFLATION")
def _rule_fanout_inflation(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    joins = list(ast.find_all(exp.Join))
    if not joins:
        return None

    for count in ast.find_all(exp.Count):
        inner = count.args.get("this")
        is_star = isinstance(inner, exp.Star)
        is_distinct = bool(count.args.get("distinct"))
        if is_star and not is_distinct:
            return Violation(
                rule_id=RuleId.FANOUT_INFLATION,
                message="COUNT(*) across JOIN may inflate due to one-to-many row fan-out; use COUNT(DISTINCT <pk>).",
                evidence={"join_count": len(joins)},
            )
    return None


# ── Rule 3 — LIMIT-before-ORDER ──────────────────────────────────────


@_register("RULE_LIMIT_BEFORE_ORDER")
def _rule_limit_before_order(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    outer = ast if isinstance(ast, exp.Select) else ast.find(exp.Select)
    if outer is None:
        return None
    outer_order = outer.args.get("order")
    if not outer_order:
        return None

    for sub in ast.find_all(exp.Subquery):
        sub_select = sub.find(exp.Select)
        if sub_select is None:
            continue
        if sub_select is outer:
            continue
        if sub_select.args.get("limit"):
            return Violation(
                rule_id=RuleId.LIMIT_BEFORE_ORDER,
                message="Subquery LIMIT applied BEFORE outer ORDER BY; outer ordering only sorts the already-truncated subset.",
            )
    return None


# ── Rule 4 — Timezone-naive ──────────────────────────────────────────


@_register("RULE_TIMEZONE_NAIVE")
def _rule_timezone_naive(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    tz_cols_map = ctx.get("tz_aware_columns") or {}
    all_tz_cols: set = set()
    for cols in tz_cols_map.values():
        for c in cols:
            all_tz_cols.add(c.lower())
    if not all_tz_cols:
        return None

    lc = sql.lower()
    if "at time zone" in lc:
        return None

    # sqlglot transpiles DATE_TRUNC to TimestampTrunc in postgres dialect
    # Check DateTrunc, Date, TimestampTrunc, and any Func that truncates dates
    func_types = (exp.DateTrunc, exp.Date, exp.TimestampTrunc)
    for func in ast.find_all(*func_types):
        # Column can be in 'this' arg directly or nested
        for col in func.find_all(exp.Column):
            if (col.name or "").lower() in all_tz_cols:
                return Violation(
                    rule_id=RuleId.TIMEZONE_NAIVE,
                    message=f"{type(func).__name__}() applied to tz-aware column {col.name!r} without AT TIME ZONE.",
                    evidence={"column": col.name, "function": type(func).__name__},
                )
    return None


# ── Rule 5 — Soft-delete missing ─────────────────────────────────────


@_register("RULE_SOFT_DELETE_MISSING")
def _rule_soft_delete_missing(ast, sql: str, ctx: dict, dialect: str):
    sd_map = ctx.get("soft_delete_columns") or {}
    if not sd_map:
        return None
    lc = sql.lower()

    for table_name, sd_col in sd_map.items():
        if table_name.lower() not in lc:
            continue
        if sd_col.lower() in lc:
            continue
        return Violation(
            rule_id=RuleId.SOFT_DELETE_MISSING,
            message=f"Table {table_name!r} has soft-delete column {sd_col!r}, but no WHERE predicate filters tombstoned rows.",
            evidence={"table": table_name, "column": sd_col},
        )
    return None


# ── Rule 6 — Negation-as-JOIN ────────────────────────────────────────


_NEGATION_TOKENS = ("never", " no ", "without", "haven't", "hasn't", "didn't", "don't have")


@_register("RULE_NEGATION_AS_JOIN")
def _rule_negation_as_join(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    nl = (ctx.get("nl_question") or "").lower()
    if not any(tok in nl for tok in _NEGATION_TOKENS):
        return None

    has_inner = False
    for j in ast.find_all(exp.Join):
        side = (j.side or "").upper()
        kind = (j.kind or "").upper()
        if side == "" and kind in {"", "INNER"}:
            has_inner = True
        elif side == "LEFT":
            where = ast.find(exp.Where)
            if where and "is null" in sql.lower():
                return None

    if "not exists" in sql.lower() or "not in (" in sql.lower():
        return None

    if has_inner:
        return Violation(
            rule_id=RuleId.NEGATION_AS_JOIN,
            message="NL query contains negation ('never/no/without') but SQL uses INNER JOIN. Anti-join requires LEFT JOIN + IS NULL or NOT EXISTS.",
            evidence={"nl_tokens_present": [t for t in _NEGATION_TOKENS if t in nl]},
        )
    return None


# ── Rule 7 — Dialect fallthrough ─────────────────────────────────────


@_register("RULE_DIALECT_FALLTHROUGH")
def _rule_dialect_fallthrough(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot

    target_raw = (ctx.get("db_type") or "").lower()
    if not target_raw:
        return None
    target = _normalize_dialect(target_raw)
    if target == dialect:
        return None

    try:
        sqlglot.transpile(sql, read=dialect, write=target)
    except Exception as exc:
        return Violation(
            rule_id=RuleId.DIALECT_FALLTHROUGH,
            message=f"SQL written in {dialect!r} cannot be transpiled to target {target!r}: {type(exc).__name__}",
            evidence={"source_dialect": dialect, "target_dialect": target, "error": str(exc)[:200]},
        )
    return None


# ── Rule 8 — View walker (H18) ──────────────────────────────────────


@_register("RULE_VIEW_WALKER")
def _rule_view_walker(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot
    import sqlglot.expressions as exp

    views = ctx.get("view_definitions") or {}
    cards = ctx.get("coverage_cards") or []
    if not views or not cards:
        return None

    card_by_table: dict = {c.table_name.lower(): c for c in cards}

    referenced: set = set()
    for tbl in ast.find_all(exp.Table):
        if tbl.name:
            referenced.add(tbl.name.lower())

    for ref in referenced:
        if ref not in views:
            continue
        base = _resolve_view_base(ref, views, depth=0, max_depth=5)
        if not base:
            continue
        if base.lower() not in card_by_table:
            continue

        card = card_by_table[base.lower()]
        for dc in card.date_columns:
            if not (dc.min_value and dc.max_value):
                continue
            col_lc = dc.column.lower()
            for where in ast.find_all(exp.Where):
                for cmp in where.find_all(exp.LT, exp.GT, exp.LTE, exp.GTE):
                    col = cmp.args.get("this")
                    lit = cmp.args.get("expression")
                    if not isinstance(col, exp.Column) or not isinstance(lit, exp.Literal):
                        continue
                    if (col.name or "").lower() != col_lc:
                        continue
                    lit_val = lit.this
                    op = cmp.key
                    if op in {"lt", "lte"} and lit_val < dc.min_value:
                        return Violation(
                            rule_id=RuleId.VIEW_WALKER,
                            message=f"View {ref!r} resolves to base {base!r}; WHERE {col_lc} {op} {lit_val!r} outside base card min {dc.min_value!r}.",
                            evidence={"view": ref, "base": base, "column": col_lc, "literal": lit_val},
                        )
                    if op in {"gt", "gte"} and lit_val > dc.max_value:
                        return Violation(
                            rule_id=RuleId.VIEW_WALKER,
                            message=f"View {ref!r} resolves to base {base!r}; WHERE {col_lc} {op} {lit_val!r} outside base card max {dc.max_value!r}.",
                            evidence={"view": ref, "base": base, "column": col_lc, "literal": lit_val},
                        )
    return None


def _resolve_view_base(name: str, views: dict, depth: int, max_depth: int):
    import sqlglot
    import sqlglot.expressions as exp

    if depth >= max_depth:
        return None
    view_sql = views.get(name)
    if not view_sql:
        return name
    try:
        vast = sqlglot.parse_one(view_sql)
    except Exception:
        return None
    for tbl in vast.find_all(exp.Table):
        nm = (tbl.name or "").lower()
        if nm and nm != name.lower():
            if nm in views:
                return _resolve_view_base(nm, views, depth + 1, max_depth)
            return nm
    return None


# ── Rule 9 — Conjunction selectivity (H18) ───────────────────────────


@_register("RULE_CONJUNCTION_SELECTIVITY")
def _rule_conjunction_selectivity(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    cards = ctx.get("coverage_cards") or []
    connector = ctx.get("connector")
    if not cards or connector is None:
        return None

    tables_in_query: set = set()
    for tbl in ast.find_all(exp.Table):
        if tbl.name:
            tables_in_query.add(tbl.name.lower())

    candidate_card = None
    for card in cards:
        if card.table_name.lower() in tables_in_query:
            if candidate_card is None or card.row_count > candidate_card.row_count:
                candidate_card = card
    if not candidate_card or candidate_card.row_count <= 0:
        return None

    try:
        rows = connector.execute_query(f"EXPLAIN SELECT 1 FROM ({sql}) _")
        if not rows:
            return None
        estimate = int(rows[0][0])
    except Exception:
        return None

    threshold = max(int(candidate_card.row_count * 0.001), 1)
    if estimate < threshold:
        return Violation(
            rule_id=RuleId.CONJUNCTION_SELECTIVITY,
            message=f"Estimated {estimate:,} rows is less than 0.1% of the {candidate_card.row_count:,}-row base table — likely accidental empty intersection.",
            evidence={"estimate": estimate, "threshold": threshold, "base_rows": candidate_card.row_count},
        )
    return None


# ── Rule 10 — Expression-predicate (H18) ─────────────────────────────


@_register("RULE_EXPRESSION_PREDICATE")
def _rule_expression_predicate(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    for where in ast.find_all(exp.Where):
        for cmp in where.find_all(exp.LT, exp.GT, exp.LTE, exp.GTE, exp.EQ, exp.NEQ):
            lhs = cmp.args.get("this")
            if isinstance(lhs, (exp.Func, exp.Mod, exp.Add, exp.Sub, exp.Mul, exp.Div)):
                return Violation(
                    rule_id=RuleId.EXPRESSION_PREDICATE,
                    message=f"WHERE clause contains a computed expression ({type(lhs).__name__}); scope cannot be validated against DataCoverageCard.",
                    evidence={"lhs_type": type(lhs).__name__},
                )
    return None
