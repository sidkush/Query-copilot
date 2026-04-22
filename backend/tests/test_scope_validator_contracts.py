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


def test_rule_id_enum_has_ten_members():
    assert len(list(RuleId)) == 10
