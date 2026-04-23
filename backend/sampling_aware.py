"""H11 — Sampling-aware correctness.

- approximate_distinct_count: datasketch HLL
- detect_sentinel_values:     statistical spike-detection on numeric arrays
- adaptive_stratify_plan:     pick sample rate + stratum count
- should_swap_to_hex_bin:     row-count gate for VizQL scatter → hex-bin
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


def approximate_distinct_count(values: Iterable, precision: int = 14) -> int:
    try:
        from datasketch import HyperLogLog
    except ImportError:
        return len(set(values))
    hll = HyperLogLog(p=precision)
    empty = True
    for v in values:
        hll.update(str(v).encode("utf-8"))
        empty = False
    if empty:
        return 0
    return int(hll.count())


def detect_sentinel_values(values, spike_threshold: float = 0.02, sigma: float = 1.9) -> list:
    if not values:
        return []
    import statistics
    from collections import Counter
    total = len(values)
    counter = Counter(values)
    mean = statistics.fmean(values)
    try:
        stdev = statistics.pstdev(values)
    except statistics.StatisticsError:
        stdev = 0.0
    if stdev == 0:
        return []
    out = []
    for val, count in counter.items():
        if count / total < spike_threshold:
            continue
        try:
            if abs(val - mean) > sigma * stdev:
                out.append(float(val))
        except (TypeError, ValueError):
            continue
    return sorted(out)


@dataclass(frozen=True)
class StratPlan:
    sample_rate: float
    strata: int
    method: str


def adaptive_stratify_plan(total_rows: int, strat_col_card: int) -> StratPlan:
    if total_rows <= 1000:
        return StratPlan(sample_rate=1.0, strata=max(1, strat_col_card), method="full_scan")
    strata = min(max(1, strat_col_card), 1000)
    if total_rows < 100_000:
        rate = 0.10
    elif total_rows < 1_000_000:
        rate = 0.02
    elif total_rows < 10_000_000:
        rate = 0.005
    else:
        rate = 0.001
    return StratPlan(sample_rate=rate, strata=strata, method="stratified")


def should_swap_to_hex_bin(row_count: int) -> bool:
    try:
        from config import settings
        threshold = int(settings.VIZQL_HEX_BIN_THRESHOLD_ROWS)
    except Exception:
        threshold = 20_000
    return row_count > threshold
