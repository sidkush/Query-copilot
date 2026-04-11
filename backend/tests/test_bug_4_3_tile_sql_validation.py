"""
Test for Bug 4.3: Dashboard tiles store raw SQL without validation.

The bug: Tiles accept any SQL at creation/update time. Invalid or
dangerous SQL is only caught at execution time.

The fix: Run SQL through SQLValidator.validate() at tile creation and
update endpoints. Reject tiles with invalid SQL before saving.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "routers", "dashboard_routes.py"
)


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_sql_validator_imported():
    """dashboard_routes.py must import SQLValidator or sql_validator."""
    source = _load_source()
    assert "SQLValidator" in source or "sql_validator" in source, (
        "dashboard_routes.py must import SQLValidator for tile SQL validation"
    )


def test_add_tile_validates_sql():
    """add_tile() must validate SQL before saving."""
    source = _load_source()
    # Find add_tile function body (the first one with tab_id, section_id)
    match = re.search(
        r"async def add_tile\(dashboard_id.*?(?=\n(?:@router|async def |def ))",
        source, re.DOTALL
    )
    assert match, "Could not find add_tile function"
    body = match.group()
    assert "validate" in body.lower(), (
        "add_tile() must validate SQL before saving the tile"
    )


def test_update_tile_validates_sql():
    """update_tile_endpoint() must validate SQL on update."""
    source = _load_source()
    match = re.search(
        r"async def update_tile_endpoint\(.*?(?=\n(?:@router|async def |def ))",
        source, re.DOTALL
    )
    assert match, "Could not find update_tile_endpoint function"
    body = match.group()
    assert "validate" in body.lower(), (
        "update_tile_endpoint() must validate SQL before updating the tile"
    )


def test_sql_validator_rejects_dangerous_sql():
    """SQLValidator must reject DROP TABLE and similar statements."""
    from sql_validator import SQLValidator
    validator = SQLValidator()
    is_valid, _cleaned, error = validator.validate("DROP TABLE users")
    assert not is_valid, (
        "SQLValidator should reject 'DROP TABLE users'"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
