"""Plan 9e T2 — compile_box_plot emits the right SQL envelope + correct numerics.

References:
  Build_Tableau §XIII.1 (box plot catalogue).
  Build_Tableau Appendix B — PERCENTILE_CONT + WITHIN GROUP grammar.

The plan's original test used ``lg.LogicalOpInlineRows`` + ``lg.FieldRef``
which do not exist in this codebase. We adapt: load each fixture into a
DuckDB table called ``orders`` and use ``LogicalOpProject`` over a
``LogicalOpRelation`` as the base plan — which compiles to
``SELECT measure AS measure FROM orders AS t1``. The emitted analytics
SQL then references that table by name; the test harness creates a
fresh DuckDB connection per test with the fixture loaded so DuckDB can
evaluate the queries.
"""
import json
from pathlib import Path

import duckdb

from sql_validator import SQLValidator
from vizql import logical as lg
from vizql.box_plot import BoxPlotSpec
from vizql.box_plot_compiler import compile_box_plot

FIXTURES = Path(__file__).parent / "fixtures" / "box_plot"


def _load(name: str) -> list[float]:
    return list(json.loads((FIXTURES / name).read_text())["measure"])


def _base_plan() -> lg.LogicalOp:
    """Pass-through projection of ``measure`` from the ``orders`` table.
    Keeps rows unaggregated so PERCENTILE_CONT runs over individual
    values instead of a single aggregate.
    """
    rel = lg.LogicalOpRelation(table="orders")
    return lg.LogicalOpProject(
        input=rel,
        renames=(),
        expressions=lg.NamedExps(
            entries=(("measure", lg.Column(field_id="measure")),),
        ),
        calculated_column=(),
    )


def _con_with_data(rows: list[float]) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("CREATE TABLE orders (measure DOUBLE)")
    con.executemany("INSERT INTO orders VALUES (?)", [(v,) for v in rows])
    return con


def _run_query(con: duckdb.DuckDBPyConnection, fn) -> list[dict]:
    sql = fn.to_sql_generic()
    ok, clean, err = SQLValidator().validate(sql)
    assert ok, f"SQLValidator rejected emitted SQL: {err}\n{sql}"
    df = con.execute(clean).df()
    return df.to_dict("records")


def test_tukey_emits_5_queries_when_no_outliers():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 5  # q1, median, q3, min, max


def test_tukey_emits_6_queries_with_outliers():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 6  # q1, median, q3, min, max, outliers


def test_min_max_emits_5_queries():
    spec = BoxPlotSpec(
        axis="y", whisker_method="min-max", whisker_percentile=None,
        show_outliers=False, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 5


def test_percentile_mode_emits_specified_bounds():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=(10, 90),
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    assert len(fns) == 6  # q1, median, q3, p10, p90, outliers
    sqls = [fn.to_sql_generic() for fn in fns]
    pct_sqls = [s for s in sqls if "PERCENTILE_CONT" in s]
    assert any("0.1" in s for s in pct_sqls), f"no 0.1 bound: {pct_sqls}"
    assert any("0.9" in s for s in pct_sqls), f"no 0.9 bound: {pct_sqls}"


def test_gaussian_quartiles_match_analytical():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    con = _con_with_data(_load("normal-1k.json"))
    q1  = _run_query(con, fns[0])[0]["__reference_value__"]
    med = _run_query(con, fns[1])[0]["__reference_value__"]
    q3  = _run_query(con, fns[2])[0]["__reference_value__"]
    assert abs(q1 - (-0.6745)) < 0.1
    assert abs(med - 0.0) < 0.1
    assert abs(q3 - 0.6745) < 0.1


def test_spiked_outliers_caught():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    con = _con_with_data(_load("spiked-plus-minus-10.json"))
    # Last fn is the outlier detail query.
    outlier_rows = _run_query(con, fns[-1])
    vals = sorted(r["measure"] for r in outlier_rows)
    # The ±10 spikes must be caught. A Gaussian(0,1) with n=1000 also has
    # natural tails beyond 1.5·IQR (~±2.7), so the outlier set contains
    # additional samples — the plan's "exactly 2" assertion reflected
    # analytical IQR bounds, not the actual Tukey cutoffs on a 1k sample.
    # We assert the spikes are present AND are the extremes.
    assert -10.0 in vals and 10.0 in vals
    assert vals[0] == -10.0 and vals[-1] == 10.0


def test_every_emitted_query_passes_validator():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=True, fill_color="#4C78A8", fill_opacity=0.3, scope="entire",
    )
    fns = compile_box_plot(
        spec=spec, base_plan=_base_plan(),
        measure_alias="measure", pane_dims=(),
    )
    v = SQLValidator()
    for fn in fns:
        ok, _, err = v.validate(fn.to_sql_generic())
        assert ok, f"SQLValidator rejected: {err}"
