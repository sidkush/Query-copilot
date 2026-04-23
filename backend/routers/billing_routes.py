"""Billing routes — Stripe webhook verification (Phase H — H20)."""
from fastapi import APIRouter, Header, HTTPException, Request

from identity_hardening import verify_stripe_signature
from audit_trail import log_agent_event  # reused; billing events live in the same log

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="Stripe-Signature"),
):
    payload = await request.body()
    try:
        event = verify_stripe_signature(payload=payload, sig_header=stripe_signature)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid signature: {exc}")

    log_agent_event(
        email=event.get("data", {}).get("object", {}).get("customer_email", "unknown"),
        chat_id="stripe",
        event=event.get("type", "unknown"),
        actor_type="system",
        details={"id": event.get("id")},
    )
    return {"received": True}
