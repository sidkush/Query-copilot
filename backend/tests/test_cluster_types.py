"""Plan 9d T1 — ClusterSpec / ClusterCandidate / ClusterResult dataclass round-trip + validation."""
import pytest

from vizql.cluster import ClusterCandidate, ClusterResult, ClusterSpec


def test_spec_round_trip():
    spec = ClusterSpec(
        k="auto",
        k_min=2,
        k_max=10,
        variables=["sales", "profit"],
        disaggregate=False,
        standardize=True,
        seed=42,
    )
    assert ClusterSpec.from_dict(spec.to_dict()) == spec


def test_spec_rejects_empty_variables():
    spec = ClusterSpec(k="auto", k_min=2, k_max=10, variables=[],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="variables"):
        spec.validate()


def test_spec_rejects_kmin_gt_kmax():
    spec = ClusterSpec(k="auto", k_min=8, k_max=4, variables=["a"],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="k_min"):
        spec.validate()


def test_spec_rejects_bad_k_value():
    spec = ClusterSpec(k="seven", k_min=2, k_max=10, variables=["a"],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="k must be 'auto' or int"):
        spec.validate()


def test_spec_rejects_manual_k_lt_2():
    spec = ClusterSpec(k=1, k_min=2, k_max=10, variables=["a"],
                      disaggregate=False, standardize=True, seed=42)
    with pytest.raises(ValueError, match="k must be >= 2"):
        spec.validate()


def test_result_round_trip():
    result = ClusterResult(
        optimal_k=3,
        assignments=[0, 1, 2, 0, 1, 2],
        centroids=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
        calinski_harabasz_score=42.5,
        f_statistic=21.25,
        inertia=10.0,
        total_ssq=100.0,
        between_group_ssq=90.0,
        candidates=[
            ClusterCandidate(k=2, ch_score=20.0, inertia=50.0),
            ClusterCandidate(k=3, ch_score=42.5, inertia=10.0),
        ],
        per_cluster_feature_means=[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]],
        notes=[],
    )
    assert ClusterResult.from_dict(result.to_dict()) == result
