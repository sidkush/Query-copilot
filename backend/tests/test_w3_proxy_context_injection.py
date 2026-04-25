"""Phase K W3-P1 — proxy framing note injection on Gate C station_proxy.

Adapted from plan trigger: Gate C is a pre-loop park, not an `ask_user`
tool_result. Helper `_build_proxy_framing_note` is called after the park
resolves with `station_proxy`; output is appended to the legacy system
prompt before the agent loop's first LLM call.
"""
from agent_engine import AgentEngine


def _engine():
    return AgentEngine.__new__(AgentEngine)


def test_station_proxy_schema_mismatch_emits_replan_instruction():
    eng = _engine()
    note = eng._build_proxy_framing_note(
        choice="station_proxy",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="user type (member vs casual)",
        proxy_columns=None,
    )
    assert note is not None
    assert "rider" in note.lower()
    assert "user type" in note.lower()
    # replan / re-frame instruction must be present so the model knows to
    # use proxy columns instead of the missing rider id
    lowered = note.lower()
    assert any(tok in lowered for tok in ("instead", "replan", "use", "proxy"))


def test_abort_choice_emits_no_note():
    eng = _engine()
    note = eng._build_proxy_framing_note(
        choice="abort",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="user type (member vs casual)",
        proxy_columns=None,
    )
    assert note is None


def test_non_gate_c_kind_emits_no_note():
    eng = _engine()
    note = eng._build_proxy_framing_note(
        choice="station_proxy",
        kind="ask_user",
        canonical="rider",
        proxy_suggestion="user type",
        proxy_columns=None,
    )
    assert note is None


def test_note_is_directive_not_disclosure():
    """Regression: agent must be told to run SQL, not re-explain the limit.

    Earlier wording read like a disclosure — model treated it as context
    to summarize back to the user instead of a directive to run SQL with
    the proxy. Lock in directive phrasing.
    """
    eng = _engine()
    note = eng._build_proxy_framing_note(
        choice="station_proxy",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="user type (member vs casual)",
        proxy_columns=None,
    )
    assert note is not None
    lowered = note.lower()
    # must mandate run_sql as next action
    assert "run_sql" in lowered
    assert "must" in lowered or "immediately" in lowered
    # must forbid re-explaining and ask_user
    assert "do not re-explain" in lowered or "do not explain" in lowered
    assert "do not call `ask_user`" in lowered or "do not ask" in lowered
    # must reference the user's prior consent
    assert "already" in lowered and "consent" in lowered


def test_session_memory_initialises_consent_defaults():
    """Regression: Edge case 2 — Gate C must NOT re-fire in the same chat
    once the user has consented. Gap-based consents dict lives on SessionMemory
    (not on a per-run AgentEngine attr) and must exist by default so reload
    code can restore deterministically."""
    from agent_engine import SessionMemory
    sm = SessionMemory("c1", owner_email="t@x.com")
    assert sm._schema_mismatch_consents == {}
    assert sm._consent_dirty is False


def test_consent_round_trip_through_progress_dict():
    """Regression: persistence path must round-trip the gap-based consents dict
    so a second rider question after reload skips Gate C."""
    from agent_engine import SessionMemory
    from routers.agent_routes import (
        _merge_consent_into_progress,
        _restore_consent_from_progress,
    )
    sm = SessionMemory("c1", owner_email="t@x.com")
    sm._schema_mismatch_consents = {
        "rider": {"_id": "trip_id"},
        "person": {"_id": "user_id"},
    }
    progress: dict = {}
    _merge_consent_into_progress(progress, sm)
    assert progress["_schema_mismatch_consents"] == {
        "rider": {"_id": "trip_id"},
        "person": {"_id": "user_id"},
    }

    sm2 = SessionMemory("c1", owner_email="t@x.com")
    _restore_consent_from_progress(sm2, progress)
    assert sm2._schema_mismatch_consents == {
        "rider": {"_id": "trip_id"},
        "person": {"_id": "user_id"},
    }
    assert sm2._consent_dirty is False


def test_restore_tolerates_missing_keys():
    """Pre-W3 sessions (old `_decided` list format) must migrate to empty dict
    rather than raise."""
    from agent_engine import SessionMemory
    from routers.agent_routes import _restore_consent_from_progress
    sm = SessionMemory("c1", owner_email="t@x.com")
    # Old format: list of canonicals, no proxy info
    _restore_consent_from_progress(sm, {"_schema_mismatch_decided": ["person", "rider"]})
    assert sm._schema_mismatch_consents == {}
    assert sm._consent_dirty is False


