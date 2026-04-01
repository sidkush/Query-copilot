"""Dashboard CRUD API routes."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth import get_current_user
from user_storage import (
    list_dashboards, create_dashboard, load_dashboard,
    update_dashboard, add_dashboard_tile, delete_dashboard,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


class CreateDashboard(BaseModel):
    name: str


class UpdateDashboard(BaseModel):
    name: Optional[str] = None
    tiles: Optional[list] = None
    layout: Optional[list] = None


class AddTile(BaseModel):
    title: str
    chartType: str
    columns: list
    rows: list
    selectedMeasure: Optional[str] = None
    activeMeasures: Optional[list] = None
    palette: str = "default"
    question: Optional[str] = None
    sql: Optional[str] = None


@router.get("/")
def get_dashboards(user: dict = Depends(get_current_user)):
    return {"dashboards": list_dashboards(user["email"])}


@router.post("/")
def create_new_dashboard(body: CreateDashboard, user: dict = Depends(get_current_user)):
    name = body.name.strip()[:200] or "Untitled Dashboard"
    dashboard = create_dashboard(user["email"], name)
    return dashboard


@router.get("/{dashboard_id}")
def get_dashboard(dashboard_id: str, user: dict = Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return d


@router.put("/{dashboard_id}")
def update_existing_dashboard(dashboard_id: str, body: UpdateDashboard, user: dict = Depends(get_current_user)):
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()[:200]
    if body.tiles is not None:
        updates["tiles"] = body.tiles
    if body.layout is not None:
        updates["layout"] = body.layout
    d = update_dashboard(user["email"], dashboard_id, updates)
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return d


@router.post("/{dashboard_id}/tiles")
def add_tile_to_dashboard(dashboard_id: str, body: AddTile, user: dict = Depends(get_current_user)):
    tile = {
        "title": body.title.strip()[:200],
        "chartType": body.chartType,
        "columns": body.columns,
        "rows": body.rows[:100],  # cap at 100 rows per tile
        "selectedMeasure": body.selectedMeasure,
        "activeMeasures": body.activeMeasures,
        "palette": body.palette,
        "question": body.question,
        "sql": body.sql,
    }
    d = add_dashboard_tile(user["email"], dashboard_id, tile)
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return d


@router.delete("/{dashboard_id}")
def delete_existing_dashboard(dashboard_id: str, user: dict = Depends(get_current_user)):
    delete_dashboard(user["email"], dashboard_id)
    return {"status": "ok"}


@router.delete("/{dashboard_id}/tiles/{tile_id}")
def remove_tile(dashboard_id: str, tile_id: str, user: dict = Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    d["tiles"] = [t for t in d["tiles"] if t.get("id") != tile_id]
    d["layout"] = [l for l in d.get("layout", []) if l.get("i") != tile_id]
    result = update_dashboard(user["email"], dashboard_id, {"tiles": d["tiles"], "layout": d["layout"]})
    return result
