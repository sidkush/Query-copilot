"""Skill library operational status endpoint (Plan 3 P7T17)."""
from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/v1/skill-library", tags=["skill-library"])


@router.get("/status")
def status(request: Request):
    """Return current skill library state for ops dashboards + smoke tests."""
    from config import settings

    lib = getattr(request.app.state, "skill_library", None)
    coll = getattr(request.app.state, "skill_collection", None)
    sched = getattr(request.app.state, "skill_scheduler", None)

    return {
        "enabled": settings.SKILL_LIBRARY_ENABLED,
        "library_loaded": lib is not None,
        "skill_count": len(lib.all_names()) if lib else 0,
        "chroma_collection": getattr(coll, "name", None) if coll else None,
        "scheduler_running": bool(sched and getattr(sched, "running", False)),
        "always_on_tokens": (
            sum(h.tokens for h in lib.always_on()) if lib else 0
        ),
    }
