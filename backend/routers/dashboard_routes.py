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
    globalFilters: Optional[dict] = None
    customMetrics: Optional[list] = None
    themeConfig: Optional[dict] = None

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
    dataSources: Optional[list] = None
    blendConfig: Optional[dict] = None
    visualConfig: Optional[dict] = None

class AddAnnotation(BaseModel):
    text: str
    author: Optional[str] = None
    authorName: Optional[str] = None

class RefreshTileBody(BaseModel):
    conn_id: Optional[str] = None
    filters: Optional[dict] = None
    source_id: Optional[str] = None

class SaveBookmark(BaseModel):
    name: str
    state: dict


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
        tile_data["rows"] = tile_data["rows"][:5000]
    tile_data.setdefault("annotations", [])
    d = add_tile_to_section(user["email"], dashboard_id, tab_id, section_id, tile_data)
    if not d:
        raise HTTPException(404, "Dashboard, tab, or section not found")
    return d

@router.put("/{dashboard_id}/tiles/{tile_id}")
async def update_tile_endpoint(dashboard_id: str, tile_id: str, body: UpdateTileBody, user=Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if "rows" in updates:
        updates["rows"] = updates["rows"][:5000]
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
        raise HTTPException(400, "No active database connection")

    try:
        from sql_validator import SQLValidator
        from pii_masking import mask_dataframe
        validator = SQLValidator()
        if target_sql is None:
            target_sql = target_tile["sql"]
        is_valid, msg = validator.validate(target_sql)
        if not is_valid:
            raise HTTPException(400, f"SQL validation failed: {msg}")

        # Apply Global Filters if present
        filters = body.filters
        if filters and filters.get("dateColumn") and filters.get("range") and filters.get("range") != "all_time":
            date_col = filters["dateColumn"]
            date_range = filters["range"]
            
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
                
            if start_date and end_date:
                s_str = start_date.strftime('%Y-%m-%d %H:%M:%S')
                e_str = end_date.strftime('%Y-%m-%d %H:%M:%S')
                
                # Wrap original query in CTE
                target_sql = f"SELECT * FROM ({target_tile['sql']}) sq_wrap WHERE {date_col} >= '{s_str}' AND {date_col} <= '{e_str}'"
                
                # KPI Twin Query logic: Return previous and current inside rows
                if target_tile.get("chartType") == "kpi" and prev_start and prev_end:
                    ps_str = prev_start.strftime('%Y-%m-%d %H:%M:%S')
                    pe_str = prev_end.strftime('%Y-%m-%d %H:%M:%S')
                    prev_sql = f"SELECT * FROM ({target_tile['sql']}) sq_wrap WHERE {date_col} >= '{ps_str}' AND {date_col} <= '{pe_str}'"
                    
                    try:
                        df_current = entry.connector.execute_query(target_sql)
                        df_prev = entry.connector.execute_query(prev_sql)
                        
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
                            update_tile(email, dashboard_id, tile_id, {"dataSources": sources})
                        else:
                            update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
                        return {"columns": columns, "rows": rows, "rowCount": 2}
                    except Exception as e:
                        print("Warning: KPI twin query failed:", str(e))
                        # Fallback to single query below if twin query fails

        # Apply additional field filters (column/operator/value)
        if filters and filters.get("fields"):
            _ALLOWED_OPS = {'=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'}
            conditions = []
            for f in filters["fields"]:
                col = f.get("column", "")
                op  = f.get("operator", "=").upper()
                val = f.get("value", "")
                if not col or not val or op not in _ALLOWED_OPS:
                    continue
                # Quote identifier safely using sqlglot if available, otherwise basic quoting
                try:
                    import sqlglot
                    quoted_col = sqlglot.exp.column(col).sql()
                except Exception:
                    quoted_col = f'"{col}"'
                if op == "IN":
                    quoted_val = f"({val})"
                    conditions.append(f"{quoted_col} IN {quoted_val}")
                elif op == "LIKE":
                    conditions.append(f"{quoted_col} LIKE '{val}'")
                else:
                    # Numeric check: avoid quoting numbers
                    try:
                        float(val)
                        conditions.append(f"{quoted_col} {op} {val}")
                    except ValueError:
                        conditions.append(f"{quoted_col} {op} '{val}'")
            if conditions:
                where_clause = " AND ".join(conditions)
                target_sql = f"SELECT * FROM ({target_sql}) _field_filter WHERE {where_clause}"

        # Standard singular execution (or fallback)
        df = entry.connector.execute_query(target_sql)
        df = mask_dataframe(df)
        from decimal import Decimal
        rows = df.head(5000).to_dict("records")
        for row in rows:
            for k, v in row.items():
                if isinstance(v, Decimal):
                    row[k] = float(v)
        columns = list(df.columns)
        if body.source_id:
            # Update the specific data source within the tile
            sources = target_tile.get("dataSources", [])
            for src in sources:
                if src.get("id") == body.source_id:
                    src["columns"] = columns
                    src["rows"] = rows
                    break
            update_tile(email, dashboard_id, tile_id, {"dataSources": sources})
        else:
            update_tile(email, dashboard_id, tile_id, {"columns": columns, "rows": rows})
        return {"columns": columns, "rows": rows, "rowCount": len(df)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Refresh failed: {str(e)}")


# ── AI Chart Suggestion ────────────────────────────────────────────
class AIChartSuggestBody(BaseModel):
    columns: list
    sample_rows: list = []
    question: Optional[str] = None

@router.post("/{dashboard_id}/tiles/{tile_id}/ai-suggest")
async def ai_suggest_chart(dashboard_id: str, tile_id: str, body: AIChartSuggestBody, user=Depends(get_current_user)):
    """Ask Claude to suggest optimal chart type and formatting for tile data."""
    import json as _json
    try:
        import anthropic
        from config import settings
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        sample = body.sample_rows[:5]  # Send max 5 rows to keep prompt small
        prompt = f"""Given this dataset:
Columns: {body.columns}
Sample data (first 5 rows): {_json.dumps(sample, default=str)[:2000]}
{f'Context: {body.question}' if body.question else ''}

Suggest the optimal chart configuration. Return ONLY valid JSON:
{{
  "recommendedType": "bar|line|area|pie|donut|scatter|stacked_bar|horizontal_bar|kpi|table",
  "reasoning": "one sentence why",
  "config": {{
    "xAxis": "column_name for x-axis",
    "yAxis": "column_name for y-axis (if applicable)",
    "series": ["measure_column_1", "measure_column_2"],
    "colors": {{"measure_name": "#hex_color"}},
    "showLegend": true,
    "showDataLabels": false,
    "yAxisLabel": "optional axis label"
  }}
}}"""

        response = client.messages.create(
            model=settings.PRIMARY_MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
            system="You are a data visualization expert. Return ONLY valid JSON, no markdown.",
        )

        text = response.content[0].text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = _json.loads(text)
        return result
    except Exception as e:
        raise HTTPException(500, f"AI suggestion failed: {str(e)}")


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
