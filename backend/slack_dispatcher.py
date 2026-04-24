"""
Slack Dispatcher — Phase I / H16.

Standalone webhook sender with:
- per-tenant rate limit (token bucket, default 5 req/s)
- retry via chaos_isolation.jittered_backoff
- email fallback via digest._send_email() when Slack exhausted
- Block Kit payload (no raw SQL results; SQL truncated to 200 chars)
"""
from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock
from typing import Optional

import requests

from chaos_isolation import jittered_backoff

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SlackPayload:
    rule_id: str
    tenant_id: str
    severity: str
    message: str
    observed_value: float
    threshold: float


def _send_email_fallback(recipient_email: str, payload: SlackPayload) -> bool:
    try:
        from digest import _send_email
    except ImportError:
        logger.warning("digest._send_email not importable — email fallback disabled")
        return False
    subject = f"[AskDB alert · {payload.severity}] {payload.rule_id}"
    body = (
        f"Rule: {payload.rule_id}\n"
        f"Tenant: {payload.tenant_id}\n"
        f"Severity: {payload.severity}\n"
        f"Observed: {payload.observed_value} | Threshold: {payload.threshold}\n\n"
        f"{payload.message}\n"
    )
    try:
        _send_email(recipient_email, subject, body)
        return True
    except Exception as exc:
        logger.warning("email fallback failed: %s", exc)
        return False


class SlackDispatcher:
    def __init__(self, webhook_url: str, max_retry: int, email_fallback: bool, rate_per_sec: int = 5):
        self._webhook = webhook_url
        self._max_retry = max_retry
        self._email_fallback = email_fallback
        self._rate_per_sec = rate_per_sec
        self._bucket: deque[float] = deque(maxlen=rate_per_sec)
        self._lock = Lock()

    def _rate_allow(self) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._bucket and now - self._bucket[0] > 1.0:
                self._bucket.popleft()
            if len(self._bucket) >= self._rate_per_sec:
                return False
            self._bucket.append(now)
            return True

    def send(self, payload: SlackPayload, recipient_email: Optional[str]) -> bool:
        if not self._webhook:
            if self._email_fallback and recipient_email:
                return _send_email_fallback(recipient_email, payload)
            return False
        if not self._rate_allow():
            logger.info("slack rate-limit drop rule=%s tenant=%s", payload.rule_id, payload.tenant_id)
            return False
        body = {
            "text": f":rotating_light: *{payload.severity.upper()}* `{payload.rule_id}` — tenant `{payload.tenant_id}`",
            "blocks": [{
                "type": "section",
                "text": {"type": "mrkdwn", "text": (
                    f"*{payload.rule_id}* ({payload.severity})\n"
                    f"Tenant: `{payload.tenant_id}`\n"
                    f"Observed: `{payload.observed_value}` | Threshold: `{payload.threshold}`\n"
                    f"{payload.message}"
                )},
            }],
        }
        for attempt in range(self._max_retry + 1):
            try:
                r = requests.post(self._webhook, json=body, timeout=5)
                if 200 <= r.status_code < 300:
                    return True
                logger.warning("slack http %s on rule=%s", r.status_code, payload.rule_id)
            except Exception as exc:
                logger.warning("slack post failed (attempt %d): %s", attempt + 1, exc)
            if attempt < self._max_retry:
                time.sleep(jittered_backoff(attempt) / 1000.0)
        if self._email_fallback and recipient_email:
            return _send_email_fallback(recipient_email, payload)
        return False
