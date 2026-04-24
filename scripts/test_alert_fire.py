"""Manual harness — fires one of each of the 12 alert rules end-to-end.

Usage:
  SLACK_WEBHOOK_DEV_URL=https://hooks.slack.com/... python scripts/test_alert_fire.py --tenant t-dev

Asserts: one dispatch per rule; dedup suppresses immediate second fire.
Does NOT require a live Slack webhook — if SLACK_WEBHOOK_DEV_URL is unset,
uses alert_manager's log channel and still verifies dedup logic.
"""
from __future__ import annotations

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from alert_manager import AlertSignal, AlertManager, get_alert_manager
import alert_manager as _am_mod


RULES = [
    ("residual_risk_1_llm_pretraining_fn",      "warn"),
    ("residual_risk_2_anthropic_region_failover","critical"),
    ("residual_risk_3_dba_ddl_no_webhook",       "warn"),
    ("residual_risk_4_leap_day",                 "warn"),
    ("residual_risk_5_10k_tables",               "warn"),
    ("residual_risk_6_thumbs_up_storm",          "warn"),
    ("residual_risk_7_client_retry_abuse",       "warn"),
    ("residual_risk_8_hnsw_tie_drift",           "critical"),
    ("residual_risk_9_byok_deprecated_model",    "warn"),
    ("residual_risk_10_low_traffic_cache_miss",  "info"),
    ("ops_telemetry_source_missing",             "critical"),
    ("ops_alert_dispatch_failure",               "critical"),
]


def _make_log_dispatch(webhook: str):
    """Return a _dispatch replacement that sends to Slack when a dev webhook is
    configured, or falls back to log-channel (returning dispatched=True) so that
    the dedup/assertion logic is exercised even without live Slack credentials."""
    from alert_manager import DispatchResult

    def _dispatch(self, signal: AlertSignal) -> DispatchResult:  # noqa: ANN001
        # ops_alert_dispatch_failure always uses log channel (prevents storm)
        if signal.rule_id == "ops_alert_dispatch_failure":
            import logging as _logging
            _logging.getLogger("alert_manager").critical(
                "CRITICAL: alert dispatch failed repeatedly for tenant=%s — no Slack/email retry to avoid storm",
                signal.tenant_id,
            )
            return DispatchResult(True, "log", None)

        if webhook:
            # Real Slack send via SlackDispatcher
            from slack_dispatcher import SlackDispatcher, SlackPayload
            payload = SlackPayload(
                rule_id=signal.rule_id,
                tenant_id=signal.tenant_id,
                severity=signal.severity,
                message=signal.message,
                observed_value=signal.observed_value,
                threshold=signal.threshold,
            )
            disp = SlackDispatcher(webhook_url=webhook, max_retry=0, email_fallback=False)
            ok = disp.send(payload, recipient_email=None)
            channel = "slack"
        else:
            # No webhook — log-channel synthetic success so dedup logic is verified
            import logging as _logging
            _logging.getLogger("alert_manager").info(
                "[test_alert_fire log-channel] rule=%s tenant=%s severity=%s observed=%s",
                signal.rule_id, signal.tenant_id, signal.severity, signal.observed_value,
            )
            ok = True
            channel = "log"

        return DispatchResult(ok, channel, None if ok else "dispatch_failed")

    return _dispatch


def fire_one(rule_id: str, tenant_id: str, severity: str, am: AlertManager) -> None:
    sig = AlertSignal(
        rule_id=rule_id,
        tenant_id=tenant_id,
        severity=severity,
        observed_value=999.0,
        threshold=0.0,
        message=f"[test_alert_fire] synthetic fire for {rule_id}",
    )
    r1 = am.fire(sig)
    r2 = am.fire(sig)  # should dedup
    assert r1.dispatched, f"{rule_id}: first fire should dispatch, got reason={r1.reason}"
    assert not r2.dispatched, f"{rule_id}: second fire should dedup, got dispatched={r2.dispatched} reason={r2.reason}"
    print(f"[OK] {rule_id}: dispatched={r1.dispatched} channel={r1.channel} | dedup reason={r2.reason}")


def main() -> None:
    p = argparse.ArgumentParser(description="Fire all 12 Phase-I alert rules and verify dedup.")
    p.add_argument("--tenant", default="t-dev", help="Tenant ID for synthetic signals")
    args = p.parse_args()

    webhook = os.environ.get("SLACK_WEBHOOK_DEV_URL", "")
    if webhook:
        print(f"[harness] Slack dev channel: {webhook[:40]}...")
    else:
        print("[harness] SLACK_WEBHOOK_DEV_URL not set — using log channel only (dedup logic still verified)")

    # Fresh AlertManager with 0-retry (so dispatch always 'succeeds' to log channel quickly)
    am = AlertManager(dedup_window_s=300, multi_hour_s=3600, max_retry=0)
    # Patch _dispatch so config/slack_dispatcher imports are not needed when no webhook
    am._dispatch = _make_log_dispatch(webhook).__get__(am, AlertManager)
    _am_mod._singleton = am  # replace global singleton for this run

    tenant = args.tenant
    errors = []
    for rule_id, severity in RULES:
        try:
            fire_one(rule_id, tenant, severity, am)
            time.sleep(0.05)  # stay inside per-second rate limit
        except AssertionError as e:
            errors.append(str(e))
            print(f"[FAIL] {e}")

    # Print dedup cache summary
    print(f"\n[harness] dedup cache entries: {len(am._dedup_cache)}")
    print(f"[harness] multi-hour cache entries: {len(am._multi_hour_cache)}")

    if errors:
        print(f"\n[FAIL] {len(errors)} rule(s) failed assertions:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print(f"\n[harness] All {len(RULES)} rules verified — dispatch + dedup OK")
        sys.exit(0)


if __name__ == "__main__":
    main()
