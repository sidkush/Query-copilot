"""
Test for Bug 3.3: refresh_twin() delete-then-create unavailability window.

The bug: refresh_twin() calls delete_twin() then create_twin(). Between
those calls, concurrent queries fail with "twin does not exist".

The fix: Skip delete_twin(). create_twin() already writes to .tmp.duckdb
and atomically renames to .duckdb, overwriting the existing file.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "duckdb_twin.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_refresh_does_not_call_delete():
    """refresh_twin() must NOT call delete_twin() before create_twin()."""
    source = _load_source()
    match = re.search(
        r"def refresh_twin\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find refresh_twin function"
    body = match.group()
    assert "delete_twin" not in body, (
        "refresh_twin() must not call delete_twin() — create_twin() "
        "already does an atomic swap via .tmp.duckdb rename"
    )


def test_refresh_calls_create_twin():
    """refresh_twin() must call create_twin() directly."""
    source = _load_source()
    match = re.search(
        r"def refresh_twin\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find refresh_twin function"
    body = match.group()
    assert "create_twin" in body, (
        "refresh_twin() must call create_twin() for atomic replacement"
    )


def test_create_twin_uses_atomic_rename():
    """create_twin() must use atomic rename (os.replace or Path.rename)."""
    source = _load_source()
    match = re.search(
        r"def create_twin\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_twin function"
    body = match.group()
    has_atomic = "replace" in body or "rename" in body
    assert has_atomic, (
        "create_twin() must use os.replace() or Path.rename() for atomic swap"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
