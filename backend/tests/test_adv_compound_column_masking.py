"""
Adversarial fix: compound column names like employee_ssn, user_salary
must be masked by PII column-name detection.

The bug: SENSITIVE_COLUMN_PATTERNS uses exact match (set membership).
A column named 'employee_ssn' won't match 'ssn' exactly. This lets
sensitive compound column names leak into ChromaDB metadata and
into unmasked dataframe columns.

The fix: Use substring matching — if any sensitive pattern is contained
within the normalized column name, treat it as sensitive.
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


def test_query_memory_masks_compound_ssn():
    """store_insight() must mask 'employee_ssn' as [MASKED]."""
    source_path = os.path.join(os.path.dirname(__file__), "..", "query_memory.py")
    with open(source_path, "r", encoding="utf-8") as f:
        source = f.read()

    import re
    match = re.search(
        r"def store_insight\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find store_insight function"
    body = match.group()

    # The masking logic must use substring matching, not exact set membership.
    # Look for 'any(' or 'in col' patterns that indicate substring checking.
    has_substring_match = (
        "any(" in body
        or re.search(r"for\s+\w+\s+in\s+SENSITIVE", body)
        or "in str(c)" in body
        or "in col" in body
    )
    assert has_substring_match, (
        "store_insight() uses exact match for PII column masking. "
        "Compound column names like 'employee_ssn' bypass the check. "
        "Use substring matching: any(p in col_lower for p in SENSITIVE_COLUMN_PATTERNS)"
    )


def test_pii_masking_masks_compound_salary():
    """mask_dataframe() must mask columns like 'user_salary'."""
    from pii_masking import SENSITIVE_COLUMN_PATTERNS
    import re

    source_path = os.path.join(os.path.dirname(__file__), "..", "pii_masking.py")
    with open(source_path, "r", encoding="utf-8") as f:
        source = f.read()

    match = re.search(
        r"def mask_dataframe\(.*?(?=\ndef |\Z)", source, re.DOTALL
    )
    assert match, "Could not find mask_dataframe function"
    body = match.group()

    # The column matching logic must use substring matching.
    has_substring_match = (
        "any(" in body
        or re.search(r"for\s+\w+\s+in\s+SENSITIVE", body)
    )
    assert has_substring_match, (
        "mask_dataframe() uses exact match for PII column detection. "
        "Compound column names like 'user_salary' bypass masking. "
        "Use substring matching: any(p in col_lower for p in SENSITIVE_COLUMN_PATTERNS)"
    )


def test_compound_column_masked_at_runtime():
    """Actually run mask_dataframe on a df with compound column names."""
    import pandas as pd
    from pii_masking import mask_dataframe

    df = pd.DataFrame({
        "employee_ssn": ["123-45-6789"],
        "user_salary": [75000],
        "name": ["Alice"],
    })
    result = mask_dataframe(df)
    # employee_ssn and user_salary should be masked
    assert "123-45-6789" not in str(result["employee_ssn"].iloc[0]), (
        f"Compound column 'employee_ssn' not masked: {result['employee_ssn'].iloc[0]}"
    )
    assert "75000" not in str(result["user_salary"].iloc[0]), (
        f"Compound column 'user_salary' not masked: {result['user_salary'].iloc[0]}"
    )
    # name should be preserved
    assert result["name"].iloc[0] == "Alice"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
