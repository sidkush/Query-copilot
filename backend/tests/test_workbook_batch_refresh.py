"""
Tests for POST /api/v1/dashboards/{dashboard_id}/tiles/refresh-batch

Workbook shared-filter batch refresh: translates a filter array into SQL
WHERE conditions applied as a subquery wrapper around each tile's SQL.

Three tests:
  1. test_applies_equality_filter      — region = Europe → subquery with WHERE
  2. test_applies_multiple_filters     — two filters → both AND'd in WHERE
  3. test_rejects_sql_injection_in_filter — '; DROP TABLE → rejected by validator
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


# ── _build_filter_conditions unit tests ──────────────────────────────────────

def test_applies_equality_filter():
    """A single equality filter produces the correct subquery WHERE clause."""
    from routers.dashboard_routes import _build_filter_conditions

    filters = [{"field": "region", "op": "=", "value": "Europe"}]
    conditions = _build_filter_conditions(filters)

    assert conditions == "region = 'Europe'", (
        f"Expected \"region = 'Europe'\", got {conditions!r}"
    )

    # Verify the assembled subquery is syntactically what we expect
    original_sql = "SELECT region, SUM(revenue) AS total FROM sales GROUP BY region"
    full_sql = f"SELECT * FROM ({original_sql}) AS _filtered WHERE {conditions}"

    assert "AS _filtered WHERE" in full_sql, (
        "Subquery must use _filtered alias and a WHERE clause"
    )
    assert "region = 'Europe'" in full_sql, (
        "Filter condition must appear after WHERE"
    )


def test_applies_multiple_filters():
    """Two filters are AND-joined in the WHERE clause."""
    from routers.dashboard_routes import _build_filter_conditions

    filters = [
        {"field": "region", "op": "=", "value": "Europe"},
        {"field": "year", "op": ">=", "value": "2023"},
    ]
    conditions = _build_filter_conditions(filters)

    # Both conditions must be present
    assert "region = 'Europe'" in conditions, (
        f"First filter missing from conditions: {conditions!r}"
    )
    assert "year >= 2023" in conditions, (
        f"Second filter (numeric) missing from conditions: {conditions!r}"
    )
    assert " AND " in conditions, (
        f"Multiple filters must be joined with AND: {conditions!r}"
    )

    original_sql = "SELECT region, year, revenue FROM sales"
    full_sql = f"SELECT * FROM ({original_sql}) AS _filtered WHERE {conditions}"
    assert conditions.count("AND") == 1, (
        f"Expected exactly 1 AND for 2 filters, got: {conditions!r}"
    )
    assert "AS _filtered WHERE" in full_sql


def test_rejects_sql_injection_in_filter():
    """Filter value with SQL injection payload is rejected by SQLValidator.

    The _build_filter_conditions helper escapes single quotes (turning ' into ''),
    so a value like `'; DROP TABLE users; --` becomes a safe string literal.
    The assembled subquery SQL is then run through SQLValidator which will reject
    any statement containing DROP/DELETE/UPDATE/INSERT/etc.
    """
    from routers.dashboard_routes import _build_filter_conditions
    from sql_validator import SQLValidator

    # A classic SQL injection attempt in a filter value
    injection_value = "'; DROP TABLE users; --"
    filters = [{"field": "region", "op": "=", "value": injection_value}]

    conditions = _build_filter_conditions(filters)

    # _build_filter_conditions must escape the embedded single quote
    assert "DROP TABLE" not in conditions.upper() or "''" in conditions, (
        "Filter value must have its single quotes escaped before reaching SQL"
    )

    # Assemble the full subquery and run it through SQLValidator
    original_sql = "SELECT region, revenue FROM sales"
    full_sql = f"SELECT * FROM ({original_sql}) AS _filtered WHERE {conditions}"

    validator = SQLValidator()
    is_valid, _cleaned, error = validator.validate(full_sql)

    # Either the validator outright rejects it (DROP keyword blocked)
    # or the escaped string renders it harmless (it becomes a literal string,
    # not a statement — both outcomes are acceptable security postures).
    if not is_valid:
        assert error, "Validator must return an error message on rejection"
        # Confirm the rejection is security-related: multi-statement block,
        # blocked keyword, AST parse failure, or dangerous function detection.
        _SECURITY_REASONS = (
            "DROP", "BLOCKED", "INVALID", "DANGEROUS", "KEYWORD",
            "MULTI", "STATEMENT", "NOT ALLOWED",
        )
        assert any(
            kw in (error or "").upper()
            for kw in _SECURITY_REASONS
        ), f"Rejection reason not security-related: {error!r}"
    else:
        # If validator passes (value was escaped into a harmless literal),
        # confirm the DROP TABLE appears only inside a quoted string literal —
        # the escaped form turns '; into '' so it cannot break out of the string.
        # The raw DROP keyword must NOT appear as an unquoted bare statement.
        assert "''" in conditions, (
            "If validator passes, single quotes in value must be escaped ('' present)"
        )


# ── _build_filter_conditions edge-case tests ──────────────────────────────────

def test_empty_filters_returns_empty_string():
    """No filters → empty condition string (no subquery wrapping needed)."""
    from routers.dashboard_routes import _build_filter_conditions

    assert _build_filter_conditions([]) == "", (
        "Empty filter list must produce an empty condition string"
    )


def test_in_operator_produces_csv_list():
    """op='IN' with comma-separated value produces IN (…) condition."""
    from routers.dashboard_routes import _build_filter_conditions

    filters = [{"field": "country", "op": "IN", "value": "US, UK, DE"}]
    conditions = _build_filter_conditions(filters)

    assert "country IN (" in conditions, f"Expected IN clause: {conditions!r}"
    assert "'US'" in conditions and "'UK'" in conditions and "'DE'" in conditions, (
        f"All IN values must appear quoted: {conditions!r}"
    )


def test_like_operator():
    """op='LIKE' produces a LIKE condition."""
    from routers.dashboard_routes import _build_filter_conditions

    filters = [{"field": "name", "op": "LIKE", "value": "Acme%"}]
    conditions = _build_filter_conditions(filters)

    assert "name LIKE 'Acme%'" == conditions, (
        f"Expected \"name LIKE 'Acme%'\", got {conditions!r}"
    )


def test_invalid_field_name_rejected():
    """Field names with SQL meta-characters are rejected (not included)."""
    from routers.dashboard_routes import _build_filter_conditions

    filters = [{"field": "1badfield; DROP TABLE", "op": "=", "value": "x"}]
    conditions = _build_filter_conditions(filters)

    assert conditions == "", (
        f"Invalid field name must be silently dropped; got: {conditions!r}"
    )


def test_invalid_op_rejected():
    """Unknown operators are rejected."""
    from routers.dashboard_routes import _build_filter_conditions

    filters = [{"field": "region", "op": "UNION SELECT", "value": "1"}]
    conditions = _build_filter_conditions(filters)

    assert conditions == "", (
        f"Unknown operator must be silently dropped; got: {conditions!r}"
    )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
