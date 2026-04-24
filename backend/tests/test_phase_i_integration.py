"""End-to-end integration smoke tests for Phase I Operations Layer.

Covers the full pipeline:
  detector → AlertManager.fire() → SlackDispatcher → AlertManager.recent_events()
  → ops_routes /cache-stats and /alerts (admin-scoped, per-tenant)

All I/O is mocked: no real Slack, no real email, no real DB.
"""
from __future__ import annotations

import importlib
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Smoke: all 12 detectors registered ───────────────────────────────────────

def test_import_smoke_12_detectors():
    """Importing residual_risk_telemetry must register exactly 12 detectors."""
    import residual_risk_telemetry
    importlib.reload(residual_risk_telemetry)
    assert len(residual_risk_telemetry._ALL_DETECTORS) == 12, (
        f"Expected 12 detectors, got {len(residual_risk_telemetry._ALL_DETECTORS)}"
    )


# ── AlertManager: fire → dedup → ring ────────────────────────────────────────

def test_fire_stores_in_ring():
    """A dispatched signal appears in recent_events for the tenant."""
    from alert_manager import AlertManager, AlertSignal
    am = AlertManager(dedup_window_s=0, multi_hour_s=0, max_retry=0)
    # Patch _dispatch so we don't need Slack/email
    am._dispatch = lambda sig: __import__("alert_manager").DispatchResult(True, "log")

    sig = AlertSignal(
        rule_id="residual_risk_1_llm_pretraining_fn",
        tenant_id="t-integ",
        severity="warn",
        observed_value=3.0,
        threshold=2.0,
        message="integration test signal",
    )
    result = am.fire(sig)
    assert result.dispatched
    events = am.recent_events("t-integ")
    assert len(events) == 1
    assert events[0]["rule_id"] == "residual_risk_1_llm_pretraining_fn"


def test_dedup_suppresses_second_fire():
    """A second fire within the dedup window returns dispatched=False."""
    from alert_manager import AlertManager, AlertSignal, DispatchResult
    am = AlertManager(dedup_window_s=9999, multi_hour_s=9999, max_retry=0)
    am._dispatch = lambda sig: DispatchResult(True, "log")

    sig = AlertSignal(
        rule_id="residual_risk_3_dba_ddl_no_webhook",
        tenant_id="t-integ",
        severity="warn",
        observed_value=1.5,
        threshold=1.0,
        message="dup test",
    )
    r1 = am.fire(sig)
    r2 = am.fire(sig)
    assert r1.dispatched
    assert not r2.dispatched
    assert r2.reason == "deduped_within_window"


def test_ops_alert_dispatch_failure_uses_log_channel():
    """ops_alert_dispatch_failure must route through log, never Slack/email."""
    from alert_manager import AlertManager, AlertSignal
    am = AlertManager(dedup_window_s=0, multi_hour_s=0, max_retry=0)

    sig = AlertSignal(
        rule_id="ops_alert_dispatch_failure",
        tenant_id="t-integ",
        severity="critical",
        observed_value=5.0,
        threshold=5.0,
        message="feedback storm guard test",
    )
    result = am._dispatch(sig)
    assert result.dispatched
    assert result.channel == "log"


# ── Ops routes: /cache-stats and /alerts ─────────────────────────────────────

def _make_app_with_overrides(am_override, admin_override):
    """Build a minimal FastAPI app with ops_routes and dependency overrides."""
    from fastapi import FastAPI
    from routers import ops_routes
    from routers.admin_routes import get_admin_user

    app = FastAPI()
    app.include_router(ops_routes.router)
    app.dependency_overrides[get_admin_user] = lambda: admin_override
    return app


def test_cache_stats_route_returns_tenant_scoped_report():
    import alert_manager as am_mod
    from alert_manager import AlertManager
    old = am_mod._singleton
    am_mod._singleton = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    try:
        admin = {"username": "admin", "role": "admin"}
        app = _make_app_with_overrides(am_mod._singleton, admin)

        with patch("routers.ops_routes.collect_for_tenant") as mock_collect:
            from types import SimpleNamespace
            mock_report = SimpleNamespace(
                tenant_id="t-route",
                schema=0.9,
                vizql_in_process=0.8,
                vizql_external=0.7,
                chroma_query_memory=0.6,
                turbo_twin=0.5,
                prompt_cache=0.1,
            )
            mock_collect.return_value = mock_report
            client = TestClient(app)
            resp = client.get("/api/v1/ops/cache-stats?tenant_id=t-route")

        assert resp.status_code == 200
        data = resp.json()
        assert data["tenant_id"] == "t-route"
        assert "schema" in data
    finally:
        am_mod._singleton = old


def test_cache_stats_route_requires_tenant_id():
    admin = {"username": "admin", "role": "admin"}
    app = _make_app_with_overrides(None, admin)
    client = TestClient(app)
    resp = client.get("/api/v1/ops/cache-stats")
    assert resp.status_code == 400


def test_alerts_route_returns_only_target_tenant():
    """recent_events for t-A must not include events fired for t-B."""
    import alert_manager as am_mod
    from alert_manager import AlertManager, AlertSignal, DispatchResult
    old = am_mod._singleton
    am = AlertManager(dedup_window_s=0, multi_hour_s=0, max_retry=0)
    am._dispatch = lambda sig: DispatchResult(True, "log")
    am_mod._singleton = am
    try:
        # Fire for t-A
        sig_a = AlertSignal(
            rule_id="residual_risk_1_llm_pretraining_fn",
            tenant_id="t-A",
            severity="warn",
            observed_value=3.0,
            threshold=2.0,
            message="tenant A event",
        )
        am.fire(sig_a)

        # Fire for t-B
        sig_b = AlertSignal(
            rule_id="residual_risk_3_dba_ddl_no_webhook",
            tenant_id="t-B",
            severity="warn",
            observed_value=1.5,
            threshold=1.0,
            message="tenant B event",
        )
        am.fire(sig_b)

        admin = {"username": "admin", "role": "admin"}
        app = _make_app_with_overrides(am, admin)
        client = TestClient(app)

        resp = client.get("/api/v1/ops/alerts?tenant_id=t-A")
        assert resp.status_code == 200
        alerts = resp.json()["alerts"]
        # Only t-A event; no t-B event must appear
        assert all(e["rule_id"] != "residual_risk_3_dba_ddl_no_webhook" for e in alerts)
        assert len(alerts) == 1
    finally:
        am_mod._singleton = old


def test_alert_history_route_scopes_to_rule_and_tenant():
    import alert_manager as am_mod
    from alert_manager import AlertManager, AlertSignal, DispatchResult
    old = am_mod._singleton
    am = AlertManager(dedup_window_s=0, multi_hour_s=0, max_retry=0)
    am._dispatch = lambda sig: DispatchResult(True, "log")
    am_mod._singleton = am
    try:
        sig = AlertSignal(
            rule_id="residual_risk_5_10k_tables",
            tenant_id="t-hist",
            severity="warn",
            observed_value=50.0,
            threshold=70.0,
            message="history test",
        )
        am.fire(sig)

        admin = {"username": "admin", "role": "admin"}
        app = _make_app_with_overrides(am, admin)
        client = TestClient(app)

        resp = client.get(
            "/api/v1/ops/alerts/residual_risk_5_10k_tables/history?tenant_id=t-hist"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["rule_id"] == "residual_risk_5_10k_tables"
        assert len(body["events"]) == 1
    finally:
        am_mod._singleton = old
