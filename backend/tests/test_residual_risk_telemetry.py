"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from residual_risk_telemetry import detect_residual_risk_1_llm_pretraining_fn


def test_detector_1_fires_above_threshold():
    with patch("residual_risk_telemetry._trap_fn_rate_pct", return_value=3.5):
        sig = detect_residual_risk_1_llm_pretraining_fn("t-1")
    assert sig is not None
    assert sig.rule_id == "residual_risk_1_llm_pretraining_fn"
    assert sig.observed_value == 3.5


def test_detector_1_silent_at_or_below_threshold():
    with patch("residual_risk_telemetry._trap_fn_rate_pct", return_value=2.0):
        assert detect_residual_risk_1_llm_pretraining_fn("t-1") is None
