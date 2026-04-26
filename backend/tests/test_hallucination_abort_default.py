def test_hallucination_abort_default_on():
    from config import Settings
    s = Settings()
    assert s.FEATURE_AGENT_HALLUCINATION_ABORT is True
