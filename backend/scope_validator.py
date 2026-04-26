"""Ring 3 — ScopeValidator.

Pre-execution deterministic check between SQL generation and execution.
Fails open on sqlglot parse exception (H6). Each rule independently toggleable.

Hardening (S4, 2026-04-24 adversarial):
- Parse exception and per-rule exception both emit telemetry via
  `_emit_telemetry(event=..., **kwargs)`. Default implementation logs at WARN;
  residual-risk telemetry pipeline can monkey-patch to record metrics.
- Exceptions are still non-blocking (fail-open preserves availability) but no
  longer silent — ops can see which rule is degrading.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _emit_telemetry(**event) -> None:
    """Telemetry hook for scope validator degradation events.

    Default sinks to logger.warning so running tests + ops get visibility.
    Residual-risk telemetry module can monkey-patch this symbol to record
    structured metrics.
    """
    logger.warning("scope_validator_event: %s", event)

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
    AGGREGATE_IN_GROUP_BY = "aggregate_in_group_by"  # Rule 11 — Bug 4 root fix
    SQL_TOO_LARGE = "sql_too_large"  # A6/A11 fold — pre-parse size guard


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
        # A6/A11 adversarial fold — pre-parse size guard. Without this,
        # sqlglot.parse_one on 10MB SQL or 5K-deep CTE causes RecursionError
        # (uncaught, fail-open returns empty violations -> scope fence
        # bypassed).
        try:
            from config import settings as _cfg
            _max_bytes = int(getattr(_cfg, "SQL_MAX_LEN_BYTES", 100_000))
        except Exception:
            _max_bytes = 100_000
        if isinstance(sql, str) and len(sql.encode("utf-8", errors="ignore")) > _max_bytes:
            _emit_telemetry(
                event="scope_validator_sql_too_large",
                dialect=self.dialect,
                sql_bytes=len(sql.encode("utf-8", errors="ignore")),
                limit=_max_bytes,
            )
            return ValidatorResult(
                violations=[Violation(
                    rule_id=RuleId.SQL_TOO_LARGE,
                    message=f"SQL exceeds {_max_bytes}-byte cap — refusing to parse (DoS guard).",
                    severity="block",
                    evidence={"sql_bytes": len(sql.encode("utf-8", errors="ignore")), "limit": _max_bytes},
                )],
            )
        try:
            import sqlglot
            ast = sqlglot.parse_one(sql, dialect=self.dialect)
        except RecursionError as exc:
            # A6/A11 fold — explicit RecursionError from deep nesting.
            # Block, do NOT fail-open (could mask DML smuggled in deep CTE).
            _emit_telemetry(
                event="scope_validator_recursion_error",
                dialect=self.dialect,
            )
            return ValidatorResult(
                violations=[Violation(
                    rule_id=RuleId.SQL_TOO_LARGE,
                    message="SQL AST too deep — refused.",
                    severity="block",
                    evidence={"reason": "recursion_limit"},
                )],
            )
        except Exception as exc:
            _emit_telemetry(
                event="scope_validator_parse_failed",
                dialect=self.dialect,
                exception=type(exc).__name__,
                message=str(exc)[:200],
            )
            # A6 fold — defense in depth: if SQL contains DML keywords,
            # block instead of fail-open. The 6-layer SQL validator catches
            # this independently, but redundant defense closes the smuggle
            # window where a malformed SQL parses on src-dialect but bypasses
            # rule walks.
            # D10-final fold (P0): strip string literals + line comments
            # before DML keyword scan, otherwise legitimate
            # `SELECT 'no DELETE allowed' AS warning` triggers a false
            # block on parse-failure paths (e.g., dialect mismatch).
            import re as _re_dml
            _sql_stripped = _re_dml.sub(r"'(?:[^']|'')*'", "''", sql or "")
            _sql_stripped = _re_dml.sub(r'"(?:[^"]|"")*"', '""', _sql_stripped)
            _sql_stripped = _re_dml.sub(r"--[^\n]*", "", _sql_stripped)
            _sql_stripped = _re_dml.sub(r"/\*[\s\S]*?\*/", "", _sql_stripped)
            if _re_dml.search(
                r"(?i)\b(drop|delete|update|insert|alter|truncate|create|grant|revoke|merge)\b",
                _sql_stripped,
            ):
                return ValidatorResult(
                    violations=[Violation(
                        rule_id=RuleId.SQL_TOO_LARGE,
                        message="Unparseable SQL containing DML keywords — refused.",
                        severity="block",
                        evidence={"reason": "parse_failed_with_dml"},
                    )],
                    parse_failed=True,
                )
            return ValidatorResult(violations=[], parse_failed=True)

        violations: list = []
        for rule_fn in _enabled_rules():
            try:
                vio = rule_fn(ast, sql, ctx, self.dialect)
                if vio is not None:
                    violations.append(vio)
            except Exception as exc:
                _emit_telemetry(
                    event="scope_validator_rule_failed",
                    rule=getattr(rule_fn, "__name__", repr(rule_fn)),
                    dialect=self.dialect,
                    exception=type(exc).__name__,
                    message=str(exc)[:200],
                )
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

# AMEND-W2-T4-03 — dialect-branched dedup suggestion table.
# Keep narrow: only buckets that have empirical engine-side support.
# Reference: dialect_capabilities/__init__.py for engine list authority.
_QUALIFY_DIALECTS = frozenset(
    {"bigquery", "snowflake", "databricks", "duckdb", "clickhouse"}
)
_DISTINCT_ON_DIALECTS = frozenset({"postgres", "postgresql"})
_SUBQUERY_ROW_NUMBER_DIALECTS = frozenset(
    {"mysql", "mariadb", "sqlite", "mssql", "tsql", "oracle"}
)


def _dedup_suggestion_for_dialect(dialect: str, pk_hint: Optional[str] = None) -> str:
    """Return a dialect-appropriate dedup suggestion.

    AMEND-W2-T4-03 — implementation requested by adversarial Pass #2.
    `pk_hint` is the column users should partition by; falls back to
    `<pk>` placeholder when caller cannot determine one.
    """
    pk = pk_hint or "<pk>"
    d = (dialect or "").lower()
    d = _DIALECT_ALIASES.get(d, d)
    if d in _QUALIFY_DIALECTS:
        return (
            f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {pk}) = 1 "
            "to enforce uniqueness inside the CTE"
        )
    if d in _DISTINCT_ON_DIALECTS:
        return (
            f"DISTINCT ON ({pk}) ... ORDER BY {pk} (Postgres >= 9.5) "
            "to enforce uniqueness inside the CTE"
        )
    if d in _SUBQUERY_ROW_NUMBER_DIALECTS:
        return (
            f"a ROW_NUMBER() subquery wrapper: "
            f"SELECT ... FROM (SELECT ..., ROW_NUMBER() OVER "
            f"(PARTITION BY {pk}) AS rn FROM <cte>) WHERE rn = 1"
        )
    # Conservative default: surface the QUALIFY hint with caveat.
    return (
        f"QUALIFY ROW_NUMBER() OVER (PARTITION BY {pk}) = 1 "
        "(or a ROW_NUMBER subquery wrapper if your engine lacks QUALIFY)"
    )


@_register("RULE_FANOUT_INFLATION")
def _rule_fanout_inflation(ast, sql: str, ctx: dict, dialect: str):
    """Ring-3 fan-out detector.

    Branches:
      1. legacy_count_star — COUNT(*) over JOIN.
      2. distinct_cte_multi_col — INNER JOIN on DISTINCT CTE with >=2
         columns AND the JOIN condition references >=2 of those cols.
      3. using_multi_col — JOIN ... USING(col_a, col_b) where both
         sides are DISTINCT CTEs covering those cols.
      4. group_by_cte — same as (2) but the CTE uses GROUP BY rather
         than DISTINCT for dedup; functionally equivalent.

    Tenant invariant (AMEND-W2-T4-06):
        # DO NOT consume ctx["coverage_cards"] without tenant_fortress
        # composite key — see AMEND-W2-T4-06.
    """
    import sqlglot.expressions as exp
    try:
        from config import settings as _settings
    except Exception:
        _settings = None

    joins = list(ast.find_all(exp.Join))

    # Branch 1 — legacy COUNT(*) + JOIN.
    if joins:
        for count in ast.find_all(exp.Count):
            inner = count.args.get("this")
            is_star = isinstance(inner, exp.Star)
            is_distinct = bool(count.args.get("distinct"))
            if is_star and not is_distinct:
                _emit_telemetry(
                    event="fanout_inflation_fired",
                    branch="legacy_count_star",
                    dialect=dialect,
                )
                return Violation(
                    rule_id=RuleId.FANOUT_INFLATION,
                    message="COUNT(*) across JOIN may inflate due to one-to-many row fan-out; use COUNT(DISTINCT <pk>).",
                    evidence={"join_count": len(joins)},
                )

    # W2 branches gated by config flag (AMEND-W2-T4-13 anonymous skip
    # + AMEND-W2-T4-08 recursive skip + AMEND-W2-T4-09 star skip
    # + AMEND-W2-T4-15 quoted-identifier case).
    if not getattr(_settings, "W2_FANOUT_DISTINCT_CTE_ENFORCE", False):
        return None
    if not joins:
        return None

    # Build CTE column-set map. Each entry: alias → set of col names
    # (lowercase). For Alias nodes we record alias_or_name (output name)
    # plus the underlying column source (AMEND-W2-T4-01).
    cte_cols_map: dict[str, set[str]] = {}
    saw_alias_rename = False  # AMEND-W2-T4-01 telemetry hook

    with_clause = ast.args.get("with") or ast.args.get("with_") or ast.find(exp.With)
    if with_clause is not None:
        for cte in with_clause.expressions:
            cte_alias = (cte.alias_or_name or "").lower()
            if not cte_alias:
                # AMEND-W2-T4-13 — anonymous CTE.
                continue
            inner = cte.this
            # AMEND-W2-T4-08 — recursive CTE = Union expression.
            if isinstance(inner, exp.Union):
                _emit_telemetry(
                    event="fanout_inflation_skip_recursive_cte",
                    cte_alias=cte_alias,
                )
                continue
            if not isinstance(inner, exp.Select):
                continue

            is_distinct = bool(inner.args.get("distinct"))
            group_keys: set[str] = set()
            grp = inner.args.get("group")
            if grp is not None:
                for ge in grp.expressions:
                    if isinstance(ge, exp.Column):
                        group_keys.add((ge.name or "").lower())
                    else:
                        nm = getattr(ge, "name", "") or ""
                        if nm:
                            group_keys.add(nm.lower())

            # Skip CTEs that are neither DISTINCT nor GROUP BY-deduped.
            if not is_distinct and not group_keys:
                continue

            cols: set[str] = set()
            for proj in inner.expressions:
                if isinstance(proj, exp.Star):
                    # AMEND-W2-T4-09 — star projection: telemetry + skip.
                    _emit_telemetry(
                        event="fanout_inflation_star_skipped",
                        cte_alias=cte_alias,
                    )
                    cols = set()
                    break
                # Output name (post-alias).
                out_name = (proj.alias_or_name or "").lower()
                if out_name:
                    cols.add(out_name)
                    # AMEND-W2-T4-15 — also store raw case for quoted-id
                    # databases (Postgres/Snowflake "Foo_Bar" survives).
                    raw = proj.alias_or_name or ""
                    if raw and raw != out_name:
                        cols.add(raw)
                # Underlying column when projection is an alias of a column.
                if isinstance(proj, exp.Alias):
                    src = proj.this
                    if isinstance(src, exp.Column):
                        src_name = (src.name or "").lower()
                        if src_name and src_name != out_name:
                            cols.add(src_name)
                            saw_alias_rename = True

            if not cols:
                continue

            # GROUP BY keys must be present in the projected columns
            # for the dedup to actually hold; otherwise it isn't a
            # functional uniqueness guarantee.
            if group_keys and not group_keys.issubset(cols):
                continue

            cte_cols_map[cte_alias] = cols

    if not cte_cols_map:
        return None

    # Branch 2/3/4 — scan each join and fire when threshold met.
    for join in joins:
        rhs = join.this
        # Source table name (resolves to CTE name when joining a CTE).
        rhs_table_name = (
            (rhs.name or "").lower() if hasattr(rhs, "name") else ""
        )
        # Local alias used for column references (e.g. INNER JOIN churned c → "c").
        rhs_local_alias = (
            (rhs.alias_or_name or "").lower()
            if hasattr(rhs, "alias_or_name")
            else ""
        )

        # Branch 3 — JOIN ... USING(col_a, col_b)
        # AMEND-W2-T4-04 — sqlglot leaves col.table=="" on USING cols;
        # walk join.args["using"] directly.
        using = join.args.get("using")
        if using:
            using_names = {
                ((u.name if hasattr(u, "name") else str(u)) or "").lower()
                for u in using
            }
            using_names.discard("")

            # Find lhs of join via parent Select's FROM arg.
            parent = join.parent
            lhs_table_name = ""
            if parent is not None and hasattr(parent, "args"):
                from_ = (
                    parent.args.get("from")
                    or parent.args.get("from_")
                )
                if from_ is None and hasattr(parent, "find"):
                    from_ = parent.find(exp.From)
                if from_ is not None:
                    src = from_.this if hasattr(from_, "this") else from_
                    if hasattr(src, "name"):
                        lhs_table_name = (src.name or "").lower()

            both_dedup = (
                lhs_table_name in cte_cols_map
                and rhs_table_name in cte_cols_map
            )
            if both_dedup:
                lhs_cols = cte_cols_map[lhs_table_name]
                rhs_cols = cte_cols_map[rhs_table_name]
                shared = using_names & lhs_cols & rhs_cols
                if len(shared) >= 2:
                    suggestion = _dedup_suggestion_for_dialect(
                        dialect, pk_hint=sorted(shared)[0]
                    )
                    _emit_telemetry(
                        event="fanout_inflation_fired",
                        branch="using_multi_col",
                        dialect=dialect,
                    )
                    return Violation(
                        rule_id=RuleId.FANOUT_INFLATION,
                        message=(
                            f"JOIN ... USING({', '.join(sorted(shared))}) on two "
                            f"DISTINCT CTEs `{lhs_table_name}` + `{rhs_table_name}` "
                            f"may inflate if any USING column is non-unique. "
                            f"Consider {suggestion}."
                        ),
                        evidence={
                            "lhs_cte": lhs_table_name,
                            "rhs_cte": rhs_table_name,
                            "using": sorted(shared),
                            "branch": "using_multi_col",
                        },
                    )

        # Branch 2/4 — JOIN ... ON c.col = t.col AND c.col2 = t.col2
        if rhs_table_name not in cte_cols_map:
            continue
        cte_cols = cte_cols_map[rhs_table_name]
        if len(cte_cols) < 2:
            continue
        on = join.args.get("on")
        if on is None:
            continue
        used_cte_cols: set[str] = set()
        for col in on.find_all(exp.Column):
            tbl = (col.table or "").lower()
            name = (col.name or "").lower()
            # Match against the JOIN's local alias (what column refs use).
            if tbl == rhs_local_alias and name in cte_cols:
                used_cte_cols.add(name)
        if len(used_cte_cols) >= 2:
            # Decide branch label: distinct vs group-by.
            branch_label = "distinct_cte_multi_col"
            cte_node = None
            if with_clause is not None:
                for cte in with_clause.expressions:
                    if (cte.alias_or_name or "").lower() == rhs_table_name:
                        cte_node = cte
                        break
            if cte_node is not None and isinstance(cte_node.this, exp.Select):
                if not bool(cte_node.this.args.get("distinct")) and cte_node.this.args.get("group"):
                    branch_label = "group_by_cte"

            suggestion = _dedup_suggestion_for_dialect(
                dialect, pk_hint=sorted(used_cte_cols)[0]
            )
            _emit_telemetry(
                event="fanout_inflation_fired",
                branch=branch_label,
                dialect=dialect,
                alias_rename_observed=saw_alias_rename,
            )
            return Violation(
                rule_id=RuleId.FANOUT_INFLATION,
                message=(
                    f"INNER JOIN on dedup CTE `{rhs_table_name}` uses "
                    f"{len(used_cte_cols)} columns; if any column is "
                    f"non-unique within the CTE, rows multiply. "
                    f"Either join on the primary key only, or rewrite "
                    f"the CTE with {suggestion}."
                ),
                evidence={
                    "cte_alias": rhs_table_name,
                    "cte_columns": sorted(cte_cols),
                    "join_columns": sorted(used_cte_cols),
                    "branch": branch_label,
                    "alias_rename_observed": saw_alias_rename,
                },
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
        base = _resolve_view_base(ref, views, depth=0, max_depth=5, dialect=dialect)
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


def _resolve_view_base(name: str, views: dict, depth: int, max_depth: int, dialect: str = "sqlite"):
    """A20 fold — accept dialect param so view-walker recursive parse uses
    the connection's dialect. Default kept as sqlite for back-compat with
    callers that still pass 4 args."""
    import sqlglot
    import sqlglot.expressions as exp

    if depth >= max_depth:
        return None
    view_sql = views.get(name)
    if not view_sql:
        return name
    try:
        vast = sqlglot.parse_one(view_sql, dialect=dialect)
    except Exception:
        return None
    for tbl in vast.find_all(exp.Table):
        nm = (tbl.name or "").lower()
        if nm and nm != name.lower():
            if nm in views:
                return _resolve_view_base(nm, views, depth + 1, max_depth, dialect)
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


# ── Rule 11 — Aggregate in GROUP BY (Bug 4 root fix) ─────────────────
# Catches the BigQuery-rejected pattern:
#     GROUP BY tm.member_casual, user_segment
# where user_segment = CASE WHEN AVG(...) > 30 THEN ... — aggregate
# nested in CASE used directly in GROUP BY. BigQuery and standard SQL
# both reject; the agent currently writes it because no rule catches it.
#
# Adversarial folds:
#   A4/A6/A11  — RecursionError-safe walk; AST cap pre-checked above.
#   A6  — empty GROUP BY () (grouping sets) returns None (legal).
#   A16 — exclude exp.Window descendants (window aggs are valid).
#   A16 — exclude exp.Subquery descendants (uncorrelated scalar
#         subquery aggs are valid in GROUP BY; their evaluation context
#         is independent of the outer aggregate scope).


@_register("RULE_AGGREGATE_IN_GROUP_BY")
def _rule_aggregate_in_group_by(ast, sql: str, ctx: dict, dialect: str):
    import sqlglot.expressions as exp

    # Aggregate node classes. AggFunc is sqlglot's parent for Avg/Sum/Count/
    # Max/Min/etc., but explicit list catches subclasses sqlglot may not
    # inherit-mark in older versions.
    _AGG_TYPES = (exp.AggFunc, exp.Avg, exp.Sum, exp.Count, exp.Max, exp.Min)

    try:
        groups = list(ast.find_all(exp.Group))
    except RecursionError:
        return Violation(
            rule_id=RuleId.AGGREGATE_IN_GROUP_BY,
            message="AST too deep for aggregate-in-GROUP-BY check.",
            severity="block",
            evidence={"reason": "recursion_limit"},
        )

    for grp in groups:
        # AMEND-A6 — empty GROUP BY () (grouping sets) is legal.
        grp_exprs = list(grp.expressions or [])
        if not grp_exprs:
            continue
        for grp_expr in grp_exprs:
            # Walk THIS expression only (not the whole AST). We don't use
            # `find_all` on the AST root because that would catch agg
            # functions in unrelated SELECT projections.
            try:
                candidates = [grp_expr] + list(grp_expr.find_all(*_AGG_TYPES))
            except RecursionError:
                return Violation(
                    rule_id=RuleId.AGGREGATE_IN_GROUP_BY,
                    message="AST too deep for aggregate-in-GROUP-BY check.",
                    severity="block",
                    evidence={"reason": "recursion_limit"},
                )
            for node in candidates:
                if not isinstance(node, _AGG_TYPES):
                    continue
                # AMEND-A16 — window aggregate (SUM(x) OVER (...)) is
                # valid in GROUP BY: the windowed result is a scalar per
                # row, evaluated outside the GROUP scope.
                if node.find_ancestor(exp.Window) is not None:
                    continue
                # D10-final fold (P0) — scalar-subquery FP fix:
                # Legal: GROUP BY (SELECT MAX(t2.x) FROM t2) — scalar
                # subquery returns a constant; aggregating it as the
                # GROUP key is valid SQL.
                # Illegal: GROUP BY CASE WHEN AVG(t.x)>30 THEN 'a' END —
                # bare aggregate in GROUP BY's own evaluation scope.
                # Distinguish: if the agg node has a Subquery ancestor
                # AND that Subquery is a STRICT DESCENDANT of grp_expr
                # (not grp_expr itself), the agg is shielded inside a
                # nested scalar query → skip. If grp_expr IS the
                # Subquery, the agg is inside it but represents the
                # whole group expression → still legal scalar form.
                anc_subq = node.find_ancestor(exp.Subquery)
                if anc_subq is not None:
                    # Agg is inside SOME subquery. Whether that subquery
                    # is grp_expr itself or an ancestor of grp_expr or
                    # a descendant of grp_expr, it is shielded from the
                    # outer group's aggregation scope. SKIP — legal.
                    continue
                _emit_telemetry(
                    event="aggregate_in_group_by_fired",
                    dialect=dialect,
                    agg_type=type(node).__name__,
                )
                _agg_name = type(node).__name__.upper()
                return Violation(
                    rule_id=RuleId.AGGREGATE_IN_GROUP_BY,
                    message=(
                        f"GROUP BY expression contains aggregate {_agg_name}(...). "
                        "BigQuery, Snowflake, Postgres, and standard SQL reject "
                        "this. Wrap the aggregate-derived column in an inner "
                        "subquery and GROUP BY the outer alias."
                    ),
                    severity="block",
                    evidence={
                        "agg_type": _agg_name,
                        "fix_pattern": (
                            "SELECT ..., CASE WHEN avg_col > 30 THEN 'big' ELSE 'small' END AS bucket "
                            "FROM (SELECT ..., AVG(x) AS avg_col FROM t GROUP BY ...) i "
                            "GROUP BY bucket"
                        ),
                    },
                )
    return None
