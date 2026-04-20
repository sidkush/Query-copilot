"""Function catalogue. Plan 8a (Build_Tableau.md §V.1).

All names canonical Tableau spelling. Each FunctionDef holds:
- arg_types: list[TypeConstraint]
- min_args / max_args (max_args=-1 for variadic)
- is_aggregate / is_table_calc
- return_type: TypeConstraint or callable(args) → TypeConstraint
- sql_template: dict[Dialect, str]  — emission template per dialect;
  keyed by the local Dialect enum (DUCKDB / POSTGRES / BIGQUERY /
  SNOWFLAKE). Plan 7d's dialects/registry.py does not yet export a
  matching enum, so we declare a minimal one here for catalogue use.
  When a shared enum lands (Plan 8c+), swap the import.
- docstring
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Callable, Optional, Union


class Dialect(enum.Enum):
    """Minimal dialect enum used to key per-dialect SQL templates.

    Plan 8a note: backend/vizql/dialects/registry.py does not (yet)
    export a Dialect enum — it resolves dialect singletons from
    config.DBType. The catalogue keeps its own small enum so the
    sql_template dict can be iterated independently of DBType.
    """
    DUCKDB = "duckdb"
    POSTGRES = "postgres"
    BIGQUERY = "bigquery"
    SNOWFLAKE = "snowflake"


class TypeKind(enum.Enum):
    STRING = "string"
    NUMBER = "number"      # real-valued (any numeric ok)
    INTEGER = "integer"
    DATE = "date"
    DATETIME = "datetime"
    BOOLEAN = "boolean"
    SPATIAL = "spatial"
    ANY = "any"
    SAME_AS = "same_as"    # references arg index for return_type


class Category(enum.Enum):
    AGGREGATE = "aggregate"
    LOGICAL = "logical"
    STRING = "string"
    DATE = "date"
    TYPE_CONVERSION = "type_conversion"
    USER = "user"
    SPATIAL = "spatial"
    PASSTHROUGH = "passthrough"
    ANALYTICS_EXT = "analytics_ext"
    TABLE_CALC = "table_calc"


@dataclass(frozen=True, slots=True)
class TypeConstraint:
    kind: TypeKind
    arg_index: int = -1  # only meaningful for TypeKind.SAME_AS

    @classmethod
    def string(cls) -> "TypeConstraint": return cls(TypeKind.STRING)
    @classmethod
    def number(cls) -> "TypeConstraint": return cls(TypeKind.NUMBER)
    @classmethod
    def integer(cls) -> "TypeConstraint": return cls(TypeKind.INTEGER)
    @classmethod
    def date(cls) -> "TypeConstraint": return cls(TypeKind.DATE)
    @classmethod
    def datetime(cls) -> "TypeConstraint": return cls(TypeKind.DATETIME)
    @classmethod
    def boolean(cls) -> "TypeConstraint": return cls(TypeKind.BOOLEAN)
    @classmethod
    def spatial(cls) -> "TypeConstraint": return cls(TypeKind.SPATIAL)
    @classmethod
    def any_(cls) -> "TypeConstraint": return cls(TypeKind.ANY)
    @classmethod
    def same_as(cls, idx: int) -> "TypeConstraint": return cls(TypeKind.SAME_AS, arg_index=idx)


ReturnType = Union[TypeConstraint, Callable[[tuple[TypeConstraint, ...]], TypeConstraint]]


@dataclass(frozen=True, slots=True)
class FunctionDef:
    name: str
    category: Category
    arg_types: tuple[TypeConstraint, ...]
    min_args: int
    max_args: int  # -1 = variadic
    return_type: ReturnType
    sql_template: dict[Dialect, str] = field(default_factory=dict)
    is_aggregate: bool = False
    is_table_calc: bool = False
    docstring: str = ""


# ---- helper builders ----
def _agg(name: str, arg: TypeConstraint, ret: TypeConstraint, *,
         distinct: bool = False, docstring: str = "") -> FunctionDef:
    fn = "COUNT" if name in ("COUNT", "COUNTD") else name
    template = f"{fn}({{args[0]}})" if not distinct else f"COUNT(DISTINCT {{args[0]}})"
    per_dialect = {d: template for d in Dialect}
    return FunctionDef(
        name=name, category=Category.AGGREGATE,
        arg_types=(arg,), min_args=1, max_args=1,
        return_type=ret, sql_template=per_dialect,
        is_aggregate=True, docstring=docstring,
    )


def _bin(name: str, arg: TypeConstraint, ret: TypeConstraint, op: str) -> FunctionDef:
    return FunctionDef(
        name=name, category=Category.AGGREGATE,
        arg_types=(arg, arg), min_args=2, max_args=2,
        return_type=ret, sql_template={d: f"{op}({{args[0]}}, {{args[1]}})" for d in Dialect},
        is_aggregate=True,
    )


# ---- catalogue ----
FUNCTIONS: dict[str, FunctionDef] = {}


def _register(fn: FunctionDef) -> None:
    if fn.name in FUNCTIONS:
        raise RuntimeError(f"duplicate function {fn.name}")
    FUNCTIONS[fn.name] = fn


# Aggregate (Build_Tableau §V.1)
for name in ("SUM", "AVG", "MIN", "MAX", "MEDIAN", "STDEV", "STDEVP", "VAR", "VARP",
             "KURTOSIS", "SKEWNESS"):
    _register(_agg(name, TypeConstraint.number(), TypeConstraint.number()))

_register(_agg("COUNT", TypeConstraint.any_(), TypeConstraint.integer()))
_register(FunctionDef(
    name="COUNTD", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
    return_type=TypeConstraint.integer(),
    sql_template={d: "COUNT(DISTINCT {args[0]})" for d in Dialect},
    is_aggregate=True, docstring="distinct count",
))
_register(FunctionDef(
    name="ATTR", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
    return_type=TypeConstraint.same_as(0),
    sql_template={d: "CASE WHEN MIN({args[0]}) = MAX({args[0]}) THEN MIN({args[0]}) ELSE NULL END" for d in Dialect},
    is_aggregate=True,
    docstring="returns value if all rows agree, else NULL",
))
_register(FunctionDef(
    name="PERCENTILE", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.number(), TypeConstraint.number()),
    min_args=2, max_args=2,
    return_type=TypeConstraint.number(),
    sql_template={d: "PERCENTILE_CONT({args[1]}) WITHIN GROUP (ORDER BY {args[0]})" for d in Dialect},
    is_aggregate=True,
))
_register(FunctionDef(
    name="COLLECT", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.spatial(),), min_args=1, max_args=1,
    return_type=TypeConstraint.spatial(),
    sql_template={d: "ST_COLLECT({args[0]})" for d in Dialect},
    is_aggregate=True,
    docstring="spatial aggregate",
))


# Logical (§V.1)
def _logical(name: str, min_a: int, max_a: int, arg: TypeConstraint, ret: TypeConstraint,
             template: dict[Dialect, str]) -> None:
    _register(FunctionDef(
        name=name, category=Category.LOGICAL,
        arg_types=(arg,), min_args=min_a, max_args=max_a,
        return_type=ret, sql_template=template,
    ))


# IF / CASE handled by parser AST, but registered here for catalogue completeness +
# typecheck dispatch when treated as an FnCall (e.g. ad-hoc adapters call them).
_register(FunctionDef(
    name="IF", category=Category.LOGICAL,
    arg_types=(TypeConstraint.boolean(), TypeConstraint.any_(), TypeConstraint.any_()),
    min_args=2, max_args=-1,
    return_type=TypeConstraint.same_as(1),
    sql_template={d: "CASE WHEN {args[0]} THEN {args[1]} ELSE {args[2]} END" for d in Dialect},
    docstring="parser also has dedicated IfExpr node; FUNCTIONS entry is for catalogue + introspection",
))
_register(FunctionDef(
    name="CASE", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=-1,
    return_type=TypeConstraint.any_(),
    sql_template={d: "" for d in Dialect},  # parser emits CaseExpr; template unused
    docstring="parser also has dedicated CaseExpr node",
))
_register(FunctionDef(
    name="IIF", category=Category.LOGICAL,
    arg_types=(TypeConstraint.boolean(), TypeConstraint.any_(), TypeConstraint.any_()),
    min_args=3, max_args=3,
    return_type=TypeConstraint.same_as(1),
    sql_template={d: "CASE WHEN {args[0]} THEN {args[1]} ELSE {args[2]} END" for d in Dialect},
    docstring="IIF(test, then, else)",
))
_register(FunctionDef(
    name="IFNULL", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(), TypeConstraint.same_as(0)), min_args=2, max_args=2,
    return_type=TypeConstraint.same_as(0),
    sql_template={d: "COALESCE({args[0]}, {args[1]})" for d in Dialect},
))
_register(FunctionDef(
    name="ZN", category=Category.LOGICAL,
    arg_types=(TypeConstraint.number(),), min_args=1, max_args=1,
    return_type=TypeConstraint.number(),
    sql_template={d: "COALESCE({args[0]}, 0)" for d in Dialect},
    docstring="zero-if-null per §V.5",
))
_register(FunctionDef(
    name="ISNULL", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} IS NULL)" for d in Dialect},
))
_register(FunctionDef(
    name="NOT", category=Category.LOGICAL,
    arg_types=(TypeConstraint.boolean(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "NOT ({args[0]})" for d in Dialect},
))
_register(FunctionDef(
    name="IN", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(),), min_args=2, max_args=-1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "{args[0]} IN ({rest})" for d in Dialect},
    docstring="parser also produces BinaryOp(op='IN', rhs=__TUPLE__)",
))


# Type conversion (§V.1)
for name, ret_kind, sql in (
    ("STR",      TypeKind.STRING,   "CAST({args[0]} AS VARCHAR)"),
    ("INT",      TypeKind.INTEGER,  "CAST({args[0]} AS BIGINT)"),
    ("FLOAT",    TypeKind.NUMBER,   "CAST({args[0]} AS DOUBLE)"),
    ("BOOL",     TypeKind.BOOLEAN,  "CAST({args[0]} AS BOOLEAN)"),
    ("DATE",     TypeKind.DATE,     "CAST({args[0]} AS DATE)"),
    ("DATETIME", TypeKind.DATETIME, "CAST({args[0]} AS TIMESTAMP)"),
):
    _register(FunctionDef(
        name=name, category=Category.TYPE_CONVERSION,
        arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
        return_type=TypeConstraint(ret_kind),
        sql_template={d: sql for d in Dialect},
    ))


# ---- String (§V.1) ----
def _str(name: str, n: int, ret: TypeConstraint, sql: str) -> None:
    _register(FunctionDef(
        name=name, category=Category.STRING,
        arg_types=tuple(TypeConstraint.any_() for _ in range(max(n, 1))),
        min_args=n, max_args=n if n >= 0 else -1,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_str("LEN", 1, TypeConstraint.integer(), "LENGTH({args[0]})")
_str("LEFT", 2, TypeConstraint.string(), "LEFT({args[0]}, {args[1]})")
_str("RIGHT", 2, TypeConstraint.string(), "RIGHT({args[0]}, {args[1]})")
_str("MID", 3, TypeConstraint.string(), "SUBSTRING({args[0]}, {args[1]}, {args[2]})")
_str("REPLACE", 3, TypeConstraint.string(), "REPLACE({args[0]}, {args[1]}, {args[2]})")
_str("UPPER", 1, TypeConstraint.string(), "UPPER({args[0]})")
_str("LOWER", 1, TypeConstraint.string(), "LOWER({args[0]})")
_str("LTRIM", 1, TypeConstraint.string(), "LTRIM({args[0]})")
_str("RTRIM", 1, TypeConstraint.string(), "RTRIM({args[0]})")
_str("TRIM", 1, TypeConstraint.string(), "TRIM({args[0]})")
_str("STARTSWITH", 2, TypeConstraint.boolean(), "({args[0]} LIKE {args[1]} || '%')")
_str("ENDSWITH", 2, TypeConstraint.boolean(), "({args[0]} LIKE '%' || {args[1]})")
_str("CONTAINS", 2, TypeConstraint.boolean(), "(POSITION({args[1]} IN {args[0]}) > 0)")
_str("SPLIT", 3, TypeConstraint.string(), "SPLIT_PART({args[0]}, {args[1]}, {args[2]})")
_str("FIND", 2, TypeConstraint.integer(), "POSITION({args[1]} IN {args[0]})")
_str("REGEXP_EXTRACT", 2, TypeConstraint.string(), "REGEXP_EXTRACT({args[0]}, {args[1]})")
_str("REGEXP_MATCH", 2, TypeConstraint.boolean(), "REGEXP_MATCHES({args[0]}, {args[1]})")
_str("REGEXP_REPLACE", 3, TypeConstraint.string(), "REGEXP_REPLACE({args[0]}, {args[1]}, {args[2]})")


# ---- Date (§V.1) ----
def _date(name: str, n_min: int, n_max: int, ret: TypeConstraint, sql: str) -> None:
    _register(FunctionDef(
        name=name, category=Category.DATE,
        arg_types=tuple(TypeConstraint.any_() for _ in range(max(n_min, 1))),
        min_args=n_min, max_args=n_max,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_date("DATEDIFF", 3, 4, TypeConstraint.integer(), "DATE_DIFF({args[0]}, {args[1]}, {args[2]})")
_date("DATETRUNC", 2, 3, TypeConstraint.datetime(), "DATE_TRUNC({args[0]}, {args[1]})")
_date("DATEPART", 2, 3, TypeConstraint.integer(), "DATE_PART({args[0]}, {args[1]})")
_date("DATEADD", 3, 3, TypeConstraint.datetime(), "DATE_ADD({args[1]}, INTERVAL ({args[1]}) {args[0]})")
_date("DATENAME", 2, 3, TypeConstraint.string(), "TO_CHAR({args[1]}, {args[0]})")
_date("MAKEDATE", 3, 3, TypeConstraint.date(), "MAKE_DATE({args[0]}, {args[1]}, {args[2]})")
_date("MAKEDATETIME", 2, 2, TypeConstraint.datetime(), "({args[0]} + {args[1]})")
_date("MAKETIME", 3, 3, TypeConstraint.datetime(), "MAKE_TIME({args[0]}, {args[1]}, {args[2]})")
_date("NOW", 0, 0, TypeConstraint.datetime(), "NOW()")
_date("TODAY", 0, 0, TypeConstraint.date(), "CURRENT_DATE")
_date("YEAR", 1, 1, TypeConstraint.integer(), "EXTRACT(YEAR FROM {args[0]})")
_date("QUARTER", 1, 1, TypeConstraint.integer(), "EXTRACT(QUARTER FROM {args[0]})")
_date("MONTH", 1, 1, TypeConstraint.integer(), "EXTRACT(MONTH FROM {args[0]})")
_date("WEEK", 1, 1, TypeConstraint.integer(), "EXTRACT(WEEK FROM {args[0]})")
_date("DAY", 1, 1, TypeConstraint.integer(), "EXTRACT(DAY FROM {args[0]})")
_date("HOUR", 1, 1, TypeConstraint.integer(), "EXTRACT(HOUR FROM {args[0]})")
_date("MINUTE", 1, 1, TypeConstraint.integer(), "EXTRACT(MINUTE FROM {args[0]})")
_date("SECOND", 1, 1, TypeConstraint.integer(), "EXTRACT(SECOND FROM {args[0]})")
_date("WEEKDAY", 1, 1, TypeConstraint.integer(), "EXTRACT(DOW FROM {args[0]})")


# ---- User (§V.1) ----
def _user(name: str, ret: TypeConstraint, sql: str) -> None:
    _register(FunctionDef(
        name=name, category=Category.USER,
        arg_types=(), min_args=0, max_args=0,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_user("USERNAME", TypeConstraint.string(), "{user_name}")
_user("FULLNAME", TypeConstraint.string(), "{user_full_name}")
_user("USERDOMAIN", TypeConstraint.string(), "{user_domain}")
_user("USER", TypeConstraint.string(), "{user_name}")  # Tableau alias
_register(FunctionDef(
    name="ISFULLNAME", category=Category.USER,
    arg_types=(TypeConstraint.string(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} = {user_full_name})" for d in Dialect},
))
_register(FunctionDef(
    name="ISUSERNAME", category=Category.USER,
    arg_types=(TypeConstraint.string(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} = {user_name})" for d in Dialect},
))
_register(FunctionDef(
    name="ISMEMBEROF", category=Category.USER,
    arg_types=(TypeConstraint.string(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} = ANY({user_groups}))" for d in Dialect},
))


# ---- Spatial (§V.1) ----
def _sp(name: str, n: int, ret: TypeConstraint, sql: str,
        arg: TypeConstraint = TypeConstraint.spatial()) -> None:
    _register(FunctionDef(
        name=name, category=Category.SPATIAL,
        arg_types=tuple(arg for _ in range(n)), min_args=n, max_args=n,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_sp("MAKEPOINT", 2, TypeConstraint.spatial(), "ST_POINT({args[0]}, {args[1]})", arg=TypeConstraint.number())
_sp("MAKELINE", 2, TypeConstraint.spatial(), "ST_MAKELINE({args[0]}, {args[1]})")
_sp("DISTANCE", 3, TypeConstraint.number(), "ST_DISTANCE({args[0]}, {args[1]})")
_sp("BUFFER", 3, TypeConstraint.spatial(), "ST_BUFFER({args[0]}, {args[1]})")
_sp("AREA", 2, TypeConstraint.number(), "ST_AREA({args[0]})")
_sp("INTERSECTS", 2, TypeConstraint.boolean(), "ST_INTERSECTS({args[0]}, {args[1]})")
_sp("OVERLAPS", 2, TypeConstraint.boolean(), "ST_OVERLAPS({args[0]}, {args[1]})")
_sp("DIFFERENCE", 2, TypeConstraint.spatial(), "ST_DIFFERENCE({args[0]}, {args[1]})")
_sp("UNION", 2, TypeConstraint.spatial(), "ST_UNION({args[0]}, {args[1]})")


# ---- Passthrough RAWSQL_* (§V.1) — feature-flagged ----
def _rawsql(suffix: str, ret: TypeConstraint) -> None:
    _register(FunctionDef(
        name=f"RAWSQL_{suffix}", category=Category.PASSTHROUGH,
        arg_types=(TypeConstraint.string(),), min_args=1, max_args=-1,
        return_type=ret,
        sql_template={d: "{rawsql}" for d in Dialect},
        docstring="dialect-specific literal — gated on FEATURE_RAWSQL_ENABLED",
    ))


_rawsql("BOOL", TypeConstraint.boolean())
_rawsql("INT", TypeConstraint.integer())
_rawsql("REAL", TypeConstraint.number())
_rawsql("STR", TypeConstraint.string())
_rawsql("DATE", TypeConstraint.date())
_rawsql("DATETIME", TypeConstraint.datetime())


# ---- Analytics extension stubs (§V.1) — Phase 12 wires the bridge ----
for _suffix, _ret in (("REAL", TypeConstraint.number()),
                      ("STR", TypeConstraint.string()),
                      ("INT", TypeConstraint.integer()),
                      ("BOOL", TypeConstraint.boolean())):
    _register(FunctionDef(
        name=f"SCRIPT_{_suffix}", category=Category.ANALYTICS_EXT,
        arg_types=(TypeConstraint.string(),), min_args=1, max_args=-1,
        return_type=_ret,
        sql_template={d: "" for d in Dialect},  # not emittable until Phase 12
        docstring="external Python/R analytics — Phase 12",
    ))


# ---- Table-calc names (§V.1) — full semantics in Plan 8c ----
_TABLE_CALCS = (
    "RUNNING_SUM", "RUNNING_AVG", "RUNNING_MIN", "RUNNING_MAX", "RUNNING_COUNT",
    "WINDOW_SUM", "WINDOW_AVG", "WINDOW_MIN", "WINDOW_MAX", "WINDOW_MEDIAN",
    "WINDOW_STDEV", "WINDOW_VAR", "WINDOW_PERCENTILE", "WINDOW_CORR", "WINDOW_COVAR",
    "INDEX", "FIRST", "LAST", "SIZE", "LOOKUP", "PREVIOUS_VALUE",
    "RANK", "RANK_DENSE", "RANK_MODIFIED", "RANK_UNIQUE", "RANK_PERCENTILE",
    "TOTAL", "PCT_TOTAL", "DIFF", "IS_DISTINCT", "IS_STACKED",
)
for _name in _TABLE_CALCS:
    _register(FunctionDef(
        name=_name, category=Category.TABLE_CALC,
        arg_types=(TypeConstraint.any_(),),
        min_args=0, max_args=-1,
        return_type=TypeConstraint.any_(),
        sql_template={d: "" for d in Dialect},  # Plan 8c emits via window fn lowering
        is_table_calc=True,
        docstring="table calculation — semantics in Plan 8c",
    ))


__all__ = [
    "TypeKind", "Category", "TypeConstraint", "ReturnType",
    "FunctionDef", "FUNCTIONS", "Dialect",
]
