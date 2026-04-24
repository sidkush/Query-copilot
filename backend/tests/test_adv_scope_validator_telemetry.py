"""S4 adversarial hardening — scope_validator must never silently swallow
exceptions. Parse failures and per-rule exceptions both emit telemetry."""
from unittest.mock import patch, MagicMock
import pytest
from scope_validator import ScopeValidator


def test_parse_failure_emits_telemetry():
    v = ScopeValidator(dialect="sqlite")
    events = []
    with patch("scope_validator._emit_telemetry", side_effect=lambda **kw: events.append(kw)):
        result = v.validate("this is not sql at all ###%%%", ctx={})
    assert result.parse_failed is True
    assert any(e.get("event") == "scope_validator_parse_failed" for e in events), events


def test_rule_exception_emits_telemetry_with_rule_id():
    import scope_validator as sv
    v = ScopeValidator(dialect="sqlite")
    events = []

    def _boom(ast, sql, ctx, dialect):
        raise RuntimeError("rule exploded")
    _boom.__name__ = "_rule_range_mismatch"  # label so telemetry can identify

    with patch.object(sv, "_enabled_rules", return_value=[_boom]), \
         patch("scope_validator._emit_telemetry", side_effect=lambda **kw: events.append(kw)):
        result = v.validate("SELECT 1", ctx={})
    assert any(e.get("event") == "scope_validator_rule_failed" for e in events), events
    # event must carry the rule name so ops can identify which rule broke
    failed = [e for e in events if e.get("event") == "scope_validator_rule_failed"][0]
    assert "rule" in failed
