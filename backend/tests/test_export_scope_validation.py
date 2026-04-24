import pytest

def test_csv_export_runs_scope_validator(monkeypatch):
    monkeypatch.setattr("config.settings.FEATURE_EXPORT_SCOPE_VALIDATION", True)
    called = []
    def fake_validate(self, sql, **kw):
        called.append(sql)
        raise ValueError("scope mismatch")
    monkeypatch.setattr("scope_validator.ScopeValidator.validate", fake_validate)
    from routers.query_routes import _export_guarded
    with pytest.raises(ValueError, match="scope"):
        _export_guarded("SELECT * FROM users", scope_hint={"table": "users"})
    assert called == ["SELECT * FROM users"]
