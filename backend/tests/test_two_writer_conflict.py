import json
import os
import pytest
from pathlib import Path
from user_storage import atomic_write_profile, TwoWriterConflict


def test_atomic_write_detects_concurrent_mtime_bump(tmp_path):
    path = tmp_path / "profile.json"
    path.write_text(json.dumps({"rev": 1}))
    original_mtime = path.stat().st_mtime_ns
    # Simulate concurrent writer: bump mtime before commit
    os.utime(path, ns=(original_mtime + 10_000_000, original_mtime + 10_000_000))
    with pytest.raises(TwoWriterConflict):
        atomic_write_profile(path, {"rev": 2}, expected_mtime_ns=original_mtime)


def test_atomic_write_succeeds_when_mtime_unchanged(tmp_path):
    path = tmp_path / "profile.json"
    path.write_text(json.dumps({"rev": 1}))
    current_mtime = path.stat().st_mtime_ns
    atomic_write_profile(path, {"rev": 2}, expected_mtime_ns=current_mtime)
    assert json.loads(path.read_text())["rev"] == 2
