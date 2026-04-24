"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_3_dba_ddl_no_webhook


def test_detector_3_fires_above_threshold():
    with patch("residual_risk_telemetry._schema_drift_error_rate_pct", return_value=1.5):
        sig = detect_residual_risk_3_dba_ddl_no_webhook("t-1")
    assert sig is not None
    assert sig.observed_value == 1.5


def test_detector_3_silent_at_or_below():
    with patch("residual_risk_telemetry._schema_drift_error_rate_pct", return_value=1.0):
        assert detect_residual_risk_3_dba_ddl_no_webhook("t-1") is None
