"""Chart customization routes — Sub-projects C + D.

Per-user CRUD for:
    - User-authored chart types (Sub-project C) at /api/v1/chart-types
    - Semantic models (Sub-project D) at /api/v1/semantic-models

Storage layer lives in chart_customization.py. Validation mirrors the
frontend @/chart-ir validators but runs server-side to prevent a
malicious client from persisting malformed definitions. Both
endpoints are auth-guarded via get_current_user.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from chart_customization import (
    delete_chart_type,
    delete_semantic_model,
    list_chart_types,
    list_semantic_models,
    save_chart_type,
    save_semantic_model,
)
from semantic_layer import (
    hydrate as semantic_hydrate,
    save_linguistic,
    save_color_map,
    save_semantic_model as save_semantic_model_conn,
)

router = APIRouter(prefix="/api/v1", tags=["chart-customization"])


# ── Sub-project C ─────────────────────────────────────────────────────


class ChartTypeListResponse(BaseModel):
    chart_types: list[dict[str, Any]]


@router.get("/chart-types", response_model=ChartTypeListResponse)
async def list_user_chart_types(user: dict = Depends(get_current_user)):
    email = _require_email(user)
    return ChartTypeListResponse(chart_types=list_chart_types(email))


@router.post("/chart-types")
async def upsert_user_chart_type(
    body: dict, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    try:
        saved = save_chart_type(email, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return saved


@router.delete("/chart-types/{type_id}")
async def remove_user_chart_type(
    type_id: str, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    removed = delete_chart_type(email, type_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"chart type not found: {type_id}")
    return {"status": "ok", "id": type_id}


# ── Sub-project D ─────────────────────────────────────────────────────


class SemanticModelListResponse(BaseModel):
    semantic_models: list[dict[str, Any]]


@router.get("/semantic-models", response_model=SemanticModelListResponse)
async def list_user_semantic_models(user: dict = Depends(get_current_user)):
    email = _require_email(user)
    return SemanticModelListResponse(semantic_models=list_semantic_models(email))


@router.post("/semantic-models")
async def upsert_user_semantic_model(
    body: dict, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    try:
        saved = save_semantic_model(email, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return saved


@router.delete("/semantic-models/{model_id}")
async def remove_user_semantic_model(
    model_id: str, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    removed = delete_semantic_model(email, model_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"semantic model not found: {model_id}")
    return {"status": "ok", "id": model_id}


# ── Sub-project D — per-connection semantic layer ─────────────────────


@router.get("/connections/{conn_id}/semantic")
async def get_connection_semantic(
    conn_id: str, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    return semantic_hydrate(email, conn_id)


@router.put("/connections/{conn_id}/semantic/linguistic")
async def put_connection_linguistic(
    conn_id: str, body: dict, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    try:
        saved = save_linguistic(email, conn_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return saved


@router.put("/connections/{conn_id}/semantic/color-map")
async def put_connection_color_map(
    conn_id: str, body: dict, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    try:
        saved = save_color_map(email, conn_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return saved


@router.put("/connections/{conn_id}/semantic/model")
async def put_connection_semantic_model(
    conn_id: str, body: dict, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    try:
        saved = save_semantic_model_conn(email, conn_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return saved


# ── helpers ───────────────────────────────────────────────────────────


def _require_email(user: dict) -> str:
    email = user.get("email") or user.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="No user email in token")
    return email
