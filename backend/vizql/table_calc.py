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


# Mapping canonical Tableau WINDOW_* names -> SQL aggregate.
_WINDOW_AGG: dict[str, str] = {
    "WINDOW_SUM":    "SUM",
    "WINDOW_AVG":    "AVG",
    "WINDOW_MIN":    "MIN",
    "WINDOW_MAX":    "MAX",
    "WINDOW_MEDIAN": "MEDIAN",
    "WINDOW_STDEV":  "STDDEV",
    "WINDOW_VAR":    "VARIANCE",
}


def _arg_col(spec: TableCalcSpec, ctx: TableCalcCtx) -> sa.Column:
    return sa.Column(name=spec.arg_field, table_alias=ctx.table_alias)


def _order_by_pairs(spec: TableCalcSpec) -> tuple[tuple[str, bool], ...]:
    """Return ((field, asc_bool), …) for LogicalOpOver.order_by.

    Default direction = ascending. `spec.sort='desc'` flips every
    addressing field. (Per-field sort lands in Task 9 UI.)
    """
    asc = spec.sort != "desc"
    return tuple((f, asc) for f in spec.addressing)


def _make_over(
    body: sa.SQLQueryExpression,
    spec: TableCalcSpec,
    ctx: TableCalcCtx,
    *,
    output_alias: str,
    frame: Optional[sa.FrameClause] = None,
) -> ServerSideCalc:
    plan = LogicalOpOver(
        input_table=ctx.table_alias,
        partition_bys=tuple(spec.partitioning),
        order_by=_order_by_pairs(spec),
        frame=frame,
        expressions=((output_alias, body),),
    )
    return ServerSideCalc(plan=plan, output_alias=output_alias)


def _compile_window_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    if spec.function in _WINDOW_AGG:
        agg = _WINDOW_AGG[spec.function]
        body = sa.FnCall(name=agg, args=(_arg_col(spec, ctx),))
        return _make_over(body, spec, ctx, output_alias=spec.calc_id)
    if spec.function == "WINDOW_PERCENTILE":
        if spec.offset is None:
            raise TableCalcCompileError(
                "WINDOW_PERCENTILE requires offset (percentile)")
        body = sa.FnCall(
            name="PERCENTILE_CONT",
            args=(sa.Literal(value=spec.offset, data_type="int"),
                  _arg_col(spec, ctx)),
        )
        return _make_over(body, spec, ctx, output_alias=spec.calc_id)
    if spec.function in ("WINDOW_CORR", "WINDOW_COVAR"):
        # arg_field carries `<measureA>,<measureB>` pair (UI splits)
        if "," not in spec.arg_field:
            raise TableCalcCompileError(
                f"{spec.function} requires arg_field='<a>,<b>'")
        a, b = (s.strip() for s in spec.arg_field.split(",", 1))
        sql_fn = "CORR" if spec.function == "WINDOW_CORR" else "COVAR_SAMP"
        body = sa.FnCall(
            name=sql_fn,
            args=(sa.Column(name=a, table_alias=ctx.table_alias),
                  sa.Column(name=b, table_alias=ctx.table_alias)),
        )
        return _make_over(body, spec, ctx, output_alias=spec.calc_id)
    raise TableCalcCompileError(f"WINDOW family fallthrough: {spec.function}")


_RUNNING_AGG: dict[str, str] = {
    "RUNNING_SUM": "SUM", "RUNNING_AVG": "AVG", "RUNNING_MIN": "MIN",
    "RUNNING_MAX": "MAX", "RUNNING_COUNT": "COUNT",
}


def _compile_running_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    agg = _RUNNING_AGG[spec.function]
    body = sa.FnCall(name=agg, args=(_arg_col(spec, ctx),))
    frame = sa.FrameClause(
        kind="ROWS",
        start=("UNBOUNDED", 0),
        end=("CURRENT_ROW", 0),
    )
    return _make_over(body, spec, ctx, output_alias=spec.calc_id, frame=frame)


_RANK_SQL: dict[str, str] = {
    "RANK":            "RANK",
    "RANK_DENSE":      "DENSE_RANK",
    "RANK_MODIFIED":   "RANK",
    "RANK_UNIQUE":     "ROW_NUMBER",
    "RANK_PERCENTILE": "PERCENT_RANK",
}


