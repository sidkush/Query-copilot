"""Plan 8b — LOD compiler (FIXED/INCLUDE/EXCLUDE → sa.Subquery / sa.Window).

Imports use `from vizql ...` (not `from backend.vizql ...`) because
`backend/` is on sys.path via the same insert pattern used by
`test_calc_parser.py` / `test_calc_compile.py`. Run from `backend/`:

    python -m pytest tests/test_lod_compiler.py -v
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


def test_module_exports():
    from vizql import lod_compiler as lc

    assert hasattr(lc, "compile_lod")
    assert hasattr(lc, "CompiledLod")
    assert hasattr(lc, "LodCompileError")
    assert hasattr(lc, "LodCompileCtx")


def test_compiled_lod_is_frozen():
    from vizql import lod_compiler as lc
    from vizql import sql_ast as sa

    c = lc.CompiledLod(
        expr=sa.Literal(value=1, data_type="integer"),
        kind="FIXED",
        stage="fixed_lod",
        warnings=(),
    )
    with pytest.raises(Exception):  # frozen dataclass
        c.kind = "INCLUDE"  # type: ignore[misc]


def test_lod_compile_ctx_defaults_empty_granularity():
    from vizql import lod_compiler as lc

    ctx = lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={"Sales": "number", "Region": "string", "City": "string"},
        table_alias="t",
    )
    assert ctx.viz_granularity == frozenset()


def test_compile_lod_raises_on_non_lod_expr():
    from vizql import lod_compiler as lc
    from vizql import calc_ast as ca

    ctx = lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={"Sales": "number"},
        table_alias="t",
    )
    with pytest.raises(lc.LodCompileError):
        lc.compile_lod(
            ca.Literal(value=1, data_type="integer"),  # type: ignore[arg-type]
            ctx,
        )


# ---------------------------------------------------------------------------
# Task 2 — FIXED LOD -> correlated subquery
# ---------------------------------------------------------------------------


def _ctx(granularity: frozenset[str] = frozenset()):
    from vizql import lod_compiler as lc

    return lc.LodCompileCtx(
        dialect=lc.Dialect.DUCKDB,
        schema={
            "Sales": "number", "Region": "string", "City": "string",
            "Segment": "string", "Product": "string", "Profit": "number",
        },
        table_alias="t",
        viz_granularity=granularity,
    )


def _fixed(dims, body_field: str = "Sales", body_fn: str = "SUM"):
    from vizql import calc_ast as ca

    return ca.LodExpr(
        kind="FIXED",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name=body_fn, args=(ca.FieldRef(field_name=body_field),)),
    )


def test_fixed_lod_emits_subquery_with_correlation_on_shared_dims():
    from vizql import lod_compiler as lc
    from vizql import sql_ast as sa

    expr = _fixed(("Region",))
    ctx = _ctx(frozenset({"Region", "City"}))
    out = lc.compile_lod(expr, ctx)

    assert out.kind == "FIXED"
    assert out.stage == "fixed_lod"
    assert isinstance(out.expr, sa.Subquery)
    assert out.expr.correlated_on == (("Region", "Region"),)
    inner = out.expr.query
    assert [p.alias for p in inner.projections] == ["_lod_val"]
    assert any(
        isinstance(g, sa.Column) and g.name == "Region"
        for g in inner.group_by
    )


def test_fixed_lod_broadcast_when_viz_shares_no_dim_with_fixed():
    from vizql import lod_compiler as lc
    from vizql import sql_ast as sa

    expr = _fixed(("Region",))
    ctx = _ctx(frozenset({"City"}))
    out = lc.compile_lod(expr, ctx)

    assert isinstance(out.expr, sa.Subquery)
    assert out.expr.correlated_on == ()  # broadcast -- single scalar
    inner = out.expr.query
    assert any(isinstance(g, sa.Column) and g.name == "Region" for g in inner.group_by)


def test_fixed_lod_multiple_fixed_dims_correlation_is_intersection():
    from vizql import lod_compiler as lc
    from vizql import sql_ast as sa

    expr = _fixed(("Region", "City"))
    ctx = _ctx(frozenset({"Region", "City", "Segment"}))
    out = lc.compile_lod(expr, ctx)

    assert isinstance(out.expr, sa.Subquery)
    # deterministic ordering: by appearance in expr.dims
    assert out.expr.correlated_on == (("Region", "Region"), ("City", "City"))


def test_fixed_lod_rejects_unknown_dim():
    from vizql import lod_compiler as lc

    expr = _fixed(("NotAColumn",))
    ctx = _ctx(frozenset({"Region"}))
    with pytest.raises(lc.LodCompileError) as exc:
        lc.compile_lod(expr, ctx)
    assert "NotAColumn" in str(exc.value)


def test_fixed_lod_preserves_body_aggregate_name():
    from vizql import lod_compiler as lc
    from vizql import sql_ast as sa

    expr = _fixed(("Region",), body_field="Sales", body_fn="AVG")
    ctx = _ctx(frozenset({"Region"}))
    out = lc.compile_lod(expr, ctx)
    assert isinstance(out.expr, sa.Subquery)
    inner = out.expr.query
    agg = inner.projections[0].expression
    assert isinstance(agg, sa.FnCall)
    assert agg.name == "AVG"
