"""Daily drift monitor.

Compares last-24h action distribution against the 7-day baseline.
KL divergence above SKILL_DRIFT_KL_THRESHOLD → alert admin via the
existing audit-log pathway (and email if configured).

See askdb-skills/agent/learn-from-corrections.md §Distribution-shift monitor.
"""
from __future__ import annotations

import json
import logging
import math
from collections import Counter
from pathlib import Path

logger = logging.getLogger(__name__)


def kl_divergence(p: dict[str, float], q: dict[str, float], eps: float = 1e-9) -> float:
    keys = set(p.keys()) | set(q.keys())
    total = 0.0
    for k in keys:
        pk = p.get(k, eps)
        qk = q.get(k, eps)
        total += pk * math.log(pk / qk)
    return total


def distribution_from_audit(audit_path: Path, *, key: str) -> dict[str, float]:
    counter: Counter = Counter()
    if not audit_path.exists():
        return {}
    for line in audit_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except Exception:  # noqa: BLE001
            continue
        v = rec.get(key)
        if isinstance(v, list):
            for item in v:
                counter[str(item)] += 1
        elif v is not None:
            counter[str(v)] += 1
    total = sum(counter.values()) or 1
    return {k: v / total for k, v in counter.items()}


def check_drift(
    *,
    today_audit: Path,
    baseline_audit: Path,
    threshold: float,
    keys: list[str] = None,
) -> dict:
    keys = keys or ["chart_type", "join_depth", "dialect"]
    alerts = []
    for key in keys:
        today = distribution_from_audit(today_audit, key=key)
        base = distribution_from_audit(baseline_audit, key=key)
        if not today or not base:
            continue
        div = kl_divergence(today, base)
        logger.info("drift_monitor: key=%s kl=%.4f", key, div)
        if div > threshold:
            alerts.append({"key": key, "kl": div})
    return {"alerts": alerts}
