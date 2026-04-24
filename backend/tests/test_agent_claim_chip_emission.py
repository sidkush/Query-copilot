"""AgentEngine wraps synthesis with claim provenance when flag on."""
from unittest.mock import MagicMock, patch

def test_synthesis_gets_unverified_marker_when_number_not_in_rowset():
    from agent_engine import AgentEngine
    from claim_provenance import ClaimProvenance
    engine = AgentEngine.__new__(AgentEngine)
    engine._claim_provenance = ClaimProvenance(unverified_marker="[unverified]")
    engine._recent_rowsets = [{"query_id": "q1", "rows": [[42]]}]
    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_CLAIM_PROVENANCE = True
        out = engine._apply_claim_provenance("Found 42 rows and 999 anomalies.")
    assert "[unverified]" in out

def test_synthesis_unchanged_when_flag_off():
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine._claim_provenance = None
    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_CLAIM_PROVENANCE = False
        out = engine._apply_claim_provenance("Found 999 anomalies.")
    assert out == "Found 999 anomalies."

def test_ledger_append_on_measured_claim():
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    engine._claim_provenance = MagicMock()
    engine._claim_provenance.bind = MagicMock(return_value="Found 42 rows.")
    engine._audit_ledger = MagicMock()
    engine._recent_rowsets = [{"query_id": "q1", "rows": [[42]], "sql_hash": "aa", "rowset_hash": "bb", "schema_hash": "cc"}]
    engine.connection_entry = MagicMock()
    engine.connection_entry.tenant_id = "t1"
    engine._current_plan = MagicMock()
    engine._current_plan.plan_id = "p1"
    with patch("agent_engine.settings") as mock_s:
        mock_s.FEATURE_CLAIM_PROVENANCE = True
        mock_s.FEATURE_AUDIT_LEDGER = True
        engine._apply_claim_provenance("Found 42 rows.")
    engine._audit_ledger.append.assert_called()
