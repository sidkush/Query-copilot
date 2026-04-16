"""
marketplace_billing.py — v1 billing model for paid gallery chart types.

Defines pricing tiers + purchase records. Actual payment processing
(Stripe integration) deferred to future work. This module stores
purchase intent and tracks what users have "bought" (free tier only in v1).
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

PRICING_TIERS = {
    "free": {"price_usd": 0, "label": "Free"},
    "basic": {"price_usd": 4.99, "label": "Basic ($4.99)"},
    "premium": {"price_usd": 14.99, "label": "Premium ($14.99)"},
}

BILLING_ROOT = Path(".data/marketplace")

def record_purchase(user_email: str, type_id: str, tier: str = "free") -> dict:
    """Record a purchase/installation. v1: all types are free."""
    BILLING_ROOT.mkdir(parents=True, exist_ok=True)
    record = {
        "user_email": user_email,
        "type_id": type_id,
        "tier": tier,
        "price_usd": PRICING_TIERS.get(tier, PRICING_TIERS["free"])["price_usd"],
        "purchased_at": datetime.now(timezone.utc).isoformat(),
        "status": "completed",
    }
    # Append to purchases log
    log_path = BILLING_ROOT / "purchases.jsonl"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    return record

def get_user_purchases(user_email: str) -> list[dict]:
    """List purchases for a user."""
    log_path = BILLING_ROOT / "purchases.jsonl"
    if not log_path.exists():
        return []
    purchases = []
    for line in log_path.read_text("utf-8").strip().split("\n"):
        if not line:
            continue
        entry = json.loads(line)
        if entry.get("user_email") == user_email:
            purchases.append(entry)
    return purchases

def has_purchased(user_email: str, type_id: str) -> bool:
    """Check if user has purchased a specific type."""
    return any(p["type_id"] == type_id for p in get_user_purchases(user_email))
