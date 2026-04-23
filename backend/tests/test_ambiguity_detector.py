"""Deterministic ambiguity scorer (Ring 4)."""
from ambiguity_detector import score_ambiguity, AmbiguityFeatures


def test_score_returns_float_in_unit_interval():
    s = score_ambiguity("count users", "SELECT COUNT(*) FROM users", [])
    assert 0.0 <= s <= 1.0


def test_fuzzy_term_raises_score():
    high = score_ambiguity("why are casual riders churning", "SELECT 1", ["trips"])
    low  = score_ambiguity("count trips", "SELECT COUNT(*) FROM trips", ["trips"])
    assert high > low


def test_explicit_date_prevents_missing_temporal_penalty():
    s = score_ambiguity("trips in 2024-06", "SELECT 1", ["trips"])
    assert s < 0.4


def test_comparative_without_baseline_raises_score():
    s = score_ambiguity("who has more orders", "SELECT 1", [])
    assert s > 0.1


def test_unambiguous_count_query_scores_low():
    s = score_ambiguity("how many users are there", "SELECT COUNT(*) FROM users", ["users"])
    assert s < 0.3


def test_score_ambiguity_ignores_empty_tables_list():
    s = score_ambiguity("retention by cohort", "SELECT 1", None)
    assert 0.0 <= s <= 1.0
