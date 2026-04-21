"""Plan 9b T1 — TrendLineSpec + TrendFitResult dataclass round-trip + validation."""
import pytest

from vizql.trend_line import TrendLineSpec, TrendFitResult


def test_spec_round_trip_linear():
    spec = TrendLineSpec(
        fit_type="linear",
        degree=None,
        factor_fields=["region"],
        show_confidence_bands=True,
        confidence_level=0.95,
        color_by_factor=True,
        trend_line_label=True,
    )
    assert TrendLineSpec.from_dict(spec.to_dict()) == spec


def test_spec_polynomial_requires_degree_in_range():
    with pytest.raises(ValueError, match="degree"):
        TrendLineSpec(fit_type="polynomial", degree=1,
                      factor_fields=[], show_confidence_bands=False,
                      confidence_level=0.95, color_by_factor=False,
                      trend_line_label=False).validate()
    with pytest.raises(ValueError, match="degree"):
        TrendLineSpec(fit_type="polynomial", degree=9,
                      factor_fields=[], show_confidence_bands=False,
                      confidence_level=0.95, color_by_factor=False,
                      trend_line_label=False).validate()


def test_spec_non_polynomial_ignores_degree():
    # Linear/log/exp/power reject a degree value to avoid silent misuse.
    with pytest.raises(ValueError, match="degree only valid for polynomial"):
        TrendLineSpec(fit_type="linear", degree=3, factor_fields=[],
                      show_confidence_bands=False, confidence_level=0.95,
                      color_by_factor=False, trend_line_label=False).validate()


def test_spec_confidence_level_allowlist():
    with pytest.raises(ValueError, match="confidence_level"):
        TrendLineSpec(fit_type="linear", degree=None, factor_fields=[],
                      show_confidence_bands=True, confidence_level=0.80,
                      color_by_factor=False, trend_line_label=False).validate()


def test_fit_result_round_trip():
    r = TrendFitResult(
        coefficients=[2.0, 3.0],
        r_squared=0.987654321,
        p_value=1.2345e-6,
        sse=0.5,
        rmse=0.25,
        equation="y = 2.000*x + 3.000",
        predictions=[{"x": 1.0, "y": 5.0, "lower": 4.8, "upper": 5.2}],
    )
    assert TrendFitResult.from_dict(r.to_dict()) == r
