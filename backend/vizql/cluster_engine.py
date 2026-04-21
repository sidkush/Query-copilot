"""Plan 9d — K-means cluster engine with auto-k via Calinski-Harabasz.

All numerical work is sklearn-backed. Pure functions; no I/O.
"""
from __future__ import annotations

import math

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import calinski_harabasz_score
from sklearn.preprocessing import StandardScaler

from config import settings
from vizql.cluster import ClusterCandidate, ClusterResult, ClusterSpec


def _safe_k_range(spec: ClusterSpec, n_rows: int) -> tuple[int, int]:
    hard_cap = int(getattr(settings, "CLUSTER_K_MAX_HARD_CAP", 25))
    k_min = max(2, int(spec.k_min))
    k_max = min(int(spec.k_max), hard_cap, max(2, n_rows - 1))
    if k_max < k_min:
        k_max = k_min
    return k_min, k_max


def _extract_matrix(rows: list[dict], variables: list[str]) -> np.ndarray:
    if not rows:
        return np.empty((0, len(variables)))
    cols = []
    for v in variables:
        cols.append([float(r.get(v, math.nan)) for r in rows])
    return np.array(cols, dtype=float).T


def _standardise(X: np.ndarray) -> tuple[np.ndarray, StandardScaler]:
    scaler = StandardScaler()
    return scaler.fit_transform(X), scaler


def _fit_one(X: np.ndarray, k: int, seed: int) -> tuple[np.ndarray, np.ndarray, float, float]:
    km = KMeans(n_clusters=k, n_init=10, random_state=seed)
    labels = km.fit_predict(X)
    inertia = float(km.inertia_)
    if k >= 2 and len(np.unique(labels)) >= 2:
        ch = float(calinski_harabasz_score(X, labels))
    else:
        ch = 0.0
    return labels, km.cluster_centers_, inertia, ch


def _compute_total_ssq(X: np.ndarray) -> float:
    if X.size == 0:
        return 0.0
    centroid = X.mean(axis=0)
    return float(((X - centroid) ** 2).sum())


def _per_cluster_feature_means(X_orig: np.ndarray, assignments: np.ndarray, k: int) -> list[list[float]]:
    means: list[list[float]] = []
    for cid in range(k):
        mask = assignments == cid
        if not mask.any():
            means.append([0.0] * X_orig.shape[1])
        else:
            means.append([float(v) for v in X_orig[mask].mean(axis=0)])
    return means


def fit(rows: list[dict], spec: ClusterSpec) -> ClusterResult:
    spec.validate()
    notes: list[str] = []

    X_full = _extract_matrix(rows, spec.variables)
    nan_mask = np.isnan(X_full).any(axis=1)
    X_orig = X_full[~nan_mask]
    if nan_mask.any():
        notes.append(f"dropped {int(nan_mask.sum())} row(s) containing NaN")

    if X_orig.shape[0] < 2:
        raise ValueError("need at least 2 rows after NaN removal to cluster")

    if spec.standardize:
        X, _scaler = _standardise(X_orig)
    else:
        X = X_orig

    if isinstance(spec.k, int):
        k_min, k_max = spec.k, spec.k
    else:
        k_min, k_max = _safe_k_range(spec, X.shape[0])
        if k_max != spec.k_max:
            notes.append(f"k_max clamped to {k_max} (hard cap or row count)")

    candidates: list[ClusterCandidate] = []
    best: tuple[int, np.ndarray, np.ndarray, float, float] | None = None
    for k in range(k_min, k_max + 1):
        labels, centers, inertia, ch = _fit_one(X, k, spec.seed)
        candidates.append(ClusterCandidate(k=k, ch_score=ch, inertia=inertia))
        if best is None or ch > best[4]:
            best = (k, labels, centers, inertia, ch)

    assert best is not None  # k_min <= k_max guarantees at least one fit.
    optimal_k, labels, centers_scaled, inertia, ch_best = best

    total_ssq = _compute_total_ssq(X)
    between_ssq = total_ssq - inertia

    if spec.standardize:
        centroids_orig = _scaler.inverse_transform(centers_scaled).tolist()
    else:
        centroids_orig = centers_scaled.tolist()

    per_cluster_means = _per_cluster_feature_means(X_orig, labels, optimal_k)

    if optimal_k >= 2:
        f_stat = ch_best * (X.shape[0] - optimal_k) / (optimal_k - 1)
    else:
        f_stat = 0.0

    return ClusterResult(
        optimal_k=int(optimal_k),
        assignments=[int(v) for v in labels],
        centroids=[[float(x) for x in row] for row in centroids_orig],
        calinski_harabasz_score=float(ch_best),
        f_statistic=float(f_stat),
        inertia=float(inertia),
        total_ssq=float(total_ssq),
        between_group_ssq=float(between_ssq),
        candidates=candidates,
        per_cluster_feature_means=per_cluster_means,
        notes=notes,
    )
