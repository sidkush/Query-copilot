"""Unit tests for alert_manager — dedup window, retry, severity routing."""
from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from alert_manager import AlertManager, AlertSignal, DispatchResult


def test_alert_signal_shape():
    sig = AlertSignal(
        rule_id="residual_risk_1_llm_pretraining_fn",
        tenant_id="t-123",
        severity="warn",
        observed_value=3.5,
        threshold=2.0,
        message="trap FN rate 3.5% > 2%",
    )
    assert sig.rule_id == "residual_risk_1_llm_pretraining_fn"
    assert sig.idempotency_key  # derived, non-empty


def test_dedup_within_window_suppresses_second_fire():
    am = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    sig = AlertSignal("residual_risk_1_llm_pretraining_fn", "t-1", "warn", 3.5, 2.0, "msg")
    with patch.object(am, "_dispatch", return_value=DispatchResult(True, "log", None)):
        r1 = am.fire(sig)
        r2 = am.fire(sig)
    assert r1.dispatched is True
    assert r2.dispatched is False
    assert r2.reason == "deduped_within_window"


def test_multi_hour_accumulator_fires_once_per_hour():
    am = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    sig = AlertSignal("residual_risk_3_dba_ddl_no_webhook", "t-2", "critical", 2.0, 1.0, "msg")
    with patch.object(am, "_dispatch", return_value=DispatchResult(True, "log", None)):
        r1 = am.fire(sig)
        # simulate 10 min later — inside multi-hour window, outside dedup
        am._dedup_cache.clear()
        r2 = am.fire(sig)
    assert r1.dispatched is True
    assert r2.dispatched is False
    assert r2.reason == "deduped_multi_hour"
