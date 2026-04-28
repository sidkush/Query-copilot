"""Agent invokes AnalyticalPlanner when FEATURE_AGENT_PLANNER=True."""
from unittest.mock import MagicMock, patch
import pytest


def test_agent_calls_planner_before_first_sql_when_flag_on():
    from agent_engine import AgentEngine
    from analytical_planner import AnalyticalPlan

    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = []
    engine.connection_entry.conn_id = "c1"
    engine.connection_entry.tenant_id = "t1"
    engine.connection_entry.db_type = "sqlite"

    mock_planner = MagicMock()
    mock_planner.plan = MagicMock(return_value=AnalyticalPlan(
        plan_id="p1", ctes=[], fallback=True, registry_hits=[],
    ))
    engine._planner = mock_planner

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_PLANNER = True
    # Wave 2 spike-fix: explicit BENCHMARK_MODE=False to avoid MagicMock-truthy
    # leak (otherwise the new BENCHMARK_MODE coercion in _maybe_emit_plan would
    # always activate and this test wouldn't really test the FEATURE_* gate).
    _ae.settings.BENCHMARK_MODE = False

    plan = engine._maybe_emit_plan(nl="trips")
    mock_planner.plan.assert_called_once()
    assert plan.plan_id == "p1"


def test_agent_skips_planner_when_flag_off():
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    engine._planner = MagicMock()

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_PLANNER = False
    # Wave 2 spike-fix: explicit BENCHMARK_MODE=False — without this the
    # MagicMock truthy-leak makes _maybe_emit_plan run the planner anyway,
    # silently inverting what the test claims to verify.
    _ae.settings.BENCHMARK_MODE = False

    plan = engine._maybe_emit_plan(nl="trips")
    assert plan is None
    engine._planner.plan.assert_not_called()


def test_planner_skips_when_connection_entry_has_no_tenant_id():
    """REGRESSION: missing tenant_id MUST cause planner to skip, not substitute a sentinel.

    Substituting any non-empty sentinel ("default", "unknown", etc.) defeats
    Wave 2 PlanCache tenant isolation by collapsing all tenant-less
    connections into a shared cache namespace. Cross-tenant cache leak that
    passes existing isolation tests because they all test explicit-tenant
    cases — this test covers the missing-tenant edge specifically.

    Skip-and-log is the only correct behavior. Mirrors option (a) for the
    empty-API-key case in _attach_ring8_components. Architecturally correct
    fix is required tenant_id at ConnectionEntry construction (post-BIRD
    ticket spawned for that broader audit).
    """
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    # spec=["conn_id", "coverage_cards"] — MagicMock will raise AttributeError
    # on tenant_id access, which getattr(..., None) catches and returns None.
    # Simulates a production connection_entry constructed without tenant_id,
    # NOT an entry with tenant_id="" (which would also fail the truthy check
    # below — both paths must skip).
    engine.connection_entry = MagicMock(spec=["conn_id", "coverage_cards"])
    engine.connection_entry.conn_id = "c1"
    engine.connection_entry.coverage_cards = []
    engine._planner = MagicMock()

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_PLANNER = True
    _ae.settings.BENCHMARK_MODE = False

    result = engine._maybe_emit_plan(nl="anything")

    assert result is None, (
        "planner must return None when tenant_id missing — substituting a "
        "sentinel would create cross-tenant cache leak"
    )
    engine._planner.plan.assert_not_called()


def test_planner_skips_when_tenant_id_is_empty_string():
    """REGRESSION: tenant_id="" is treated identically to missing tenant_id.

    Both fail the `if not tenant_id` truthy check; both must skip planner,
    not pass empty string down to plan_cache where it would raise ValueError
    (which our narrow exception handler would catch but still represents a
    confusing failure mode).
    """
    from agent_engine import AgentEngine

    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.conn_id = "c1"
    engine.connection_entry.tenant_id = ""  # explicit empty
    engine.connection_entry.coverage_cards = []
    engine._planner = MagicMock()

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_PLANNER = True
    _ae.settings.BENCHMARK_MODE = False

    result = engine._maybe_emit_plan(nl="anything")

    assert result is None
    engine._planner.plan.assert_not_called()
