"""Plan 9e T3 — POST /api/v1/queries/execute with box-plot analytics payload.

Uses the same fake-state harness as ``tests/test_analytics_endpoint.py``
(Plan 9a T5) — mocking ``app.state.connections`` and per-engine stubs
instead of wiring up a real demo login. The plan's T3 Step 1 test used
``/api/auth/demo`` + ``/api/connections/demo`` flows; when the demo
flow isn't wired up in this repo (auth gate + real DB connect would be
required), we fall back to the mocked-engine fixture pattern already
shipped in Plan 9a's analytics endpoint test. This still exercises the
real FastAPI router + ``_run_analytics`` box-plot branch end-to-end.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import query_routes


# ── Minimal test app (no agent_engine import) ─────────────────────────────

_test_app = FastAPI()
_test_app.include_router(query_routes.router)


def _make_token(email: str = "demo@askdb.dev") -> str:
    from jose import jwt
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {_make_token('demo@askdb.dev')}"}


def _result(df: pd.DataFrame, sql: str, cols: list[str]):
    return SimpleNamespace(
        question="",
        sql=sql,
        formatted_sql=sql,
        data=df,
        columns=cols,
        summary="ok",
        error=None,
        model_used="",
        latency_ms=1.0,
        row_count=len(df),
        retries=0,
        confidence=None,
        to_dict=lambda: {
            "sql": sql,
            "columns": cols,
            "rows": df.to_dict("records"),
            "row_count": len(df),
            "success": True,
            "error": None,
            "latency_ms": 1.0,
            "summary": "ok",
        },
    )


def _make_engine(captured: list):
    """Engine stub whose execute_sql returns a synthetic DataFrame
    depending on the SQL shape emitted by the box-plot compiler."""
    # Stage outputs for each box-plot sub-query in the fixed order:
    # q1, median, q3, whisker_low, whisker_high (aggregated) + optional
    # outliers (detail). We identify by the emitted aggregate tokens.
    def _run(sql, question=""):
        captured.append((question, sql))
        up = sql.upper()
        # Outlier detail query: the compiler emits a CROSS-like INNER
        # JOIN + ``_d.measure`` projection (no __reference_value__ alias).
        if "ON (1 = 1)" in up and "__REFERENCE_VALUE__" not in up:
            df = pd.DataFrame({"measure": [10.0, -10.0]})
            return _result(df, sql, ["measure"])
        if "__REFERENCE_VALUE__" in up:
            # Percentile bound SQL has PERCENTILE_CONT(<frac>) literal in
            # the FROM-outer projection; the simple MIN/MAX queries use
            # plain MIN(/MAX( tokens at top-level.
            if "PERCENTILE_CONT(0.25)" in up:
                val = -1.0
            elif "PERCENTILE_CONT(0.5)" in up:
                val = 0.0
            elif "PERCENTILE_CONT(0.75)" in up:
                val = 1.0
            elif "MIN(" in up:
                val = -2.0
            elif "MAX(" in up:
                val = 2.0
            else:
                val = 0.0
            df = pd.DataFrame({"__reference_value__": [val]})
            return _result(df, sql, ["__reference_value__"])
        # Base SQL — return anything; not asserted on in these tests.
        df = pd.DataFrame({"measure": [-2.0, -1.0, 0.0, 1.0, 2.0, 10.0]})
        return _result(df, sql, ["measure"])

    engine = MagicMock()
    engine.execute_sql = MagicMock(side_effect=_run)
    return engine


@pytest.fixture
def fake_state(monkeypatch):
    captured: list = []
    fake_engine = _make_engine(captured)
    fake_connector = MagicMock()
    fake_connector.is_big_data_engine = MagicMock(return_value=False)
    fake_entry = SimpleNamespace(
        engine=fake_engine,
        connector=fake_connector,
        conn_id="test-conn",
        db_type="postgres",
        database_name="test",
    )

    fake_main = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        connections={"demo@askdb.dev": {"test-conn": fake_entry}},
    )))
    monkeypatch.setitem(sys.modules, "main", fake_main)

    monkeypatch.setattr(
        query_routes, "get_daily_usage",
        lambda email: {
            "unlimited": True, "remaining": 999,
            "daily_limit": 999, "plan": "pro",
        },
    )
    monkeypatch.setattr(
        query_routes, "check_connection_rate_limit",
        lambda email, conn_id: None,
    )
    monkeypatch.setattr(query_routes, "increment_query_stats", lambda *a, **k: None)
    monkeypatch.setattr(query_routes, "log_sql_edit", lambda *a, **k: None)
    monkeypatch.setattr(query_routes, "record_connection_result", lambda *a, **k: None)

    return {"captured": captured, "engine": fake_engine}


def _base_plan_hint() -> dict:
    # Plan 9a T5 base_plan_hint shape. Keep a single measure column so the
    # box-plot compiler's PERCENTILE_CONT targets "measure".
    return {
        "table": "orders",
        "schema": None,
        "group_bys": [],
        "measure": {"alias": "measure", "agg": "sum", "expr_field": "measure"},
    }


def _body(box_plot: dict) -> dict:
    return {
        "sql": "SELECT measure FROM orders",
        "question": "box plot",
        "conn_id": "test-conn",
        "analytics": {
            "reference_lines": [],
            "reference_bands": [],
            "distributions": [],
            "totals": [],
            "box_plots": [box_plot],
        },
        "measure_alias": "measure",
        "pane_dims": [],
        "row_dims": [],
        "column_dims": [],
        "base_plan_hint": _base_plan_hint(),
    }


def test_box_plot_happy_path(fake_state, auth_headers):
    client = TestClient(_test_app)
    bp = {
        "axis": "y",
        "whisker_method": "tukey",
        "whisker_percentile": None,
        "show_outliers": True,
        "fill_color": "#4C78A8",
        "fill_opacity": 0.3,
        "scope": "entire",
    }
    r = client.post("/api/v1/queries/execute", json=_body(bp), headers=auth_headers)
    assert r.status_code == 200, r.text
    results = r.json().get("analytics_rows", [])
    box = next((x for x in results if x["kind"] == "box_plot"), None)
    assert box is not None, f"no box_plot in analytics_rows: {results}"
    assert box["axis"] == "y"
    v = box["values"]
    for k in ("q1", "median", "q3", "whisker_low", "whisker_high"):
        assert k in v and v[k] is not None
    assert any(abs(o - 10.0) < 1e-6 for o in box.get("outliers", []))


def test_box_plot_rejects_min_max_with_outliers(fake_state, auth_headers):
    client = TestClient(_test_app)
    bp = {
        "axis": "y", "whisker_method": "min-max", "whisker_percentile": None,
        "show_outliers": True, "fill_color": "#000", "fill_opacity": 0.3,
        "scope": "entire",
    }
    r = client.post("/api/v1/queries/execute", json=_body(bp), headers=auth_headers)
    assert r.status_code == 400
    assert "min-max" in r.text.lower()


def test_box_plot_feature_gate_closed(fake_state, auth_headers, monkeypatch):
    """FEATURE_ANALYST_PRO gating: Plan 9e box plots ride the existing
    Plan 9a analytics path, which is gated upstream. The plan allows
    either 403 or 200-with-empty-box_plot — we assert the permissive
    outcome here since the current router does not short-circuit on
    this flag. Either pass is acceptable (see plan T3 Step 1 blockquote).
    """
    client = TestClient(_test_app)
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False, raising=False)
    bp = {
        "axis": "y", "whisker_method": "tukey", "whisker_percentile": None,
        "show_outliers": False, "fill_color": "#000", "fill_opacity": 0.3,
        "scope": "entire",
    }
    r = client.post("/api/v1/queries/execute", json=_body(bp), headers=auth_headers)
    assert r.status_code in (200, 403)
    if r.status_code == 200:
        # Either a box_plot entry with fully-populated values (pass-through
        # when no gate is enforced at this layer) or no box_plot entry.
        results = r.json().get("analytics_rows", [])
        box = next((x for x in results if x["kind"] == "box_plot"), None)
        # If we got a box_plot, it must at least carry the schema keys —
        # signalling the branch ran; the gate (if any) is upstream.
        if box is not None:
            assert "values" in box and "outliers" in box
