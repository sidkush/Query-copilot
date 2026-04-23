"""Skew guard — p99/p50 > 10 → force median in summary."""
from skew_guard import (
    is_skewed, needs_median, SkewProfile, build_profile_from_values,
)


def test_skewed_when_p99_is_10x_p50():
    assert is_skewed(p50=100, p99=1500) is True


def test_not_skewed_when_ratio_small():
    assert is_skewed(p50=100, p99=200) is False


def test_not_skewed_on_zero_or_negative_p50():
    assert is_skewed(p50=0, p99=1000) is False
    assert is_skewed(p50=-1, p99=1000) is False


def test_needs_median_matches_is_skewed():
    assert needs_median(SkewProfile(p50=1, p99=100, mean=50)) is True


def test_needs_median_false_on_balanced():
    assert needs_median(SkewProfile(p50=100, p99=110, mean=105)) is False


def test_build_profile_from_values():
    profile = build_profile_from_values([1, 2, 3, 4, 5, 100])
    assert profile.p99 > profile.p50
    assert profile.mean > 0
