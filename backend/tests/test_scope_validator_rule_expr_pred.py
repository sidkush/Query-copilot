"""Rule 10 — Non-literal WHERE → mark unverified-scope."""
from scope_validator import ScopeValidator, RuleId


def test_fires_on_hash_mod_predicate():
    sql = "SELECT * FROM users WHERE HASH(id) % 1000 = 42"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert any(vio.rule_id is RuleId.EXPRESSION_PREDICATE for vio in r.violations)


def test_does_not_fire_on_simple_literal_predicate():
    sql = "SELECT * FROM users WHERE id = 42"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.EXPRESSION_PREDICATE for vio in r.violations)


def test_does_not_fire_on_simple_in_list():
    sql = "SELECT * FROM users WHERE id IN (1, 2, 3)"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.EXPRESSION_PREDICATE for vio in r.violations)
