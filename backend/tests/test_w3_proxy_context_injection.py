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
