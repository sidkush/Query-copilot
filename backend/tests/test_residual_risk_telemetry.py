"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_4_leap_day


def test_detector_4_fires_below_100_pct():
    with patch("residual_risk_telemetry._leap_day_trap_pass_pct", return_value=95.0):
        sig = detect_residual_risk_4_leap_day("t-1")
    assert sig is not None
    assert sig.observed_value == 95.0


def test_detector_4_silent_at_100_pct():
    with patch("residual_risk_telemetry._leap_day_trap_pass_pct", return_value=100.0):
        assert detect_residual_risk_4_leap_day("t-1") is None
