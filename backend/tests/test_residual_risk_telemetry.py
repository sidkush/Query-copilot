"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_9_byok_deprecated_model


def test_detector_9_fires_when_any_byok_user_pinned_to_deprecated():
    with patch("residual_risk_telemetry._deprecated_byok_pinned_count", return_value=2):
        sig = detect_residual_risk_9_byok_deprecated_model("t-1")
    assert sig is not None


def test_detector_9_silent_at_zero():
    with patch("residual_risk_telemetry._deprecated_byok_pinned_count", return_value=0):
        assert detect_residual_risk_9_byok_deprecated_model("t-1") is None
