"""Rule 5 — Historical window + table has deleted_at + no tombstone predicate."""
from scope_validator import ScopeValidator, RuleId


def test_fires_when_deleted_at_col_present_but_no_filter():
    sql = "SELECT * FROM users WHERE signup_date > '2024-01-01'"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"soft_delete_columns": {"users": "deleted_at"}})
    assert any(vio.rule_id is RuleId.SOFT_DELETE_MISSING for vio in r.violations)


def test_does_not_fire_when_deleted_at_in_where():
    sql = "SELECT * FROM users WHERE signup_date > '2024-01-01' AND deleted_at IS NULL"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"soft_delete_columns": {"users": "deleted_at"}})
    assert not any(vio.rule_id is RuleId.SOFT_DELETE_MISSING for vio in r.violations)


def test_does_not_fire_when_no_soft_delete_on_table():
    sql = "SELECT * FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"soft_delete_columns": {}})
    assert not any(vio.rule_id is RuleId.SOFT_DELETE_MISSING for vio in r.violations)
