"""Global ensemble score combination with 40% cap per method (H14).

Inputs are per-document scores from 3 methods (vector / BM25 / rerank),
each normalized to [0, 1]. Cap prevents any single method dominating final
ranking — defense against keyword-stuffed skills that game BM25, and against
long-formal-text bias in cross-encoder rerank.
"""
from __future__ import annotations
from typing import Sequence


ENSEMBLE_CAP = 0.40  # per-method max weight in final score


def _cap_scores(scores: Sequence[float]) -> list[float]:
    """Scale scores so their output range is at most ENSEMBLE_CAP * raw_range.

    This enforces the H14 invariant: no single method can produce a spread
    larger than ENSEMBLE_CAP * (max_raw - min_raw) in the final combined score.
    All-zero (or constant) inputs return all-zero outputs.
    """
    if not scores:
        return []
    lo = min(scores)
    hi = max(scores)
    if hi - lo < 1e-9:
        return [0.0] * len(scores)
    # Shift to zero-base, scale so range == ENSEMBLE_CAP * raw_range.
    return [ENSEMBLE_CAP * (s - lo) for s in scores]


def ensemble_rank(
    vec_scores: Sequence[float],
    bm25_scores: Sequence[float],
    rerank_scores: Sequence[float],
) -> list[float]:
    if not (len(vec_scores) == len(bm25_scores) == len(rerank_scores)):
        raise ValueError("score vectors must have identical length")

    v = _cap_scores(vec_scores)
    b = _cap_scores(bm25_scores)
    r = _cap_scores(rerank_scores)

    # Sum the capped contributions. Each method contributes at most
    # ENSEMBLE_CAP * its own raw score range — so no single method dominates.
    return [v[i] + b[i] + r[i] for i in range(len(v))]