def test_proxy_columns_surface_in_note():
    eng = _engine()
    note = eng._build_proxy_framing_note(
        choice="station_proxy",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="user type (member vs casual)",
        proxy_columns=["member_casual", "start_station_id", "start_station_name"],
    )
    assert note is not None
    assert "member_casual" in note
    assert "start_station_id" in note
    assert "start_station_name" in note


# ── Gap-based consent tests (W3-P1 redesign) ─────────────────────────────


def _engine_with_memory(consents: dict | None = None):
    """Engine with a live SessionMemory, skipping __init__."""
    from agent_engine import SessionMemory
    eng = AgentEngine.__new__(AgentEngine)
    eng.memory = SessionMemory("c1", owner_email="t@x.com")
    if consents is not None:
        eng.memory._schema_mismatch_consents = consents
    return eng


def test_session_memory_initialises_gap_dict():
    """SessionMemory must carry _schema_mismatch_consents dict, not _decided set."""
    from agent_engine import SessionMemory
    sm = SessionMemory("c1", owner_email="t@x.com")
    assert hasattr(sm, "_schema_mismatch_consents"), "_schema_mismatch_consents missing"
    assert isinstance(sm._schema_mismatch_consents, dict)
    assert sm._schema_mismatch_consents == {}
    assert sm._consent_dirty is False


def test_gap_based_skip_suppresses_same_canonical():
    """Consent for 'rider' canonical → second 'rider' question skips Gate C."""
    from unittest.mock import patch
    eng = _engine_with_memory(consents={"rider": {"_id": "trip_id"}})
    schema_cols = ["trip_id", "start_time", "duration_sec"]
    with patch.object(eng, "_flatten_schema_columns", return_value=schema_cols):
        result = eng._should_fire_schema_mismatch_checkpoint("show me churn by rider")
    assert result is None, "Gate C must be suppressed when canonical already consented"


def test_no_bleed_across_canonical():
    """Consent for 'rider' must NOT suppress Gate C for 'person' canonical."""
    from unittest.mock import patch
    eng = _engine_with_memory(consents={"rider": {"_id": "trip_id"}})
    # Schema with trip_id (rider proxy) but no person_id / user_id / customer_id
    schema_cols = ["trip_id", "start_time", "duration_sec"]
    with patch.object(eng, "_flatten_schema_columns", return_value=schema_cols):
        result = eng._should_fire_schema_mismatch_checkpoint(
            "how many individuals used the service last week"
        )
    assert result is not None, "Gate C must fire for 'person' canonical when only 'rider' consented"
    assert result.canonical == "person"


def test_auto_inject_proxy_note_on_reuse():
    """_derive_proxy_note_from_consents must build a non-None directive note
    from stored {canonical: {suffix: proxy_col}} consents."""
    eng = _engine_with_memory(consents={"rider": {"_id": "trip_id"}})
    note = eng._derive_proxy_note_from_consents(eng.memory._schema_mismatch_consents)
    assert note is not None, "_derive_proxy_note_from_consents returned None for non-empty consents"
    lowered = note.lower()
    # Must reference the proxy column
    assert "trip_id" in lowered
    # Must be directive (same contract as _build_proxy_framing_note)
    assert "run_sql" in lowered
    assert "already" in lowered and "consent" in lowered


# ── Entity detection: adjectival entity modifier tests ───────────────────────


def test_individual_modifier_defers_to_entity_noun():
    """'individual rider' — 'individual' is a synonym for 'person' (canonical)
    but is used as an adjectival modifier here.  Detector must return canonical
    'rider', not 'person', so Gate C consent keyed on 'rider' is found on the
    follow-up query 'churn by rider'."""
    from schema_entity_mismatch import EntityDetector
    det = EntityDetector()
    # Schema with no rider_id (so Gate C would fire if entity detected)
    mismatch = det.detect(
        "how many rides per individual rider?",
        ["trip_id", "started_at", "member_casual"],
    )
    assert mismatch is not None, "Gate C must fire — schema has no rider id"
    assert mismatch.canonical == "rider", (
        f"Expected canonical 'rider', got '{mismatch.canonical}'. "
        "'individual' must be treated as adjectival when immediately followed "
        "by another entity surface form."
    )


def test_individual_alone_still_detects_person():
    """'individual' without a following entity term → canonical 'person'.
    Regression guard: fix must not break solo-entity detection."""
    from schema_entity_mismatch import EntityDetector
    det = EntityDetector()
    mismatch = det.detect(
        "show individual activity breakdown",
        ["trip_id", "started_at"],
    )
    assert mismatch is not None
    assert mismatch.canonical == "person"
