"""IntentEchoCard assembly + SSE payload."""
from clause_inventory import Clause
from intent_echo import (
    IntentEchoCard, build_echo, echo_to_sse_payload, EchoMode,
)


def test_auto_proceed_mode_when_score_low():
    card = build_echo(
        nl="count users",
        sql="SELECT COUNT(*) FROM users",
        ambiguity=0.1,
        clauses=[],
        unmapped=[],
        tables_touched=["users"],
    )
    assert card.mode is EchoMode.AUTO_PROCEED
    assert card.interpretations == []


def test_proceed_button_mode_when_mid_score():
    card = build_echo(
        nl="count recent users",
        sql="SELECT * FROM users",
        ambiguity=0.55,
        clauses=[Clause(text="recent users", kind="cohort_filter")],
        unmapped=[],
        tables_touched=["users"],
    )
    assert card.mode is EchoMode.PROCEED_BUTTON
    assert len(card.interpretations) >= 1


def test_mandatory_choice_mode_when_high_score():
    card = build_echo(
        nl="why are casual riders churning",
        sql="SELECT 1",
        ambiguity=0.9,
        clauses=[Clause(text="churning", kind="metric")],
        unmapped=[],
        tables_touched=["trips"],
    )
    assert card.mode is EchoMode.MANDATORY_CHOICE
    assert len(card.interpretations) >= 2
    assert any("30" in i.text or "60" in i.text or "90" in i.text for i in card.interpretations)


def test_unmapped_clauses_attach_warnings():
    card = build_echo(
        nl="casual riders by station",
        sql="SELECT * FROM trips WHERE rider_type='casual'",
        ambiguity=0.6,
        clauses=[
            Clause(text="casual riders", kind="cohort_filter"),
            Clause(text="by station", kind="groupby"),
        ],
        unmapped=[Clause(text="by station", kind="groupby")],
        tables_touched=["trips"],
    )
    assert len(card.warnings) >= 1
    assert any("station" in w for w in card.warnings)


def test_sse_payload_shape_is_json_serializable():
    import json
    card = build_echo(
        nl="x", sql="SELECT 1", ambiguity=0.2, clauses=[], unmapped=[], tables_touched=[],
    )
    payload = echo_to_sse_payload(card)
    json.dumps(payload)
    assert payload["mode"] in {"auto_proceed", "proceed_button", "mandatory_choice"}
    assert "interpretations" in payload
