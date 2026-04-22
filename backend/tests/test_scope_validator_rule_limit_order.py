"""Rule 3 — LIMIT in subquery + ORDER BY outer."""
from scope_validator import ScopeValidator, RuleId


def test_fires_on_limit_inside_subquery_order_outside():
    sql = "SELECT * FROM (SELECT * FROM trips LIMIT 100) t ORDER BY t.started_at DESC"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert any(vio.rule_id is RuleId.LIMIT_BEFORE_ORDER for vio in r.violations)


def test_does_not_fire_on_order_then_limit():
    sql = "SELECT * FROM trips ORDER BY started_at DESC LIMIT 100"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.LIMIT_BEFORE_ORDER for vio in r.violations)


def test_does_not_fire_without_outer_order():
    sql = "SELECT * FROM (SELECT * FROM trips LIMIT 100) t"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.LIMIT_BEFORE_ORDER for vio in r.violations)
