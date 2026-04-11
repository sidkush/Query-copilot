"""
Adversarial fix: TURBO_TWIN_WARN_UNENCRYPTED config flag must be consumed.

The bug: config.py defines TURBO_TWIN_WARN_UNENCRYPTED but no code reads it.
The flag is dead code.

The fix: duckdb_twin.py must check this flag and emit a warning when creating
twins without disk encryption.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "duckdb_twin.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_warn_unencrypted_flag_is_consumed():
    """duckdb_twin.py must reference TURBO_TWIN_WARN_UNENCRYPTED."""
    source = _load_source()
    assert "TURBO_TWIN_WARN_UNENCRYPTED" in source, (
        "duckdb_twin.py does not reference TURBO_TWIN_WARN_UNENCRYPTED. "
        "The config flag is dead code — it must be consumed to warn operators."
    )


def test_warn_unencrypted_in_create_twin():
    """The warning must appear in create_twin(), not just an import."""
    source = _load_source()
    match = re.search(
        r"def create_twin\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_twin function"
    body = match.group()

    assert "TURBO_TWIN_WARN_UNENCRYPTED" in body, (
        "create_twin() does not check TURBO_TWIN_WARN_UNENCRYPTED. "
        "Add a warning log when the flag is True and a twin file is created."
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
