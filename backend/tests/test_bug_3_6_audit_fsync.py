"""
Test for Bug 3.6: Audit trail fsync blocks on every write.

The bug: _append_entry() calls os.fsync() under _write_lock for every
single entry. With 50+ concurrent users, this serializes all routing
decisions and adds 5-50ms latency per write.

The fix: Remove per-entry os.fsync() calls. Rely on OS-level flush +
periodic fsync, or use a buffered/batched approach. The append-only
guarantee is maintained by the file open mode ('a') and the write lock.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "audit_trail.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_append_entry_no_per_entry_fsync():
    """_append_entry() must not call os.fsync() on every single write."""
    source = _load_source()
    match = re.search(
        r"def _append_entry\(.*?(?=\ndef |\Z)", source, re.DOTALL
    )
    assert match, "Could not find _append_entry function"
    body = match.group()
    # os.fsync should NOT appear directly in _append_entry
    assert "os.fsync" not in body, (
        "_append_entry() must not call os.fsync() per entry — "
        "this serializes all concurrent writes. Use flush() only "
        "or batch fsync on a timer."
    )


def test_append_entry_still_flushes():
    """_append_entry() must still flush to ensure data reaches OS buffers."""
    source = _load_source()
    match = re.search(
        r"def _append_entry\(.*?(?=\ndef |\Z)", source, re.DOTALL
    )
    assert match, "Could not find _append_entry function"
    body = match.group()
    assert "flush()" in body, (
        "_append_entry() must still call flush() to push data to OS buffers"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
