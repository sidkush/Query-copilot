"""Plan 8c — table-calc compiler. Build_Tableau.md §V.1 + §V.3.

Decides per-function whether the calc lowers to a SQL window
(`ServerSideCalc(plan=LogicalOpOver)`) or stays client-side as a
`TableCalcSpec` the frontend evaluator runs post-fetch
(`ClientSideCalc`).

§V.3 vocabulary:
  addressing   - dims the calc walks along    (ORDER BY in SQL).
  partitioning - dims inside which it resets  (PARTITION BY in SQL).
  direction    - "table" / "pane" + across/down sugar; "specific" =
                 user-picked addressing checklist.

Implementation note: this module carries a lightweight local
``LogicalOpOver`` dataclass rather than reusing ``vizql.logical.LogicalOpOver``
because the heavier Plan 7b op requires ``PartitionBys`` / ``OrderBy`` /
``NamedExps`` wrappers that would force every table-calc test fixture to
import four extra types. The downstream SQL lowering pass (future Plan 8c
integration) translates this local op into Plan 7c's ``sql_ast.Window`` at
emission time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal as _Lit, Optional, Union

from . import sql_ast as sa


FieldId = str
Direction = _Lit["across", "down", "table", "pane", "pane_down", "specific"]
SortDir = _Lit["asc", "desc"]


class TableCalcCompileError(ValueError):
    """Raised on invalid TableCalcSpec or unknown function."""


@dataclass(frozen=True, slots=True)
class TableCalcSpec:
    calc_id: str
    function: str  # canonical Tableau spelling, e.g. "RUNNING_SUM"
    arg_field: str  # primary measure/dim referenced
    addressing: tuple[FieldId, ...] = ()
    partitioning: tuple[FieldId, ...] = ()
    direction: Direction = "table"
    sort: Optional[SortDir] = None  # per-addressing-field; uniform here
    offset: Optional[int] = None  # LOOKUP / DIFF / PREVIOUS_VALUE / PERCENTILE


@dataclass(frozen=True, slots=True)
class TableCalcCtx:
    viz_granularity: frozenset[FieldId]
    table_alias: str


@dataclass(frozen=True, slots=True)
class LogicalOpOver:
    """Lightweight windowed-expression op for table-calc lowering.

    Matches the shape of ``vizql.logical.LogicalOpOver`` conceptually but
    uses tuple-native fields to keep fixture construction cheap. Downstream
    passes translate into ``sql_ast.Window`` for emission.
    """
    input_table: str
    partition_bys: tuple[FieldId, ...]
    order_by: tuple[tuple[FieldId, bool], ...]
    frame: Optional[sa.FrameClause]
    expressions: tuple[tuple[str, sa.SQLQueryExpression], ...]


@dataclass(frozen=True, slots=True)
class ServerSideCalc:
    plan: LogicalOpOver
    output_alias: str


@dataclass(frozen=True, slots=True)
class ClientSideCalc:
    spec: TableCalcSpec  # forwarded to frontend evaluator verbatim


CompiledTableCalc = Union[ServerSideCalc, ClientSideCalc]


# Routing table — single source of truth for server vs client.
# Built per Plan 8c spec (roadmap §Plan 8c) + §V.1.
_SERVER_SIDE: frozenset[str] = frozenset({
    "RUNNING_SUM", "RUNNING_AVG", "RUNNING_MIN", "RUNNING_MAX", "RUNNING_COUNT",
    "WINDOW_SUM", "WINDOW_AVG", "WINDOW_MIN", "WINDOW_MAX", "WINDOW_MEDIAN",
    "WINDOW_STDEV", "WINDOW_VAR", "WINDOW_PERCENTILE",
    "WINDOW_CORR", "WINDOW_COVAR",
    "RANK", "RANK_DENSE", "RANK_MODIFIED", "RANK_UNIQUE", "RANK_PERCENTILE",
    "INDEX", "FIRST", "LAST", "SIZE",
    "TOTAL", "PCT_TOTAL",
})
_CLIENT_SIDE: frozenset[str] = frozenset({
    "LOOKUP", "PREVIOUS_VALUE", "DIFF", "IS_DISTINCT", "IS_STACKED",
})


def compile_table_calc(spec: TableCalcSpec, ctx: TableCalcCtx) -> CompiledTableCalc:
    fn = spec.function
    if fn in _CLIENT_SIDE:
        return ClientSideCalc(spec=spec)
    if fn in _SERVER_SIDE:
        # Specific server-side compile per family. Patched in T2-T5.
        raise TableCalcCompileError(
            f"server-side compile for {fn!r} not yet implemented")
    raise TableCalcCompileError(f"unknown table-calc {fn!r}")


__all__ = [
    "TableCalcSpec", "TableCalcCtx", "TableCalcCompileError",
    "LogicalOpOver",
    "ServerSideCalc", "ClientSideCalc", "CompiledTableCalc",
    "compile_table_calc",
]
