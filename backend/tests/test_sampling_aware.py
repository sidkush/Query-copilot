"""Sampling-aware helpers — H11."""
import pytest

from sampling_aware import (
    approximate_distinct_count, detect_sentinel_values,
    adaptive_stratify_plan, StratPlan, should_swap_to_hex_bin,
)


def test_hll_approximates_large_distinct():
    values = [f"user_{i}" for i in range(10_000)]
    estimate = approximate_distinct_count(values, precision=14)
    assert 9_000 <= estimate <= 11_000


def test_hll_on_empty_returns_zero():
    assert approximate_distinct_count([], precision=14) == 0


def test_detects_spike_at_minus_one():
    vals = [1.0, 2.0, 3.0] * 100 + [-1.0] * 50
    sentinels = detect_sentinel_values(vals)
    assert -1.0 in sentinels


def test_no_sentinels_on_smooth_distribution():
    vals = [float(i) for i in range(1000)]
    sentinels = detect_sentinel_values(vals)
    assert sentinels == []


def test_detects_999999_as_sentinel():
    vals = [float(i) for i in range(1000)] + [999999.0] * 30
    sentinels = detect_sentinel_values(vals)
    assert 999999.0 in sentinels


def test_adaptive_stratify_low_cardinality_single_stratum():
    plan = adaptive_stratify_plan(total_rows=1_000_000, strat_col_card=3)
    assert plan.strata == 3
    assert 0.001 <= plan.sample_rate <= 1.0


def test_adaptive_stratify_high_cardinality_caps_strata():
    plan = adaptive_stratify_plan(total_rows=10_000_000, strat_col_card=100_000)
    assert plan.strata <= 1000


def test_adaptive_plan_small_table_returns_full_scan():
    plan = adaptive_stratify_plan(total_rows=500, strat_col_card=10)
    assert plan.sample_rate == 1.0


def test_hex_bin_swap_fires_above_threshold():
    assert should_swap_to_hex_bin(row_count=25_000) is True


def test_hex_bin_swap_not_fired_below_threshold():
    assert should_swap_to_hex_bin(row_count=5_000) is False
