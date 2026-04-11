"""
Test for Bug 4.5: anonymize_sql() coverage gaps.

The bug: anonymize_sql() misses hex literals (0xFF), scientific notation
(1e10), dollar-quoted strings ($$...$$), and SQL-standard escaped quotes
('it''s'). These leak literal values into shared ChromaDB.

The fix: Add regex branches for all four forms.
"""

import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock chromadb before importing query_memory to avoid chromadb dep issues
if "chromadb" not in sys.modules:
    _mock = types.ModuleType("chromadb")
    _mock.EmbeddingFunction = type("EmbeddingFunction", (), {})
    sys.modules["chromadb"] = _mock

from query_memory import anonymize_sql


def test_hex_literals_anonymized():
    """Hex literals like 0xFF, 0x1A2B must be replaced with ?."""
    result = anonymize_sql("SELECT * FROM t WHERE flags = 0xFF")
    assert "0xFF" not in result, f"Hex literal 0xFF leaked: {result}"
    assert "?" in result


def test_hex_lowercase_anonymized():
    """Lowercase hex 0xff must also be replaced."""
    result = anonymize_sql("SELECT * FROM t WHERE mask = 0x1a2b3c")
    assert "0x1a2b3c" not in result, f"Hex literal leaked: {result}"


def test_scientific_notation_anonymized():
    """Scientific notation like 1e10, 3.14e-2 must be replaced."""
    result = anonymize_sql("SELECT * FROM t WHERE val > 1e10")
    assert "1e10" not in result, f"Scientific notation leaked: {result}"


def test_scientific_notation_with_decimal():
    """3.14e-2 must be replaced."""
    result = anonymize_sql("SELECT * FROM t WHERE x = 3.14e-2")
    assert "3.14e-2" not in result and "3.14" not in result, (
        f"Scientific notation leaked: {result}"
    )


def test_dollar_quoted_strings_anonymized():
    """PostgreSQL dollar-quoted strings $$text$$ must be replaced."""
    result = anonymize_sql("SELECT * FROM t WHERE body = $$hello world$$")
    assert "hello world" not in result, f"Dollar-quoted string leaked: {result}"
    assert "?" in result


def test_tagged_dollar_quoted_strings():
    """Tagged dollar-quotes $tag$text$tag$ must be replaced."""
    result = anonymize_sql("SELECT * FROM t WHERE x = $fn$body text$fn$")
    assert "body text" not in result, f"Tagged dollar-quoted string leaked: {result}"


def test_sql_standard_escaped_quotes():
    """SQL-standard doubled quotes 'it''s' must be handled as one string."""
    result = anonymize_sql("SELECT * FROM t WHERE name = 'it''s a test'")
    assert "it" not in result and "test" not in result, (
        f"SQL-escaped string leaked: {result}"
    )
    # Should be replaced with a single ?
    assert "?" in result


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
