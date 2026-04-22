import pytest
from backend.embeddings.ensemble import ensemble_rank, ENSEMBLE_CAP


def test_single_method_cannot_exceed_cap():
    vec_scores = [0.9, 0.8, 0.7, 0.6, 0.5]
    bm25_scores = [0.0, 0.0, 0.0, 0.0, 0.0]
    rerank_scores = [0.0, 0.0, 0.0, 0.0, 0.0]
    final = ensemble_rank(vec_scores, bm25_scores, rerank_scores)
    # Total contribution from vec is capped at 40%. The spread across docs
    # must not exceed what the cap permits.
    max_spread = ENSEMBLE_CAP * (max(vec_scores) - min(vec_scores))
    assert max(final) - min(final) <= max_spread + 1e-6


def test_mismatched_lengths_raise():
    with pytest.raises(ValueError):
        ensemble_rank([1.0], [1.0, 2.0], [3.0])


def test_all_zero_methods_produce_zero_ranking():
    final = ensemble_rank([0.0, 0.0], [0.0, 0.0], [0.0, 0.0])
    assert all(abs(s) < 1e-9 for s in final)
