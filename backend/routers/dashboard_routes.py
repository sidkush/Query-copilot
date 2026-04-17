"""Dashboard CRUD routes — hierarchical (tabs > sections > tiles)."""

import asyncio
import json as _json
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from auth import get_current_user
from workspace_sharing import get_workspace_sharing


def _pick_dialect_for_user(email: str) -> str:
    """Find the dialect to use for tile-save SQL validation.

    The tile-save endpoints don't receive a conn_id in the body, so we
    look at the user's active connections on app.state. If exactly one
    db_type is present, use it. Otherwise default to the one that most
    likely produced the SQL — in practice BigQuery or Postgres are the
    overwhelming majority, so if BigQuery is present we pick it (its
    backticked table names are the format that breaks the default
    Postgres validator). Falls back to 'postgres' if no active conn.
    """
    try:
        from main import app
        conns = app.state.connections.get(email, {})
        db_types = {entry.db_type for entry in conns.values()}
        if not db_types:
            return "postgres"
        if "bigquery" in db_types:
            return "bigquery"
        if len(db_types) == 1:
            return next(iter(db_types))
        return next(iter(db_types))
    except Exception:
        return "postgres"
from user_storage import (
    list_dashboards, create_dashboard, load_dashboard, update_dashboard,
    delete_dashboard, add_dashboard_tab, add_section_to_tab,
    add_tile_to_section, update_tile, add_annotation, delete_annotation,
    create_share_token, validate_share_token, revoke_share_token, load_shared_dashboard,
    list_dashboard_versions, restore_dashboard_version,
)

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"])

import math as _math

def _sanitize_nan(obj):
    """Replace NaN/Inf floats with None to prevent JSON serialization crashes.
    Dashboard tile data can contain NaN from SQL computations (LAG, differences, etc.)."""
    if isinstance(obj, float) and (_math.isnan(obj) or _math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_nan(item) for item in obj]
    return obj


# ── Auto-reconnect helper ─────────────────────────────────────────

def _auto_reconnect(email: str, app):
    """Try to restore a live DB connection from the user's saved configs."""
    import uuid
    from user_storage import load_connection_configs, decrypt_password
    from config import DBType
    from db_connector import DatabaseConnector
    from query_engine import QueryEngine
    from models import ConnectionEntry

    configs = load_connection_configs(email)
    if not configs:
        return None

    for cfg in configs:
        try:
            working = dict(cfg)
            if working.get("password"):
                working["password"] = decrypt_password(working["password"])
            if working.get("token"):
                working["token"] = decrypt_password(working["token"])

            from routers.connection_routes import _build_uri_from_config
            db_type = DBType(working["db_type"])
            uri = _build_uri_from_config(working)
            connector = DatabaseConnector(
                db_type=db_type,
                connection_uri=uri,
                credentials_path=working.get("credentials_path"),
            )
            connector.connect()

            new_conn_id = uuid.uuid4().hex[:8]
            from provider_registry import get_provider_for_user
            provider = get_provider_for_user(email)
            engine = QueryEngine(connector, namespace=new_conn_id, provider=provider)
            engine.train_schema()

            database_name = (
                working.get("database") or working.get("project")
                or working.get("account") or working.get("catalog")
                or working.get("path") or "unknown"
            )
            entry = ConnectionEntry(
                conn_id=new_conn_id,
                connector=connector,
                engine=engine,
                db_type=working["db_type"],
                database_name=database_name,
            )
            app.state.connections.setdefault(email, {})[new_conn_id] = entry
            _logger.info("Auto-reconnected %s for %s", database_name, email)
            return entry
        except Exception as e:
            _logger.warning("Auto-reconnect failed for config %s: %s", cfg.get('id'), e, exc_info=True)
            continue
    return None


# ── Request Models ──────────────────────────────────────────────────

class CreateDashboard(BaseModel):
    name: str

class UpdateDashboardBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tabs: Optional[list] = None
    annotations: Optional[list] = None
    globalFilters: Optional[dict] = None
    customMetrics: Optional[list] = None
    themeConfig: Optional[dict] = None
    settings: Optional[dict] = None  # includes refresh_interval_minutes

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
    annotation: Optional[str] = None  # Story mode: scrollytelling chapter annotation
    filters: Optional[dict] = None
    # SP-3: Rich content tile fields
    content: Optional[str] = None  # Text/markdown tile body
    insightText: Optional[str] = None  # AI insight narrative
    insightGeneratedAt: Optional[str] = None  # ISO timestamp of last generation
    linkedTileIds: Optional[list] = None  # Tile IDs referenced by insight
    events: Optional[list] = None  # Activity feed events

