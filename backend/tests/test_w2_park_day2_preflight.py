"""
Day-2 pre-flight integration test: park_id round-trip via /agent/respond.

Council decision (2026-04-24, locked):
  Day 2 prerequisite — frontend must echo park_id back, backend /respond
  must route through ParkRegistry.resolve when PARK_V2_ASK_USER=True.
  This test gates flag flip: if the round-trip is broken, the agent
  hangs silently on every ask_user.

Scope:
  1. PARK_V2 path: flag on + park_id present → ParkRegistry.resolve fires,
     slot.response set, slot.consent_basis="user_act", legacy fields
     also set (so sync wait loop unblocks).
  2. Stale park_id under flag on → 422.
  3. Legacy path: flag on + park_id missing → falls through to
     _user_response_event (back-compat for old frontend builds).
  4. Legacy path: flag off + park_id present → flag dominates; legacy
     path runs, registry untouched.

Run:
  pytest tests/test_w2_park_day2_preflight.py -v
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import threading

import pytest
from fastapi.testclient import TestClient

from main import app
from auth import get_current_user
from agent_engine import SessionMemory
from routers import agent_routes


OWNER = "preflight@example.com"


@pytest.fixture
def authed_client():
    app.dependency_overrides[get_current_user] = lambda: {"email": OWNER, "plan": "pro"}
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def waiting_session():
    """Inject a SessionMemory in the 'waiting on user' state."""
    chat_id = "preflight-chat"
    session = SessionMemory(chat_id, owner_email=OWNER)
    session._running = True
    session._waiting_for_user = True
    session._user_response_event = threading.Event()
    session._user_response = None
    with agent_routes._sessions_lock:
        agent_routes._sessions[chat_id] = session
    yield chat_id, session
    with agent_routes._sessions_lock:
        agent_routes._sessions.pop(chat_id, None)


def _arm_slot(session: SessionMemory, vocab=("retry", "summarize", "abort")):
    return session.parks.arm("ask_user", frozenset(vocab), "summarize")


def test_park_v2_resolves_via_registry(authed_client, waiting_session, monkeypatch):
    """Flag on + park_id present → registry.resolve fires + legacy fields set."""
    from config import settings as _settings
    monkeypatch.setattr(_settings, "PARK_V2_ASK_USER", True, raising=False)

    chat_id, session = waiting_session
    slot = _arm_slot(session)

    resp = authed_client.post("/api/v1/agent/respond", json={
        "chat_id": chat_id,
        "response": "retry",
        "park_id": slot.park_id,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ok"
    assert body["park_id"] == slot.park_id

    # Registry side: slot resolved with consent_basis user_act
    assert slot.response == "retry"
    assert slot.consent_basis == "user_act"

    # Legacy side: mirror writes so sync wait loop unblocks
    assert session._user_response == "retry"
    assert session._user_response_event.is_set()


def test_park_v2_stale_park_id_returns_422(authed_client, waiting_session, monkeypatch):
    """Flag on + unknown/discarded park_id → 422, legacy fields untouched."""
    from config import settings as _settings
    monkeypatch.setattr(_settings, "PARK_V2_ASK_USER", True, raising=False)

    chat_id, session = waiting_session
    slot = _arm_slot(session)
    session.parks.discard(slot.park_id)  # simulate stale

    resp = authed_client.post("/api/v1/agent/respond", json={
        "chat_id": chat_id,
        "response": "retry",
        "park_id": slot.park_id,
    })
    assert resp.status_code == 422, resp.text
    assert session._user_response is None
    assert not session._user_response_event.is_set()


def test_park_v2_missing_park_id_falls_back_to_legacy(authed_client, waiting_session, monkeypatch):
    """Flag on but old frontend (no park_id) → legacy event-set path runs."""
    from config import settings as _settings
    monkeypatch.setattr(_settings, "PARK_V2_ASK_USER", True, raising=False)

    chat_id, session = waiting_session
    slot = _arm_slot(session)

    resp = authed_client.post("/api/v1/agent/respond", json={
        "chat_id": chat_id,
        "response": "summarize",
    })
    assert resp.status_code == 200, resp.text
    # Legacy fields set
    assert session._user_response == "summarize"
    assert session._user_response_event.is_set()
    # Registry slot untouched (legacy path didn't resolve it)
    assert slot.response is None


def test_flag_off_ignores_park_id(authed_client, waiting_session, monkeypatch):
    """Flag off + park_id present → legacy path; registry untouched."""
    from config import settings as _settings
    monkeypatch.setattr(_settings, "PARK_V2_ASK_USER", False, raising=False)

    chat_id, session = waiting_session
    slot = _arm_slot(session)

    resp = authed_client.post("/api/v1/agent/respond", json={
        "chat_id": chat_id,
        "response": "retry",
        "park_id": slot.park_id,
    })
    assert resp.status_code == 200, resp.text
    assert session._user_response == "retry"
    assert session._user_response_event.is_set()
    assert slot.response is None  # registry not touched


def test_park_v2_freetext_accepted(authed_client, waiting_session, monkeypatch):
    """Flag on, free-text response → registry accepts (allow_freetext=True at /respond)."""
    from config import settings as _settings
    monkeypatch.setattr(_settings, "PARK_V2_ASK_USER", True, raising=False)

    chat_id, session = waiting_session
    slot = _arm_slot(session, vocab=("yes", "no"))

    resp = authed_client.post("/api/v1/agent/respond", json={
        "chat_id": chat_id,
        "response": "Maybe later, I want to think about it",
        "park_id": slot.park_id,
    })
    assert resp.status_code == 200, resp.text
    assert slot.response == "maybe later, i want to think about it"
    assert slot.consent_basis == "user_act"
