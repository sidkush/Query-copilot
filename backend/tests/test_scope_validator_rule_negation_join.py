"""Rule 6 — NL contains 'never/no/without' AND SQL is INNER JOIN."""
from scope_validator import ScopeValidator, RuleId


def test_fires_when_nl_says_never_and_sql_has_inner_join():
    sql = "SELECT u.id FROM users u INNER JOIN orders o ON o.user_id = u.id"
    nl = "show me users who have never placed an order"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"nl_question": nl})
    assert any(vio.rule_id is RuleId.NEGATION_AS_JOIN for vio in r.violations)


def test_does_not_fire_when_sql_uses_left_join_with_is_null():
    sql = "SELECT u.id FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL"
    nl = "users who never placed an order"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"nl_question": nl})
    assert not any(vio.rule_id is RuleId.NEGATION_AS_JOIN for vio in r.violations)


def test_does_not_fire_without_negation_in_nl():
    sql = "SELECT u.id FROM users u INNER JOIN orders o ON o.user_id = u.id"
    nl = "users who placed an order"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"nl_question": nl})
    assert not any(vio.rule_id is RuleId.NEGATION_AS_JOIN for vio in r.violations)
