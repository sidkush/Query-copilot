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
