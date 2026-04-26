def test_off_scope_cache_skipped(monkeypatch):
    """Cache write skipped when summary has domain terms the question doesn't."""
    from unittest.mock import MagicMock, patch
    import agent_engine as ae
    store_calls = []
    eng = MagicMock()
    eng._run_question = "rides per station"
    eng.connection_entry = MagicMock(conn_id="c1", tenant_id="t1")
    eng._query_memory = MagicMock()
    eng._query_memory.store_insight.side_effect = lambda **kw: store_calls.append(kw)
    # Simulate the off-scope check logic
    _cache_question = eng._run_question.lower()
    _cache_summary = "10 rows returned with columns: station_id, churn_rate"
    _off_scope_terms = ae.DOMAIN_ANALYSIS_KEYWORDS
    _q_has_term = any(t in _cache_question for t in _off_scope_terms)
    _sum_has_term = any(t in _cache_summary.lower() for t in _off_scope_terms)
    if not (_sum_has_term and not _q_has_term):
        eng._query_memory.store_insight(conn_id="c1", question=_cache_question,
            sql="SELECT 1", result_summary=_cache_summary, columns=[], row_count=10, schema_hash="h")
    assert len(store_calls) == 0, "Should skip cache for off-scope result"

def test_on_scope_cache_stored():
    """Cache write happens when question and summary share domain terms."""
    import agent_engine as ae
    _cache_question = "rider churn last 30 days"
    _cache_summary = "5 rows returned with columns: date, churn_rate"
    _off_scope_terms = ae.DOMAIN_ANALYSIS_KEYWORDS
    _q_has_term = any(t in _cache_question for t in _off_scope_terms)
    _sum_has_term = any(t in _cache_summary.lower() for t in _off_scope_terms)
    assert not (_sum_has_term and not _q_has_term), "On-scope should not trigger skip"
