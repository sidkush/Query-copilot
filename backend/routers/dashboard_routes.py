"""Dashboard CRUD routes — hierarchical (tabs > sections > tiles)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from auth import get_current_user
from user_storage import (
    list_dashboards, create_dashboard, load_dashboard, update_dashboard,
    delete_dashboard, add_dashboard_tab, add_section_to_tab,
    add_tile_to_section, update_tile, add_annotation,
)

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


# ── Request Models ──────────────────────────────────────────────────

class CreateDashboard(BaseModel):
    name: str

class UpdateDashboardBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tabs: Optional[list] = None
    annotations: Optional[list] = None

class AddTab(BaseModel):
    name: str

class AddSection(BaseModel):
    name: str

class AddTile(BaseModel):
    title: str
    chartType: str = "bar"
    columns: list = []
    rows: list = []
    selectedMeasure: Optional[str] = None
    activeMeasures: Optional[list] = None
    palette: str = "default"
    question: Optional[str] = None
    sql: Optional[str] = None
    subtitle: Optional[str] = None
    filters: Optional[dict] = None

class UpdateTileBody(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    chartType: Optional[str] = None
    sql: Optional[str] = None
    selectedMeasure: Optional[str] = None
    activeMeasures: Optional[list] = None
    palette: Optional[str] = None
    filters: Optional[dict] = None
    columns: Optional[list] = None
    rows: Optional[list] = None

class AddAnnotation(BaseModel):
    text: str
    author: Optional[str] = None
    authorName: Optional[str] = None

class RefreshTileBody(BaseModel):
    conn_id: Optional[str] = None


# ── Dashboard CRUD ──────────────────────────────────────────────────

@router.get("/")
async def get_dashboards(user=Depends(get_current_user)):
    return {"dashboards": list_dashboards(user["email"])}

@router.post("/")
async def create_new_dashboard(body: CreateDashboard, user=Depends(get_current_user)):
    if not body.name or len(body.name.strip()) == 0:
        raise HTTPException(400, "Dashboard name is required")
    return create_dashboard(user["email"], body.name.strip()[:200])

@router.get("/{dashboard_id}")
async def get_dashboard(dashboard_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    return d

@router.put("/{dashboard_id}")
async def update_existing_dashboard(dashboard_id: str, body: UpdateDashboardBody, user=Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    d = update_dashboard(user["email"], dashboard_id, updates)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    return d

@router.delete("/{dashboard_id}")
async def delete_existing_dashboard(dashboard_id: str, user=Depends(get_current_user)):
    if delete_dashboard(user["email"], dashboard_id):
        return {"status": "ok"}
    raise HTTPException(404, "Dashboard not found")


# ── Tab Management ──────────────────────────────────────────────────

@router.post("/{dashboard_id}/tabs")
async def add_tab(dashboard_id: str, body: AddTab, user=Depends(get_current_user)):
    d = add_dashboard_tab(user["email"], dashboard_id, body.name.strip()[:200])
    if not d:
        raise HTTPException(404, "Dashboard not found")
    return d

@router.delete("/{dashboard_id}/tabs/{tab_id}")
async def delete_tab(dashboard_id: str, tab_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    for tab in d.get("tabs", []):
        if tab["id"] == tab_id:
            d["tabs"].remove(tab)
            update_dashboard(user["email"], dashboard_id, {"tabs": d["tabs"]})
            return d
    raise HTTPException(404, "Tab not found")


# ── Section Management ──────────────────────────────────────────────

@router.post("/{dashboard_id}/tabs/{tab_id}/sections")
async def add_section(dashboard_id: str, tab_id: str, body: AddSection, user=Depends(get_current_user)):
    d = add_section_to_tab(user["email"], dashboard_id, tab_id, body.name.strip()[:200])
    if not d:
        raise HTTPException(404, "Dashboard or tab not found")
    return d

@router.delete("/{dashboard_id}/tabs/{tab_id}/sections/{section_id}")
async def delete_section(dashboard_id: str, tab_id: str, section_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    for tab in d.get("tabs", []):
        if tab["id"] == tab_id:
            for sec in tab.get("sections", []):
                if sec["id"] == section_id:
                    tab["sections"].remove(sec)
                    update_dashboard(user["email"], dashboard_id, {"tabs": d["tabs"]})
                    return d
    raise HTTPException(404, "Tab or section not found")


# ── Tile Management ─────────────────────────────────────────────────

@router.post("/{dashboard_id}/tabs/{tab_id}/sections/{section_id}/tiles")
async def add_tile(dashboard_id: str, tab_id: str, section_id: str, body: AddTile, user=Depends(get_current_user)):
    tile_data = body.model_dump(exclude_none=True)
    tile_data["title"] = tile_data.get("title", "")[:200]
    if "rows" in tile_data:
        tile_data["rows"] = tile_data["rows"][:100]
    tile_data.setdefault("annotations", [])
    d = add_tile_to_section(user["email"], dashboard_id, tab_id, section_id, tile_data)
    if not d:
        raise HTTPException(404, "Dashboard, tab, or section not found")
    return d

@router.put("/{dashboard_id}/tiles/{tile_id}")
async def update_tile_endpoint(dashboard_id: str, tile_id: str, body: UpdateTileBody, user=Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if "rows" in updates:
        updates["rows"] = updates["rows"][:100]
    d = update_tile(user["email"], dashboard_id, tile_id, updates)
    if not d:
        raise HTTPException(404, "Dashboard or tile not found")
    return d

@router.delete("/{dashboard_id}/tiles/{tile_id}")
async def remove_tile(dashboard_id: str, tile_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            sec["tiles"] = [t for t in sec.get("tiles", []) if t["id"] != tile_id]
            sec["layout"] = [l for l in sec.get("layout", []) if l["i"] != tile_id]
    update_dashboard(user["email"], dashboard_id, {"tabs": d["tabs"]})
    return load_dashboard(user["email"], dashboard_id)


# ── Tile Refresh (re-execute SQL) ───────────────────────────────────

@router.post("/{dashboard_id}/tiles/{tile_id}/refresh")
async def refresh_tile(dashboard_id: str, tile_id: str, body: RefreshTileBody, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    # Find tile
    target_tile = None
    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            for tile in sec.get("tiles", []):
                if tile["id"] == tile_id:
                    target_tile = tile
                    break
    if not target_tile or not target_tile.get("sql"):
        raise HTTPException(400, "Tile not found or has no SQL")

    conn_id = body.conn_id
    email = user["email"]

    # Import here to avoid circular
    import main as app_module
    app = app_module.app
    connections = app.state.connections.get(email, {})
    if conn_id and conn_id in connections:
        entry = connections[conn_id]
    elif connections:
        entry = next(iter(connections.values()))
    else:
        raise HTTPException(400, "No active database connection")

    try:
        from sql_validator import SQLValidator
        from pii_masking import mask_dataframe
        validator = SQLValidator()
        is_valid, msg = validator.validate(target_tile["sql"])
        if not is_valid:
            raise HTTPException(400, f"SQL validation failed: {msg}")

        df = entry.connector.execute_query(target_tile["sql"])
        df = mask_dataframe(df)
        from decimal import Decimal
        rows = df.head(100).to_dict("records")
        for row in rows:
            for k, v in row.items():
                if isinstance(v, Decimal):
                    row[k] = float(v)
        columns = list(df.columns)
        update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
        return {"columns": columns, "rows": rows, "rowCount": len(df)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Refresh failed: {str(e)}")


# ── Annotations ─────────────────────────────────────────────────────

@router.post("/{dashboard_id}/annotations")
async def add_dashboard_annotation(dashboard_id: str, body: AddAnnotation, user=Depends(get_current_user)):
    annotation = {
        "author": user["email"],
        "authorName": body.authorName or user.get("name", user["email"]),
        "text": body.text,
    }
    d = add_annotation(user["email"], dashboard_id, annotation)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    return d

@router.post("/{dashboard_id}/tiles/{tile_id}/annotations")
async def add_tile_annotation(dashboard_id: str, tile_id: str, body: AddAnnotation, user=Depends(get_current_user)):
    annotation = {
        "author": user["email"],
        "authorName": body.authorName or user.get("name", user["email"]),
        "text": body.text,
    }
    d = add_annotation(user["email"], dashboard_id, annotation, tile_id=tile_id)
    if not d:
        raise HTTPException(404, "Dashboard or tile not found")
    return d
