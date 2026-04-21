"""Plan 9b T2 — linear + polynomial least-squares fit with R² / p-value / SSE / RMSE."""
import numpy as np
import numpy.testing as npt
import pytest

from vizql.trend_fit import fit_linear, fit_polynomial


def test_fit_linear_recovers_slope_and_intercept():
    rng = np.random.default_rng(42)
    x = np.linspace(0, 10, 200)
    noise = rng.normal(0, 0.01, size=x.shape)
    y = 2.0 * x + 3.0 + noise

    result = fit_linear(x.tolist(), y.tolist())

    # Coefficients ordered [slope, intercept] (polyfit high-to-low order).
    npt.assert_allclose(result.coefficients[0], 2.0, rtol=1e-3)
    npt.assert_allclose(result.coefficients[1], 3.0, rtol=1e-3)
    assert result.r_squared > 0.9999
    assert result.p_value < 1e-10
    assert result.sse > 0.0
    assert result.rmse > 0.0
    # Equation string should contain coefficients + x.
    assert "x" in result.equation


def test_fit_linear_constant_y_has_zero_r_squared():
    x = np.linspace(0, 10, 100).tolist()
    y = [5.0] * 100
    result = fit_linear(x, y)
    # SST == 0 → R² is defined as 0 (constant-y guard).
    assert result.r_squared == 0.0


def test_fit_linear_needs_two_points():
    with pytest.raises(ValueError, match="at least 2"):
        fit_linear([1.0], [2.0])


def test_fit_polynomial_recovers_degree_3():
    rng = np.random.default_rng(7)
    x = np.linspace(-5, 5, 500)
    # y = 0.5 x³ - 2 x² + x + 4
    y = 0.5 * x**3 - 2.0 * x**2 + x + 4.0 + rng.normal(0, 0.05, size=x.shape)
    result = fit_polynomial(x.tolist(), y.tolist(), degree=3)
    # polyfit returns highest-power-first: [0.5, -2, 1, 4]
    npt.assert_allclose(result.coefficients, [0.5, -2.0, 1.0, 4.0], rtol=5e-3, atol=5e-3)
    assert result.r_squared > 0.999


@pytest.mark.parametrize("degree", [2, 3, 4, 5, 6, 7, 8])
def test_fit_polynomial_all_supported_degrees(degree):
    rng = np.random.default_rng(degree)
    true_coeffs = rng.normal(0, 1, size=degree + 1).tolist()
    x = np.linspace(-2, 2, 400)
    y = np.polyval(true_coeffs, x)
    result = fit_polynomial(x.tolist(), y.tolist(), degree=degree)
    npt.assert_allclose(result.coefficients, true_coeffs, rtol=1e-6, atol=1e-6)
    assert result.r_squared == pytest.approx(1.0, abs=1e-9)


def test_fit_polynomial_rejects_degree_gt_8():
    with pytest.raises(ValueError, match="degree"):
        fit_polynomial([1.0, 2.0, 3.0], [1.0, 4.0, 9.0], degree=9)


def test_fit_polynomial_requires_min_samples():
    # Need at least degree+1 distinct points.
    with pytest.raises(ValueError, match="at least"):
        fit_polynomial([1.0, 2.0], [1.0, 4.0], degree=3)


from vizql.trend_fit import fit_logarithmic, fit_exponential, fit_power


def test_fit_logarithmic_recovers_coefficients():
    # y = 2 ln(x) + 3
    x = np.linspace(0.5, 50, 300)
    y = 2.0 * np.log(x) + 3.0
    r = fit_logarithmic(x.tolist(), y.tolist())
    npt.assert_allclose(r.coefficients, [2.0, 3.0], rtol=1e-6)
    assert r.r_squared == pytest.approx(1.0, abs=1e-9)
    assert "ln(x)" in r.equation


def test_fit_logarithmic_rejects_nonpositive_x():
    with pytest.raises(ValueError, match="x > 0"):
        fit_logarithmic([0.0, 1.0, 2.0], [1.0, 2.0, 3.0])
    with pytest.raises(ValueError, match="x > 0"):
        fit_logarithmic([-1.0, 2.0], [1.0, 2.0])


def test_fit_exponential_recovers_coefficients():
    # y = 1.5 * exp(0.4 x)
    x = np.linspace(0, 4, 200)
    y = 1.5 * np.exp(0.4 * x)
    r = fit_exponential(x.tolist(), y.tolist())
    npt.assert_allclose(r.coefficients, [1.5, 0.4], rtol=1e-6)
    assert "exp" in r.equation


def test_fit_exponential_rejects_nonpositive_y():
    with pytest.raises(ValueError, match="y > 0"):
        fit_exponential([1.0, 2.0], [1.0, 0.0])


def test_fit_power_recovers_coefficients():
    # y = 3 * x^0.5
    x = np.linspace(0.1, 10, 300)
    y = 3.0 * x ** 0.5
    r = fit_power(x.tolist(), y.tolist())
    npt.assert_allclose(r.coefficients, [3.0, 0.5], rtol=1e-6)
    assert "^" in r.equation


def test_fit_power_rejects_nonpositive():
    with pytest.raises(ValueError, match="x > 0 and y > 0"):
        fit_power([0.0, 1.0], [1.0, 2.0])
    with pytest.raises(ValueError, match="x > 0 and y > 0"):
        fit_power([1.0, 2.0], [-1.0, 2.0])
