"""Plan 9a T1 — analytics typed specs round-trip through proto."""
import pytest

from vizql import analytics_types as at
from vizql.proto import v1_pb2 as pb


def test_reference_line_round_trip():
    spec = at.ReferenceLineSpec(
        axis="y",
        aggregation="mean",
        value=None,
        percentile=None,
        scope="entire",
        label="computation",
        custom_label="",
        line_style="dashed",
        color="#4C78A8",
        show_marker=True,
    )
    m = spec.to_proto()
    assert isinstance(m, pb.ReferenceLineSpec)
    assert at.ReferenceLineSpec.from_proto(m) == spec


def test_reference_band_round_trip():
    low = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                               percentile=25, scope="entire", label="value",
                               custom_label="", line_style="solid",
                               color="#888", show_marker=False)
    high = at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                                percentile=75, scope="entire", label="value",
                                custom_label="", line_style="solid",
                                color="#888", show_marker=False)
    band = at.ReferenceBandSpec(axis="y", from_spec=low, to_spec=high,
                                fill="#cccccc", fill_opacity=0.25)
    assert at.ReferenceBandSpec.from_proto(band.to_proto()) == band


def test_reference_distribution_round_trip():
    dist = at.ReferenceDistributionSpec(axis="y", percentiles=[10, 25, 50, 75, 90],
                                        scope="entire", style="quantile",
                                        color="#888888")
    assert at.ReferenceDistributionSpec.from_proto(dist.to_proto()) == dist


def test_totals_round_trip():
    tot = at.TotalsSpec(kind="both", axis="both", aggregation="sum",
                        position="after", should_affect_totals=True)
    assert at.TotalsSpec.from_proto(tot.to_proto()) == tot


def test_percentile_requires_percentile_value():
    with pytest.raises(ValueError, match="percentile"):
        at.ReferenceLineSpec(axis="y", aggregation="percentile", value=None,
                             percentile=None, scope="entire", label="value",
                             custom_label="", line_style="solid",
                             color="#888", show_marker=False).validate()


def test_constant_requires_value():
    with pytest.raises(ValueError, match="value"):
        at.ReferenceLineSpec(axis="y", aggregation="constant", value=None,
                             percentile=None, scope="entire", label="value",
                             custom_label="", line_style="solid",
                             color="#888", show_marker=False).validate()
