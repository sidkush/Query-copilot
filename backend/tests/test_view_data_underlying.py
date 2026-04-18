"""Tests for POST /api/v1/queries/underlying — Plan 6e View Data drawer source."""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    from main import app
    from auth import get_current_user

    async def _fake_user():
        return {"email": "pytest@askdb.dev"}

    app.dependency_overrides[get_current_user] = _fake_user

    fake_engine = MagicMock()
    fake_result = MagicMock()
    fake_result.error = None
    fake_result.latency_ms = 7
    fake_result.to_dict.return_value = {
        "columns": ["region", "year", "amount"],
        "rows": [["East", 2024, 100], ["East", 2024, 250]],
        "error": None,
        "latency_ms": 7,
    }
    fake_engine.execute_sql.return_value = fake_result

    fake_entry = MagicMock()
    fake_entry.engine = fake_engine
    fake_entry.conn_id = "conn-1"
    fake_entry.db_type = "postgresql"
    fake_entry.database_name = "test"
    fake_entry.connector.is_big_data_engine.return_value = False

    app.state.connections = {"pytest@askdb.dev": {"conn-1": fake_entry}}
    yield TestClient(app), fake_engine
    app.dependency_overrides.clear()


def _underlying(client: TestClient, **overrides: Any):
    body = {
        "conn_id": "conn-1",
        "sql": "SELECT region, year, SUM(amount) AS amount FROM sales GROUP BY 1, 2",
        "mark_selection": {"region": "East", "year": 2024},
        "limit": 10000,
    }
    body.update(overrides)
    return client.post("/api/v1/queries/underlying", json=body)


class TestUnderlyingHappyPath:
    def test_returns_columns_and_rows(self, client):
        c, _engine = client
        r = _underlying(c)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["columns"] == ["region", "year", "amount"]
        assert len(body["rows"]) == 2
        assert body["mark_selection"] == {"region": "East", "year": 2024}

    def test_wraps_sql_with_mark_predicates(self, client):
        c, engine = client
        _underlying(c)
        called_sql = engine.execute_sql.call_args.args[0]
        assert "_askdb_filtered" in called_sql
        assert '"region" = \'East\'' in called_sql
        assert '"year" = 2024' in called_sql
        assert " AND " in called_sql

    def test_empty_mark_selection_returns_unwrapped(self, client):
        c, engine = client
        _underlying(c, mark_selection={})
        called_sql = engine.execute_sql.call_args.args[0]
        assert called_sql.strip().startswith("SELECT * FROM (SELECT region, year, SUM(amount)")
        assert "_askdb_filtered" not in called_sql


class TestUnderlyingLimits:
    def test_default_limit_is_10000(self, client):
        c, _engine = client
        r = _underlying(c, limit=None)
        assert r.status_code == 200
        assert r.json()["limit"] == 10000

    def test_limit_capped_at_50000(self, client):
        c, _engine = client
        r = _underlying(c, limit=100000)
        assert r.status_code == 200
        assert r.json()["limit"] == 50000

    def test_negative_limit_clamps_to_default(self, client):
        c, _engine = client
        r = _underlying(c, limit=-5)
        assert r.status_code == 200
        assert r.json()["limit"] == 10000


class TestUnderlyingSecurity:
    def test_rejects_invalid_field_in_mark_selection(self, client):
        c, _engine = client
        r = _underlying(c, mark_selection={"region'); DROP TABLE sales;--": "x"})
        assert r.status_code == 400

    def test_rejects_non_select_sql(self, client):
        c, _engine = client
        r = _underlying(c, sql="DROP TABLE sales")
        assert r.status_code == 400

    def test_rejects_unknown_conn_id(self, client):
        c, _engine = client
        r = _underlying(c, conn_id="does-not-exist")
        assert r.status_code == 404


class TestUnderlyingAudit:
    def test_writes_view_data_audit_entry(self, client, monkeypatch):
        captured: list[dict] = []

        def _fake_append(entry):
            captured.append(entry)

        import audit_trail

        monkeypatch.setattr(audit_trail, "_append_entry", _fake_append)
        c, _engine = client
        r = _underlying(c)
        assert r.status_code == 200
        events = [e["event"] for e in captured]
        assert "view_data" in events
        view = next(e for e in captured if e["event"] == "view_data")
        assert view["conn_id"] == "conn-1"
        assert view["user"] == "pytest@askdb.dev"
        assert sorted(view["mark_fields"]) == ["region", "year"]


class TestUnderlyingWrapHardening:
    def test_outer_wrap_includes_limit_in_sql(self, client):
        c, engine = client
        _underlying(c, limit=12345)
        called_sql = engine.execute_sql.call_args.args[0]
        # 12345 < 50000 cap, so the literal value flows through.
        assert "LIMIT 12345" in called_sql

    def test_default_limit_appears_in_outer_wrap(self, client):
        c, engine = client
        _underlying(c, limit=None)
        called_sql = engine.execute_sql.call_args.args[0]
        assert "LIMIT 10000" in called_sql

    def test_inner_line_comment_does_not_swallow_outer_wrap(self, client):
        c, engine = client
        # Worksheet SQL ending in a line comment is a real shape
        # (e.g., user-pinned annotation). The outer LIMIT must still apply.
        _underlying(
            c,
            sql="SELECT region FROM sales -- pinned",
            mark_selection={},
        )
        called_sql = engine.execute_sql.call_args.args[0]
        assert "LIMIT 10000" in called_sql
        # The newline before ) terminates the line comment so the alias survives.
        assert "_askdb_underlying" in called_sql
