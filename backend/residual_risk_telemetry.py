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


def _adversarial_upvote_storm_count(tenant_id: str) -> int:
    try:
        from correction_pipeline import adversarial_similarity_storm_count_last_hour
        return adversarial_similarity_storm_count_last_hour(tenant_id)
    except Exception:
        return 0


def detect_residual_risk_6_thumbs_up_storm(tenant_id: str) -> Optional[AlertSignal]:
    n = _adversarial_upvote_storm_count(tenant_id)
    threshold = settings.RESIDUAL_RISK_6_UPVOTE_STORM_MAX_PER_HOUR
    if n > threshold:
        return AlertSignal(
            rule_id="residual_risk_6_thumbs_up_storm",
            tenant_id=tenant_id,
            severity="warn",
            observed_value=float(n),
            threshold=float(threshold),
            message=f"Outlier-similarity upvotes = {n} (>{threshold} in 1h from same user). Runbook: rate-limit + flag.",
        )
    return None


_ALL_DETECTORS.append(detect_residual_risk_6_thumbs_up_storm)
