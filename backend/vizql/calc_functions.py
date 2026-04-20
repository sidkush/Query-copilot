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


__all__ = [
    "TypeKind", "Category", "TypeConstraint", "ReturnType",
    "FunctionDef", "FUNCTIONS", "Dialect",
]
