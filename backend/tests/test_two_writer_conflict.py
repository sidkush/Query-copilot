import json
import os
import pytest
from pathlib import Path
import user_storage


def test_atomic_write_detects_concurrent_mtime_bump(tmp_path):
    path = tmp_path / "profile.json"
    path.write_text(json.dumps({"rev": 1}))
    original_mtime = path.stat().st_mtime_ns
    # Simulate concurrent writer: bump mtime before commit
    os.utime(path, ns=(original_mtime + 10_000_000, original_mtime + 10_000_000))
    # Resolve class at call time so a prior test's importlib.reload
    # of user_storage doesn't desync the expected class identity.
    with pytest.raises(user_storage.TwoWriterConflict):
        user_storage.atomic_write_profile(path, {"rev": 2}, expected_mtime_ns=original_mtime)


def test_atomic_write_succeeds_when_mtime_unchanged(tmp_path):
    path = tmp_path / "profile.json"
    path.write_text(json.dumps({"rev": 1}))
    current_mtime = path.stat().st_mtime_ns
    user_storage.atomic_write_profile(path, {"rev": 2}, expected_mtime_ns=current_mtime)
    assert json.loads(path.read_text())["rev"] == 2
