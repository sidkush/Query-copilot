"""Verify scope violations from Phase C feed back to LLM via tool-result text."""
from unittest.mock import MagicMock
import pytest


def test_scope_warnings_surface_in_tool_result_when_flag_on():
    from agent_engine import AgentEngine
    from scope_validator import Violation, RuleId, ValidatorResult

    import pandas as pd
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = []
    engine.connection_entry.db_type = "sqlite"
    engine.connection_entry.conn_id = "test-conn"
    engine.engine = MagicMock()
    engine.engine.validator = MagicMock()
    engine.engine.validator.validate = MagicMock(return_value=(True, "SELECT 1", None))
    engine.engine.validator.apply_limit = lambda s: s
    engine.engine.db = MagicMock()
    engine.engine.db.execute_query = MagicMock(return_value=pd.DataFrame(columns=[], data=[]))
    engine.email = "test@test.com"
    engine._sql_retries = 0
    engine.auto_execute = True
    engine._current_nl_question = "show trips before 1900"
    engine._last_scope_warnings = None
    engine._result = MagicMock()
    engine._get_turbo_tier = MagicMock(return_value=None)

    engine._run_scope_validator = MagicMock(return_value=ValidatorResult(
        violations=[Violation(
            rule_id=RuleId.RANGE_MISMATCH,
            message="WHERE started_at < '1900-01-01' outside card range",
            severity="warn",
        )],
    ))

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_FEEDBACK_LOOP = True

    result = engine._tool_run_sql("SELECT * FROM trips WHERE started_at < '1900-01-01'")
    import json
    payload = json.loads(result)
    assert "scope_warnings" in payload, f"expected scope_warnings key in {payload!r}"
    assert any("range_mismatch" in w.get("rule", "") for w in payload["scope_warnings"])


def test_scope_warnings_suppressed_when_flag_off():
    from agent_engine import AgentEngine
    from scope_validator import ValidatorResult

    import pandas as pd
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = []
    engine.connection_entry.db_type = "sqlite"
    engine.connection_entry.conn_id = "test-conn"
    engine.engine = MagicMock()
    engine.engine.validator = MagicMock()
    engine.engine.validator.validate = MagicMock(return_value=(True, "SELECT 1", None))
    engine.engine.validator.apply_limit = lambda s: s
    engine.engine.db = MagicMock()
    engine.engine.db.execute_query = MagicMock(return_value=pd.DataFrame(columns=[], data=[]))
    engine.email = "test@test.com"
    engine._sql_retries = 0
    engine.auto_execute = True
    engine._current_nl_question = ""
    engine._last_scope_warnings = None
    engine._result = MagicMock()
    engine._get_turbo_tier = MagicMock(return_value=None)
    engine._run_scope_validator = MagicMock(return_value=ValidatorResult(violations=[]))

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_FEEDBACK_LOOP = False

    result = engine._tool_run_sql("SELECT 1")
    import json
    payload = json.loads(result)
    assert "scope_warnings" not in payload


def test_replan_controller_invoked_on_violation():
    """With FEATURE_AGENT_FEEDBACK_LOOP=True, _handle_scope_violations_with_replan
    must be called and its hint appended to the tool_result."""
    from agent_engine import AgentEngine
    from scope_validator import Violation, RuleId, ValidatorResult

    import pandas as pd
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = []
    engine.connection_entry.db_type = "sqlite"
    engine.connection_entry.conn_id = "test-conn"
    engine.engine = MagicMock()
    engine.engine.validator = MagicMock()
    engine.engine.validator.validate = MagicMock(return_value=(True, "SELECT 1", None))
    engine.engine.validator.apply_limit = lambda s: s
    engine.engine.db = MagicMock()
    engine.engine.db.execute_query = MagicMock(return_value=pd.DataFrame(columns=[], data=[]))
    engine.email = "test@test.com"
    engine._sql_retries = 0
    engine.auto_execute = True
    engine._current_nl_question = "show trips"
    engine._last_scope_warnings = None
    engine._result = MagicMock()
    engine._get_turbo_tier = MagicMock(return_value=None)

    engine._run_scope_validator = MagicMock(return_value=ValidatorResult(
        violations=[Violation(RuleId.RANGE_MISMATCH, "out of range", "warn")],
    ))
    engine._handle_scope_violations_with_replan = MagicMock(
        return_value={"reason": "range_mismatch", "context": {"min": "2023-12-01"}, "original_sql": "SELECT 1"}
    )

    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_FEEDBACK_LOOP = True

    result = engine._tool_run_sql("SELECT 1")
    engine._handle_scope_violations_with_replan.assert_called_once()
    import json
    payload = json.loads(result)
    assert "replan_hint" in payload
    assert payload["replan_hint"]["reason"] == "range_mismatch"
