"""Parametrized trap suite for all 12 Phase I alert rules.

Reads trap_ops_alerts.jsonl and verifies:
1. Each rule_id appears in _ALL_DETECTORS exactly once.
2. The detector fires when the signal is above its threshold.
3. The detector is silent at/below its threshold (boundary condition).

This file is a regression net — if a detector is removed or renamed,
the import smoke in test_phase_i_integration.py will catch it; this
suite verifies the threshold semantics survive future edits.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from residual_risk_telemetry import (
    _ALL_DETECTORS,
    detect_residual_risk_1_llm_pretraining_fn,
    detect_residual_risk_2_anthropic_region_failover,
    detect_residual_risk_3_dba_ddl_no_webhook,
    detect_residual_risk_4_leap_day,
    detect_residual_risk_5_10k_tables,
    detect_residual_risk_6_thumbs_up_storm,
    detect_residual_risk_7_client_retry_abuse,
    detect_residual_risk_8_hnsw_tie_drift,
    detect_residual_risk_9_byok_deprecated_model,
    detect_residual_risk_10_low_traffic_cache_miss,
    detect_ops_telemetry_source_missing,
    detect_ops_alert_dispatch_failure,
)

JSONL_PATH = Path(__file__).parent / "trap_ops_alerts.jsonl"

_TRAP_ROWS = [json.loads(l) for l in JSONL_PATH.read_text().splitlines() if l.strip()]
_RULE_IDS = [r["rule_id"] for r in _TRAP_ROWS]


def test_all_12_rules_in_jsonl():
    assert len(_TRAP_ROWS) == 12


def test_all_12_detectors_registered():
    assert len(_ALL_DETECTORS) == 12


def test_all_jsonl_rule_ids_unique():
    assert len(_RULE_IDS) == len(set(_RULE_IDS))


def test_all_rule_ids_have_registered_detector():
    registered = {fn.__name__ for fn in _ALL_DETECTORS}
    # Map rule_id → detector function name pattern
    for row in _TRAP_ROWS:
        rule_id = row["rule_id"]
        # Each detector function is named detect_{rule_id}
        expected_fn = f"detect_{rule_id}"
        assert expected_fn in registered, (
            f"No detector registered for rule_id={rule_id!r}; "
            f"expected function name {expected_fn!r}"
        )


# ── Per-detector threshold boundary tests ────────────────────────────────────
# These patch the private data-source helper directly so no real DB is needed.

def test_r1_fires_above_fn_rate():
    with patch("residual_risk_telemetry._trap_fn_rate_pct", return_value=2.1):
        sig = detect_residual_risk_1_llm_pretraining_fn("t-trap")
    assert sig is not None and sig.rule_id == "residual_risk_1_llm_pretraining_fn"


def test_r1_silent_at_threshold():
    with patch("residual_risk_telemetry._trap_fn_rate_pct", return_value=2.0):
        assert detect_residual_risk_1_llm_pretraining_fn("t-trap") is None


def test_r2_fires_on_divergence():
    with patch("residual_risk_telemetry._cross_region_divergence_count", return_value=1):
        sig = detect_residual_risk_2_anthropic_region_failover("t-trap")
    assert sig is not None and sig.severity == "critical"


def test_r2_silent_at_zero():
    with patch("residual_risk_telemetry._cross_region_divergence_count", return_value=0):
        assert detect_residual_risk_2_anthropic_region_failover("t-trap") is None


def test_r3_fires_above_drift_rate():
    with patch("residual_risk_telemetry._schema_drift_error_rate_pct", return_value=1.1):
        sig = detect_residual_risk_3_dba_ddl_no_webhook("t-trap")
    assert sig is not None


def test_r3_silent_at_threshold():
    with patch("residual_risk_telemetry._schema_drift_error_rate_pct", return_value=1.0):
        assert detect_residual_risk_3_dba_ddl_no_webhook("t-trap") is None


def test_r4_fires_below_100_pct():
    with patch("residual_risk_telemetry._leap_day_trap_pass_pct", return_value=99.9):
        sig = detect_residual_risk_4_leap_day("t-trap")
    assert sig is not None


def test_r4_silent_at_100_pct():
    with patch("residual_risk_telemetry._leap_day_trap_pass_pct", return_value=100.0):
        assert detect_residual_risk_4_leap_day("t-trap") is None


def test_r5_fires_below_precision():
    with patch("residual_risk_telemetry._top10_retrieval_precision_pct", return_value=69.9):
        sig = detect_residual_risk_5_10k_tables("t-trap")
    assert sig is not None


def test_r5_silent_at_threshold():
    with patch("residual_risk_telemetry._top10_retrieval_precision_pct", return_value=70.0):
        assert detect_residual_risk_5_10k_tables("t-trap") is None


def test_r6_fires_above_storm_count():
    with patch("residual_risk_telemetry._adversarial_upvote_storm_count", return_value=4):
        sig = detect_residual_risk_6_thumbs_up_storm("t-trap")
    assert sig is not None


def test_r6_silent_at_threshold():
    with patch("residual_risk_telemetry._adversarial_upvote_storm_count", return_value=3):
        assert detect_residual_risk_6_thumbs_up_storm("t-trap") is None


def test_r7_fires_above_retry_budget():
    with patch("residual_risk_telemetry._client_retries_in_last_5min", return_value=6):
        sig = detect_residual_risk_7_client_retry_abuse("t-trap")
    assert sig is not None


def test_r7_silent_at_threshold():
    with patch("residual_risk_telemetry._client_retries_in_last_5min", return_value=5):
        assert detect_residual_risk_7_client_retry_abuse("t-trap") is None


def test_r8_fires_on_hnsw_drift():
    with patch("residual_risk_telemetry._hnsw_consistency_divergence", return_value=1):
        sig = detect_residual_risk_8_hnsw_tie_drift("t-trap")
    assert sig is not None and sig.severity == "critical"


def test_r8_silent_at_zero():
    with patch("residual_risk_telemetry._hnsw_consistency_divergence", return_value=0):
        assert detect_residual_risk_8_hnsw_tie_drift("t-trap") is None


def test_r9_fires_on_deprecated_byok():
    with patch("residual_risk_telemetry._deprecated_byok_pinned_count", return_value=1):
        sig = detect_residual_risk_9_byok_deprecated_model("t-trap")
    assert sig is not None


def test_r9_silent_at_zero():
    with patch("residual_risk_telemetry._deprecated_byok_pinned_count", return_value=0):
        assert detect_residual_risk_9_byok_deprecated_model("t-trap") is None


def test_r10_fires_above_miss_rate():
    with patch("residual_risk_telemetry._prompt_cache_miss_pct", return_value=30.1):
        sig = detect_residual_risk_10_low_traffic_cache_miss("t-trap")
    assert sig is not None


def test_r10_silent_at_threshold():
    with patch("residual_risk_telemetry._prompt_cache_miss_pct", return_value=30.0):
        assert detect_residual_risk_10_low_traffic_cache_miss("t-trap") is None


def test_ops11_fires_when_no_emission_in_window():
    with patch("residual_risk_telemetry._seconds_since_last_emission", return_value=700), \
         patch("residual_risk_telemetry._is_business_hours", return_value=True):
        sig = detect_ops_telemetry_source_missing("t-trap")
    assert sig is not None and sig.severity == "critical"


def test_ops11_silent_within_window():
    with patch("residual_risk_telemetry._seconds_since_last_emission", return_value=599), \
         patch("residual_risk_telemetry._is_business_hours", return_value=True):
        assert detect_ops_telemetry_source_missing("t-trap") is None


def test_ops12_fires_at_dispatch_budget():
    import alert_manager as am_mod
    from alert_manager import AlertManager
    am_mod._singleton = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    try:
        am = am_mod.get_alert_manager()
        for _ in range(5):
            am._record_dispatch_failure("t-trap")
        sig = detect_ops_alert_dispatch_failure("t-trap")
        assert sig is not None
    finally:
        am_mod._singleton = None


def test_ops12_silent_below_budget():
    import alert_manager as am_mod
    from alert_manager import AlertManager
    am_mod._singleton = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    try:
        am = am_mod.get_alert_manager()
        for _ in range(4):
            am._record_dispatch_failure("t-trap")
        assert detect_ops_alert_dispatch_failure("t-trap") is None
    finally:
        am_mod._singleton = None
