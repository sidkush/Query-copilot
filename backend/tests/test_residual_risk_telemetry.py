"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_7_client_retry_abuse


def test_detector_7_fires_above_retry_budget():
    with patch("residual_risk_telemetry._client_retries_in_last_5min", return_value=6):
        sig = detect_residual_risk_7_client_retry_abuse("t-1")
    assert sig is not None


def test_detector_7_silent_at_or_below_5():
    with patch("residual_risk_telemetry._client_retries_in_last_5min", return_value=5):
        assert detect_residual_risk_7_client_retry_abuse("t-1") is None
