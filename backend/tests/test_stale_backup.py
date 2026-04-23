from pathlib import Path
import os
import time
from routers.dashboard_routes import _stale_flag


def test_stale_flag_fresh(tmp_path, monkeypatch):
    monkeypatch.setattr("config.settings.STALE_BACKUP_WARN_DAYS", 30)
    p = tmp_path / "b.json"; p.write_text("{}")
    assert _stale_flag(p) is False


def test_stale_flag_stale(tmp_path, monkeypatch):
    monkeypatch.setattr("config.settings.STALE_BACKUP_WARN_DAYS", 1)
    p = tmp_path / "b.json"; p.write_text("{}")
    past = time.time() - 3 * 86400
    os.utime(p, (past, past))
    assert _stale_flag(p) is True
