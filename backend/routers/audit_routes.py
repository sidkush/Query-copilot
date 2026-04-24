"""Phase L — Admin audit-ledger export router."""
from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from config import settings
from routers.admin_routes import get_admin_user

router = APIRouter(prefix="/api/v1/admin/audit-ledger", tags=["admin-audit"])
_LEDGER_ROOT = Path(settings.AUDIT_LEDGER_DIR)

@router.get("/export", response_class=PlainTextResponse)
def export_ledger(
    tenant_id: str = Query(..., min_length=1),
    year_month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    admin_user=Depends(get_admin_user),
):
    from audit_ledger import AuditLedger
    import json as _j
    from dataclasses import asdict as _asdict
    ledger = AuditLedger(root=_LEDGER_ROOT)
    entries = ledger.read(tenant_id=tenant_id, year_month=year_month)
    return "\n".join(_j.dumps(_asdict(e), sort_keys=True) for e in entries)
