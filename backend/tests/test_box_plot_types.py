"""Plan 9e T1 — BoxPlotSpec dataclass round-trip + validation.

References:
  Build_Tableau §XIII.1 — "Box Plot (via reference distribution + percentages)".
  Build_Tableau §XIV.5 — shading / fill.
"""
import pytest

from vizql.box_plot import BoxPlotSpec


def test_spec_round_trip_tukey():
    spec = BoxPlotSpec(
        axis="y",
        whisker_method="tukey",
        whisker_percentile=None,
        show_outliers=True,
        fill_color="#4C78A8",
        fill_opacity=0.3,
        scope="pane",
    )
    spec.validate()
    assert BoxPlotSpec.from_proto(spec.to_proto()) == spec


def test_spec_round_trip_percentile():
    spec = BoxPlotSpec(
        axis="x",
        whisker_method="percentile",
        whisker_percentile=(10, 90),
        show_outliers=True,
        fill_color="#E45756",
        fill_opacity=0.25,
        scope="entire",
    )
    spec.validate()
    assert BoxPlotSpec.from_proto(spec.to_proto()) == spec


def test_spec_rejects_unknown_axis():
    spec = BoxPlotSpec(
        axis="z", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="axis"):
        spec.validate()


def test_spec_rejects_unknown_whisker_method():
    spec = BoxPlotSpec(
        axis="y", whisker_method="iqr-2", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="whisker_method"):
        spec.validate()


def test_spec_rejects_percentile_mode_without_bounds():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="whisker_percentile required"):
        spec.validate()


def test_spec_rejects_percentile_bounds_out_of_range():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=(0, 90),
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="whisker_percentile"):
        spec.validate()


def test_spec_rejects_inverted_percentile_bounds():
    spec = BoxPlotSpec(
        axis="y", whisker_method="percentile", whisker_percentile=(90, 10),
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="low.*high"):
        spec.validate()


def test_spec_rejects_min_max_with_outliers():
    spec = BoxPlotSpec(
        axis="y", whisker_method="min-max", whisker_percentile=None,
        show_outliers=True, fill_color="#000000", fill_opacity=0.3, scope="entire",
    )
    with pytest.raises(ValueError, match="min-max.*show_outliers"):
        spec.validate()


def test_spec_rejects_fill_opacity_out_of_range():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=2.0, scope="entire",
    )
    with pytest.raises(ValueError, match="fill_opacity"):
        spec.validate()


def test_spec_rejects_unknown_scope():
    spec = BoxPlotSpec(
        axis="y", whisker_method="tukey", whisker_percentile=None,
        show_outliers=False, fill_color="#000000", fill_opacity=0.3, scope="viz",
    )
    with pytest.raises(ValueError, match="scope"):
        spec.validate()
