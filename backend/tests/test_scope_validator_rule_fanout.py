"""Rule 2 — Fan-out inflation: multi-table JOIN + COUNT(*) without DISTINCT."""
from scope_validator import ScopeValidator, RuleId


def test_fires_on_join_count_star_without_distinct():
    sql = "SELECT COUNT(*) FROM orders o JOIN order_items oi ON oi.order_id = o.id"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)


def test_does_not_fire_on_count_distinct_pk():
    sql = "SELECT COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON oi.order_id = o.id"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)


def test_does_not_fire_on_single_table_count_star():
    sql = "SELECT COUNT(*) FROM orders"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)


def test_does_not_fire_on_three_way_join_with_distinct():
    sql = "SELECT COUNT(DISTINCT u.id) FROM users u JOIN orders o ON o.user_id = u.id JOIN order_items oi ON oi.order_id = o.id"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)
