"""
Residual risk detectors — Phase I.

One pure function per row of the master plan's residual-risk register.
Each returns AlertSignal or None. Dispatch is the caller's job
(typically run_detectors_periodic).
"""
from __future__ import annotations

import logging
from typing import Optional

from alert_manager import AlertSignal, get_alert_manager
from config import settings

logger = logging.getLogger(__name__)


def run_detectors_periodic(tenant_ids: list[str]) -> None:
    """Called from main.py APScheduler every 60s."""
    am = get_alert_manager()
    for t in tenant_ids:
        for detect in _ALL_DETECTORS:
            sig = detect(t)
            if sig is not None:
                am.fire(sig)


# _ALL_DETECTORS populated at bottom after each function is defined.
_ALL_DETECTORS: list = []


def _prompt_cache_miss_pct(tenant_id: str) -> float:
    try:
        from anthropic_provider import prompt_cache_miss_rate_for_tenant
        return prompt_cache_miss_rate_for_tenant(tenant_id) * 100.0
    except Exception:
        return 0.0


def detect_residual_risk_10_low_traffic_cache_miss(tenant_id: str) -> Optional[AlertSignal]:
    pct = _prompt_cache_miss_pct(tenant_id)
    threshold = settings.RESIDUAL_RISK_10_LOW_TRAFFIC_CACHE_MISS_MAX_PCT
    if pct > threshold:
        return AlertSignal(
            rule_id="residual_risk_10_low_traffic_cache_miss",
            tenant_id=tenant_id,
            severity="info",
            observed_value=pct,
            threshold=threshold,
            message=f"Prompt-cache miss rate {pct:.1f}% > {threshold}%. Runbook: cache-warmer cron.",
        )
    return None


_ALL_DETECTORS.append(detect_residual_risk_10_low_traffic_cache_miss)
