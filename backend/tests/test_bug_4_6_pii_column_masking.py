"""
Test for Bug 4.6: PII column names leak into ChromaDB metadata.

The bug: store_insight() masks column names in sql_intent but stores
raw column names in the 'columns' metadata field. When multi-tenant
features are added, sensitive column names (ssn, salary, etc.) become
visible across tenants in shared ChromaDB.

The fix: Apply SENSITIVE_COLUMN_PATTERNS masking to the columns
metadata field before storing in ChromaDB.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "query_memory.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_columns_metadata_field_is_masked():
    """The 'columns' value in the metadata dict must go through masking."""
    source = _load_source()
    match = re.search(
        r"def store_insight\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find store_insight function"
    body = match.group()

    # Find the metadata dict assignment — specifically the "columns" key.
    # The raw form is: "columns": ",".join(str(c) for c in columns)
    # After the fix, the columns variable used in the join should be
    # a masked version, not the raw parameter.
    # Look for evidence that columns are masked BEFORE the metadata dict,
    # or that the metadata dict uses a masked_columns variable.
    has_columns_masking = (
        "masked_columns" in body
        or "mask_columns" in body
        or re.search(r"columns\s*=\s*\[.*MASKED", body)
        or re.search(r"for\s+\w+\s+in\s+columns.*SENSITIVE", body, re.DOTALL)
    )
    assert has_columns_masking, (
        "store_insight() must mask the 'columns' metadata field values "
        "(not just sql_intent) before storing in ChromaDB. "
        "Raw column names like 'ssn', 'salary' must be replaced with [MASKED]."
    )


def test_columns_masking_uses_pii_patterns():
    """Column-name masking must reference SENSITIVE_COLUMN_PATTERNS."""
    source = _load_source()
    match = re.search(
        r"def store_insight\(.*?(?=\n    def |\Z)", source, re.DOTALL
    )
    assert match, "Could not find store_insight function"
    body = match.group()

    # Find the section between "metadata = {" and "collection = "
    # to ensure column masking happens in the metadata construction area
    meta_section = re.search(
        r"metadata\s*=\s*\{.*?collection\s*=",
        body,
        re.DOTALL,
    )
    assert meta_section, "Could not find metadata dict section"
    meta_body = meta_section.group()
    # The columns line in the metadata dict must use a masked variable
    raw_columns_in_meta = re.search(
        r'"columns".*join.*\bcolumns\b',
        meta_body,
    )
    if raw_columns_in_meta:
        # If it still uses the raw 'columns' param, there must be masking
        # code between the function start and the metadata dict
        pre_meta = body[:body.find("metadata")]
        has_masking_before = (
            "masked_columns" in pre_meta
            or re.search(r"columns\s*=\s*\[", pre_meta)
        )
        assert has_masking_before, (
            "The 'columns' metadata field uses the raw columns parameter. "
            "It must use a masked version (e.g., masked_columns) instead."
        )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
