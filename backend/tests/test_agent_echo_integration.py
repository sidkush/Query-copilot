"""Agent engine -> IntentEcho integration."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

from agent_engine import AgentEngine
from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage


def _card():
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def _engine(with_card=False):
    e = AgentEngine.__new__(AgentEngine)
    e.connection_entry = MagicMock()
    e.connection_entry.coverage_cards = [_card()] if with_card else []
    e.connection_entry.db_type = "sqlite"
    e.engine = None
    e.email = "u@t"
    e._persona = None
    e._skill_library = None
    e._skill_collection = None
    e._session_id = "sess-1"
    e._current_nl_question = "why are casual riders churning"
    return e


def test_ambiguous_question_emits_echo():
    e = _engine(with_card=False)
    card = e._emit_intent_echo_if_ambiguous(
        nl="why are casual riders churning",
        sql="SELECT * FROM trips WHERE rider_type='casual'",
        tables_touched=["trips"],
    )
    assert card is not None
    assert card["mode"] in {"proceed_button", "mandatory_choice"}


def test_unambiguous_question_no_echo():
    e = _engine(with_card=False)
    card = e._emit_intent_echo_if_ambiguous(
        nl="count users",
        sql="SELECT COUNT(*) FROM users",
        tables_touched=["users"],
    )
    assert card is None or card["mode"] == "auto_proceed"


def test_replan_hint_returned_on_scope_violation():
    e = _engine(with_card=True)
    hint = e._handle_scope_violations_with_replan(
        sql="SELECT * FROM january_trips WHERE started_at < '1900-01-01'",
        nl="old trips",
    )
    assert hint is not None
    assert "range_mismatch" in (hint.get("reason") or "")

    hint2 = e._handle_scope_violations_with_replan(
        sql="SELECT * FROM january_trips WHERE started_at < '1900-01-01'",
        nl="old trips",
    )
    # AMEND-W2-T4-02 — budget exhausted with violations present must
    # return a sentinel dict (not bare None) so the caller can refuse
    # to execute the bad SQL.
    assert isinstance(hint2, dict)
    assert hint2.get("budget_exhausted") is True
    assert hint2.get("tier") == "unverified"
