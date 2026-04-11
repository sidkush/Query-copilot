"""
Adversarial fix: anonymize_sql() must handle leading-dot floats like .5, .123.

The bug: _NUMBER_PATTERN has (?<![.\w]) lookbehind which prevents matching
bare decimal floats like .5 because the dot itself triggers the lookbehind.

The fix: Add an alternative branch for leading-dot decimal forms.
"""

import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock chromadb before importing query_memory
if "chromadb" not in sys.modules:
    _mock = types.ModuleType("chromadb")
    _mock.EmbeddingFunction = type("EmbeddingFunction", (), {})
    sys.modules["chromadb"] = _mock

from query_memory import anonymize_sql


def test_leading_dot_float_anonymized():
    """.5 must be replaced with ?."""
    result = anonymize_sql("SELECT * FROM t WHERE x = .5")
    assert ".5" not in result, f"Leading-dot float .5 leaked: {result}"
    assert "?" in result


def test_leading_dot_longer_float():
    """.123 must be replaced with ?."""
    result = anonymize_sql("SELECT * FROM t WHERE ratio = .123")
    assert ".123" not in result, f"Leading-dot float .123 leaked: {result}"


def test_leading_dot_with_exponent():
    """.5e3 must be replaced with ?."""
    result = anonymize_sql("SELECT * FROM t WHERE val = .5e3")
    assert ".5e3" not in result and ".5" not in result, (
        f"Leading-dot float with exponent leaked: {result}"
    )


def test_column_names_with_dots_preserved():
    """Column references like t.col must NOT be anonymized."""
    result = anonymize_sql("SELECT t.price FROM t WHERE t.price > .5")
    assert "t.price" in result, f"Column reference damaged: {result}"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
