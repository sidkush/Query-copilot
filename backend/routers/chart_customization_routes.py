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

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response as RawResponse
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


@router.post("/chart-types/import")
async def import_chart_type(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a .askdbviz ZIP package and install it as a user chart type."""
    from askdbviz_package import (
        PackageValidationError,
        extract_package,
        validate_package,
    )

    email = _require_email(user)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Package exceeds 10 MB limit")

    try:
        result = validate_package(content)
    except PackageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    manifest = result["manifest"]
    extracted = extract_package(content)

    chart_type: dict[str, Any] = {
        "id": manifest["id"],
        "name": manifest["name"],
        "description": manifest.get("description", ""),
        "category": manifest.get("category", "custom"),
        "schemaVersion": 1,
        "tier": manifest["tier"],
        "version": manifest["version"],
    }

    if manifest["tier"] == "spec":
        chart_type["parameters"] = manifest.get("parameters", [])
        chart_type["specTemplate"] = manifest.get("specTemplate", {})
    elif manifest["tier"] == "code":
        chart_type["bundle"] = extracted.get("bundle")
        chart_type["capabilities"] = manifest.get("capabilities", [])

    try:
        saved = save_chart_type(email, chart_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"chart_type": saved, "manifest": manifest}


@router.get("/chart-types/export/{type_id}")
async def export_chart_type(
    type_id: str, user: dict = Depends(get_current_user)
):
    """Download an installed user chart type as a .askdbviz ZIP package."""
    from askdbviz_package import build_package

    email = _require_email(user)

    all_types = list_chart_types(email)
    chart_type = next((ct for ct in all_types if ct.get("id") == type_id), None)
    if chart_type is None:
        raise HTTPException(status_code=404, detail=f"chart type not found: {type_id}")

    manifest: dict[str, Any] = {
        "id": chart_type["id"],
        "name": chart_type["name"],
        "description": chart_type.get("description", ""),
        "category": chart_type.get("category", "custom"),
        "tier": chart_type["tier"],
        "version": chart_type.get("version", "1.0.0"),
    }

    bundle: str | None = None
    if chart_type["tier"] == "spec":
        manifest["parameters"] = chart_type.get("parameters", [])
        manifest["specTemplate"] = chart_type.get("specTemplate", {})
    elif chart_type["tier"] == "code":
        bundle = chart_type.get("bundle")
        manifest["capabilities"] = chart_type.get("capabilities", [])
        if bundle:
            manifest["entryPoint"] = "index.js"

    zip_bytes = build_package(manifest, bundle=bundle)

    safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in type_id)
    filename = f"{safe_id}.askdbviz"

    return RawResponse(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


@router.post("/connections/{conn_id}/semantic/bootstrap")
async def bootstrap_semantic(
    conn_id: str, request: Request, user: dict = Depends(get_current_user)
):
    email = _require_email(user)
    from main import app
    conn_entry = app.state.connections.get(email, {}).get(conn_id)
    if conn_entry is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    schema_profile = conn_entry.schema_profile
    if not schema_profile:
        raise HTTPException(status_code=400, detail="Connection not profiled yet — run schema profiling first")
    from provider_registry import resolve_provider
    provider = resolve_provider(email, model_tier="fast")
    from semantic_bootstrap import bootstrap_linguistic
    linguistic = bootstrap_linguistic(schema_profile=schema_profile, provider=provider)
    try:
        saved = save_linguistic(email, conn_id, linguistic)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"linguistic": saved}


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


# ── Gallery (Sub-project C — community type registry) ─────────────────


@router.get("/gallery/types")
async def gallery_list_types(
    page: int = 1,
    page_size: int = 20,
    category: str | None = None,
    tier: str | None = None,
    sort: str = "recent",
):
    """Browse community-contributed chart types."""
    from gallery_store import gallery_store

    return gallery_store.list_types(
        page=page,
        page_size=page_size,
        category=category,
        tier=tier,
        sort=sort,
    )


@router.get("/gallery/types/{type_id}")
async def gallery_get_type(type_id: str):
    """Return a single gallery type by ID."""
    from gallery_store import gallery_store

    entry = gallery_store.get_type(type_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"gallery type not found: {type_id}")
    return entry


@router.post("/gallery/submit")
async def gallery_submit_type(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Submit a .askdbviz package to the community gallery."""
    from askdbviz_package import extract_package
    from gallery_store import gallery_store

    email = _require_email(user)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Package exceeds 10 MB limit")

    try:
        manifest = extract_package(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        entry = gallery_store.submit_type(manifest, content, email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"entry": entry}


@router.get("/gallery/types/{type_id}/download")
async def gallery_download_type(type_id: str):
    """Download a gallery chart type as a .askdbviz ZIP."""
    from gallery_store import gallery_store

    zip_bytes = gallery_store.download_package(type_id)
    if zip_bytes is None:
        raise HTTPException(status_code=404, detail=f"gallery type not found: {type_id}")

    safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in type_id)
    filename = f"{safe_id}.askdbviz"

    return RawResponse(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/gallery/types/{type_id}/rate")
async def gallery_rate_type(
    type_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Rate a gallery chart type (1–5 stars). Auth required."""
    from gallery_store import gallery_store

    _require_email(user)

    stars = body.get("stars")
    if not isinstance(stars, int) or stars < 1 or stars > 5:
        raise HTTPException(status_code=400, detail="stars must be an integer between 1 and 5")

    entry = gallery_store.rate_type(type_id, stars)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"gallery type not found: {type_id}")

    return entry


# ── helpers ───────────────────────────────────────────────────────────


def _require_email(user: dict) -> str:
    email = user.get("email") or user.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="No user email in token")
    return email
