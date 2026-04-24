"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from residual_risk_telemetry import detect_residual_risk_1_llm_pretraining_fn
from residual_risk_telemetry import detect_residual_risk_2_anthropic_region_failover
from residual_risk_telemetry import detect_residual_risk_3_dba_ddl_no_webhook


def test_detector_1_fires_above_threshold():
    with patch("residual_risk_telemetry._trap_fn_rate_pct", return_value=3.5):
        sig = detect_residual_risk_1_llm_pretraining_fn("t-1")
    assert sig is not None
    assert sig.rule_id == "residual_risk_1_llm_pretraining_fn"
    assert sig.observed_value == 3.5


def test_detector_1_silent_at_or_below_threshold():
    with patch("residual_risk_telemetry._trap_fn_rate_pct", return_value=2.0):
        assert detect_residual_risk_1_llm_pretraining_fn("t-1") is None


def test_detector_2_fires_on_any_divergence():
    with patch("residual_risk_telemetry._cross_region_divergence_count", return_value=1):
        sig = detect_residual_risk_2_anthropic_region_failover("t-1")
    assert sig is not None
    assert sig.severity == "critical"


def test_detector_2_silent_at_zero():
    with patch("residual_risk_telemetry._cross_region_divergence_count", return_value=0):
        assert detect_residual_risk_2_anthropic_region_failover("t-1") is None


def test_detector_3_fires_above_threshold():
    with patch("residual_risk_telemetry._schema_drift_error_rate_pct", return_value=1.5):
        sig = detect_residual_risk_3_dba_ddl_no_webhook("t-1")
    assert sig is not None
    assert sig.observed_value == 1.5


def test_detector_3_silent_at_or_below():
    with patch("residual_risk_telemetry._schema_drift_error_rate_pct", return_value=1.0):
        assert detect_residual_risk_3_dba_ddl_no_webhook("t-1") is None
