"""Verify coverage cards flow into agent prompts."""
from datetime import datetime, timezone

from data_coverage import (
    DataCoverageCard, DateCoverage, CategoricalCoverage,
)
from agent_engine import _format_coverage_card_block


def test_format_card_emits_readable_line():
    card = DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="sqlite",
    )
    block = _format_coverage_card_block(card)
    assert "january_trips" in block
    assert "500 rows" in block
    assert "started_at" in block
    assert "2023-12" in block and "2025-10" in block
    assert "23 distinct months" in block
    assert "rider_type" in block
    assert "member" in block


def test_format_card_handles_none_fields():
    card = DataCoverageCard(
        table_name="mystery",
        row_count=-1,
        date_columns=[DateCoverage("x", None, None, None, None)],
        categorical_columns=[CategoricalCoverage("y", None, [])],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="postgresql",
    )
    block = _format_coverage_card_block(card)
    assert "mystery" in block
    assert "(unavailable)" in block


from unittest.mock import MagicMock


def test_system_prompt_includes_data_coverage_block():
    """When coverage_cards is populated, engine builds <data_coverage> block."""
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = [DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 4, 29, tzinfo=timezone.utc),
        dialect="sqlite",
    )]
    engine.connection_entry.db_type = "sqlite"
    engine.engine = None
    engine.email = "u@test"
    engine._persona = None
    engine._skill_library = None
    engine._skill_collection = None

    block = engine._build_data_coverage_block(["january_trips"])
    assert "<data_coverage>" in block
    assert "</data_coverage>" in block
    assert "january_trips" in block
    assert "500 rows" in block
    assert "23 distinct months" in block