def _compile_rank_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    sql_fn = _RANK_SQL[spec.function]
    # RANK family takes no measure-arg in the call body; the measure is the
    # ORDER BY column. Spec.sort defaults desc=True for RANK per Tableau UX.
    body = sa.FnCall(name=sql_fn, args=())
    # Force the order_by to the measure (arg_field) when the user hasn't
    # picked an explicit addressing — matches Tableau's "rank by the measure
    # this is computing" default.
    if not spec.addressing and spec.arg_field:
        spec = TableCalcSpec(
            calc_id=spec.calc_id, function=spec.function,
            arg_field=spec.arg_field, addressing=(spec.arg_field,),
            partitioning=spec.partitioning,
            direction=spec.direction, sort=spec.sort or "desc",
            offset=spec.offset,
        )
    return _make_over(body, spec, ctx, output_alias=spec.calc_id)


def _compile_index_first_last_size(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    fn = spec.function
    if fn == "INDEX":
        body = sa.FnCall(name="ROW_NUMBER", args=())
    elif fn == "FIRST":
        # FIRST() = 1 - ROW_NUMBER() OVER(...)  — distance-from-first.
        body = sa.BinaryOp(
            op="-",
            left=sa.Literal(value=1, data_type="int"),
            right=sa.FnCall(name="ROW_NUMBER", args=()),
        )
    elif fn == "LAST":
        # LAST() = COUNT(*) OVER(...) - ROW_NUMBER() OVER(...)
        body = sa.BinaryOp(
            op="-",
            left=sa.FnCall(name="COUNT",
                           args=(sa.Literal(value="*", data_type="string"),)),
            right=sa.FnCall(name="ROW_NUMBER", args=()),
        )
    elif fn == "SIZE":
        body = sa.FnCall(name="COUNT",
                         args=(sa.Literal(value="*", data_type="string"),))
    else:  # pragma: no cover
        raise TableCalcCompileError(f"unhandled INDEX/FIRST/LAST/SIZE: {fn}")
    return _make_over(body, spec, ctx, output_alias=spec.calc_id)


def _compile_total_family(spec: TableCalcSpec, ctx: TableCalcCtx) -> ServerSideCalc:
    sum_body = sa.FnCall(name="SUM", args=(_arg_col(spec, ctx),))
    frame = sa.FrameClause(
        kind="ROWS",
        start=("UNBOUNDED", 0),
        end=("UNBOUNDED", 0),
    )
    if spec.function == "TOTAL":
        return _make_over(sum_body, spec, ctx, output_alias=spec.calc_id,
                          frame=frame)
    # PCT_TOTAL = arg_field / SUM(arg_field) OVER(...)
    body = sa.BinaryOp(
        op="/",
        left=_arg_col(spec, ctx),
        right=sum_body,
    )
    return _make_over(body, spec, ctx, output_alias=spec.calc_id, frame=frame)


def compile_table_calc(spec: TableCalcSpec, ctx: TableCalcCtx) -> CompiledTableCalc:
    fn = spec.function
    if fn in _CLIENT_SIDE:
        return ClientSideCalc(spec=spec)
    if fn in _RUNNING_AGG:
        return _compile_running_family(spec, ctx)
    if fn in _RANK_SQL:
        return _compile_rank_family(spec, ctx)
    if fn in ("INDEX", "FIRST", "LAST", "SIZE"):
        return _compile_index_first_last_size(spec, ctx)
    if fn in ("TOTAL", "PCT_TOTAL"):
        return _compile_total_family(spec, ctx)
    if fn.startswith("WINDOW_"):
        return _compile_window_family(spec, ctx)
    if fn in _SERVER_SIDE:
        raise TableCalcCompileError(
            f"server-side compile for {fn!r} not yet implemented")
    raise TableCalcCompileError(f"unknown table-calc {fn!r}")


__all__ = [
    "TableCalcSpec", "TableCalcCtx", "TableCalcCompileError",
    "LogicalOpOver",
    "ServerSideCalc", "ClientSideCalc", "CompiledTableCalc",
    "compile_table_calc",
]
