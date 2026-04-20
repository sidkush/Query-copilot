"""Tests for GET /api/v1/queries/sample — Plan 8d T6 backend.

Covers:
  * happy path — returns columns + first N rows from the first schema table.
  * bad conn_id → 404.
  * SQL injection in table name rejected by the identifier gate.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def client(monkeypatch):
    from main import app
    from auth import get_current_user
    from config import settings

    # Feature-flag the endpoint on for the test; config default is False.
    monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", True, raising=False)

    async def _fake_user():
        return {"email": "pytest@askdb.dev"}

    app.dependency_overrides[get_current_user] = _fake_user

    fake_engine = MagicMock()
    fake_result = MagicMock()
    fake_result.error = None
    fake_result.latency_ms = 3
    fake_result.to_dict.return_value = {
        "columns": ["id", "amount"],
        "rows": [
            {"id": 1, "amount": 100},
            {"id": 2, "amount": 200},
        ],
        "error": None,
        "latency_ms": 3,
    }
    fake_engine.execute_sql.return_value = fake_result

    fake_connector = MagicMock()
    fake_connector.get_schema_info.return_value = {
        "orders": {"columns": [{"name": "id"}, {"name": "amount"}]},
        "customers": {"columns": [{"name": "id"}]},
    }

    fake_entry = MagicMock()
    fake_entry.engine = fake_engine
    fake_entry.connector = fake_connector
    fake_entry.conn_id = "conn-1"
    fake_entry.db_type = "postgresql"
    fake_entry.database_name = "test"

    app.state.connections = {"pytest@askdb.dev": {"conn-1": fake_entry}}
    yield TestClient(app), fake_engine, fake_connector
    app.dependency_overrides.clear()
    app.state.connections = {}


# ── Happy path ──────────────────────────────────────────────────────────────


class TestSampleHappyPath:
    def test_returns_columns_and_rows(self, client):
        c, _engine, _connector = client
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 10})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["columns"] == ["id", "amount"]
        assert len(body["rows"]) == 2
        assert body["rows"][0] == {"id": 1, "amount": 100}
        assert body["table"] == "orders"
        assert body["limit"] == 10
        assert body["row_count"] == 2

    def test_selects_first_schema_table(self, client):
        c, engine, _connector = client
        c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 5})
        called_sql = engine.execute_sql.call_args.args[0]
        # "orders" is the first key in the ordered dict returned from get_schema_info.
        assert '"orders"' in called_sql
        assert "LIMIT 5" in called_sql
        assert "customers" not in called_sql

    def test_default_limit_is_10(self, client):
        c, engine, _connector = client
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1"})
        assert r.status_code == 200
        assert r.json()["limit"] == 10
        called_sql = engine.execute_sql.call_args.args[0]
        assert "LIMIT 10" in called_sql

    def test_limit_capped_at_100(self, client):
        c, _engine, _connector = client
        # Validator rejects limits > 100 at the query-param layer, returning 422.
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 500})
        assert r.status_code == 422


# ── Error paths ─────────────────────────────────────────────────────────────


class TestSampleErrors:
    def test_unknown_conn_id_returns_404(self, client):
        c, _engine, _connector = client
        r = c.get(
            "/api/v1/queries/sample",
            params={"conn_id": "does-not-exist", "limit": 10},
        )
        assert r.status_code == 404

    def test_no_tables_returns_404(self, client):
        c, _engine, connector = client
        connector.get_schema_info.return_value = {}
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 10})
        assert r.status_code == 404
        assert "no tables" in r.json()["detail"].lower()

    def test_feature_flag_off_returns_404(self, client, monkeypatch):
        c, _engine, _connector = client
        from config import settings
        monkeypatch.setattr(settings, "FEATURE_ANALYST_PRO", False, raising=False)
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 10})
        assert r.status_code == 404


# ── Security ────────────────────────────────────────────────────────────────


class TestSampleSecurity:
    def test_rejects_sql_injection_in_table_name(self, client):
        c, engine, connector = client
        # Malicious "table name" returned by a compromised/hostile schema.
        connector.get_schema_info.return_value = {
            "orders\"; DROP TABLE users; --": {"columns": []},
        }
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 10})
        assert r.status_code == 400
        # execute_sql must NEVER be called with the injection string.
        assert engine.execute_sql.call_count == 0

    def test_rejects_table_name_with_space(self, client):
        c, engine, connector = client
        connector.get_schema_info.return_value = {
            "orders customers": {"columns": []},
        }
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 10})
        assert r.status_code == 400
        assert engine.execute_sql.call_count == 0

    def test_rejects_table_name_with_semicolon(self, client):
        c, engine, connector = client
        connector.get_schema_info.return_value = {
            "orders;": {"columns": []},
        }
        r = c.get("/api/v1/queries/sample", params={"conn_id": "conn-1", "limit": 10})
        assert r.status_code == 400
        assert engine.execute_sql.call_count == 0
