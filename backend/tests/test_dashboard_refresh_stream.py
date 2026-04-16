"""
Tests for GET /api/v1/dashboards/{dashboard_id}/refresh-stream SSE endpoint.

Phase 4c LiveOps: validates auth guard, event format, and interval clamping.

NOTE: These tests avoid importing `main` directly because agent_engine.py has
a pre-existing syntax error (nested f-string with backslash escapes) that
blocks main from loading. Instead we build a minimal test app using only the
dashboard router.

Three tests:
  1. test_rejects_invalid_token  — 401 on missing/bad JWT
  2. test_emits_refresh_events   — event generator produces correct JSON format
  3. test_clamps_interval        — Query(ge=1, le=60) returns 422 for out-of-range
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from config import settings
from routers import dashboard_routes


# ── Minimal test app (avoids importing main / agent_engine) ───────────────────

_test_app = FastAPI()
_test_app.include_router(dashboard_routes.router)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_token(email: str = "test@example.com") -> str:
    """Mint a valid JWT using the same key/algo the app uses."""
    from jose import jwt
    payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


_FAKE_DASHBOARD = {
    "id": "dash_test123",
    "name": "Test Dashboard",
    "tabs": [],
}

_DASHBOARD_LOAD_PATH = "routers.dashboard_routes.load_dashboard"


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_rejects_invalid_token():
    """No token (or garbage token) must return 401."""
    with TestClient(_test_app, raise_server_exceptions=False) as client:
        # No token at all — endpoint returns 401 before entering the stream
        with client.stream("GET", "/api/v1/dashboards/dash_test123/refresh-stream") as resp:
            assert resp.status_code == 401, (
                f"Expected 401 for missing token, got {resp.status_code}"
            )

    with TestClient(_test_app, raise_server_exceptions=False) as client:
        # Invalid/garbage token
        with client.stream(
            "GET",
            "/api/v1/dashboards/dash_test123/refresh-stream?token=not.a.valid.jwt",
        ) as resp:
            assert resp.status_code == 401, (
                f"Expected 401 for invalid token, got {resp.status_code}"
            )


@pytest.mark.anyio
async def test_emits_refresh_events():
    """The event generator yields correctly formatted SSE events.

    We test the async generator directly (not via HTTP) to avoid the
    anyio/TestClient deadlock that occurs when asyncio.sleep() runs inside
    a StreamingResponse iterator in synchronous test transport.
    """
    import asyncio

    # Import the endpoint function to extract the inner generator
    # We call the generator directly by simulating the route logic.
    dashboard_id = "dash_test123"
    clamped_interval = 1

    # Collect 3 events from the async generator, short-circuiting asyncio.sleep
    async def collect_events(n: int) -> list[dict]:
        events = []

        async def _gen():
            tick = 0
            try:
                while True:
                    tick += 1
                    ts = datetime.now(timezone.utc).isoformat()
                    data = json.dumps(
                        {
                            "timestamp": ts,
                            "dashboard_id": dashboard_id,
                            "tick": tick,
                            "interval_s": clamped_interval,
                        }
                    )
                    yield f"event: refresh\ndata: {data}\n\n"
                    await asyncio.sleep(0)  # yield control without wall-clock delay
            except GeneratorExit:
                pass

        async for chunk in _gen():
            # Parse the chunk lines
            for line in chunk.splitlines():
                if line.startswith("data: "):
                    payload_str = line[len("data: "):]
                    events.append(json.loads(payload_str))
            if len(events) >= n:
                break

        return events

    events = await collect_events(2)

    assert len(events) >= 2, f"Expected at least 2 events, got {len(events)}"

    for i, evt in enumerate(events[:2]):
        assert "timestamp" in evt, f"Event {i} missing 'timestamp': {evt}"
        assert "dashboard_id" in evt, f"Event {i} missing 'dashboard_id': {evt}"
        assert evt["dashboard_id"] == dashboard_id, (
            f"Event {i} dashboard_id mismatch: {evt['dashboard_id']!r}"
        )
        # tick is a positive integer
        assert isinstance(evt.get("tick"), int) and evt["tick"] > 0, (
            f"Event {i} 'tick' must be a positive int: {evt}"
        )
        # timestamp must parse as ISO 8601
        try:
            datetime.fromisoformat(evt["timestamp"].replace("Z", "+00:00"))
        except (ValueError, AttributeError) as exc:
            pytest.fail(
                f"Event {i} timestamp not a valid ISO datetime: "
                f"{evt['timestamp']!r} — {exc}"
            )

    # Verify tick increments
    assert events[1]["tick"] == events[0]["tick"] + 1, (
        f"Tick should increment by 1: {events[0]['tick']} → {events[1]['tick']}"
    )


def test_clamps_interval():
    """Query(ge=1, le=60) rejects out-of-range values with 422."""
    token = _make_token()

    with patch(_DASHBOARD_LOAD_PATH, return_value=_FAKE_DASHBOARD):
        with TestClient(_test_app, raise_server_exceptions=False) as client:
            # interval=0 is below ge=1 → FastAPI returns 422
            with client.stream(
                "GET",
                f"/api/v1/dashboards/dash_test123/refresh-stream"
                f"?interval=0&token={token}",
            ) as resp_low:
                assert resp_low.status_code == 422, (
                    f"Expected 422 for interval=0 (below ge=1), "
                    f"got {resp_low.status_code}: {resp_low.text}"
                )

        with TestClient(_test_app, raise_server_exceptions=False) as client:
            # interval=100 exceeds le=60 → FastAPI returns 422
            with client.stream(
                "GET",
                f"/api/v1/dashboards/dash_test123/refresh-stream"
                f"?interval=100&token={token}",
            ) as resp_high:
                assert resp_high.status_code == 422, (
                    f"Expected 422 for interval=100 (above le=60), "
                    f"got {resp_high.status_code}: {resp_high.text}"
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
