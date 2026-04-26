"""ScopeValidator top-level contracts."""
from scope_validator import (
    ScopeValidator, ValidatorResult, Violation, RuleId,
)


def test_validator_result_empty_on_valid_sql():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT 1", ctx={})
    assert isinstance(r, ValidatorResult)
    assert r.violations == []
    assert r.passed is True
    assert r.replan_requested is False


def test_validator_fails_open_on_malformed_sql():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT ))) FROM (((", ctx={})
    assert r.passed is True     # fail-open
    assert r.parse_failed is True
    assert r.violations == []


def test_violation_has_rule_id_and_message():
    vio = Violation(
        rule_id=RuleId.RANGE_MISMATCH,
        message="WHERE started_at < '2023-01-01' outside card range",
        severity="warn",
    )
    assert vio.rule_id is RuleId.RANGE_MISMATCH
    assert "started_at" in vio.message


def test_rule_id_enum_has_expected_members():
    """Contract: RuleId expands forward — Rules 1-10 (original Ring 3 set) plus
    AGGREGATE_IN_GROUP_BY (Rule 11, 2026-04-26 Bug 4) and SQL_TOO_LARGE
    (pre-parse size guard, A6/A11 fold). Update this list when adding rules."""
    expected = {
        "range_mismatch", "fanout_inflation", "limit_before_order",
        "timezone_naive", "soft_delete_missing", "negation_as_join",
        "dialect_fallthrough", "view_walker", "conjunction_selectivity",
        "expression_predicate",
        "aggregate_in_group_by",  # Rule 11
        "sql_too_large",          # pre-parse size / recursion guard
    }
    actual = {m.value for m in RuleId}
    assert actual == expected, f"missing={expected - actual}, extra={actual - expected}"
