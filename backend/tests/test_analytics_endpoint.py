"""Plan 9a T5 — /queries/execute analytics payload.

Integration tests for the analytics extension on the /queries/execute
endpoint. Every generated analytics SQL must pass SQLValidator before
execution. Constant reference lines short-circuit (C7). Missing
base_plan_hint returns 422 (C8).
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
    depending on the SQL shape. Captures every SQL string for assertions."""
    def _run(sql, question=""):
        captured.append((question, sql))
        up = sql.upper()
        # Reference line / band: expose __reference_value__
        if "__REFERENCE_VALUE__" in up:
            df = pd.DataFrame({"__reference_value__": [42.0]})
            return _result(df, sql, ["__reference_value__"])
        # Grand total: single row with __total_value__
        if "__TOTAL_VALUE__" in up:
            df = pd.DataFrame({"__total_value__": [1000.0]})
            return _result(df, sql, ["__total_value__"])
        # Subtotal: one row per kept dim value
        if "__SUBTOTAL_VALUE__" in up:
            if "REGION" in up:
                df = pd.DataFrame({
                    "region": ["East", "West"],
                    "__subtotal_value__": [100.0, 200.0],
                })
                return _result(df, sql, ["region", "__subtotal_value__"])
            if "CATEGORY" in up:
                df = pd.DataFrame({
                    "category": ["A", "B"],
                    "__subtotal_value__": [60.0, 240.0],
                })
                return _result(df, sql, ["category", "__subtotal_value__"])
            df = pd.DataFrame({"__subtotal_value__": [300.0]})
            return _result(df, sql, ["__subtotal_value__"])
        # Base query — two rows matching "region, sum_sales"
        df = pd.DataFrame({
            "region": ["East", "West"],
            "sum_sales": [100.0, 200.0],
        })
        return _result(df, sql, ["region", "sum_sales"])

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


# ── Helpers for the request body ──────────────────────────────────────────

def _base_plan_hint_region() -> dict:
    return {
        "table": "orders",
        "schema": None,
        "group_bys": ["region"],
        "measure": {"alias": "sum_sales", "agg": "sum", "expr_field": "sales"},
    }


def _base_plan_hint_region_cat() -> dict:
    return {
        "table": "orders",
        "schema": None,
        "group_bys": ["region", "category"],
        "measure": {"alias": "sum_sales", "agg": "sum", "expr_field": "sales"},
    }


# ── Tests ─────────────────────────────────────────────────────────────────

def test_execute_without_analytics_payload_unchanged_response(fake_state, auth_headers):
    """Regression: when analytics is None, the response shape is unchanged
    (no analytics_rows key)."""
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT region, SUM(sales) AS sum_sales FROM orders GROUP BY region",
            "question": "by region",
            "conn_id": "test-conn",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "rows" in data
    assert "analytics_rows" not in data


def test_execute_without_base_plan_hint_returns_422(fake_state, auth_headers):
    """analytics payload present, base_plan_hint missing → 422."""
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT region, SUM(sales) AS sum_sales FROM orders GROUP BY region",
            "question": "q",
            "conn_id": "test-conn",
            "analytics": {
                "reference_lines": [{
                    "axis": "y", "aggregation": "mean", "scope": "entire",
                    "label": "value", "custom_label": "",
                    "line_style": "solid", "color": "#4C78A8",
                    "show_marker": True,
                    "value": None, "percentile": None,
                }],
                "reference_bands": [], "distributions": [], "totals": [],
            },
            "measure_alias": "sum_sales",
            "pane_dims": ["region"],
            "row_dims": ["region"],
            "column_dims": [],
            # base_plan_hint intentionally omitted
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "base_plan_hint_required_for_analytics" in resp.json()["detail"]


