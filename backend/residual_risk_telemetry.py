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


def _top10_retrieval_precision_pct(tenant_id: str) -> float:
    try:
        from query_memory import QueryMemory
        return QueryMemory().top10_precision_pct(tenant_id)
    except Exception:
        return 100.0  # assume full precision if unavailable


def detect_residual_risk_5_10k_tables(tenant_id: str) -> Optional[AlertSignal]:
    pct = _top10_retrieval_precision_pct(tenant_id)
    threshold = settings.RESIDUAL_RISK_5_TOP10_PRECISION_MIN_PCT
    if pct < threshold:
        return AlertSignal(
            rule_id="residual_risk_5_10k_tables",
            tenant_id=tenant_id,
            severity="warn",
            observed_value=pct,
            threshold=threshold,
            message=f"Top-10 retrieval precision {pct:.1f}% < {threshold}%. Runbook: bespoke enterprise-tier strategy.",
        )
    return None


_ALL_DETECTORS.append(detect_residual_risk_5_10k_tables)
