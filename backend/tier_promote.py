"""Ring 5 — Tier-promote gate.

NL questions containing certain keywords MUST bypass Turbo Mode and run
live regardless of waterfall preference. Current list via settings:
  exact | last hour | today | fraud rate | incident | live
"""
from __future__ import annotations


def _keywords():
    try:
        from config import settings
        raw = settings.TIER_PROMOTE_KEYWORDS or ""
    except Exception:
        raw = "exact,last hour,today,fraud rate,incident,live"
    return [kw.strip().lower() for kw in raw.split(",") if kw.strip()]


def extract_promote_trigger(nl: str):
    lc = (nl or "").lower()
    for kw in _keywords():
        if kw in lc:
            return kw
    return None


def should_force_live(nl: str) -> bool:
    return extract_promote_trigger(nl) is not None
