"""
Tests for POST /api/v1/dashboards/{dashboard_id}/actions/{action_id}/fire

Plan 3 T8 — Backend fire endpoint.

Uses a minimal FastAPI test app built from the dashboard router only (same
pattern as test_dashboard_refresh_stream.py) to avoid importing agent_engine
which has known import-time issues.

Three tests:
  1. test_fire_filter_action_returns_target_plan   — 200 with expected structure
  2. test_fire_unknown_dashboard_404               — 404 for non-existent dashboard
  3. test_fire_other_user_dashboard_404            — 404 when dashboard owned by another user
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import dashboard_routes


# ── Minimal test app ────────────────────────────────────────────────────────

_test_app = FastAPI()
_test_app.include_router(dashboard_routes.router)


# ── JWT helper ──────────────────────────────────────────────────────────────

def _make_token(email: str = "user-a@example.com") -> str:
    """Mint a valid JWT using the same key/algo the app uses."""
    from jose import jwt
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ── Fixture: auth headers ────────────────────────────────────────────────────

@pytest.fixture
def auth_headers_user_a():
    return {"Authorization": f"Bearer {_make_token('user-a@example.com')}"}


@pytest.fixture
def auth_headers_user_b():
    return {"Authorization": f"Bearer {_make_token('user-b@example.com')}"}


# ── Shared dashboard/action fixtures ────────────────────────────────────────

_FILTER_ACTION = {
    "id": "act-filter-1",
    "name": "Week Filter",
    "kind": "filter",
    "enabled": True,
    "sourceSheets": ["sheet-src"],
    "targetSheets": ["sheet-t1", "sheet-t2"],
    "trigger": "select",
    "fieldMapping": [
        {"source": "Week", "target": "Week"},
    ],
    "clearBehavior": "show-all",
}

_DASHBOARD_USER_A = {
    "id": "dash-owned-by-a",
    "name": "User A Dashboard",
    "tabs": [],
    "actions": [_FILTER_ACTION],
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

_FIRE_BODY = {
    "markData": {"Week": "W12"},
    "trigger": "select",
    "timestamp": 1234567890,
}

_LOAD_DASHBOARD_PATH = "routers.dashboard_routes.load_dashboard"
_ANALYST_PRO_FLAG_PATH = "routers.dashboard_routes.settings"


# ── Test 1: filter action returns expected target plan ───────────────────────

def test_fire_filter_action_returns_target_plan(auth_headers_user_a):
    """POST /fire on a filter action returns 200 with per-sheet filterPlanHints."""

    # Always enable the flag and serve the dashboard for user-a.
    def _load(email, dashboard_id):
        if email == "user-a@example.com" and dashboard_id == "dash-owned-by-a":
            return _DASHBOARD_USER_A
        return None

    with patch(_LOAD_DASHBOARD_PATH, side_effect=_load), \
         patch.object(settings, "FEATURE_ANALYST_PRO", True), \
         patch("routers.dashboard_routes._uuid.uuid4") as mock_uuid, \
         patch("audit_trail._append_entry", return_value=None):

        mock_uuid.return_value.hex = "a" * 40  # ensures [:12] = "aaaaaaaaaaaa"

        with TestClient(_test_app, raise_server_exceptions=True) as client:
            resp = client.post(
                "/api/v1/dashboards/dash-owned-by-a/actions/act-filter-1/fire",
                json=_FIRE_BODY,
                headers=auth_headers_user_a,
            )

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()

    assert data["accepted"] is True
    assert "cascadeId" in data
    assert len(data["cascadeId"]) == 12

    targets = data["targets"]
    assert len(targets) == 2, f"Expected 2 targets (one per targetSheet), got {len(targets)}"

    sheet_ids = {t["sheetId"] for t in targets}
    assert "sheet-t1" in sheet_ids
    assert "sheet-t2" in sheet_ids

    for t in targets:
        assert t["filterPlanHints"].get("Week") == "W12", (
            f"Expected filterPlanHints Week=W12, got {t['filterPlanHints']}"
        )


# ── Test 2: unknown dashboard → 404 ─────────────────────────────────────────

def test_fire_unknown_dashboard_404(auth_headers_user_a):
    """POST /fire with a non-existent dashboard id must return 404."""

    def _load(email, dashboard_id):
        return None  # dashboard not found for any user

    with patch(_LOAD_DASHBOARD_PATH, side_effect=_load), \
         patch.object(settings, "FEATURE_ANALYST_PRO", True):

        with TestClient(_test_app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/api/v1/dashboards/no-such-dash/actions/no-such-act/fire",
                json={"markData": {}, "trigger": "select", "timestamp": 0},
                headers=auth_headers_user_a,
            )

    assert resp.status_code == 404, f"Expected 404 for unknown dashboard, got {resp.status_code}"


# ── Test 3: dashboard owned by another user → 404 (no 403 leak) ─────────────

def test_fire_other_user_dashboard_404(auth_headers_user_b, auth_headers_user_a):
    """
    User B must receive 404 when requesting a dashboard owned by User A.

    Endpoint must not return 403 (which would confirm existence).
    load_dashboard is scoped per-user — it returns None when the email
    doesn't own the dashboard, so the response is indistinguishable from
    a genuinely missing resource.
    """

    def _load(email, dashboard_id):
        # Only user-a can see this dashboard.
        if email == "user-a@example.com" and dashboard_id == "dash-owned-by-a":
            return _DASHBOARD_USER_A
        return None  # user-b gets None — same as "not found"

    with patch(_LOAD_DASHBOARD_PATH, side_effect=_load), \
         patch.object(settings, "FEATURE_ANALYST_PRO", True):

        with TestClient(_test_app, raise_server_exceptions=False) as client:
            # User B tries to fire on User A's dashboard.
            resp = client.post(
                "/api/v1/dashboards/dash-owned-by-a/actions/act-filter-1/fire",
                json=_FIRE_BODY,
                headers=auth_headers_user_b,  # <-- user B token
            )

    assert resp.status_code == 404, (
        f"Expected 404 (no existence leak) for cross-user access, got {resp.status_code}"
    )
    # Must NOT be 403 — that would reveal the dashboard exists.
    assert resp.status_code != 403, "Endpoint must not return 403 (existence leak)"
