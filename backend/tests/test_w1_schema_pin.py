"""W1 Task 1 — DataCoverageCard must land in system prompt with absence rule."""
from unittest.mock import MagicMock
from datetime import datetime, timezone

import pytest

from agent_engine import AgentEngine
from data_coverage import DataCoverageCard


def _card(name="trips", rows=2_847_103):
    return DataCoverageCard(
        table_name=name,
        row_count=rows,
        date_columns=[],
        categorical_columns=[],
        computed_at=datetime.now(timezone.utc),
        dialect="postgresql",
    )


def _make_agent(cards):
    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.coverage_cards = cards
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    return AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )


def test_block_includes_absence_rule(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_DATA_COVERAGE", True)
    agent = _make_agent([_card()])
    block = agent._build_data_coverage_block()
    assert "<data_coverage>" in block
    assert "trips" in block
    assert "absent from <data_coverage>" in block
    assert "ask_user" in block


def test_block_empty_when_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_DATA_COVERAGE", False)
    agent = _make_agent([_card()])
    assert agent._build_data_coverage_block() == ""


def test_block_empty_when_no_cards(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_DATA_COVERAGE", True)
    agent = _make_agent([])
    assert agent._build_data_coverage_block() == ""
