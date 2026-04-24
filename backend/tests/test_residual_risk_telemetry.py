"""Unit tests for residual_risk_telemetry detectors."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from residual_risk_telemetry import detect_residual_risk_1_llm_pretraining_fn
from residual_risk_telemetry import detect_residual_risk_2_anthropic_region_failover
from residual_risk_telemetry import detect_residual_risk_3_dba_ddl_no_webhook
from residual_risk_telemetry import detect_residual_risk_4_leap_day
from residual_risk_telemetry import detect_residual_risk_5_10k_tables
from residual_risk_telemetry import detect_residual_risk_6_thumbs_up_storm
from residual_risk_telemetry import detect_residual_risk_7_client_retry_abuse
from residual_risk_telemetry import detect_residual_risk_8_hnsw_tie_drift
from residual_risk_telemetry import detect_residual_risk_9_byok_deprecated_model
from residual_risk_telemetry import detect_residual_risk_10_low_traffic_cache_miss


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


def test_detector_4_fires_below_100_pct():
    with patch("residual_risk_telemetry._leap_day_trap_pass_pct", return_value=95.0):
        sig = detect_residual_risk_4_leap_day("t-1")
    assert sig is not None
    assert sig.observed_value == 95.0


def test_detector_4_silent_at_100_pct():
    with patch("residual_risk_telemetry._leap_day_trap_pass_pct", return_value=100.0):
        assert detect_residual_risk_4_leap_day("t-1") is None


def test_detector_5_fires_when_precision_drops():
    with patch("residual_risk_telemetry._top10_retrieval_precision_pct", return_value=55.0):
        sig = detect_residual_risk_5_10k_tables("t-1")
    assert sig is not None
    assert sig.severity == "warn"


def test_detector_5_silent_at_or_above_threshold():
    with patch("residual_risk_telemetry._top10_retrieval_precision_pct", return_value=70.0):
        assert detect_residual_risk_5_10k_tables("t-1") is None


def test_detector_6_fires_when_upvote_storm_flagged():
    with patch("residual_risk_telemetry._adversarial_upvote_storm_count", return_value=4):
        sig = detect_residual_risk_6_thumbs_up_storm("t-1")
    assert sig is not None


def test_detector_6_silent_at_or_below_3():
    with patch("residual_risk_telemetry._adversarial_upvote_storm_count", return_value=3):
        assert detect_residual_risk_6_thumbs_up_storm("t-1") is None


def test_detector_7_fires_above_retry_budget():
    with patch("residual_risk_telemetry._client_retries_in_last_5min", return_value=6):
        sig = detect_residual_risk_7_client_retry_abuse("t-1")
    assert sig is not None


def test_detector_7_silent_at_or_below_5():
    with patch("residual_risk_telemetry._client_retries_in_last_5min", return_value=5):
        assert detect_residual_risk_7_client_retry_abuse("t-1") is None


def test_detector_8_fires_on_any_divergence():
    with patch("residual_risk_telemetry._hnsw_consistency_divergence", return_value=1):
        sig = detect_residual_risk_8_hnsw_tie_drift("t-1")
    assert sig is not None
    assert sig.severity == "critical"


def test_detector_8_silent_at_zero():
    with patch("residual_risk_telemetry._hnsw_consistency_divergence", return_value=0):
        assert detect_residual_risk_8_hnsw_tie_drift("t-1") is None


def test_detector_9_fires_when_any_byok_user_pinned_to_deprecated():
    with patch("residual_risk_telemetry._deprecated_byok_pinned_count", return_value=2):
        sig = detect_residual_risk_9_byok_deprecated_model("t-1")
    assert sig is not None


def test_detector_9_silent_at_zero():
    with patch("residual_risk_telemetry._deprecated_byok_pinned_count", return_value=0):
        assert detect_residual_risk_9_byok_deprecated_model("t-1") is None


def test_detector_10_fires_above_30pct_miss():
    with patch("residual_risk_telemetry._prompt_cache_miss_pct", return_value=35.0):
        sig = detect_residual_risk_10_low_traffic_cache_miss("t-1")
    assert sig is not None


def test_detector_10_silent_at_or_below():
    with patch("residual_risk_telemetry._prompt_cache_miss_pct", return_value=30.0):
        assert detect_residual_risk_10_low_traffic_cache_miss("t-1") is None


from residual_risk_telemetry import detect_ops_telemetry_source_missing, detect_ops_alert_dispatch_failure


def test_ops_11_fires_when_no_detector_emitted_in_window():
    with patch("residual_risk_telemetry._seconds_since_last_emission", return_value=700), \
         patch("residual_risk_telemetry._is_business_hours", return_value=True):
        sig = detect_ops_telemetry_source_missing("t-1")
    assert sig is not None
    assert sig.severity == "critical"


def test_ops_11_silent_outside_business_hours():
    with patch("residual_risk_telemetry._seconds_since_last_emission", return_value=700), \
         patch("residual_risk_telemetry._is_business_hours", return_value=False):
        assert detect_ops_telemetry_source_missing("t-1") is None


def test_ops_11_silent_within_window():
    with patch("residual_risk_telemetry._seconds_since_last_emission", return_value=599), \
         patch("residual_risk_telemetry._is_business_hours", return_value=True):
        assert detect_ops_telemetry_source_missing("t-1") is None


def test_ops_12_fires_when_dispatch_failure_budget_exhausted():
    from alert_manager import get_alert_manager, AlertManager
    import alert_manager as am_mod
    # Replace singleton with fresh instance
    am_mod._singleton = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    am = get_alert_manager()
    for _ in range(5):
        am._record_dispatch_failure("t-1")
    sig = detect_ops_alert_dispatch_failure("t-1")
    assert sig is not None
    am_mod._singleton = None  # reset singleton


def test_ops_12_silent_below_budget():
    from alert_manager import get_alert_manager, AlertManager
    import alert_manager as am_mod
    am_mod._singleton = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    am = get_alert_manager()
    for _ in range(4):
        am._record_dispatch_failure("t-1")
    sig = detect_ops_alert_dispatch_failure("t-1")
    assert sig is None
    am_mod._singleton = None
