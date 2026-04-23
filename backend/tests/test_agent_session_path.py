def test_agent_session_db_path_configurable(monkeypatch, tmp_path):
    custom = tmp_path / "custom.db"
    monkeypatch.setattr("config.settings.AGENT_SESSION_DB_PATH", str(custom))
    import importlib, agent_session_store
    importlib.reload(agent_session_store)
    assert str(custom) in str(agent_session_store.DB_PATH)
