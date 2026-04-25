"""_tool_run_sql pushes (query_id, rows, hashes) onto _recent_rowsets."""
from unittest.mock import MagicMock, patch

def test_tool_run_sql_records_rowset():
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = []
    engine.connection_entry.db_type = "sqlite"
    engine.engine = MagicMock()
    engine.engine.validator = MagicMock()
    engine.engine.validator.validate = MagicMock(return_value=(True, "SELECT 1", None))
    engine.engine.validator.apply_limit = lambda s: s
    df_mock = MagicMock()
    df_mock.columns = ["c"]
    df_mock.values.tolist = MagicMock(return_value=[[42]])
    df_mock.replace.return_value = df_mock  # NaN sanitisation returns same df
    engine.engine.db = MagicMock()
    engine.engine.db.execute_query = MagicMock(return_value=df_mock)
    engine._sql_retries = 0
    engine.MAX_SQL_RETRIES = 3
    engine.auto_execute = True
    engine.email = "test@test"
    engine._result = MagicMock()
    engine._query_memory = MagicMock()
    engine.memory = MagicMock()
    engine.memory.get_messages = MagicMock(return_value=[])
    engine._get_turbo_tier = MagicMock(return_value=None)
    engine._current_nl_question = ""
    engine._last_scope_warnings = None
    engine._run_scope_validator = MagicMock(return_value=MagicMock(violations=[]))
    engine._recent_rowsets = []
    import agent_engine as _ae
    _ae.settings = MagicMock()
    _ae.settings.FEATURE_AGENT_FEEDBACK_LOOP = False
    engine._tool_run_sql("SELECT 42")
    assert len(engine._recent_rowsets) == 1
    rs = engine._recent_rowsets[0]
    assert "query_id" in rs
    assert rs["rows"] == [[42]]
    assert "sql_hash" in rs
