"""Ring 5 — Skew guard.

When a numeric column's p99/p50 ratio exceeds SKEW_GUARD_P99_P50_RATIO,
the summary template is forced to include the median alongside the mean.
No LLM judgement — pure arithmetic rule.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SkewProfile:
    p50: float
    p99: float
    mean: float


def _ratio_threshold() -> float:
    try:
        from config import settings
        return float(settings.SKEW_GUARD_P99_P50_RATIO)
    except Exception:
        return 10.0


def is_skewed(p50: float, p99: float) -> bool:
    if p50 is None or p99 is None or p50 <= 0:
        return False
    return (p99 / p50) > _ratio_threshold()


def needs_median(profile: SkewProfile) -> bool:
    return is_skewed(profile.p50, profile.p99)


def build_profile_from_values(values) -> SkewProfile:
    import statistics
    if not values:
        return SkewProfile(p50=0.0, p99=0.0, mean=0.0)
    sorted_v = sorted(values)
    n = len(sorted_v)
    p50 = sorted_v[int(n * 0.50)]
    p99 = sorted_v[min(int(n * 0.99), n - 1)]
    mean = statistics.fmean(sorted_v)
    return SkewProfile(p50=float(p50), p99=float(p99), mean=float(mean))
