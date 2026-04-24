"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch
import pytest
from residual_risk_telemetry import detect_residual_risk_6_thumbs_up_storm


def test_detector_6_fires_when_upvote_storm_flagged():
    with patch("residual_risk_telemetry._adversarial_upvote_storm_count", return_value=4):
        sig = detect_residual_risk_6_thumbs_up_storm("t-1")
    assert sig is not None


def test_detector_6_silent_at_or_below_3():
    with patch("residual_risk_telemetry._adversarial_upvote_storm_count", return_value=3):
        assert detect_residual_risk_6_thumbs_up_storm("t-1") is None
