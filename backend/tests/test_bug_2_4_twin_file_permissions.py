"""
Test for Bug 2.4: DuckDB twin files lack encryption/access restrictions.

The bug: Twin files containing sampled rows (potentially PHI/PII) are
written with default OS permissions, readable by any user on the system.

The fix: Set restrictive file permissions (owner-only) on twin files
after creation, and add a startup warning when twins are enabled without
disk-level encryption configured.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "duckdb_twin.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_create_twin_restricts_file_permissions():
    """create_twin() must set restrictive file permissions on the twin file."""
    source = _load_source()
    match = re.search(
        r"def create_twin\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_twin function"
    body = match.group()
    has_chmod = "chmod" in body or "os.chmod" in body
    assert has_chmod, (
        "create_twin() must set restrictive file permissions (os.chmod) "
        "on the twin .duckdb file to prevent unauthorized access to sampled data"
    )


def test_chmod_uses_owner_only():
    """File permissions must be owner-only (0o600 or stricter)."""
    source = _load_source()
    match = re.search(
        r"def create_twin\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_twin function"
    body = match.group()
    # Should contain 0o600 (rw owner only) or 0o400 (read-only owner)
    has_restrictive = "0o600" in body or "0o400" in body or "stat.S_IRUSR" in body
    assert has_restrictive, (
        "File permissions must be owner-only (0o600 or stricter) "
        "to protect sensitive sampled data"
    )


def test_twin_encryption_warning_in_config():
    """Config must have a flag to warn about unencrypted twin storage."""
    config_path = os.path.join(os.path.dirname(__file__), "..", "config.py")
    with open(config_path, "r", encoding="utf-8") as f:
        config_source = f.read()
    has_warning_flag = (
        "TURBO_TWIN_WARN_UNENCRYPTED" in config_source
        or "TWIN_ENCRYPTION" in config_source
    )
    assert has_warning_flag, (
        "config.py must have a flag (e.g., TURBO_TWIN_WARN_UNENCRYPTED) "
        "to warn when twin storage is on an unencrypted volume"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
