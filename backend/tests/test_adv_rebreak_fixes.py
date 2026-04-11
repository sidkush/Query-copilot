"""
Rebreak fixes from adversarial analyst re-dispatch:
1. Trailing-dot floats (1., 42.) must be anonymized
2. sql_intent masking must handle compound column names (employee_ssn)
"""

import os
import re
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock chromadb before importing query_memory
if "chromadb" not in sys.modules:
    _mock = types.ModuleType("chromadb")
    _mock.EmbeddingFunction = type("EmbeddingFunction", (), {})
    sys.modules["chromadb"] = _mock

from query_memory import anonymize_sql


def test_trailing_dot_float_anonymized():
    """1. must be replaced with ?."""
    result = anonymize_sql("SELECT * FROM t WHERE salary > 100000.")
    assert "100000." not in result, f"Trailing-dot float leaked: {result}"
    assert "?" in result


def test_trailing_dot_with_exponent():
    """1.e5 must be replaced with ?."""
    result = anonymize_sql("SELECT * FROM t WHERE x = 1.e5")
    assert "1.e5" not in result and "1." not in result, (
        f"Trailing-dot exponent leaked: {result}"
    )


def test_trailing_dot_preserves_column_refs():
    """t.price must NOT be affected by trailing-dot pattern."""
    result = anonymize_sql("SELECT t.price FROM t WHERE t.price > 100.")
    assert "t.price" in result, f"Column reference damaged: {result}"
    assert "100." not in result


def test_sql_intent_masks_compound_column_names():
    """sql_intent regex must mask employee_ssn, user_salary in SQL text."""
    source_path = os.path.join(os.path.dirname(__file__), "..", "query_memory.py")
    with open(source_path, "r", encoding="utf-8") as f:
        source = f.read()

    match = re.search(
        r"def store_insight\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find store_insight function"
    body = match.group()

    # The sql_intent masking must NOT use \b word boundary (which treats _ as word char).
    # It should use lookarounds like (?<![a-zA-Z]) that treat _ as transparent.
    word_boundary_in_intent = re.search(
        r"sql_intent\s*=\s*re\.sub\(\s*r.*?\\b.*?\\b",
        body,
    )
    assert not word_boundary_in_intent, (
        "sql_intent masking still uses \\b word boundary regex. "
        "This treats _ as a word char, so compound names like employee_ssn "
        "pass through unmasked. Use (?<![a-zA-Z]) lookarounds instead."
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
