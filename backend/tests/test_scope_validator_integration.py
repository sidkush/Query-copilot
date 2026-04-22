"""End-to-end: agent-engine invokes ScopeValidator between SQL gen and exec."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from agent_engine import AgentEngine


def _card():
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def _engine_with_card():
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = [_card()]
    engine.connection_entry.db_type = "sqlite"
    engine.engine = None
    engine.email = "u@t"
    engine._persona = None
    engine._skill_library = None
    engine._skill_collection = None
    return engine


def test_validate_before_exec_returns_violations_for_out_of_range_where():
    engine = _engine_with_card()
    result = engine._run_scope_validator(
        sql="SELECT * FROM january_trips WHERE started_at < '1900-01-01'",
        nl_question="show me all trips",
    )
    assert result.violations
    assert any(v.rule_id.value == "range_mismatch" for v in result.violations)


def test_validate_passes_clean_sql():
    engine = _engine_with_card()
    result = engine._run_scope_validator(
        sql="SELECT * FROM january_trips WHERE started_at >= '2024-06-01'",
        nl_question="2024 trips",
    )
    assert result.passed


def test_waterfall_exposes_scope_validator_hook():
    """Smoke test: the waterfall router module exposes validate_scope()."""
    import waterfall_router
    assert hasattr(waterfall_router, "validate_scope")


def test_waterfall_validate_scope_returns_result_for_any_tier():
    from waterfall_router import validate_scope
    result = validate_scope(
        sql="SELECT 1",
        ctx={},
        dialect="sqlite",
    )
    assert result.passed is True
    assert result.violations == []
