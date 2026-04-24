"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_5_10k_tables


def test_detector_5_fires_when_precision_drops():
    with patch("residual_risk_telemetry._top10_retrieval_precision_pct", return_value=55.0):
        sig = detect_residual_risk_5_10k_tables("t-1")
    assert sig is not None
    assert sig.severity == "warn"


def test_detector_5_silent_at_or_above_threshold():
    with patch("residual_risk_telemetry._top10_retrieval_precision_pct", return_value=70.0):
        assert detect_residual_risk_5_10k_tables("t-1") is None