def test_execute_with_reference_line_returns_analytics_rows(fake_state, auth_headers):
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT region, SUM(sales) AS sum_sales FROM orders GROUP BY region",
            "question": "by region",
            "conn_id": "test-conn",
            "analytics": {
                "reference_lines": [{
                    "axis": "y", "aggregation": "mean", "scope": "entire",
                    "label": "computation", "custom_label": "",
                    "line_style": "solid", "color": "#4C78A8",
                    "show_marker": True,
                    "value": None, "percentile": None,
                }],
                "reference_bands": [], "distributions": [], "totals": [],
            },
            "measure_alias": "sum_sales",
            "pane_dims": ["region"],
            "row_dims": ["region"],
            "column_dims": [],
            "base_plan_hint": _base_plan_hint_region(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "rows" in data
    assert "analytics_rows" in data
    assert len(data["analytics_rows"]) == 1
    entry = data["analytics_rows"][0]
    assert entry["kind"] == "reference_line"
    assert entry["axis"] == "y"
    assert isinstance(entry["value"], (int, float))
    assert entry["value"] == pytest.approx(42.0)


def test_execute_with_constant_reference_line_short_circuits(fake_state, auth_headers):
    """Constant reference lines must NOT run SQL (C7)."""
    client = TestClient(_test_app)
    engine = fake_state["engine"]
    captured = fake_state["captured"]

    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT region, SUM(sales) AS sum_sales FROM orders GROUP BY region",
            "question": "by region",
            "conn_id": "test-conn",
            "analytics": {
                "reference_lines": [{
                    "axis": "y", "aggregation": "constant", "scope": "entire",
                    "label": "value", "custom_label": "",
                    "line_style": "dashed", "color": "#d62728",
                    "show_marker": False,
                    "value": 123.5, "percentile": None,
                }],
                "reference_bands": [], "distributions": [], "totals": [],
            },
            "measure_alias": "sum_sales",
            "pane_dims": ["region"],
            "row_dims": ["region"],
            "column_dims": [],
            "base_plan_hint": _base_plan_hint_region(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    rows = data["analytics_rows"]
    assert len(rows) == 1
    assert rows[0]["kind"] == "reference_line"
    assert rows[0]["aggregation"] == "constant"
    assert rows[0]["value"] == pytest.approx(123.5)

    # execute_sql called exactly once — the base query — not for analytics.
    # captured stores (question, sql) tuples.
    analytics_calls = [
        q for (q, s) in captured if q in ("reference_line", "reference_band",
                                           "reference_distribution", "totals",
                                           "analytics")
    ]
    assert analytics_calls == [], (
        f"constant refline should not hit engine; got {analytics_calls}"
    )
    assert engine.execute_sql.call_count == 1  # just the base SQL


def test_execute_with_totals_returns_grand_plus_subtotal_rows(fake_state, auth_headers):
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT region, category, SUM(sales) AS sum_sales FROM orders "
                   "GROUP BY region, category",
            "question": "by region x category",
            "conn_id": "test-conn",
            "analytics": {
                "reference_lines": [], "reference_bands": [], "distributions": [],
                "totals": [{
                    "kind": "both", "axis": "both",
                    "aggregation": "sum", "position": "after",
                    "should_affect_totals": True,
                }],
            },
            "measure_alias": "sum_sales",
            "pane_dims": ["region", "category"],
            "row_dims": ["region"],
            "column_dims": ["category"],
            "base_plan_hint": _base_plan_hint_region_cat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["analytics_rows"]
    kinds = [r["kind"] for r in rows]
    assert kinds.count("grand_total") == 1
    assert kinds.count("subtotal") == 2  # row dim + column dim

    grand = next(r for r in rows if r["kind"] == "grand_total")
    assert grand["value"] == pytest.approx(1000.0)
    assert grand["aggregation"] == "sum"
    assert grand["position"] == "after"

    sub_rows = [r for r in rows if r["kind"] == "subtotal"]
    for s in sub_rows:
        assert "rows" in s
        assert s["aggregation"] == "sum"


def test_execute_analytics_sql_passes_validator(fake_state, auth_headers):
    """Every analytics SQL that reaches the engine must have been validated.
    We prove this by asserting the endpoint returns 200 and that the
    captured SQL round-trips through SQLValidator.validate() again.
    (The endpoint runs validator internally; double-check here.)"""
    from sql_validator import SQLValidator
    client = TestClient(_test_app)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT region, SUM(sales) AS sum_sales FROM orders GROUP BY region",
            "question": "by region",
            "conn_id": "test-conn",
            "analytics": {
                "reference_lines": [{
                    "axis": "y", "aggregation": "mean", "scope": "entire",
                    "label": "value", "custom_label": "",
                    "line_style": "solid", "color": "#4C78A8",
                    "show_marker": False,
                    "value": None, "percentile": None,
                }],
                "reference_bands": [], "distributions": [], "totals": [],
            },
            "measure_alias": "sum_sales",
            "pane_dims": ["region"],
            "row_dims": ["region"],
            "column_dims": [],
            "base_plan_hint": _base_plan_hint_region(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    captured = fake_state["captured"]
    # Find the analytics-origin SQLs (question tag != base question)
    analytics_sqls = [
        s for (q, s) in captured
        if q in ("reference_line", "reference_band",
                 "reference_distribution", "totals")
    ]
    assert analytics_sqls, "no analytics SQL reached the engine"
    v = SQLValidator()
    for sql in analytics_sqls:
        ok, _, err = v.validate(sql)
        assert ok, f"analytics SQL failed validator round-trip: {err}\n{sql}"
