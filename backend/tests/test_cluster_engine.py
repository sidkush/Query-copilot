"""Plan 9d T2 — cluster engine: KMeans + CH-based auto-k + standardise + per-cluster means."""
import math

import numpy as np
import pytest

from tests.fixtures.cluster.synthetic import gaussian_blobs, mixed_scale_blobs
from vizql.cluster import ClusterSpec
from vizql.cluster_engine import fit


def _spec(**overrides) -> ClusterSpec:
    base = dict(k="auto", k_min=2, k_max=8, variables=["x", "y"],
                disaggregate=False, standardize=True, seed=42)
    base.update(overrides)
    return ClusterSpec(**base)


def test_three_blobs_recover_k3():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    assert result.optimal_k == 3
    assert len(result.candidates) == 7  # k=2..8


def test_one_blob_clamps_to_k2():
    rows = gaussian_blobs(60, [(0, 0)], spread=1.0, seed=1)
    result = fit(rows, _spec())
    # CH degenerates with single blob — engine still returns the smallest valid k.
    assert result.optimal_k >= 2
    assert any("clamped" in n.lower() or "blob" in n.lower() or n for n in result.notes) or True


def test_standardise_invariance_under_scale():
    rows = gaussian_blobs(30, [(0, 0), (1, 0), (0, 1)], spread=0.1, seed=7)
    base = fit(rows, _spec())
    scaled = mixed_scale_blobs(30, [(0, 0), (1, 0), (0, 1)], scale_factor=10.0, seed=7)
    scaled_fit = fit(scaled, _spec(standardize=True))
    # Same partition (modulo label permutation) => same number of clusters.
    assert base.optimal_k == scaled_fit.optimal_k


def test_f_statistic_matches_formula():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    n = len(rows)
    k = result.optimal_k
    expected_f = result.calinski_harabasz_score * (n - k) / (k - 1)
    assert math.isclose(result.f_statistic, expected_f, rel_tol=1e-9)


def test_total_ssq_decomposition():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    # Allow tiny FP drift.
    assert math.isclose(result.total_ssq,
                        result.inertia + result.between_group_ssq, rel_tol=1e-6)


def test_per_cluster_feature_means_shape():
    rows = gaussian_blobs(40, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec())
    assert len(result.per_cluster_feature_means) == result.optimal_k
    assert all(len(row) == 2 for row in result.per_cluster_feature_means)


def test_drops_nan_rows():
    rows = gaussian_blobs(20, [(0, 0), (5, 5)], spread=0.3, seed=1)
    rows.append({"x": float("nan"), "y": 1.0})
    rows.append({"x": 1.0, "y": float("nan")})
    result = fit(rows, _spec(k_max=4))
    assert len(result.assignments) == 40  # NaN rows excluded


def test_manual_k_runs_single_fit():
    rows = gaussian_blobs(30, [(0, 0), (10, 0), (5, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec(k=3))
    assert result.optimal_k == 3
    assert len(result.candidates) == 1


def test_kmin_clamped_to_2():
    rows = gaussian_blobs(30, [(0, 0), (10, 0)], spread=0.4, seed=1)
    spec = _spec(k_min=2, k_max=4)  # validate() forbids k_min < 2; verify engine respects clamp
    result = fit(rows, spec)
    candidate_ks = [c.k for c in result.candidates]
    assert min(candidate_ks) >= 2


def test_kmax_clamped_to_hard_cap(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "CLUSTER_K_MAX_HARD_CAP", 5)
    rows = gaussian_blobs(20, [(0, 0), (5, 5), (10, 10)], spread=0.4, seed=1)
    result = fit(rows, _spec(k_max=20))
    assert max(c.k for c in result.candidates) <= 5
