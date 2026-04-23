import json
from pathlib import Path
import audit_trail


def test_log_agent_event_writes_actor_type(tmp_path, monkeypatch):
    log_dir = tmp_path / "audit"
    log_dir.mkdir()
    monkeypatch.setattr("audit_trail._log_path", lambda: log_dir / "query_decisions.jsonl")
    monkeypatch.setattr("audit_trail._ensure_dir", lambda: None)
    audit_trail.log_agent_event(
        email="u@example.com",
        chat_id="c1",
        event="start",
        actor_type="support",
        details={},
    )
    line = (log_dir / "query_decisions.jsonl").read_text().strip()
    assert json.loads(line)["actor_type"] == "support"
