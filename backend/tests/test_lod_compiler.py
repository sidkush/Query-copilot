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
