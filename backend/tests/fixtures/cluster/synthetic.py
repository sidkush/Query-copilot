"""Plan 9d — synthetic Gaussian-blob fixtures for cluster tests."""
from __future__ import annotations

import numpy as np


def gaussian_blobs(n_per_cluster: int, centers: list[tuple[float, float]],
                   spread: float = 0.5, seed: int = 0) -> list[dict]:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for cx, cy in centers:
        xs = rng.normal(cx, spread, size=n_per_cluster)
        ys = rng.normal(cy, spread, size=n_per_cluster)
        rows.extend({"x": float(x), "y": float(y)} for x, y in zip(xs, ys))
    return rows


def mixed_scale_blobs(n_per_cluster: int, centers: list[tuple[float, float]],
                       scale_factor: float, seed: int = 0) -> list[dict]:
    """Same blobs as gaussian_blobs but x feature scaled by scale_factor."""
    rows = gaussian_blobs(n_per_cluster, centers, seed=seed)
    return [{"x": r["x"] * scale_factor, "y": r["y"]} for r in rows]
