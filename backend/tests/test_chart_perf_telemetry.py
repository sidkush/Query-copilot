"""
Tests for POST /api/v1/agent/perf/telemetry — chart render telemetry endpoint.

Phase B5: fire-and-forget endpoint that appends chart render metrics to
.data/audit/chart_perf.jsonl (no PII, JSONL with 50MB rotation).

TDD: these tests are written first and should fail until the endpoint exists.
"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from main import app
from auth import get_current_user

# ── Fixture helpers ───────────────────────────────────────────────────────────

VALID_PAYLOAD = {
    "session_id": "abc123",
    "tile_id": "def456",
    "tier": "t1",
    "renderer_family": "vega",
    "renderer_backend": "canvas",
    "row_count": 5000,
    "downsample_method": "lttb",
    "target_points": 4000,
    "first_paint_ms": 120.5,
    "median_frame_ms": 11.2,
    "p95_frame_ms": 15.8,
    "escalations": [],
    "evictions": 0,
    "instance_pressure_at_mount": 0.3,
    "gpu_tier": "medium",
}


def _authed_client() -> TestClient:
    """Return a TestClient with get_current_user dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: {
        "email": "test@example.com",
        "plan": "pro",
    }
    return TestClient(app, raise_server_exceptions=False)


def _clear_overrides():
    app.dependency_overrides.pop(get_current_user, None)


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_accepts_valid_payload_and_returns_204():
    """POST full valid payload → 204 No Content."""
    with _authed_client() as client:
        resp = client.post("/api/v1/agent/perf/telemetry", json=VALID_PAYLOAD)
    _clear_overrides()
    assert resp.status_code == 204, (
        f"Expected 204 for valid telemetry payload, got {resp.status_code}: {resp.text}"
    )


def test_writes_to_chart_perf_jsonl(tmp_path):
    """POST payload → JSONL line written to chart_perf.jsonl with correct fields + timestamp."""
    import routers.agent_routes as agent_routes_module

    fake_log = tmp_path / "chart_perf.jsonl"

    with patch.object(agent_routes_module, "_CHART_PERF_LOG_PATH", fake_log):
        with _authed_client() as client:
            resp = client.post("/api/v1/agent/perf/telemetry", json=VALID_PAYLOAD)
        _clear_overrides()

    assert resp.status_code == 204, f"Expected 204, got {resp.status_code}"
    assert fake_log.exists(), "chart_perf.jsonl was not created"

    lines = [l for l in fake_log.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 1, f"Expected 1 JSONL line, got {len(lines)}"

    entry = json.loads(lines[0])

    # Required fields from payload must be present
    for field in ("session_id", "tile_id", "tier", "renderer_family", "renderer_backend", "row_count"):
        assert field in entry, f"Missing field '{field}' in JSONL entry"
    assert entry["session_id"] == "abc123"
    assert entry["tier"] == "t1"

    # timestamp must be added
    assert "timestamp" in entry, "Missing 'timestamp' in JSONL entry"


def test_rejects_missing_required_fields():
    """POST with only {tier: t0} (missing session_id, tile_id, etc.) → 422."""
    with _authed_client() as client:
        resp = client.post("/api/v1/agent/perf/telemetry", json={"tier": "t0"})
    _clear_overrides()
    assert resp.status_code == 422, (
        f"Expected 422 for missing required fields, got {resp.status_code}"
    )


def test_accepts_empty_escalations_array():
    """POST with escalations=[] (valid default) → 204."""
    payload = dict(VALID_PAYLOAD, escalations=[])
    with _authed_client() as client:
        resp = client.post("/api/v1/agent/perf/telemetry", json=payload)
    _clear_overrides()
    assert resp.status_code == 204, (
        f"Expected 204 with empty escalations array, got {resp.status_code}"
    )


def test_no_pii_in_logged_entry(tmp_path):
    """POST payload with extra 'email' field → email must NOT appear in JSONL output."""
    import routers.agent_routes as agent_routes_module

    fake_log = tmp_path / "chart_perf_pii.jsonl"
    payload_with_pii = dict(VALID_PAYLOAD, email="secret@example.com", user_id="user_999")

    with patch.object(agent_routes_module, "_CHART_PERF_LOG_PATH", fake_log):
        with _authed_client() as client:
            resp = client.post("/api/v1/agent/perf/telemetry", json=payload_with_pii)
        _clear_overrides()

    assert resp.status_code == 204, f"Expected 204, got {resp.status_code}"
    assert fake_log.exists(), "chart_perf_pii.jsonl was not created"

    raw = fake_log.read_text(encoding="utf-8")
    assert "secret@example.com" not in raw, "PII email leaked into JSONL log"
    assert "user_999" not in raw, "PII user_id leaked into JSONL log"

    # Confirm the line is valid JSON
    lines = [l for l in raw.splitlines() if l.strip()]
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert "email" not in entry, "'email' key must not appear in logged entry"
    assert "user_id" not in entry, "'user_id' key must not appear in logged entry"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
