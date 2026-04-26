def test_feedback_loop_default_on():
    from config import Settings
    s = Settings()
    assert s.FEATURE_AGENT_FEEDBACK_LOOP is True
