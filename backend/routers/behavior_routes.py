"""Behavior tracking routes — receives compacted deltas, manages consent."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from auth import get_current_user
from config import settings
from user_storage import (
    load_behavior_profile,
    merge_behavior_delta,
    update_consent_level,
    clear_behavior_profile,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/behavior", tags=["behavior"])


class BehaviorDelta(BaseModel):
    session_signals: int = 0
    topic_interests: dict = {}
    connection_patterns: list = []
    page_visits: dict = {}
    dashboard_usage: dict = {}
    prediction_accuracy: Optional[float] = None
    compacted_at: str = ""


class ConsentUpdate(BaseModel):
    consent_level: int  # 0=off, 1=personal, 2=collaborative


@router.post("/delta")
def submit_behavior_delta(delta: BehaviorDelta, user: dict = Depends(get_current_user)):
    """Receive a compacted behavior delta from the client.

    Only accepted if session tracking is enabled and user has consented.
    Raw signals never leave the browser — this endpoint only receives
    abstract, compacted intents.
    """
    if not settings.FEATURE_SESSION_TRACKING:
        return {"status": "disabled"}

    email = user["email"]
    profile = load_behavior_profile(email)

    if profile.get("consent_level", 0) < 1:
        return {"status": "no_consent"}

    # Validate delta size to prevent abuse
    if delta.session_signals > 5000:
        raise HTTPException(status_code=400, detail="Delta too large")
    if len(delta.topic_interests) > 50:
        raise HTTPException(status_code=400, detail="Too many topics")

    merged = merge_behavior_delta(email, delta.model_dump())
    logger.info("Merged behavior delta for %s: %d signals", email, delta.session_signals)
    return {"status": "ok", "total_signals": merged.get("total_signals", 0)}


@router.get("/consent")
def get_consent(user: dict = Depends(get_current_user)):
    """Get current consent level for behavior tracking."""
    email = user["email"]
    profile = load_behavior_profile(email)
    return {
        "consent_level": profile.get("consent_level", 0),
        "feature_enabled": settings.FEATURE_SESSION_TRACKING,
    }


@router.put("/consent")
def set_consent(body: ConsentUpdate, user: dict = Depends(get_current_user)):
    """Update consent level. 0=off (deletes all data), 1=personal, 2=collaborative."""
    if not settings.FEATURE_SESSION_TRACKING:
        raise HTTPException(status_code=400, detail="Session tracking is not enabled")

    email = user["email"]

    # If revoking consent, erase all behavior data (right-to-erasure)
    if body.consent_level == 0:
        clear_behavior_profile(email)
        return {"consent_level": 0, "data_cleared": True}

    profile = update_consent_level(email, body.consent_level)
    return {"consent_level": profile["consent_level"], "data_cleared": False}


@router.get("/profile")
def get_behavior_profile(user: dict = Depends(get_current_user)):
    """Get the user's compacted behavior profile (for debugging/transparency)."""
    email = user["email"]
    profile = load_behavior_profile(email)
    # Never return raw signals — only the compacted profile
    return {
        "topic_interests": profile.get("topic_interests", {}),
        "total_signals": profile.get("total_signals", 0),
        "prediction_accuracy": profile.get("prediction_accuracy"),
        "consent_level": profile.get("consent_level", 0),
        "last_compacted_at": profile.get("last_compacted_at"),
    }


@router.get("/preload-targets")
def get_preload_targets(user: dict = Depends(get_current_user)):
    """Predict which pages/dashboards to pre-load."""
    from behavior_engine import predict_preload_targets
    return {"targets": predict_preload_targets(user["email"])}


@router.get("/precache-queries")
def get_precache_queries(user: dict = Depends(get_current_user)):
    """Get queries worth pre-caching based on usage patterns."""
    from behavior_engine import get_precache_queries
    email = user["email"]
    # Need schema context — use first available connection
    from main import app
    connections = app.state.connections.get(email, {})
    schema_info = {}
    if connections:
        entry = next(iter(connections.values()))
        try:
            schema_info = entry.engine.db.get_schema_info() if entry.engine else {}
        except Exception:
            pass
    queries = get_precache_queries(email, schema_info)
    return {"queries": queries}


@router.get("/insight-chains")
def get_insight_chains(user: dict = Depends(get_current_user)):
    """Get topic threads the user might want to resume."""
    from behavior_engine import extract_insight_chains
    email = user["email"]
    chains = extract_insight_chains(email)
    return {"chains": chains}


@router.get("/skill-gaps")
def get_skill_gaps(user: dict = Depends(get_current_user)):
    """Identify SQL features the user hasn't used yet."""
    from behavior_engine import detect_skill_gaps
    return {"gaps": detect_skill_gaps(user["email"])}


@router.get("/collaborative-suggestions")
def get_collaborative_suggestions(user: dict = Depends(get_current_user)):
    """Get suggestions based on what similar users commonly ask."""
    from behavior_engine import get_collaborative_suggestions
    email = user["email"]
    from main import app
    connections = app.state.connections.get(email, {})
    schema_info = {}
    if connections:
        entry = next(iter(connections.values()))
        try:
            schema_info = entry.engine.db.get_schema_info() if entry.engine else {}
        except Exception:
            pass
    return {"suggestions": get_collaborative_suggestions(email, schema_info)}


@router.get("/workflow-patterns")
def get_workflow_patterns(user: dict = Depends(get_current_user)):
    """Detect repeated query sequences that could become templates."""
    from behavior_engine import detect_workflow_patterns
    return {"workflows": detect_workflow_patterns(user["email"])}


@router.get("/personas")
def get_personas():
    """List available analyst personas."""
    from behavior_engine import list_personas, VALID_PERSONAS
    if not settings.FEATURE_PERSONAS:
        return {"personas": [], "enabled": False}
    return {"personas": list_personas(), "enabled": True}
