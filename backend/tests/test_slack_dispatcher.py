"""Unit tests for slack_dispatcher."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from slack_dispatcher import SlackDispatcher, SlackPayload


def test_empty_webhook_falls_back_to_email_when_enabled():
    disp = SlackDispatcher(webhook_url="", max_retry=0, email_fallback=True)
    payload = SlackPayload(
        rule_id="residual_risk_7_client_retry_abuse",
        tenant_id="t-9",
        severity="warn",
        message="6 retries in 5 min",
        observed_value=6,
        threshold=5,
    )
    with patch("slack_dispatcher._send_email_fallback", return_value=True) as mocked_email:
        ok = disp.send(payload, recipient_email="admin@t-9.example")
    assert ok is True
    mocked_email.assert_called_once()


def test_retry_exhausted_triggers_email_fallback():
    disp = SlackDispatcher(webhook_url="https://hooks.slack.com/x", max_retry=2, email_fallback=True)
    payload = SlackPayload("residual_risk_4_leap_day", "t-1", "warn", "msg", 99.0, 100.0)
    with patch("slack_dispatcher.requests.post", side_effect=Exception("boom")):
        with patch("slack_dispatcher._send_email_fallback", return_value=True) as mocked:
            ok = disp.send(payload, recipient_email="admin@t-1.example")
    assert ok is True
    mocked.assert_called_once()


def test_rate_limit_blocks_burst():
    disp = SlackDispatcher(webhook_url="https://hooks.slack.com/x", max_retry=0, email_fallback=False, rate_per_sec=2)
    payload = SlackPayload("residual_risk_1_llm_pretraining_fn", "t-1", "warn", "m", 3.0, 2.0)
    with patch("slack_dispatcher.requests.post") as mocked_post:
        mocked_post.return_value.status_code = 200
        for _ in range(5):
            disp.send(payload, recipient_email=None)
    # Two slots per sec — at most 2 real posts fire in this tight loop.
    assert mocked_post.call_count <= 2
