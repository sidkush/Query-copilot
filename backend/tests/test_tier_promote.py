"""Tier-promote gate — NL keywords force live execution."""
from tier_promote import should_force_live, extract_promote_trigger


def test_exact_keyword_forces_live():
    assert should_force_live("give me the exact revenue for Q4") is True


def test_today_keyword_forces_live():
    assert should_force_live("what are today's signups") is True


def test_last_hour_forces_live():
    assert should_force_live("errors in the last hour") is True


def test_fraud_rate_forces_live():
    assert should_force_live("what is the current fraud rate") is True


def test_incident_forces_live():
    assert should_force_live("active incident count") is True


def test_neutral_question_does_not_force_live():
    assert should_force_live("how many trips in 2024") is False


def test_extract_returns_matched_keyword():
    trigger = extract_promote_trigger("show me today's fraud rate incident")
    assert trigger in {"today", "fraud rate", "incident"}


def test_extract_returns_none_when_no_match():
    assert extract_promote_trigger("show trip count") is None
