"""Ops routes — Phase I. Admin-only, per-tenant.

Security invariant: every endpoint requires admin auth via
`get_admin_user` (separate admin JWT) and a `tenant_id` query
parameter.  Responses are always scoped to that single tenant —
no cross-tenant aggregates are ever returned (Ring 6 invariant).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from alert_manager import get_alert_manager
from cache_stats import collect_for_tenant
from routers.admin_routes import get_admin_user

router = APIRouter(prefix="/api/v1/ops", tags=["ops"])


def _resolve_tenant(admin: dict, tenant_id: str | None) -> str:
    """Return the tenant_id to scope this request to.

    ``get_admin_user`` returns ``{"username": ..., "role": ...}`` —
    no embedded tenant_id.  The caller must always supply
    ``?tenant_id=`` explicitly.  Global admins (role == "admin") may
    pass any tenant_id; otherwise the check is a no-op because the
    admin system has no per-tenant admins at this stage.
    """
    if tenant_id is None:
        raise HTTPException(
            status_code=400,
            detail="tenant_id query parameter is required",
        )
    return tenant_id


@router.get("/cache-stats")
def cache_stats(
    tenant_id: str | None = Query(None, description="Tenant to scope the report to"),
    admin: dict = Depends(get_admin_user),
):
    """Return per-tier cache hit-rates for a single tenant.

    Requires admin auth.  Never aggregates across tenants.
    """
    t = _resolve_tenant(admin, tenant_id)
    report = collect_for_tenant(t)
    return report.__dict__


@router.get("/alerts")
def list_alerts(
    tenant_id: str | None = Query(None, description="Tenant whose recent alerts to list"),
    admin: dict = Depends(get_admin_user),
):
    """Return up to 50 most recent alert events for a tenant."""
    t = _resolve_tenant(admin, tenant_id)
    am = get_alert_manager()
    return {"alerts": am.recent_events(t, limit=50)}


@router.get("/alerts/{alert_id}/history")
def alert_history(
    alert_id: str,
    tenant_id: str | None = Query(None, description="Tenant to scope the history to"),
    admin: dict = Depends(get_admin_user),
):
    """Return up to 200 historical events for a single rule_id within a tenant."""
    t = _resolve_tenant(admin, tenant_id)
    am = get_alert_manager()
    return {"rule_id": alert_id, "events": am.rule_history(t, alert_id, limit=200)}
