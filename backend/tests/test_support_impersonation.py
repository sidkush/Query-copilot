def test_impersonation_writes_audit_actor_type_support(monkeypatch):
    calls = []
    import audit_trail
    monkeypatch.setattr(audit_trail, "log_agent_event", lambda **kw: calls.append(kw))
    # admin_routes imports log_agent_event at module load — patch its binding too
    from routers import admin_routes
    monkeypatch.setattr(admin_routes, "log_agent_event", lambda **kw: calls.append(kw))
    admin_routes._impersonate_core(
        actor_email="support@askdb.dev",
        target_email="user@example.com",
        justification="ticket #1234 — user cannot log in",
    )
    assert calls
    assert calls[0]["actor_type"] == "support"


def test_impersonate_request_rejects_short_justification():
    from routers.admin_routes import ImpersonateRequest
    import pytest
    with pytest.raises(Exception):
        ImpersonateRequest(target="x@y.com", justification="short")
