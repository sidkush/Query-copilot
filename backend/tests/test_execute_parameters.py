"""
Plan 4c T9 — verify /queries/execute substitutes {{tokens}} and still
hands the result to SQLValidator via the existing execute path.

Does NOT execute against a real DB — stubs the connector/engine to
capture the SQL that reaches execution time.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client(monkeypatch):
    from auth import get_current_user

    def _user():
        return {"email": "demo@askdb.dev", "plan": "pro"}

    app.dependency_overrides[get_current_user] = _user

    from routers import query_routes
    monkeypatch.setattr(
        query_routes, "get_daily_usage",
        lambda email: {"unlimited": True, "remaining": 999, "daily_limit": 999, "plan": "pro"},
    )
    monkeypatch.setattr(
        query_routes, "check_connection_rate_limit", lambda email, conn_id: None,
    )
    monkeypatch.setattr(query_routes, "increment_query_stats", lambda *a, **k: None)
    monkeypatch.setattr(query_routes, "log_sql_edit", lambda *a, **k: None)

    yield TestClient(app)

    app.dependency_overrides.clear()


def _install_fake_connection(captured_sql: list):
    fake_conn = MagicMock()
    fake_conn.is_big_data_engine = MagicMock(return_value=False)
    fake_conn.execute_query = MagicMock(return_value={
        "columns": ["a"], "rows": [[1]], "row_count": 1,
    })
    fake_engine = MagicMock()

    def _run(sql, question=""):
        captured_sql.append(sql)
        return SimpleNamespace(
            sql=sql,
            columns=["a"],
            rows=[[1]],
            row_count=1,
            success=True,
            error=None,
            latency_ms=1.0,
            summary="ok",
            to_dict=lambda: {
                "sql": sql,
                "columns": ["a"],
                "rows": [[1]],
                "row_count": 1,
                "success": True,
                "error": None,
                "latency_ms": 1.0,
                "summary": "ok",
            },
        )
    fake_engine.execute_sql = MagicMock(side_effect=_run)
    fake_entry = SimpleNamespace(
        engine=fake_engine,
        connector=fake_conn,
        conn_id="test-conn",
        db_type="postgres",
        database_name="test",
    )
    app.state.connections = {"demo@askdb.dev": {"test-conn": fake_entry}}


def test_execute_substitutes_string_parameter(client):
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM sales WHERE region = {{region}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "region", "type": "string", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    final_sql = captured[-1]
    assert "region = 'West'" in final_sql
    assert "{{region}}" not in final_sql


def test_execute_rejects_unknown_token(client):
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT {{ghost}} FROM t",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "region", "type": "string", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 400
    assert "unknown parameter" in resp.json()["detail"].lower()
    assert captured == []  # never reached execution


def test_execute_parameters_run_before_additional_filters(client):
    """The substitution pass runs FIRST so filter injection wraps the
    already-substituted SQL."""
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM sales WHERE year = {{year}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "year", "type": "number", "value": 2026},
            ],
            "additional_filters": [
                {"field": "region", "op": "eq", "value": "West"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    final_sql = captured[-1]
    assert "year = 2026" in final_sql
    assert "_askdb_filtered" in final_sql
    assert '"region" = \'West\'' in final_sql


def test_execute_adversarial_value_is_quoted_and_validator_catches(client):
    """An adversarial string value cannot escape its literal position."""
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM t WHERE x = {{n}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": [
                {"id": "p1", "name": "n", "type": "string",
                 "value": "'; DROP TABLE users--"},
            ],
        },
    )
    # Validator either accepts the (now safely-quoted) SELECT OR rejects
    # it — what matters is the DROP never reaches the connector as a
    # separate statement.
    if captured:
        final_sql = captured[-1]
        assert "'''; DROP TABLE users--'" in final_sql


def test_execute_without_parameters_is_pass_through(client):
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT a FROM t",
            "question": "q",
            "conn_id": "test-conn",
        },
    )
    assert resp.status_code == 200, resp.text
    assert captured[-1].strip().startswith("SELECT a FROM t")


def test_execute_parameters_dict_form_accepted(client):
    """The client may send parameters as a dict {name: paramDict} for
    convenience; the route must accept both list and dict shapes."""
    captured: list = []
    _install_fake_connection(captured)
    resp = client.post(
        "/api/v1/queries/execute",
        json={
            "sql": "SELECT * FROM t WHERE x = {{n}}",
            "question": "q",
            "conn_id": "test-conn",
            "parameters": {
                "n": {"id": "p1", "name": "n", "type": "number", "value": 5},
            },
        },
    )
    assert resp.status_code == 200, resp.text
    assert "x = 5" in captured[-1]
