"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_8_hnsw_tie_drift


def test_detector_8_fires_on_any_divergence():
    with patch("residual_risk_telemetry._hnsw_consistency_divergence", return_value=1):
        sig = detect_residual_risk_8_hnsw_tie_drift("t-1")
    assert sig is not None
    assert sig.severity == "critical"


def test_detector_8_silent_at_zero():
    with patch("residual_risk_telemetry._hnsw_consistency_divergence", return_value=0):
        assert detect_residual_risk_8_hnsw_tie_drift("t-1") is None
