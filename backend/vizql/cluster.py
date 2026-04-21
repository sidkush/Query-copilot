"""Plan 9d — ClusterSpec / ClusterCandidate / ClusterResult dataclasses.

Wire-format only; not persisted in VisualSpec (matches Plan 9b/9c precedent).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Union

KAuto = Union[int, str]  # 'auto' or positive int >= 2


@dataclass(frozen=True)
class ClusterSpec:
    k: KAuto
    k_min: int
    k_max: int
    variables: list[str]
    disaggregate: bool
    standardize: bool
    seed: int

    def validate(self) -> None:
        if not isinstance(self.k, (int, str)) or (isinstance(self.k, str) and self.k != "auto"):
            raise ValueError("k must be 'auto' or int >= 2")
        if isinstance(self.k, int) and self.k < 2:
            raise ValueError("k must be >= 2 (CH undefined for k=1)")
        if not self.variables:
            raise ValueError("variables must be non-empty")
        if self.k_min < 2:
            raise ValueError("k_min must be >= 2 (CH undefined for k=1)")
        if self.k_min > self.k_max:
            raise ValueError("k_min must be <= k_max")
        if self.seed < 0:
            raise ValueError("seed must be >= 0")

    def to_dict(self) -> dict:
        return {
            "k": self.k,
            "k_min": self.k_min,
            "k_max": self.k_max,
            "variables": list(self.variables),
            "disaggregate": self.disaggregate,
            "standardize": self.standardize,
            "seed": self.seed,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ClusterSpec":
        return cls(
            k=d["k"],
            k_min=int(d.get("k_min", 2)),
            k_max=int(d.get("k_max", 15)),
            variables=list(d["variables"]),
            disaggregate=bool(d.get("disaggregate", False)),
            standardize=bool(d.get("standardize", True)),
            seed=int(d.get("seed", 42)),
        )


@dataclass(frozen=True)
class ClusterCandidate:
    k: int
    ch_score: float
    inertia: float

    def to_dict(self) -> dict:
        return {"k": self.k, "ch_score": self.ch_score, "inertia": self.inertia}

    @classmethod
    def from_dict(cls, d: dict) -> "ClusterCandidate":
        return cls(k=int(d["k"]), ch_score=float(d["ch_score"]), inertia=float(d["inertia"]))


@dataclass(frozen=True)
class ClusterResult:
    optimal_k: int
    assignments: list[int]
    centroids: list[list[float]]
    calinski_harabasz_score: float
    f_statistic: float
    inertia: float
    total_ssq: float
    between_group_ssq: float
    candidates: list[ClusterCandidate]
    per_cluster_feature_means: list[list[float]]
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "optimal_k": self.optimal_k,
            "assignments": list(self.assignments),
            "centroids": [list(c) for c in self.centroids],
            "calinski_harabasz_score": self.calinski_harabasz_score,
            "f_statistic": self.f_statistic,
            "inertia": self.inertia,
            "total_ssq": self.total_ssq,
            "between_group_ssq": self.between_group_ssq,
            "candidates": [c.to_dict() for c in self.candidates],
            "per_cluster_feature_means": [list(m) for m in self.per_cluster_feature_means],
            "notes": list(self.notes),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ClusterResult":
        return cls(
            optimal_k=int(d["optimal_k"]),
            assignments=[int(a) for a in d["assignments"]],
            centroids=[[float(x) for x in c] for c in d["centroids"]],
            calinski_harabasz_score=float(d["calinski_harabasz_score"]),
            f_statistic=float(d["f_statistic"]),
            inertia=float(d["inertia"]),
            total_ssq=float(d["total_ssq"]),
            between_group_ssq=float(d["between_group_ssq"]),
            candidates=[ClusterCandidate.from_dict(c) for c in d["candidates"]],
            per_cluster_feature_means=[[float(x) for x in m] for m in d["per_cluster_feature_means"]],
            notes=list(d.get("notes", [])),
        )
