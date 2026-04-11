"""
Test for Bug 1.3: Negative LIMIT/OFFSET not clamped.

The bug: LIMIT -1 passes validation and apply_limit() unchanged.
On SQLite, LIMIT -1 means "no limit", bypassing MAX_ROWS.
Negative OFFSET is also not caught.

The fix: In apply_limit(), clamp negative LIMIT values to max_rows.
In validate(), clamp negative OFFSET to 0.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sql_validator import SQLValidator


def test_negative_limit_clamped_by_apply_limit():
    """LIMIT -1 must be clamped to max_rows by apply_limit()."""
    v = SQLValidator(dialect="sqlite", max_rows=100)
    result = v.apply_limit("SELECT * FROM users LIMIT -1")
    # The output SQL should have LIMIT 100, not LIMIT -1
    assert "-1" not in result, (
        f"apply_limit() did not clamp LIMIT -1. Got: {result}"
    )
    assert "100" in result, (
        f"apply_limit() should set LIMIT to max_rows (100). Got: {result}"
    )


def test_negative_limit_large_clamped():
    """LIMIT -999 must also be clamped."""
    v = SQLValidator(dialect="postgres", max_rows=1000)
    result = v.apply_limit("SELECT * FROM orders LIMIT -999")
    assert "-999" not in result
    assert "1000" in result


def test_zero_limit_preserved():
    """LIMIT 0 is valid (returns empty set) — should not be changed."""
    v = SQLValidator(dialect="postgres", max_rows=1000)
    result = v.apply_limit("SELECT * FROM orders LIMIT 0")
    # LIMIT 0 is fine — returns empty set, not a bypass
    assert "0" in result


def test_negative_offset_clamped_by_validate():
    """Negative OFFSET must be clamped to 0 during validation."""
    v = SQLValidator(dialect="postgres", max_rows=1000)
    is_valid, clean_sql, error = v.validate("SELECT * FROM users OFFSET -5")
    assert is_valid, f"Validation failed: {error}"
    assert "-5" not in clean_sql, (
        f"validate() did not clamp negative OFFSET. Got: {clean_sql}"
    )


def test_positive_limit_within_max_unchanged():
    """LIMIT within max_rows should pass through unchanged."""
    v = SQLValidator(dialect="postgres", max_rows=1000)
    result = v.apply_limit("SELECT * FROM users LIMIT 50")
    assert "50" in result


def test_positive_limit_exceeding_max_clamped():
    """LIMIT exceeding max_rows should be clamped."""
    v = SQLValidator(dialect="postgres", max_rows=100)
    result = v.apply_limit("SELECT * FROM users LIMIT 5000")
    assert "5000" not in result
    assert "100" in result


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