class UpdateTileBody(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    annotation: Optional[str] = None  # Story mode: scrollytelling chapter annotation
    chartType: Optional[str] = None
    sql: Optional[str] = None
    selectedMeasure: Optional[str] = None
    activeMeasures: Optional[list] = None
    palette: Optional[str] = None
    filters: Optional[dict] = None
    columns: Optional[list] = None
    rows: Optional[list] = None
    dataSources: Optional[list] = None
    blendConfig: Optional[dict] = None
    visualConfig: Optional[dict] = None
    # SP-3: Rich content tile fields
    content: Optional[str] = None  # Text/markdown tile body
    insightText: Optional[str] = None  # AI insight narrative
    insightGeneratedAt: Optional[str] = None  # ISO timestamp of last generation
    linkedTileIds: Optional[list] = None  # Tile IDs referenced by insight
    events: Optional[list] = None  # Activity feed events

class GenerateColumnSQLBody(BaseModel):
    conn_id: str
    existing_sql: str
    new_columns: list  # column names to add to SELECT

class AddAnnotation(BaseModel):
    text: str
    author: Optional[str] = None
    authorName: Optional[str] = None

class RefreshTileBody(BaseModel):
    conn_id: Optional[str] = None
    filters: Optional[dict] = None
    source_id: Optional[str] = None
    parameters: Optional[dict] = None  # What-If param name → numeric value

class SaveBookmark(BaseModel):
    name: str
    state: dict

class TileTelemetryEvent(BaseModel):
    event: str  # "tile_created" | "tile_deleted" | "tile_survived_24h"
    dashboardId: str
    tileId: str
    chartType: Optional[str] = None
    ageMs: Optional[int] = None


# ── Phase 2.5 — tile survival telemetry ────────────────────────────

_VALID_TILE_EVENTS = {"tile_created", "tile_deleted", "tile_survived_24h"}


@router.post("/audit/tile-event")
async def log_tile_telemetry(
    body: TileTelemetryEvent,
    user=Depends(get_current_user),
):
    """
    Append a tile lifecycle event to the audit trail JSONL log.

    Reuses the existing audit_trail writer — no schema change, no new
    table. Used to compute tile survival rate (Phase 2 falsifiable
    claim: dense tiles survive 24h > 70% of the time).

    Hashing: user email is sha256-prefixed before writing to preserve
    the existing audit log's anonymization posture.
    """
    if body.event not in _VALID_TILE_EVENTS:
        raise HTTPException(400, f"Unknown event type: {body.event}")

    import hashlib
    email_hash = hashlib.sha256(user["email"].encode("utf-8")).hexdigest()[:16]

    from audit_trail import log_tile_event
    log_tile_event(
        event_type=body.event,
        dashboard_id=body.dashboardId,
        tile_id=body.tileId,
        chart_type=body.chartType,
        user_email_hash=email_hash,
        age_ms=body.ageMs,
    )
    return {"ok": True}


# ── Dashboard CRUD ──────────────────────────────────────────────────

@router.get("/")
async def get_dashboards(user=Depends(get_current_user)):
    return {"dashboards": list_dashboards(user["email"])}

@router.post("/")
async def create_new_dashboard(body: CreateDashboard, user=Depends(get_current_user)):
    if not body.name or len(body.name.strip()) == 0:
        raise HTTPException(400, "Dashboard name is required")
    return create_dashboard(user["email"], body.name.strip()[:200])

# NOTE: Literal routes MUST be declared before parametric ones or
# FastAPI matches `/{dashboard_id}` first and /feature-flags becomes a
# 404 "Dashboard not found". Phase 4c+1 regression — do not move below.
@router.get("/feature-flags")
async def get_dashboard_feature_flags():
    """Return chart-system cutover flags so the frontend can gate the
    new DashboardShell + ChartEditor surfaces in production. Primary
    flag is NEW_CHART_EDITOR_ENABLED. Additional chart-system flags
    land here as they come online.
    """
    from config import settings
    return {
        "NEW_CHART_EDITOR_ENABLED": settings.NEW_CHART_EDITOR_ENABLED,
    }

@router.get("/{dashboard_id}")
async def get_dashboard(dashboard_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    return _sanitize_nan(d)

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
    email = user["email"]
    # Permission check: caller must be editor or owner
    d = load_dashboard(email, dashboard_id)
    if not d:
        # May be a shared dashboard — locate the owner
        ws = get_workspace_sharing()
        shared = ws.list_shared_with_me(email)
        entry = next((s for s in shared if s["dashboard_id"] == dashboard_id), None)
        if not entry or not ws.check_access(email, entry["owner_email"], dashboard_id, "editor"):
            raise HTTPException(403, "Editor access required to add tiles")
        owner_email = entry["owner_email"]
    else:
        owner_email = email

    tile_data = body.model_dump(exclude_none=True)
    tile_data["title"] = tile_data.get("title", "")[:200]
    if "rows" in tile_data:
        tile_data["rows"] = tile_data["rows"][:5000]
    # Validate SQL at write time
    if tile_data.get("sql"):
        from sql_validator import SQLValidator
        _dialect = _pick_dialect_for_user(email)
        is_valid, _cleaned, error = SQLValidator(dialect=_dialect).validate(tile_data["sql"])
        if not is_valid:
            raise HTTPException(400, f"Invalid SQL: {error}")
    tile_data.setdefault("annotations", [])
    d = add_tile_to_section(owner_email, dashboard_id, tab_id, section_id, tile_data)
    if not d:
        raise HTTPException(404, "Dashboard, tab, or section not found")
    return d


@router.post("/{dashboard_id}/tiles")
async def add_tile_shortcut(dashboard_id: str, body: AddTile, user=Depends(get_current_user)):
    """Shortcut: add tile to the first tab's first section of a dashboard.

    Used by the Chat page's 'Add to Dashboard' flow which doesn't know
    about the tab/section hierarchy.
    """
    target = load_dashboard(user["email"], dashboard_id)
    if not target:
        raise HTTPException(404, "Dashboard not found")
    tabs = target.get("tabs", [])
    if not tabs:
        raise HTTPException(404, "Dashboard has no tabs")
    tab = tabs[0]
    sections = tab.get("sections", [])
    if not sections:
        raise HTTPException(404, "Dashboard tab has no sections")
    section = sections[0]
    tile_data = body.model_dump(exclude_none=True)
    tile_data["title"] = tile_data.get("title", "")[:200]
    if "rows" in tile_data:
        tile_data["rows"] = tile_data["rows"][:5000]
    # Validate SQL at write time
    if tile_data.get("sql"):
        from sql_validator import SQLValidator
        _dialect = _pick_dialect_for_user(user["email"])
        is_valid, _cleaned, error = SQLValidator(dialect=_dialect).validate(tile_data["sql"])
        if not is_valid:
            raise HTTPException(400, f"Invalid SQL: {error}")
    tile_data.setdefault("annotations", [])
    d = add_tile_to_section(user["email"], dashboard_id, tab["id"], section["id"], tile_data)
    if not d:
        raise HTTPException(404, "Failed to add tile")
    return d

@router.put("/{dashboard_id}/tiles/{tile_id}")
async def update_tile_endpoint(dashboard_id: str, tile_id: str, body: UpdateTileBody, user=Depends(get_current_user)):
    email = user["email"]
    # Permission check: caller must be editor or owner
    d = load_dashboard(email, dashboard_id)
    if not d:
        ws = get_workspace_sharing()
        shared = ws.list_shared_with_me(email)
        entry = next((s for s in shared if s["dashboard_id"] == dashboard_id), None)
        if not entry or not ws.check_access(email, entry["owner_email"], dashboard_id, "editor"):
            raise HTTPException(403, "Editor access required to update tiles")
        owner_email = entry["owner_email"]
    else:
        owner_email = email

    updates = body.model_dump(exclude_none=True)
    if "rows" in updates:
        updates["rows"] = updates["rows"][:5000]
    # Validate SQL at write time
    if updates.get("sql"):
        from sql_validator import SQLValidator
        _dialect = _pick_dialect_for_user(email)
        is_valid, _cleaned, error = SQLValidator(dialect=_dialect).validate(updates["sql"])
        if not is_valid:
            raise HTTPException(400, f"Invalid SQL: {error}")
    d = update_tile(owner_email, dashboard_id, tile_id, updates)
    if not d:
        raise HTTPException(404, "Dashboard or tile not found")
    return d

@router.delete("/{dashboard_id}/tiles/{tile_id}")
async def remove_tile(dashboard_id: str, tile_id: str, user=Depends(get_current_user)):
    email = user["email"]
    # Permission check: caller must be editor or owner
    d = load_dashboard(email, dashboard_id)
    if not d:
        ws = get_workspace_sharing()
        shared = ws.list_shared_with_me(email)
        entry = next((s for s in shared if s["dashboard_id"] == dashboard_id), None)
        if not entry or not ws.check_access(email, entry["owner_email"], dashboard_id, "editor"):
            raise HTTPException(403, "Editor access required to delete tiles")
        owner_email = entry["owner_email"]
        d = load_dashboard(owner_email, dashboard_id)
        if not d:
            raise HTTPException(404, "Dashboard not found")
    else:
        owner_email = email

    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            sec["tiles"] = [t for t in sec.get("tiles", []) if t["id"] != tile_id]
            sec["layout"] = [l for l in sec.get("layout", []) if l["i"] != tile_id]
    update_dashboard(owner_email, dashboard_id, {"tabs": d["tabs"]})
    return load_dashboard(owner_email, dashboard_id)


# ── SP-3: Insight Generation ──────────────────────────────────────────

class GenerateInsightBody(BaseModel):
    linkedTileIds: list = []  # tile IDs to analyze


@router.post("/{dashboard_id}/tiles/{tile_id}/generate-insight")
async def generate_insight(
    dashboard_id: str, tile_id: str,
    body: GenerateInsightBody,
    request: Request,
    user=Depends(get_current_user),
):
    """Generate an AI narrative insight from linked tile data.

    Collects rows/columns from referenced tiles, sends to Anthropic
    with a summarization prompt, caches result in tile metadata.
    """
    email = user["email"]
    d = load_dashboard(email, dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    # Collect data from linked tiles
    tile_data_context = []
    target_tile = None

    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            for t in sec.get("tiles", []):
                if t["id"] == tile_id:
                    target_tile = t
                # Gather linked tile data
                if t["id"] in body.linkedTileIds:
                    rows = t.get("rows", [])[:50]  # cap for prompt size
                    cols = t.get("columns", [])
                    title = t.get("title", t["id"])
                    tile_data_context.append(
                        f"Tile '{title}' ({t.get('chartType', 'chart')}):\n"
                        f"  Columns: {cols}\n"
                        f"  Sample data ({len(rows)} rows): {_json.dumps(rows[:10])}"
                    )

    if target_tile is None:
        raise HTTPException(404, "Tile not found")

    if not tile_data_context:
        raise HTTPException(400, "No linked tiles with data found")

    # Build prompt
    data_block = "\n\n".join(tile_data_context)
    prompt = (
        "You are a business intelligence analyst. Analyze the following dashboard tile data "
        "and write a concise narrative summary (2-4 sentences) that highlights key trends, "
        "changes, and notable metrics. Use specific numbers. Write in a professional editorial "
        "tone suitable for an executive briefing.\n\n"
        f"Dashboard tile data:\n{data_block}\n\n"
        "Write only the narrative paragraph — no headers, no bullet points, no markdown."
    )

    # Call Anthropic via provider
    from provider_registry import get_provider_for_user
    provider = get_provider_for_user(email)
    if not provider:
        raise HTTPException(503, "No AI provider available")

    try:
        response = await asyncio.to_thread(
            provider.complete,
            messages=[{"role": "user", "content": prompt}],
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
        )
        insight_text = response.content[0].text if response.content else ""
    except Exception as e:
        import logging
        logging.getLogger("dashboard").error("Insight generation failed: %s", e)
        raise HTTPException(502, f"AI generation failed: {str(e)[:200]}")

    # Cache insight in tile metadata
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "insightText": insight_text,
        "insightGeneratedAt": now,
        "linkedTileIds": body.linkedTileIds,
    }
    update_tile(email, dashboard_id, tile_id, updates)

    return {
        "insightText": insight_text,
        "insightGeneratedAt": now,
        "linkedTileIds": body.linkedTileIds,
    }


# ── Generate Column SQL ──────────────────────────────────────────────

@router.post("/generate-column-sql")
async def generate_column_sql(body: GenerateColumnSQLBody, request: Request, user=Depends(get_current_user)):
    """Rewrite a SQL SELECT to include additional columns. Returns error for complex SQL."""
    import sqlglot
    from sql_validator import SQLValidator

    email = user["email"]
    conns = request.app.state.connections.get(email, {})
    entry = conns.get(body.conn_id)
    if not entry:
        raise HTTPException(404, "Connection not found")

    sql = body.existing_sql.strip().rstrip(';')

    # Detect complex SQL that we can't safely rewrite
    sql_upper = sql.upper()
    is_complex = (
        'WITH ' in sql_upper  # CTE
        or sql_upper.count(' JOIN ') > 2  # >2 JOINs
        or 'UNION' in sql_upper  # UNION
        or sql_upper.count('SELECT') > 1  # subqueries
    )

    if is_complex:
        return {"error": "complex_sql", "message": "This query is too complex to auto-modify. Use the Agent to add columns."}

    # Try to parse and rewrite with sqlglot
    try:
        dialect = entry.db_type if entry.db_type != "postgresql" else "postgres"
        parsed = sqlglot.parse_one(sql, read=dialect)

        # Find existing SELECT columns
        existing_cols = set()
        for expr in parsed.find(sqlglot.exp.Select).expressions:
            if hasattr(expr, 'alias_or_name'):
                existing_cols.add(expr.alias_or_name.lower())

        # Add new columns that aren't already selected
        from_clause = parsed.find(sqlglot.exp.From)
        table_alias = None
        if from_clause and from_clause.this:
            table_alias = from_clause.this.alias_or_name

        for col in body.new_columns:
            if col.lower() not in existing_cols:
                col_expr = sqlglot.exp.Column(this=sqlglot.exp.to_identifier(col))
                if table_alias:
                    col_expr.set("table", sqlglot.exp.to_identifier(table_alias))
                parsed.find(sqlglot.exp.Select).expressions.append(col_expr)

        new_sql = parsed.sql(dialect=dialect)
    except Exception as e:
        # sqlglot parse failed — fall back to simple string rewrite
        import re
        match = re.match(r'(SELECT\s+)(.*?)(\s+FROM\s+)', sql, re.IGNORECASE | re.DOTALL)
        if not match:
            return {"error": "parse_failed", "message": f"Could not parse SQL: {str(e)[:100]}"}

        select_part = match.group(2)
        existing_cols_lower = {c.strip().lower().split('.')[-1].split(' as ')[-1].split(' AS ')[-1].strip() for c in select_part.split(',')}
        additions = [c for c in body.new_columns if c.lower() not in existing_cols_lower]
        if not additions:
            return {"sql": sql}  # all columns already present

        new_sql = f"{match.group(1)}{select_part}, {', '.join(additions)}{match.group(3)}{sql[match.end():]}"

    # Validate the generated SQL through sql_validator
    try:
        validator = SQLValidator(dialect=entry.db_type)
        is_valid, _cleaned, error = validator.validate(new_sql)
        if not is_valid:
            return {"error": "validation_failed", "message": f"Generated SQL failed validation: {error}"}
    except Exception as e:
        return {"error": "validation_error", "message": str(e)[:200]}

    return {"sql": new_sql}


# ── Tile Move & Copy ─────────────────────────────────────────────────

class MoveCopyTileBody(BaseModel):
    target_tab_id: str
    target_section_id: str

@router.post("/{dashboard_id}/tiles/{tile_id}/move")
async def move_tile_endpoint(dashboard_id: str, tile_id: str, body: MoveCopyTileBody, user=Depends(get_current_user)):
    from user_storage import move_tile
    result = move_tile(user["email"], dashboard_id, tile_id, body.target_tab_id, body.target_section_id)
    if not result:
        raise HTTPException(404, "Tile, target tab, or target section not found")
    return result

@router.post("/{dashboard_id}/tiles/{tile_id}/copy")
async def copy_tile_endpoint(dashboard_id: str, tile_id: str, body: MoveCopyTileBody, user=Depends(get_current_user)):
    from user_storage import copy_tile
    result = copy_tile(user["email"], dashboard_id, tile_id, body.target_tab_id, body.target_section_id)
    if not result:
        raise HTTPException(404, "Tile, target tab, or target section not found")
    return result


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
    if not target_tile:
        raise HTTPException(400, "Tile not found")

    # ── Data source branching: refresh a specific blend source ──
    if body.source_id:
        sources = target_tile.get("dataSources", [])
        source = next((s for s in sources if s.get("id") == body.source_id), None)
        if not source or not source.get("sql"):
            raise HTTPException(400, "Data source not found or has no SQL")
        target_sql = source["sql"]
    else:
        if not target_tile.get("sql"):
            raise HTTPException(400, "Tile has no SQL")
        target_sql = None  # will use target_tile["sql"] below

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
        # Auto-reconnect from saved connection configs
        entry = _auto_reconnect(email, app)
        if not entry:
            raise HTTPException(400, "No active database connection. Please connect to a database first.")

    try:
        from sql_validator import SQLValidator
        from pii_masking import mask_dataframe
        _dialect = entry.connector.db_type.value if hasattr(entry.connector, 'db_type') and hasattr(entry.connector.db_type, 'value') else 'postgres'
        validator = SQLValidator(dialect=_dialect)
        if target_sql is None:
            target_sql = target_tile["sql"]
        is_valid, validated_sql, validation_err = validator.validate(target_sql)
        if not is_valid:
            raise HTTPException(400, f"SQL validation failed: {validation_err}")
        target_sql = validated_sql

        # Apply Global Filters if present
        filters = body.filters
        # Normalize: support both new dateFilters[] array and old single dateColumn format
        _date_filters_list = []
        if filters:
            if isinstance(filters.get("dateFilters"), list):
                _date_filters_list = [df for df in filters["dateFilters"]
                                      if df.get("dateColumn") and df.get("range") and df["range"] != "all_time"]
            elif filters.get("dateColumn") and filters.get("range") and filters["range"] != "all_time":
                _date_filters_list = [{"dateColumn": filters["dateColumn"], "range": filters["range"],
                                       "dateStart": filters.get("dateStart", ""), "dateEnd": filters.get("dateEnd", "")}]

        for _df_entry in _date_filters_list:
            date_col = _df_entry["dateColumn"]
            # Validate dateColumn: only allow safe identifier characters
            import re as _re_dc
            if not _re_dc.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', date_col):
                raise HTTPException(400, "Invalid date column name")
            date_range = _df_entry["range"]
            
            from datetime import datetime, timedelta, timezone
            from dateutil.relativedelta import relativedelta
            now = datetime.now(timezone.utc)
            start_date, end_date = None, None
            prev_start, prev_end = None, None
            
            if date_range == "today":
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end_date = start_date + timedelta(days=1, microseconds=-1)
                prev_start = start_date - timedelta(days=1)
                prev_end = end_date - timedelta(days=1)
            elif date_range == "yesterday":
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
                end_date = start_date + timedelta(days=1, microseconds=-1)
                prev_start = start_date - timedelta(days=1)
                prev_end = end_date - timedelta(days=1)
            elif date_range == "this_week":
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
                end_date = start_date + timedelta(days=7, microseconds=-1)
                prev_start = start_date - timedelta(days=7)
                prev_end = end_date - timedelta(days=7)
            elif date_range == "last_week":
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday() + 7)
                end_date = start_date + timedelta(days=7, microseconds=-1)
                prev_start = start_date - timedelta(days=7)
                prev_end = end_date - timedelta(days=7)
            elif date_range == "this_month":
                start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                end_date = start_date + relativedelta(months=1, microseconds=-1)
                prev_start = start_date - relativedelta(months=1)
                prev_end = start_date - timedelta(microseconds=1)
            elif date_range == "last_month":
                end_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(microseconds=1)
                start_date = end_date.replace(day=1)
                prev_start = start_date - relativedelta(months=1)
                prev_end = start_date - timedelta(microseconds=1)
            elif date_range == "this_quarter":
                q_month = ((now.month - 1) // 3) * 3 + 1
                start_date = now.replace(month=q_month, day=1, hour=0, minute=0, second=0, microsecond=0)
                end_date = start_date + relativedelta(months=3, microseconds=-1)
                prev_start = start_date - relativedelta(months=3)
                prev_end = start_date - timedelta(microseconds=1)
            elif date_range == "last_quarter":
                this_q_start = now.replace(month=((now.month - 1) // 3) * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
                end_date = this_q_start - timedelta(microseconds=1)
                start_date = end_date.replace(month=((end_date.month - 1) // 3) * 3 + 1, day=1)
                prev_start = start_date - relativedelta(months=3)
                prev_end = start_date - timedelta(microseconds=1)
            elif date_range == "this_year":
                start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                end_date = start_date.replace(year=start_date.year + 1) - timedelta(microseconds=1)
                prev_start = start_date.replace(year=start_date.year - 1)
                prev_end = start_date - timedelta(microseconds=1)
            elif date_range == "last_year":
                start_date = now.replace(year=now.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                end_date = start_date.replace(year=start_date.year + 1) - timedelta(microseconds=1)
                prev_start = start_date.replace(year=start_date.year - 1)
                prev_end = start_date - timedelta(microseconds=1)
            elif date_range == "custom":
                # Custom date range: use dateStart/dateEnd from frontend
                ds = _df_entry.get("dateStart", "")
                de = _df_entry.get("dateEnd", "")
                if ds and de:
                    start_date = datetime.fromisoformat(ds).replace(tzinfo=timezone.utc) if 'T' in ds else datetime.strptime(ds, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                    end_date = datetime.fromisoformat(de).replace(tzinfo=timezone.utc) if 'T' in de else datetime.strptime(de, '%Y-%m-%d').replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)

            if start_date and end_date:
                s_str = start_date.strftime('%Y-%m-%d %H:%M:%S')
                e_str = end_date.strftime('%Y-%m-%d %H:%M:%S')

                def _find_qualified_col(sql, col_name):
                    """Find the fully-qualified column reference in SQL.
                    e.g. for col_name='created_at', find 'o.created_at' in the SQL.
                    Returns the qualified name or None if column not found."""
                    import re
                    # Match alias.col_name (e.g., o.created_at, orders.created_at)
                    pattern = r'\b(\w+\.' + re.escape(col_name) + r')\b'
                    match = re.search(pattern, sql, re.IGNORECASE)
                    if match:
                        return match.group(1)
                    # Match bare col_name (no alias)
                    pattern2 = r'(?<!\w\.)(\b' + re.escape(col_name) + r'\b)'
                    match2 = re.search(pattern2, sql, re.IGNORECASE)
                    if match2:
                        return col_name
                    return None

                def _inject_date_filter(sql, col, start, end):
                    """Inject date conditions into SQL WHERE clause.
                    Handles nested subqueries by finding the correct scope."""
                    import re
                    sql = sql.rstrip().rstrip(';').rstrip()
                    cond = f"{col} >= '{start}' AND {col} <= '{end}'"
                    # If date_col is in the tile's output columns, subquery wrapping works
                    tile_cols = target_tile.get("columns") or []
                    bare_col = col.split('.')[-1] if '.' in col else col
                    if bare_col in tile_cols:
                        return f"SELECT * FROM ({sql}) sq_wrap WHERE {bare_col} >= '{start}' AND {bare_col} <= '{end}'"

                    # Find the innermost subquery that contains the column,
                    # or use the full SQL if the column is at the top level.
                    col_match = re.search(re.escape(col), sql, re.IGNORECASE)
                    col_pos = col_match.start() if col_match else 0

                    # Walk backwards from col_pos to find the enclosing subquery
                    # paren '(SELECT ...)' — skip function-call parens like DATE().
                    scope_start = 0
                    scope_end = len(sql)
                    depth = 0
                    for i in range(col_pos - 1, -1, -1):
                        if sql[i] == ')':
                            depth += 1
                        elif sql[i] == '(':
                            if depth == 0:
                                # Check if this is a subquery paren (content starts with SELECT)
                                rest = sql[i + 1:].lstrip()
                                if rest.upper().startswith('SELECT'):
                                    scope_start = i + 1
                                    d = 1
                                    for j in range(i + 1, len(sql)):
                                        if sql[j] == '(':
                                            d += 1
                                        elif sql[j] == ')':
                                            d -= 1
                                            if d == 0:
                                                scope_end = j
                                                break
                                    break
                                # Otherwise it's a function call paren — keep walking
                            else:
                                depth -= 1

                    # Extract the scope (subquery or full SQL)
                    scope_sql = sql[scope_start:scope_end]

                    # Find the first GROUP BY/ORDER BY/HAVING/LIMIT in this scope
                    boundary = re.search(
                        r'\b(GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b',
                        scope_sql, re.IGNORECASE
                    )
                    if boundary:
                        inject_pos = scope_start + boundary.start()
                        before = sql[:inject_pos].rstrip()
                        after = sql[inject_pos:]
                        # Check if there's a WHERE in the scope before the boundary
                        scope_before = scope_sql[:boundary.start()]
                        if re.search(r'\bWHERE\b', scope_before, re.IGNORECASE):
                            return f"{before} AND {cond} {after}"
                        else:
                            return f"{before} WHERE {cond} {after}"
                    else:
                        # No boundary found in scope — append at end of scope
                        before = sql[:scope_end].rstrip()
                        after = sql[scope_end:]
                        scope_text = sql[scope_start:scope_end]
                        if re.search(r'\bWHERE\b', scope_text, re.IGNORECASE):
                            return f"{before} AND {cond}{after}"
                        else:
                            return f"{before} WHERE {cond}{after}"

                def _inject_date_filter_overlap(sql, start_col, end_col, start, end):
                    """Inject overlap filter for start_date/end_date pairs.
                    A record is active during [start, end] if:
                    start_col <= end AND (end_col >= start OR end_col IS NULL)"""
                    import re
                    sql = sql.rstrip().rstrip(';').rstrip()
                    cond = (f"{start_col} <= '{end}' AND "
                            f"({end_col} >= '{start}' OR {end_col} IS NULL)")
                    # Use the same scope-aware injection as _inject_date_filter
                    col_match = re.search(re.escape(start_col), sql, re.IGNORECASE)
                    col_pos = col_match.start() if col_match else 0
                    scope_start = 0
                    scope_end = len(sql)
                    depth = 0
                    for i in range(col_pos - 1, -1, -1):
                        if sql[i] == ')': depth += 1
                        elif sql[i] == '(':
                            if depth == 0:
                                rest = sql[i + 1:].lstrip()
                                if rest.upper().startswith('SELECT'):
                                    scope_start = i + 1
                                    d = 1
                                    for j in range(i + 1, len(sql)):
                                        if sql[j] == '(': d += 1
                                        elif sql[j] == ')':
                                            d -= 1
                                            if d == 0: scope_end = j; break
                                    break
                            else: depth -= 1
                    scope_sql = sql[scope_start:scope_end]
                    boundary = re.search(
                        r'\b(GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b',
                        scope_sql, re.IGNORECASE)
                    if boundary:
                        inject_pos = scope_start + boundary.start()
                        before = sql[:inject_pos].rstrip()
                        after = sql[inject_pos:]
                        scope_before = scope_sql[:boundary.start()]
                        if re.search(r'\bWHERE\b', scope_before, re.IGNORECASE):
                            return f"{before} AND {cond} {after}"
                        else:
                            return f"{before} WHERE {cond} {after}"
                    else:
                        if re.search(r'\bWHERE\b', sql, re.IGNORECASE):
                            return f"{sql} AND {cond}"
                        else:
                            return f"{sql} WHERE {cond}"

                # Find the actual qualified column name in this tile's SQL.
                # If the user-selected date_col isn't present, fall back to
                # any recognised date-like column so the filter still applies
                # (e.g. campaigns use start_date instead of created_at).
                _DATE_COL_CANDIDATES = [
                    'created_at', 'updated_at', 'order_date', 'start_date',
                    'end_date', 'date', 'timestamp', 'datetime',
                    'purchased_at', 'shipped_at', 'delivered_at',
                    'cancelled_at', 'modified_at', 'event_date',
                    'due_date', 'birth_date', 'registered_at', 'signup_date',
                    'last_login', 'transaction_date',
                ]

                qualified_col = _find_qualified_col(target_sql, date_col)
                end_col_for_overlap = None  # set when start_date/end_date pair detected
                if not qualified_col:
                    # Try common date column names as fallback
                    for fallback in _DATE_COL_CANDIDATES:
                        if fallback == date_col:
                            continue
                        qualified_col = _find_qualified_col(target_sql, fallback)
                        if qualified_col:
                            _logger.info("Filter: tile '%s' — '%s' not found, using fallback '%s'", target_tile.get('title'), date_col, qualified_col)
                            # If we matched start_date, check for end_date pair (overlap semantics)
                            if fallback == 'start_date':
                                end_col_for_overlap = _find_qualified_col(target_sql, 'end_date')
                            break

                if not qualified_col:
                    # Last resort: detect table alias and inject alias.dateColumn
                    # e.g., SQL has "FROM orders AS o" and dateColumn is created_at → inject o.created_at
                    import re as _re
                    alias_match = _re.search(
                        r'\bFROM\s+(\w+)\s+(?:AS\s+)?(\w+)',
                        target_sql, _re.IGNORECASE
                    )
                    if alias_match:
                        table_alias = alias_match.group(2)
                        qualified_col = f"{table_alias}.{date_col}"
                        _logger.info("Filter: tile '%s' — injecting '%s' via table alias", target_tile.get('title'), qualified_col)

                if not qualified_col:
                    _logger.info("Filter: tile '%s' has no date column — skipping date filter", target_tile.get('title'))
                elif end_col_for_overlap:
                    # Overlap filter: campaign was active during the date range
                    # start_date <= range_end AND (end_date >= range_start OR end_date IS NULL)
                    target_sql = _inject_date_filter_overlap(
                        target_sql, qualified_col, end_col_for_overlap, s_str, e_str)
                else:
                    target_sql = _inject_date_filter(target_sql, qualified_col, s_str, e_str)

                # KPI Twin Query logic: Return previous and current inside rows
                if target_tile.get("chartType") == "kpi" and prev_start and prev_end and qualified_col:
                    ps_str = prev_start.strftime('%Y-%m-%d %H:%M:%S')
                    pe_str = prev_end.strftime('%Y-%m-%d %H:%M:%S')
                    prev_sql = _inject_date_filter(target_tile['sql'], qualified_col, ps_str, pe_str)

                    # Re-validate post-mutation SQL to prevent validator bypass
                    from sql_validator import SQLValidator
                    _kpi_validator = SQLValidator(dialect=entry.connector.db_type if hasattr(entry.connector, 'db_type') else 'postgres')
                    _pv_ok, prev_sql, _pv_err = _kpi_validator.validate(prev_sql)
                    _tv_ok, target_sql, _tv_err = _kpi_validator.validate(target_sql)

                    try:
                        if not _pv_ok or not _tv_ok:
                            raise ValueError(f"Post-filter validation failed: {_pv_err or _tv_err}")
                        df_current = entry.connector.execute_query(_kpi_validator.apply_limit(target_sql))
                        df_prev = entry.connector.execute_query(_kpi_validator.apply_limit(prev_sql))
                        
                        df_current = mask_dataframe(df_current)
                        df_prev = mask_dataframe(df_prev)
                        
                        from decimal import Decimal
                        rows = []
                        
                        if not df_prev.empty:
                            r = df_prev.head(1).to_dict("records")[0]
                            for k, v in r.items():
                                if isinstance(v, Decimal): r[k] = float(v)
                            rows.append(r)
                            
                        if not df_current.empty:
                            r = df_current.head(1).to_dict("records")[0]
                            for k, v in r.items():
                                if isinstance(v, Decimal): r[k] = float(v)
                            rows.append(r)
                            
                        # If both are empty, fallback to generic
                        if not rows:
                            rows = []
                            
                        columns = list(df_current.columns) if not df_current.empty else (list(df_prev.columns) if not df_prev.empty else [])
                        if body.source_id:
                            sources = target_tile.get("dataSources", [])
                            for src in sources:
                                if src.get("id") == body.source_id:
                                    src["columns"] = columns
                                    src["rows"] = rows
                                    break
                            if not _has_filters:
                                update_tile(email, dashboard_id, tile_id, {"dataSources": sources})
                        else:
                            if not _has_filters:
                                update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
                        _publish_tile_update(dashboard_id, tile_id, columns, rows)
                        return {"columns": columns, "rows": rows, "rowCount": 2}
                    except Exception as e:
                        _logger.warning("KPI twin query failed: %s", e)
                        # Fallback to single query below if twin query fails

        # Apply additional field filters (column/operator/value)
        # Inject directly into the SQL WHERE clause so filters work on source
        # columns even when the output is aggregated (e.g., GROUP BY aliases).
        if filters and filters.get("fields"):
            import re as _re_field
            _ALLOWED_OPS = {'=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'}

            def _sql_escape(v: str) -> str:
                """Escape single quotes to prevent SQL injection."""
                return v.replace("'", "''")

            conditions = []
            for f in filters["fields"]:
                # Per-tile scope: skip this filter if it has tileIds and current tile isn't in scope
                scope_ids = f.get("tileIds")
                if scope_ids and tile_id not in scope_ids:
                    continue
                col = f.get("column", "")
                op  = f.get("operator", "=").upper()
                val = f.get("value", "")
                if not col or not val or op not in _ALLOWED_OPS:
                    continue
                if not _re_field.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', col):
                    continue
                try:
                    import sqlglot
                    quoted_col = sqlglot.exp.column(col).sql()
                except Exception:
                    quoted_col = f'"{col}"'
                if op == "IN":
                    elements = [e.strip() for e in val.split(",") if e.strip()]
                    safe_elements = []
                    for elem in elements:
                        try:
                            float(elem)
                            safe_elements.append(elem)
                        except ValueError:
                            safe_elements.append(f"'{_sql_escape(elem)}'")
                    if safe_elements:
                        conditions.append(f"{quoted_col} IN ({', '.join(safe_elements)})")
                elif op == "LIKE":
                    conditions.append(f"{quoted_col} LIKE '{_sql_escape(val)}'")
                else:
                    try:
                        float(val)
                        conditions.append(f"{quoted_col} {op} {val}")
                    except ValueError:
                        conditions.append(f"{quoted_col} {op} '{_sql_escape(val)}'")

            if conditions:
                added_cond = " AND ".join(conditions)
                # Inject into the SQL WHERE clause directly (not as a wrapper subquery)
                sql_stripped = target_sql.rstrip().rstrip(';').rstrip()
                if _re_field.search(r'\bWHERE\b', sql_stripped, _re_field.IGNORECASE):
                    # Has WHERE — find last WHERE before GROUP BY/ORDER BY/LIMIT and append AND
                    # Insert before GROUP BY, ORDER BY, HAVING, LIMIT if present
                    insert_before = _re_field.search(
                        r'\b(GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b',
                        sql_stripped, _re_field.IGNORECASE
                    )
                    if insert_before:
                        pos = insert_before.start()
                        target_sql = f"{sql_stripped[:pos]} AND {added_cond} {sql_stripped[pos:]}"
                    else:
                        target_sql = f"{sql_stripped} AND {added_cond}"
                else:
                    # No WHERE — insert before GROUP BY/ORDER BY/HAVING/LIMIT
                    insert_before = _re_field.search(
                        r'\b(GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b',
                        sql_stripped, _re_field.IGNORECASE
                    )
                    if insert_before:
                        pos = insert_before.start()
                        target_sql = f"{sql_stripped[:pos]} WHERE {added_cond} {sql_stripped[pos:]}"
                    else:
                        target_sql = f"{sql_stripped} WHERE {added_cond}"

        # Apply What-If parameters (numeric only, validated)
        if body.parameters:
            import re as _re
            for pname, pval in body.parameters.items():
                # Validate: only allow alphanumeric param names and numeric values
                if not _re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', str(pname)):
                    continue
                try:
                    numeric_val = float(pval)
                except (ValueError, TypeError):
                    continue
                # Replace :param_name placeholders
                target_sql = _re.sub(
                    r':' + _re.escape(str(pname)) + r'\b',
                    str(numeric_val),
                    target_sql
                )

        # Standard singular execution (or fallback)
        original_sql = target_tile["sql"]
        try:
            df = entry.connector.execute_query(validator.apply_limit(target_sql))
        except Exception as filter_err:
            # If filtered SQL fails (e.g., injected column doesn't exist), fall back to original
            if target_sql != original_sql:
                _logger.info("Filtered SQL failed, falling back to original: %s", filter_err)
                is_valid2, validated2, _ = validator.validate(original_sql)
                df = entry.connector.execute_query(validator.apply_limit(validated2 if is_valid2 else original_sql))
            else:
                raise
        df = mask_dataframe(df)
        from decimal import Decimal
        rows = df.head(5000).to_dict("records")
        for row in rows:
            for k, v in row.items():
                if isinstance(v, Decimal):
                    row[k] = float(v)
        columns = list(df.columns)
        # Only persist to disk if no filters are active — filtered data is temporary
        _has_filters = bool(body.filters and (body.filters.get("fields") or body.filters.get("dateFilters") or (body.filters.get("range") and body.filters.get("range") != "all_time")))
        if not _has_filters:
            if body.source_id:
                sources = target_tile.get("dataSources", [])
                for src in sources:
                    if src.get("id") == body.source_id:
                        src["columns"] = columns
                        src["rows"] = rows
                        break
                update_tile(email, dashboard_id, tile_id, {"dataSources": sources})
            else:
                update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
        _publish_tile_update(dashboard_id, tile_id, columns, rows)
        return {"columns": columns, "rows": rows, "rowCount": len(df)}
    except HTTPException:
        raise
    except Exception as e:
        _logger.exception("Tile refresh failed for dashboard=%s tile=%s", dashboard_id, tile_id)
        raise HTTPException(500, "Tile refresh failed — please try again")


# ── Batch Tile Refresh ─────────────────────────────────────────────

class BatchRefreshBody(BaseModel):
    tile_ids: list  # list of tile_id strings
    conn_id: Optional[str] = None
    filters: Optional[dict] = None
    parameters: Optional[dict] = None


@router.post("/{dashboard_id}/tiles/batch-refresh")
async def batch_refresh_tiles(dashboard_id: str, body: BatchRefreshBody, user=Depends(get_current_user)):
    """Refresh multiple tiles concurrently. Returns results keyed by tile_id."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    email = user["email"]
    d = load_dashboard(email, dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    # Resolve connection once
    import main as app_module
    app = app_module.app
    connections = app.state.connections.get(email, {})
    conn_id = body.conn_id
    if conn_id and conn_id in connections:
        entry = connections[conn_id]
    elif connections:
        entry = next(iter(connections.values()))
    else:
        entry = _auto_reconnect(email, app)
        if not entry:
            raise HTTPException(400, "No active database connection")

    # Build tile lookup
    tile_map = {}
    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            for tile in sec.get("tiles", []):
                if tile["id"] in body.tile_ids:
                    tile_map[tile["id"]] = tile

    from sql_validator import SQLValidator
    from pii_masking import mask_dataframe
    from decimal import Decimal
    _dialect = entry.connector.db_type.value if hasattr(entry.connector, 'db_type') and hasattr(entry.connector.db_type, 'value') else 'postgres'
    validator = SQLValidator(dialect=_dialect)

    def _refresh_one(tile_id: str) -> dict:
        tile = tile_map.get(tile_id)
        if not tile or not tile.get("sql"):
            return {"error": "Tile not found or has no SQL"}
        target_sql = tile["sql"]
        is_valid, validated_sql, err = validator.validate(target_sql)
        if not is_valid:
            return {"error": f"SQL validation failed: {err}"}

        # Apply field filters (same logic as single-tile refresh endpoint)
        filters = body.filters
        if filters and filters.get("fields"):
            import re as _re_bf
            _ALLOWED_OPS = {'=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'}
            def _esc(v): return v.replace("'", "''")
            conditions = []
            for f in filters["fields"]:
                # Per-tile scope: skip this filter if it has tileIds and current tile isn't in scope
                scope_ids = f.get("tileIds")
                if scope_ids and tile_id not in scope_ids:
                    continue
                col, op, val = f.get("column", ""), f.get("operator", "=").upper(), f.get("value", "")
                if not col or not val or op not in _ALLOWED_OPS: continue
                if not _re_bf.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', col): continue
                try:
                    import sqlglot; qc = sqlglot.exp.column(col).sql()
                except Exception: qc = f'"{col}"'
                if op == "IN":
                    elems = [e.strip() for e in val.split(",") if e.strip()]
                    safe = []
                    for e in elems:
                        try: float(e); safe.append(e)
                        except ValueError: safe.append(f"'{_esc(e)}'")
                    if safe: conditions.append(f"{qc} IN ({', '.join(safe)})")
                elif op == "LIKE": conditions.append(f"{qc} LIKE '{_esc(val)}'")
                else:
                    try: float(val); conditions.append(f"{qc} {op} {val}")
                    except ValueError: conditions.append(f"{qc} {op} '{_esc(val)}'")
            if conditions:
                added = " AND ".join(conditions)
                sql_s = validated_sql.rstrip().rstrip(';').rstrip()
                insert_pt = _re_bf.search(r'\b(GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b', sql_s, _re_bf.IGNORECASE)
                if _re_bf.search(r'\bWHERE\b', sql_s, _re_bf.IGNORECASE):
                    if insert_pt: validated_sql = f"{sql_s[:insert_pt.start()]} AND {added} {sql_s[insert_pt.start():]}"
                    else: validated_sql = f"{sql_s} AND {added}"
                else:
                    if insert_pt: validated_sql = f"{sql_s[:insert_pt.start()]} WHERE {added} {sql_s[insert_pt.start():]}"
                    else: validated_sql = f"{sql_s} WHERE {added}"

        exec_sql = validator.apply_limit(validated_sql)
        _logger.info("batch_refresh tile=%s sql=%s", tile_id, exec_sql[:200])
        df = entry.connector.execute_query(exec_sql)
        df = mask_dataframe(df)
        rows = df.head(5000).to_dict("records")
        for row in rows:
            for k, v in row.items():
                if isinstance(v, Decimal):
                    row[k] = float(v)
        columns = list(df.columns)
        # Only persist to disk if no filters are active — filtered data is temporary
        has_filters = bool(filters and (filters.get("fields") or filters.get("dateFilters") or (filters.get("range") and filters.get("range") != "all_time")))
        if not has_filters:
            update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
        _publish_tile_update(dashboard_id, tile_id, columns, rows)
        return {"columns": columns, "rows": rows, "rowCount": len(df)}

    results = {}
    errors = {}
    max_workers = min(5, len(body.tile_ids))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_id = {executor.submit(_refresh_one, tid): tid for tid in body.tile_ids}
        for future in as_completed(future_to_id):
            tid = future_to_id[future]
            try:
                result = future.result()
                if "error" in result:
                    errors[tid] = result["error"]
                else:
                    results[tid] = result
            except Exception as e:
                errors[tid] = str(e)[:200]

    return {"results": results, "errors": errors}


# ── Workbook Batch Refresh (filter→SQL subquery wrapper) ───────────

class WorkbookFilterItem(BaseModel):
    field: str
    op: str  # "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN"
    value: str


class RefreshBatchBody(BaseModel):
    tile_ids: list  # list of tile_id strings
    filters: list = []  # list of WorkbookFilterItem dicts


_WORKBOOK_ALLOWED_OPS = {"=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"}


def _build_filter_conditions(filters: list) -> str:
    """Translate workbook filter list into SQL WHERE conditions.

    Each filter uses the subquery-wrapper pattern:
      SELECT * FROM ({original_sql}) AS _filtered WHERE {conditions}

    Returns the combined condition string (e.g. "col = 'val' AND col2 > 5"),
    or an empty string if no valid filters.

    Values are escaped (single-quote doubling) and operator-validated.
    Injection is additionally blocked by running the assembled SQL through
    SQLValidator before execution.
    """
    import re as _re_wf

    def _esc(v: str) -> str:
        return v.replace("'", "''")

    conditions = []
    for f in filters:
        if isinstance(f, dict):
            field = f.get("field", "")
            op = (f.get("op") or "=").upper()
            value = str(f.get("value", ""))
        else:
            # WorkbookFilterItem pydantic model
            field = f.field
            op = (f.op or "=").upper()
            value = str(f.value)

        if not field or op not in _WORKBOOK_ALLOWED_OPS:
            continue
        # Validate field name: only safe SQL identifier chars
        if not _re_wf.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', field):
            continue

        if op == "IN":
            elements = [e.strip() for e in value.split(",") if e.strip()]
            safe_elems = []
            for elem in elements:
                try:
                    float(elem)
                    safe_elems.append(elem)
                except ValueError:
                    safe_elems.append(f"'{_esc(elem)}'")
            if safe_elems:
                conditions.append(f"{field} IN ({', '.join(safe_elems)})")
        elif op == "LIKE":
            conditions.append(f"{field} LIKE '{_esc(value)}'")
        else:
            try:
                float(value)
                conditions.append(f"{field} {op} {value}")
            except ValueError:
                conditions.append(f"{field} {op} '{_esc(value)}'")

    return " AND ".join(conditions)


@router.post("/{dashboard_id}/tiles/refresh-batch")
async def refresh_tiles_batch(
    dashboard_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Re-execute tile SQL with additional WHERE filters applied via subquery wrapper.

    Body: {"tile_ids": ["t1", "t2"], "filters": [{"field": "region", "op": "=", "value": "Europe"}]}

    Each tile's SQL is wrapped as:
      SELECT * FROM ({original_sql}) AS _filtered WHERE {conditions}

    Filter values are escaped and all SQL is re-validated through SQLValidator
    to prevent injection attacks. Results are not persisted (filtered data is
    always transient).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    email = user["email"]
    tile_ids = body.get("tile_ids", [])
    raw_filters = body.get("filters", [])

    if not isinstance(tile_ids, list):
        raise HTTPException(400, "tile_ids must be a list")
    if not isinstance(raw_filters, list):
        raise HTTPException(400, "filters must be a list")

    d = load_dashboard(email, dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    # Resolve connection
    import main as app_module
    app = app_module.app
    connections = app.state.connections.get(email, {})
    if connections:
        entry = next(iter(connections.values()))
    else:
        entry = _auto_reconnect(email, app)
        if not entry:
            raise HTTPException(400, "No active database connection. Please connect to a database first.")

    # Build tile lookup
    tile_map = {}
    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            for tile in sec.get("tiles", []):
                if tile["id"] in tile_ids:
                    tile_map[tile["id"]] = tile

    from sql_validator import SQLValidator
    from pii_masking import mask_dataframe
    from decimal import Decimal

    _dialect = (
        entry.connector.db_type.value
        if hasattr(entry.connector, "db_type") and hasattr(entry.connector.db_type, "value")
        else "postgres"
    )
    validator = SQLValidator(dialect=_dialect)

    # Build WHERE condition string once (shared across all tiles)
    condition_str = _build_filter_conditions(raw_filters)

    def _refresh_one(tile_id: str) -> dict:
        tile = tile_map.get(tile_id)
        if not tile or not tile.get("sql"):
            return {"error": "Tile not found or has no SQL"}

        original_sql = tile["sql"].rstrip().rstrip(";").rstrip()

        # Wrap in subquery if filters are present
        if condition_str:
            target_sql = f"SELECT * FROM ({original_sql}) AS _filtered WHERE {condition_str}"
        else:
            target_sql = original_sql

        # Validate assembled SQL through the full validator to block injection
        is_valid, validated_sql, err = validator.validate(target_sql)
        if not is_valid:
            return {"error": f"SQL validation failed: {err}"}

        try:
            exec_sql = validator.apply_limit(validated_sql)
            _logger.info("refresh_batch tile=%s sql=%s", tile_id, exec_sql[:200])
            df = entry.connector.execute_query(exec_sql)
            df = mask_dataframe(df)
            rows = df.head(5000).to_dict("records")
            for row in rows:
                for k, v in row.items():
                    if isinstance(v, Decimal):
                        row[k] = float(v)
            columns = list(df.columns)
            # Never persist filtered results — filtered data is always transient
            _publish_tile_update(dashboard_id, tile_id, columns, rows)
            return {"columns": columns, "rows": rows, "rowCount": len(df)}
        except Exception as exc:
            _logger.warning("refresh_batch tile=%s error=%s", tile_id, exc)
            return {"error": str(exc)[:200]}

    results = {}
    errors = {}
    max_workers = min(5, max(1, len(tile_ids)))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_id = {executor.submit(_refresh_one, tid): tid for tid in tile_ids}
        for future in as_completed(future_to_id):
            tid = future_to_id[future]
            try:
                result = future.result()
                if "error" in result:
                    errors[tid] = result["error"]
                else:
                    results[tid] = result
            except Exception as exc:
                errors[tid] = str(exc)[:200]

    return _sanitize_nan({"results": results, "errors": errors})


# ── Bookmarks ──────────────────────────────────────────────────────

@router.post("/{dashboard_id}/bookmarks")
async def save_bookmark(dashboard_id: str, body: SaveBookmark, user=Depends(get_current_user)):
    import uuid
    from datetime import datetime, timezone
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    bookmarks = d.get("bookmarks", [])
    bookmark = {
        "id": "bm_" + uuid.uuid4().hex[:8],
        "name": body.name[:200],
        "state": body.state,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["email"],
    }
    bookmarks.append(bookmark)
    update_dashboard(user["email"], dashboard_id, {"bookmarks": bookmarks})
    return bookmark

@router.get("/{dashboard_id}/bookmarks")
async def list_bookmarks(dashboard_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    return {"bookmarks": d.get("bookmarks", [])}

@router.delete("/{dashboard_id}/bookmarks/{bookmark_id}")
async def delete_bookmark(dashboard_id: str, bookmark_id: str, user=Depends(get_current_user)):
    d = load_dashboard(user["email"], dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")
    bookmarks = [b for b in d.get("bookmarks", []) if b["id"] != bookmark_id]
    update_dashboard(user["email"], dashboard_id, {"bookmarks": bookmarks})
    return {"deleted": bookmark_id}


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


@router.delete("/{dashboard_id}/annotations/{annotation_id}")
async def delete_dashboard_annotation(dashboard_id: str, annotation_id: str, user=Depends(get_current_user)):
    d = delete_annotation(user["email"], dashboard_id, annotation_id)
    if not d:
        raise HTTPException(404, "Annotation not found")
    return d


@router.delete("/{dashboard_id}/tiles/{tile_id}/annotations/{annotation_id}")
async def delete_tile_annotation(dashboard_id: str, tile_id: str, annotation_id: str, user=Depends(get_current_user)):
    d = delete_annotation(user["email"], dashboard_id, annotation_id, tile_id=tile_id)
    if not d:
        raise HTTPException(404, "Annotation not found")
    return d


# ── Background Refresh ────────────────────────────────────────────

from concurrent.futures import ThreadPoolExecutor as _ThreadPoolExecutor
_bg_executor = _ThreadPoolExecutor(max_workers=10)  # Shared bounded pool
_active_refresh_dashboards: set[str] = set()  # Prevent duplicate refresh-all


@router.post("/{dashboard_id}/refresh-all")
async def refresh_all_tiles_background(dashboard_id: str, body: RefreshTileBody, user=Depends(get_current_user)):
    """Refresh all tiles in a dashboard using the batch mechanism.
    Returns immediately; tiles are refreshed in the background."""
    email = user["email"]

    # Prevent duplicate concurrent refresh for same dashboard
    refresh_key = f"{email}:{dashboard_id}"
    if refresh_key in _active_refresh_dashboards:
        return {"status": "already_refreshing", "count": 0}

    d = load_dashboard(email, dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    # Resolve connection
    import main as app_module
    app = app_module.app
    connections = app.state.connections.get(email, {})
    conn_id = body.conn_id
    if conn_id and conn_id in connections:
        entry = connections[conn_id]
    elif connections:
        entry = next(iter(connections.values()))
    else:
        entry = _auto_reconnect(email, app)
        if not entry:
            raise HTTPException(400, "No active database connection")

    # Collect all tile IDs
    tile_ids = []
    for tab in d.get("tabs", []):
        for sec in tab.get("sections", []):
            for tile in sec.get("tiles", []):
                if tile.get("sql"):
                    tile_ids.append(tile["id"])

    if not tile_ids:
        return {"status": "no_tiles", "count": 0}

    from sql_validator import SQLValidator
    from pii_masking import mask_dataframe
    from decimal import Decimal
    _dialect = entry.connector.db_type.value if hasattr(entry.connector, 'db_type') and hasattr(entry.connector.db_type, 'value') else 'postgres'
    validator = SQLValidator(dialect=_dialect)

    def _refresh_tile(tile_id):
        dash = load_dashboard(email, dashboard_id)
        if not dash:
            return
        tile = None
        for tab in dash.get("tabs", []):
            for sec in tab.get("sections", []):
                for t in sec.get("tiles", []):
                    if t["id"] == tile_id:
                        tile = t
                        break
        if not tile or not tile.get("sql"):
            return
        try:
            is_valid, validated_sql, _ = validator.validate(tile["sql"])
            if not is_valid:
                return
            df = entry.connector.execute_query(validator.apply_limit(validated_sql))
            df = mask_dataframe(df)
            rows = df.head(5000).to_dict("records")
            for row in rows:
                for k, v in row.items():
                    if isinstance(v, Decimal):
                        row[k] = float(v)
            columns = list(df.columns)
            update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
            _publish_tile_update(dashboard_id, tile_id, columns, rows)
        except Exception as e:
            _logger.warning("Background refresh tile %s failed: %s", tile_id, e)

    _active_refresh_dashboards.add(refresh_key)

    def _run_batch():
        try:
            futures = [_bg_executor.submit(_refresh_tile, tid) for tid in tile_ids]
            for f in futures:
                f.result(timeout=60)  # Wait with timeout
        except Exception as e:
            _logger.warning("Background batch refresh failed: %s", e)
        finally:
            _active_refresh_dashboards.discard(refresh_key)

    import threading
    threading.Thread(target=_run_batch, daemon=True).start()

    return {"status": "refreshing", "count": len(tile_ids)}


# ── Share links [ADV-FIX H1] ──────────────────────────────────

class ShareRequest(BaseModel):
    expires_hours: int = 168  # 7 days default


@router.post("/{dashboard_id}/share")
async def share_dashboard(dashboard_id: str, body: ShareRequest, user=Depends(get_current_user)):
    """Generate an opaque share token for read-only access."""
    result = create_share_token(user["email"], dashboard_id, body.expires_hours)
    return result


@router.delete("/{dashboard_id}/share/{token}")
async def revoke_share(dashboard_id: str, token: str, user=Depends(get_current_user)):
    """Revoke a share token — only the dashboard owner can revoke [ADV-FIX M3, M5]."""
    # Verify the user owns this dashboard
    dash = load_dashboard(user["email"], dashboard_id)
    if not dash:
        raise HTTPException(404, "Dashboard not found")
    # Verify the token belongs to this specific dashboard before revoking
    token_info = validate_share_token(token)
    if not token_info or token_info.get("dashboard_id") != dashboard_id:
        raise HTTPException(404, "Token not found for this dashboard")
    ok = revoke_share_token(token)
    if not ok:
        raise HTTPException(404, "Token not found")
    return {"status": "revoked"}


# ── Version History ──────────────────────────────────────────────

@router.get("/{dashboard_id}/versions")
async def get_versions(dashboard_id: str, user=Depends(get_current_user)):
    """List version history metadata for a dashboard."""
    versions = list_dashboard_versions(user["email"], dashboard_id)
    return {"versions": versions}


class RestoreVersionRequest(BaseModel):
    version_id: str


@router.post("/{dashboard_id}/versions/restore")
async def restore_version(dashboard_id: str, body: RestoreVersionRequest, user=Depends(get_current_user)):
    """Restore a dashboard to a specific version."""
    result = restore_dashboard_version(user["email"], dashboard_id, body.version_id)
    if not result:
        raise HTTPException(404, "Version not found")
    return result


# ── Workspace Sharing (role-based RBAC) ───────────────────────────

class WorkspaceShareRequest(BaseModel):
    email: str
    role: str = "viewer"  # "viewer" | "editor"


@router.post("/{dashboard_id}/workspace-shares")
async def share_dashboard_with_user(
    dashboard_id: str,
    body: WorkspaceShareRequest,
    user=Depends(get_current_user),
):
    """Grant another AskDB user access to this dashboard at a given role.

    Only the dashboard owner can share. Role must be 'viewer' or 'editor'.
    Idempotent: re-posting with a different role updates the existing entry.
    """
    owner_email = user["email"]
    # Verify the caller owns this dashboard
    d = load_dashboard(owner_email, dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    if not body.email or "@" not in body.email:
        raise HTTPException(400, "Valid target email required")
    if body.role not in ("viewer", "editor"):
        raise HTTPException(400, "Role must be 'viewer' or 'editor'")

    ws = get_workspace_sharing()
    try:
        result = ws.share_dashboard(owner_email, dashboard_id, body.email, body.role)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return {"status": "shared", **result}


@router.delete("/{dashboard_id}/workspace-shares/{target_email}")
async def revoke_dashboard_share(
    dashboard_id: str,
    target_email: str,
    user=Depends(get_current_user),
):
    """Revoke access for a specific user. Only the owner can revoke."""
    owner_email = user["email"]
    d = load_dashboard(owner_email, dashboard_id)
    if not d:
        raise HTTPException(404, "Dashboard not found")

    ws = get_workspace_sharing()
    removed = ws.revoke_share(owner_email, dashboard_id, target_email)
    if not removed:
        raise HTTPException(404, f"No share entry found for {target_email}")

    return {"status": "revoked", "email": target_email}


@router.get("/{dashboard_id}/workspace-shares")
async def list_dashboard_shares(
    dashboard_id: str,
    user=Depends(get_current_user),
):
    """List all members with access to this dashboard.

    Accessible by the owner and any viewer/editor already on the share list.
    """
    owner_email = user["email"]
    ws = get_workspace_sharing()

    # Allow access if caller is owner OR already a viewer/editor
    d = load_dashboard(owner_email, dashboard_id)
    if not d:
        # Might not be owner — check if shared with this user
        shared = ws.list_shared_with_me(user["email"])
        is_member = any(s["dashboard_id"] == dashboard_id for s in shared)
        if not is_member:
            raise HTTPException(404, "Dashboard not found")
        # Find the actual owner
        entry = next(s for s in shared if s["dashboard_id"] == dashboard_id)
        actual_owner = entry["owner_email"]
        members = ws.list_shares(actual_owner, dashboard_id)
    else:
        members = ws.list_shares(owner_email, dashboard_id)

    return {"members": members}


# Public endpoint — no auth required
@router.get("/shared/{token}")
async def get_shared_dashboard(token: str):
    """Public read-only dashboard access via share token."""
    dashboard = load_shared_dashboard(token)
    if not dashboard:
        raise HTTPException(404, "Dashboard not found or link expired")
    # Strip sensitive fields: sharing config, raw SQL, and row data [ADV-FIX H8]
    def _strip_tile(tile):
        return {k: v for k, v in tile.items() if k not in ("sql", "rows", "conn_id", "columns")}

    safe = {k: v for k, v in dashboard.items() if k not in ("sharing",)}
    if "tabs" in safe:
        safe["tabs"] = [
            {**tab, "sections": [
                {**sec, "tiles": [_strip_tile(t) for t in sec.get("tiles", [])]}
                for sec in tab.get("sections", [])
            ]}
            for tab in safe["tabs"]
        ]
    return safe


# ── SSE Live Tile Updates ────────────────────────────────────────

import logging as _logging
_logger = _logging.getLogger(__name__)

_MAX_SSE_PER_USER = 3
_sse_connections: dict[str, int] = {}  # email → active count

_MAX_PUBLISH_BYTES = 2 * 1024 * 1024  # 2MB cap for Redis pub/sub payloads


def _publish_tile_update(dashboard_id: str, tile_id: str, columns: list, rows: list):
    """Fire-and-forget publish of tile refresh result to Redis pub/sub.
    No-op if Redis is unavailable or payload exceeds size cap."""
    try:
        from redis_client import get_redis
        r = get_redis()
        if r:
            payload = _json.dumps({
                "tile_id": tile_id,
                "columns": columns,
                "rows": rows[:5000],
                "row_count": len(rows),
            }, default=str)
            if len(payload) > _MAX_PUBLISH_BYTES:
                _logger.warning("Tile %s payload too large for pub/sub (%d bytes), skipping", tile_id, len(payload))
                return
            r.publish(f"qc:tile_updates:{dashboard_id}", payload)
    except Exception as exc:
        _logger.warning("Failed to publish tile update for %s: %s", tile_id, exc)


@router.get("/{dashboard_id}/subscribe")
async def subscribe_tile_updates(dashboard_id: str, user: dict = Depends(get_current_user)):
    """SSE endpoint — streams live tile updates for a dashboard via Redis pub/sub.
    Returns 503 if Redis is unavailable (frontend falls back to polling)."""
    from redis_client import get_redis
    r = get_redis()
    if not r:
        raise HTTPException(503, "Real-time updates require Redis — tile refresh still works via polling")

    email = user["email"]
    current = _sse_connections.get(email, 0)
    if current >= _MAX_SSE_PER_USER:
        raise HTTPException(429, f"Too many SSE connections (max {_MAX_SSE_PER_USER})")
    _sse_connections[email] = current + 1

    async def event_generator():
        pubsub = r.pubsub()
        pubsub.subscribe(f"qc:tile_updates:{dashboard_id}")
        try:
            while True:
                # Run blocking Redis call in a thread to avoid blocking the event loop
                msg = await asyncio.to_thread(
                    pubsub.get_message, ignore_subscribe_messages=True, timeout=1.0
                )
                if msg and msg["type"] == "message":
                    yield f"data: {msg['data']}\n\n"
                else:
                    yield "data: ping\n\n"
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            pass
        finally:
            pubsub.unsubscribe()
            pubsub.close()
            _sse_connections[email] = max(0, _sse_connections.get(email, 1) - 1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Sub-project A Phase 4b — dashboard migration ─────────────────────

@router.post("/migrate")
async def migrate_all_dashboards(user=Depends(get_current_user)):
    """Migrate every dashboard owned by the caller to attach ChartSpec
    to each legacy tile. Idempotent — tiles that already have a
    chart_spec key are skipped. Backs up dashboards.json before
    writing.
    """
    from dashboard_migration import migrate_user_dashboards
    email = user.get("email") or user.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="No user email in token")
    return migrate_user_dashboards(email)


@router.post("/{dashboard_id}/migrate")
async def migrate_one_dashboard(dashboard_id: str, user=Depends(get_current_user)):
    """Migrate a single dashboard by id. Same contract as /migrate but
    only touches the matching dashboard; useful for re-running a
    migration on a single tile after fixing a legacy field.
    """
    from dashboard_migration import migrate_user_dashboards
    email = user.get("email") or user.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="No user email in token")
    return migrate_user_dashboards(email, dashboard_id=dashboard_id)


# ── Sub-project A Phase 4c — LiveOps refresh stream ────────────────────

@router.get("/{dashboard_id}/refresh-stream")
async def dashboard_refresh_stream(
    dashboard_id: str,
    interval: int = Query(default=5, ge=1, le=60),
    token: str = Query(default=""),
):
    """SSE endpoint for LiveOps auto-refresh. Emits refresh signals at interval seconds.

    EventSource cannot set custom headers, so the JWT is passed via the
    `token` query param (same pattern as the agent SSE endpoint). The
    interval is enforced server-side in [1, 60] via Query constraints.

    Emits: `event: refresh\\ndata: {timestamp, dashboard_id, tick}\\n\\n`
    """
    from jose import JWTError as _JWTError, jwt as _jwt
    from datetime import datetime, timezone

    from config import settings

    # 1. Validate JWT from query param (EventSource cannot send headers)
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")
    try:
        payload = _jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        email: str = payload.get("sub") or payload.get("email", "")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except (_JWTError, Exception):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # 2. Verify user owns (or can access) the dashboard
    d = load_dashboard(email, dashboard_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # interval already clamped by Query(ge=1, le=60)
    clamped_interval = interval

    async def event_generator():
        tick = 0
        try:
            while True:
                tick += 1
                ts = datetime.now(timezone.utc).isoformat()
                data = _json.dumps(
                    {
                        "timestamp": ts,
                        "dashboard_id": dashboard_id,
                        "tick": tick,
                        "interval_s": clamped_interval,
                    }
                )
                yield f"event: refresh\ndata: {data}\n\n"
                await asyncio.sleep(clamped_interval)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Analyst Pro: server-side freeform layout resolver ──────────────

class _Viewport(BaseModel):
    width: int
    height: int


class _ResolveLayoutRequest(BaseModel):
    dashboard: dict
    viewport: _Viewport


@router.post("/{dashboard_id}/resolve-layout")
def resolve_dashboard_layout(dashboard_id: str, payload: _ResolveLayoutRequest = Body(...)) -> dict:
    """
    Resolve a freeform dashboard's zone tree + floating layer to absolute
    pixel coordinates. Mirrors the frontend `resolveLayout` so first paint
    can happen without client-side layout math.

    Note: uses max(100000, sum) as the proportion denominator to match
    frontend semantics — proportions are absolute percentages of 100000, so
    a single child with h=25000 occupies 25% of parent, not 100%.
    """
    d = payload.dashboard
    size = d.get("size", {"mode": "automatic"})
    mode = size.get("mode")

    if mode == "fixed":
        # Prefer explicit dimensions over preset (preset is descriptive metadata)
        canvas_w = int(size.get("width", 1200))
        canvas_h = int(size.get("height", 800))
    elif mode == "automatic":
        canvas_w = payload.viewport.width
        canvas_h = payload.viewport.height
    elif mode == "range":
        canvas_w = max(min(payload.viewport.width, size["maxWidth"]), size["minWidth"])
        canvas_h = max(min(payload.viewport.height, size["maxHeight"]), size["minHeight"])
    else:
        raise HTTPException(status_code=400, detail=f"unknown size mode: {mode}")

    resolved: list[dict] = []
    _resolve_tiled(d["tiledRoot"], 0, 0, canvas_w, canvas_h, 0, resolved)
    for f in d.get("floatingLayer", []):
        resolved.append({
            "id": f["id"],
            "x": f["x"],
            "y": f["y"],
            "width": f["pxW"],
            "height": f["pxH"],
            "depth": -1,
        })
    return {"dashboardId": dashboard_id, "canvasWidth": canvas_w, "canvasHeight": canvas_h, "resolved": resolved}


def _resolve_tiled(zone: dict, x: int, y: int, w: int, h: int, depth: int, out: list) -> None:
    out.append({"id": zone["id"], "x": x, "y": y, "width": w, "height": h, "depth": depth})
    t = zone.get("type")
    if t not in ("container-horz", "container-vert"):
        return
    children = zone.get("children", []) or []
    if not children:
        return
    if t == "container-horz":
        actual_sum = sum(c["w"] for c in children)
        denom = max(100000, actual_sum)
        cursor = x
        for c in children:
            child_w = round((c["w"] / denom) * w)
            _resolve_tiled(c, cursor, y, child_w, h, depth + 1, out)
            cursor += child_w
    else:
        actual_sum = sum(c["h"] for c in children)
        denom = max(100000, actual_sum)
        cursor = y
        for c in children:
            child_h = round((c["h"] / denom) * h)
            _resolve_tiled(c, x, cursor, w, child_h, depth + 1, out)
            cursor += child_h
