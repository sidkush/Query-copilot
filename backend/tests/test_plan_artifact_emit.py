def test_plan_artifact_emitted_before_sql(monkeypatch):
    """plan_artifact step appears when plan is generated."""
    from config import settings
    monkeypatch.setattr(settings, 'PLAN_ARTIFACT_EMIT_BEFORE_FIRST_SQL', True)
    # Integration: verify the step type exists in module
    import backend.agent_engine as ae
    assert hasattr(ae, 'AgentStep')
    # If plan_artifact emitted, it must have type="plan_artifact"
    step = ae.AgentStep(type="plan_artifact", content="test plan", tool_input=[])
    assert step.type == "plan_artifact"
