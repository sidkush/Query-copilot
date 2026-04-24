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


def _hnsw_consistency_divergence(tenant_id: str) -> int:
    try:
        from query_memory import hnsw_consistency_divergence_last_hour
        return hnsw_consistency_divergence_last_hour(tenant_id)
    except Exception:
        return 0


def detect_residual_risk_8_hnsw_tie_drift(tenant_id: str) -> Optional[AlertSignal]:
    n = _hnsw_consistency_divergence(tenant_id)
    if n > 0:
        return AlertSignal(
            rule_id="residual_risk_8_hnsw_tie_drift",
            tenant_id=tenant_id,
            severity="critical",
            observed_value=float(n),
            threshold=0.0,
            message=f"ChromaDB consistency divergence count = {n}. Runbook: already pinned seed + stable-sort (H9) — re-pin + log.",
        )
    return None


_ALL_DETECTORS.append(detect_residual_risk_8_hnsw_tie_drift)
