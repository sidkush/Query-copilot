def test_churn_no_longer_inflates_budget(monkeypatch):
    """'churn' query should get 8-call budget (not 15) in legacy heuristic path."""
    from unittest.mock import MagicMock
    import backend.agent_engine as ae
    from backend.config import settings
    # Only tests the legacy heuristic (flag OFF) path
    monkeypatch.setattr(settings, 'GROUNDING_W1_HARDCAP_ENFORCE', False)
    eng = MagicMock()
    result = ae.AgentEngine._classify_workload_cap(eng, "user churn last 30 days")
    assert result == 8, f"Expected 8-call budget, got {result}"

def test_domain_analysis_keywords_exist():
    import backend.agent_engine as ae
    assert hasattr(ae, 'DOMAIN_ANALYSIS_KEYWORDS')
    assert "churn" in ae.DOMAIN_ANALYSIS_KEYWORDS
    assert "cohort" in ae.DOMAIN_ANALYSIS_KEYWORDS
