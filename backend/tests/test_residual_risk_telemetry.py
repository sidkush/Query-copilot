"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_10_low_traffic_cache_miss


def test_detector_10_fires_above_30pct_miss():
    with patch("residual_risk_telemetry._prompt_cache_miss_pct", return_value=35.0):
        sig = detect_residual_risk_10_low_traffic_cache_miss("t-1")
    assert sig is not None


def test_detector_10_silent_at_or_below():
    with patch("residual_risk_telemetry._prompt_cache_miss_pct", return_value=30.0):
        assert detect_residual_risk_10_low_traffic_cache_miss("t-1") is None
