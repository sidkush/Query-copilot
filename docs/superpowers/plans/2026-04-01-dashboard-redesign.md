# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the QueryCopilot dashboard into a professional corporate analytics tool with tabbed+sectioned layout, AI command bar, full-power tile editing (chart type, measures, SQL), drag-drop/resize, collaborative annotations, and PDF/PNG export.

**Architecture:** Incremental enhancement on existing react-grid-layout + Recharts stack. Backend data model becomes hierarchical (dashboard > tabs > sections > tiles). Frontend DashboardBuilder.jsx is rewritten with new design system tokens. Chat integration enhanced with guided questions.

**Tech Stack:** FastAPI (Python), React 19 + Vite 8, Zustand, react-grid-layout, Recharts, Framer Motion, html2canvas + jsPDF (new), Tailwind CSS 4, Inter + JetBrains Mono fonts.

**Design Spec:** `docs/superpowers/specs/2026-04-01-dashboard-redesign-design.md`
**Visual Mockup:** `.superpowers/brainstorm/438-1775073672/content/dashboard-layout-v2.html`

---

## File Structure

### Backend — Modified Files
| File | Responsibility | Change Type |
|------|---------------|-------------|
| `backend/user_storage.py` (lines 409-515) | Dashboard CRUD with new hierarchical model (tabs/sections/tiles/annotations) | Major rewrite of dashboard functions |
| `backend/routers/dashboard_routes.py` (109 lines) | REST endpoints for tabs, sections, tiles, annotations, refresh | Major rewrite — new Pydantic models + new routes |
| `backend/routers/query_routes.py` (lines 184-217) | Enhanced generate-dashboard with preferences + tab/section grouping | Modify DashboardRequest model + endpoint |
| `backend/query_engine.py` (lines 248-356) | Enhanced DASHBOARD_PROMPT + generate_dashboard() with preferences | Modify prompt + method signature |

### Frontend — Modified Files
| File | Responsibility | Change Type |
|------|---------------|-------------|
| `frontend/src/pages/DashboardBuilder.jsx` (767 lines) | Complete rewrite — new layout, command bar, tabs, sections, tile editor | Full rewrite |
| `frontend/src/pages/Chat.jsx` (lines 89-270, 528-565) | Guided questions flow, enhanced InlineDashboard | Modify detection + handler + inline component |
| `frontend/src/components/ResultsChart.jsx` (lines 311-631) | Add KPI card variant chart type | Minor addition |
| `frontend/src/api.js` (lines 218-229) | New API functions for tabs, sections, annotations, refresh, export | Add functions |
| `frontend/src/store.js` (70 lines) | Add activeDashboardId state | Minor addition |
| `frontend/src/index.css` | Remove old dashboard styles, add new design tokens | Modify |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/dashboard/CommandBar.jsx` | AI command bar (Cmd+K) with search |
| `frontend/src/components/dashboard/DashboardHeader.jsx` | Title editing, meta info, auto-save status |
| `frontend/src/components/dashboard/TabBar.jsx` | Tab navigation, add/rename/delete/reorder tabs |
| `frontend/src/components/dashboard/Section.jsx` | Collapsible section with header, tile grid, actions |
| `frontend/src/components/dashboard/KPICard.jsx` | KPI stat card with sparkline, delta badge |
| `frontend/src/components/dashboard/TileWrapper.jsx` | Tile chrome: header, hover toolbar, drag/resize handles, comment badge |
| `frontend/src/components/dashboard/TileEditor.jsx` | Full-power editor: title, chart type, measures, SQL, filters, palette, notes |
| `frontend/src/components/dashboard/NotesPanel.jsx` | Dashboard-level notes & commentary section |
| `frontend/src/components/dashboard/ExportModal.jsx` | PDF/PNG export dialog |
| `frontend/src/components/dashboard/tokens.js` | Design system tokens as JS constants |

---

## Task 1: Backend Data Model — Hierarchical Dashboard Storage

**Files:**
- Modify: `backend/user_storage.py` (lines 409-515)

- [ ] **Step 1: Rewrite dashboard helper functions with new hierarchical model**

Replace the dashboard functions (lines 409-515) in `user_storage.py`. The existing `_dashboards_file`, `_load_dashboards`, `_save_dashboards` helpers (lines 409-425) stay unchanged. Replace everything from `list_dashboards` (line 428) onward:

```python
# ── Dashboard CRUD (hierarchical: tabs > sections > tiles) ──────────

def list_dashboards(email: str) -> list:
    """Return summary list of all dashboards."""
    dashboards = _load_dashboards(email)
    result = []
    for d in dashboards:
        tile_count = sum(
            len(sec.get("tiles", []))
            for tab in d.get("tabs", [])
            for sec in tab.get("sections", [])
        )
        result.append({
            "id": d["id"],
            "name": d["name"],
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
            "tile_count": tile_count,
            "tab_count": len(d.get("tabs", [])),
        })
    return result


def create_dashboard(email: str, name: str) -> dict:
    """Create a new dashboard with a default tab and section."""
    dashboards = _load_dashboards(email)
    now = datetime.now().isoformat()
    default_section = {
        "id": uuid.uuid4().hex[:8],
        "name": "General",
        "description": "",
        "order": 0,
        "collapsed": False,
        "tiles": [],
        "layout": [],
    }
    default_tab = {
        "id": uuid.uuid4().hex[:8],
        "name": "Overview",
        "order": 0,
        "sections": [default_section],
    }
    dashboard = {
        "id": uuid.uuid4().hex[:12],
        "name": name[:200],
        "description": "",
        "created_at": now,
        "updated_at": now,
        "tabs": [default_tab],
        "annotations": [],
        "sharing": {"enabled": False, "token": None},
    }
    dashboards.append(dashboard)
    _save_dashboards(email, dashboards)
    return dashboard


def load_dashboard(email: str, dashboard_id: str) -> dict | None:
    """Load a full dashboard by ID."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            return d
    return None


def update_dashboard(email: str, dashboard_id: str, updates: dict) -> dict | None:
    """Update dashboard fields (name, description, tabs, annotations)."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            for key in ("name", "description", "tabs", "annotations", "sharing"):
                if key in updates:
                    d[key] = updates[key]
            d["updated_at"] = datetime.now().isoformat()
            _save_dashboards(email, dashboards)
            return d
    return None


def add_dashboard_tab(email: str, dashboard_id: str, tab_name: str) -> dict | None:
    """Add a new tab to a dashboard."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            new_tab = {
                "id": uuid.uuid4().hex[:8],
                "name": tab_name[:200],
                "order": len(d.get("tabs", [])),
                "sections": [{
                    "id": uuid.uuid4().hex[:8],
                    "name": "General",
                    "description": "",
                    "order": 0,
                    "collapsed": False,
                    "tiles": [],
                    "layout": [],
                }],
            }
            d.setdefault("tabs", []).append(new_tab)
            d["updated_at"] = datetime.now().isoformat()
            _save_dashboards(email, dashboards)
            return d
    return None


def add_section_to_tab(email: str, dashboard_id: str, tab_id: str, section_name: str) -> dict | None:
    """Add a new section to a tab."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            for tab in d.get("tabs", []):
                if tab["id"] == tab_id:
                    new_section = {
                        "id": uuid.uuid4().hex[:8],
                        "name": section_name[:200],
                        "description": "",
                        "order": len(tab.get("sections", [])),
                        "collapsed": False,
                        "tiles": [],
                        "layout": [],
                    }
                    tab.setdefault("sections", []).append(new_section)
                    d["updated_at"] = datetime.now().isoformat()
                    _save_dashboards(email, dashboards)
                    return d
    return None


def add_tile_to_section(email: str, dashboard_id: str, tab_id: str, section_id: str, tile: dict) -> dict | None:
    """Add a tile to a specific section."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            for tab in d.get("tabs", []):
                if tab["id"] == tab_id:
                    for sec in tab.get("sections", []):
                        if sec["id"] == section_id:
                            tile_id = uuid.uuid4().hex[:8]
                            tile["id"] = tile_id
                            if "rows" in tile:
                                tile["rows"] = tile["rows"][:100]
                            sec["tiles"].append(tile)
                            # Auto-compute layout position
                            existing = sec.get("layout", [])
                            max_y = max((item["y"] + item["h"] for item in existing), default=0)
                            col = len(existing) % 2
                            row_y = max_y if col == 0 else max_y - 4 if max_y >= 4 else 0
                            sec["layout"].append({
                                "i": tile_id,
                                "x": col * 6,
                                "y": row_y,
                                "w": 6,
                                "h": 4,
                                "minW": 3,
                                "minH": 3,
                            })
                            d["updated_at"] = datetime.now().isoformat()
                            _save_dashboards(email, dashboards)
                            return d
    return None


def update_tile(email: str, dashboard_id: str, tile_id: str, updates: dict) -> dict | None:
    """Update a specific tile's properties (title, chartType, sql, measures, filters, etc.)."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            for tab in d.get("tabs", []):
                for sec in tab.get("sections", []):
                    for tile in sec.get("tiles", []):
                        if tile["id"] == tile_id:
                            for key, val in updates.items():
                                if key != "id":
                                    tile[key] = val
                            d["updated_at"] = datetime.now().isoformat()
                            _save_dashboards(email, dashboards)
                            return d
    return None


def add_annotation(email: str, dashboard_id: str, annotation: dict, tile_id: str = None) -> dict | None:
    """Add annotation to dashboard or specific tile."""
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            annotation["id"] = uuid.uuid4().hex[:8]
            annotation["created_at"] = datetime.now().isoformat()
            if tile_id:
                for tab in d.get("tabs", []):
                    for sec in tab.get("sections", []):
                        for tile in sec.get("tiles", []):
                            if tile["id"] == tile_id:
                                tile.setdefault("annotations", []).append(annotation)
                                break
            else:
                d.setdefault("annotations", []).append(annotation)
            d["updated_at"] = datetime.now().isoformat()
            _save_dashboards(email, dashboards)
            return d
    return None


def delete_dashboard(email: str, dashboard_id: str) -> bool:
    """Delete a dashboard."""
    dashboards = _load_dashboards(email)
    filtered = [d for d in dashboards if d["id"] != dashboard_id]
    if len(filtered) < len(dashboards):
        _save_dashboards(email, filtered)
        return True
    return False


def migrate_dashboard_if_needed(dashboard: dict) -> dict:
    """Migrate flat dashboard format to hierarchical (tabs/sections) format."""
    if "tabs" in dashboard:
        return dashboard
    # Old format: { tiles: [], layout: [] }
    old_tiles = dashboard.get("tiles", [])
    old_layout = dashboard.get("layout", [])
    default_section = {
        "id": uuid.uuid4().hex[:8],
        "name": "General",
        "description": "",
        "order": 0,
        "collapsed": False,
        "tiles": old_tiles,
        "layout": old_layout,
    }
    default_tab = {
        "id": uuid.uuid4().hex[:8],
        "name": "Overview",
        "order": 0,
        "sections": [default_section],
    }
    dashboard["tabs"] = [default_tab]
    dashboard.setdefault("annotations", [])
    dashboard.setdefault("sharing", {"enabled": False, "token": None})
    dashboard.pop("tiles", None)
    dashboard.pop("layout", None)
    return dashboard
```

- [ ] **Step 2: Add migration call in load_dashboard**

In the `load_dashboard` function above, after finding the dashboard, apply migration:

```python
def load_dashboard(email: str, dashboard_id: str) -> dict | None:
    dashboards = _load_dashboards(email)
    for d in dashboards:
        if d["id"] == dashboard_id:
            migrated = migrate_dashboard_if_needed(d)
            if migrated is not d or "tabs" not in d:
                _save_dashboards(email, dashboards)
            return migrated
    return None
```

- [ ] **Step 3: Commit**

```bash
git add backend/user_storage.py
git commit -m "feat: rewrite dashboard storage with hierarchical tabs/sections/tiles model"
```

---

## Task 2: Backend Routes — New Dashboard API

**Files:**
- Rewrite: `backend/routers/dashboard_routes.py` (all 109 lines)

- [ ] **Step 1: Rewrite dashboard_routes.py with new models and endpoints**

Replace the entire file:

```python
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
async def refresh_tile(dashboard_id: str, tile_id: str, body: RefreshTileBody, request=None, user=Depends(get_current_user)):
    from fastapi import Request
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

    # Get connection from app state
    from fastapi import Request as Req
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/dashboard_routes.py
git commit -m "feat: rewrite dashboard routes with tabs, sections, annotations, refresh"
```

---

## Task 3: Backend — Enhanced Dashboard Generation

**Files:**
- Modify: `backend/query_engine.py` (lines 248-356)
- Modify: `backend/routers/query_routes.py` (lines 184-217)

- [ ] **Step 1: Update DASHBOARD_PROMPT in query_engine.py**

Replace lines 248-271 in `query_engine.py`:

```python
    DASHBOARD_PROMPT = """You are a dashboard architect. Given a user request and database schema, generate a professional analytics dashboard.

Return a JSON object with this structure:
{
  "tabs": [
    {
      "name": "Tab Name",
      "sections": [
        {
          "name": "Section Name",
          "tiles": [
            {
              "title": "Tile Title",
              "subtitle": "Optional subtitle",
              "question": "Natural language question this tile answers",
              "sql": "SELECT ...",
              "chartType": "bar|line|area|pie|donut|table|kpi|stacked_bar|horizontal_bar|radar|scatter|treemap"
            }
          ]
        }
      ]
    }
  ]
}

Guidelines:
- Create 2-3 tabs for different analytical perspectives
- Each tab has 1-3 sections grouping related metrics
- First section of first tab should be KPI cards (chartType: "kpi") — 3-4 single-value metrics
- Use chartType "kpi" for single aggregate values (COUNT, SUM, AVG)
- Use "line" or "area" for time-series data
- Use "bar" or "horizontal_bar" for category comparisons
- Use "pie" or "donut" for proportions (max 5-6 categories)
- Use "table" for detailed breakdowns
- Use "stacked_bar" for multi-measure comparisons
- SQL must be SELECT-only, use table aliases, add LIMIT (max 50 for breakdowns)
- Use ONLY tables and columns from the provided schema
- Respect the user's focus area and audience level
- Return ONLY the JSON object, no markdown fences or explanation
"""
```

- [ ] **Step 2: Update generate_dashboard method signature and logic**

Replace the `generate_dashboard` method (lines 273-356) in `query_engine.py`:

```python
    def generate_dashboard(self, request: str, preferences: dict = None) -> dict:
        """Generate a complete dashboard with tabs/sections/tiles from natural language."""
        preferences = preferences or {}
        focus = preferences.get("focus", "")
        time_range = preferences.get("timeRange", "")
        audience = preferences.get("audience", "")

        # Build enhanced request with preferences
        enhanced_request = request
        if focus:
            enhanced_request += f"\nFocus area: {focus}"
        if time_range:
            enhanced_request += f"\nTime range: {time_range}"
        if audience:
            enhanced_request += f"\nAudience: {audience}"

        # Retrieve relevant schema context
        schema_results = self.collection.query(
            query_texts=[enhanced_request], n_results=15
        )
        schema_context = "\n".join(schema_results["documents"][0]) if schema_results["documents"] else ""

        dialect = self.connector.db_type if self.connector else "postgresql"

        user_prompt = f"""User request: {enhanced_request}

Database dialect: {dialect}
Available schema:
{schema_context}

Generate the dashboard JSON now."""

        try:
            response = self.client.messages.create(
                model=self.fallback_model or self.primary_model,
                max_tokens=4096,
                system=self.DASHBOARD_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except Exception:
            response = self.client.messages.create(
                model=self.primary_model,
                max_tokens=4096,
                system=self.DASHBOARD_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )

        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        import json
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: find JSON object
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                result = json.loads(raw[start:end])
            else:
                return {"tabs": []}

        if not isinstance(result, dict) or "tabs" not in result:
            # Legacy: if AI returned a flat array, wrap it
            if isinstance(result, list):
                result = {
                    "tabs": [{
                        "name": "Overview",
                        "sections": [{
                            "name": "General",
                            "tiles": result[:8]
                        }]
                    }]
                }
            else:
                return {"tabs": []}

        # Execute each tile's SQL
        from sql_validator import SQLValidator
        from pii_masking import mask_dataframe
        from decimal import Decimal
        validator = SQLValidator()

        for tab in result.get("tabs", []):
            for section in tab.get("sections", []):
                executed_tiles = []
                for tile in section.get("tiles", [])[:8]:
                    sql = tile.get("sql", "")
                    is_valid, msg = validator.validate(sql)
                    if not is_valid:
                        continue
                    try:
                        df = self.connector.execute_query(sql)
                        df = mask_dataframe(df)
                        rows = df.head(100).to_dict("records")
                        for row in rows:
                            for k, v in row.items():
                                if isinstance(v, Decimal):
                                    row[k] = float(v)
                                elif hasattr(v, "isoformat"):
                                    row[k] = v.isoformat()
                        tile["columns"] = list(df.columns)
                        tile["rows"] = rows
                        tile["rowCount"] = len(df)
                        executed_tiles.append(tile)
                    except Exception as e:
                        import logging
                        logging.warning(f"Dashboard tile failed: {e}")
                        continue
                section["tiles"] = executed_tiles

        return result
```

- [ ] **Step 3: Update the generate-dashboard endpoint in query_routes.py**

Replace lines 184-217 in `query_routes.py`:

```python
class DashboardRequest(BaseModel):
    request: str
    conn_id: Optional[str] = None
    preferences: Optional[dict] = None  # { focus, timeRange, audience }


@router.post("/generate-dashboard")
async def generate_dashboard(req: DashboardRequest, request: Request, user=Depends(get_current_user)):
    """Generate a complete dashboard with tabs/sections from natural language."""
    email = user["email"]
    connections = request.app.state.connections.get(email, {})

    conn_id = req.conn_id
    if conn_id and conn_id not in connections:
        raise HTTPException(400, f"Connection {conn_id} not found")
    if not conn_id:
        if not connections:
            raise HTTPException(400, "No active database connection")
        conn_id = next(iter(connections))

    entry = connections[conn_id]
    try:
        result = entry.engine.generate_dashboard(req.request, preferences=req.preferences)
        # Check if any tiles were generated
        total_tiles = sum(
            len(sec.get("tiles", []))
            for tab in result.get("tabs", [])
            for sec in tab.get("sections", [])
        )
        if total_tiles == 0:
            raise HTTPException(400, "Could not generate dashboard tiles from your request")

        return {
            "tabs": result.get("tabs", []),
            "conn_id": conn_id,
            "db_type": entry.db_type,
            "database_name": entry.database_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Dashboard generation failed: {str(e)}")
```

- [ ] **Step 4: Commit**

```bash
git add backend/query_engine.py backend/routers/query_routes.py
git commit -m "feat: enhanced dashboard generation with tabs/sections, preferences, and chart types"
```

---

## Task 4: Frontend — Design Tokens and API Layer

**Files:**
- Create: `frontend/src/components/dashboard/tokens.js`
- Modify: `frontend/src/api.js` (lines 218-229)
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Create design tokens file**

```javascript
// frontend/src/components/dashboard/tokens.js
export const TOKENS = {
  bg: {
    deep: '#050506',
    base: '#0a0a0c',
    elevated: '#111114',
    surface: '#161619',
    hover: '#1c1c20',
  },
  border: {
    default: 'rgba(255,255,255,0.06)',
    hover: 'rgba(255,255,255,0.12)',
  },
  text: {
    primary: '#EDEDEF',
    secondary: '#8A8F98',
    muted: '#5C5F66',
  },
  accent: '#2563EB',
  accentLight: '#3B82F6',
  accentGlow: 'rgba(37,99,235,0.15)',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  radius: { sm: '6px', md: '10px', lg: '14px', xl: '18px' },
  transition: '200ms cubic-bezier(0.16,1,0.3,1)',
};

export const KPI_ACCENTS = [
  'linear-gradient(90deg, #2563EB, #60a5fa)',
  'linear-gradient(90deg, #22c55e, #4ade80)',
  'linear-gradient(90deg, #a78bfa, #c4b5fd)',
  'linear-gradient(90deg, #f59e0b, #fbbf24)',
  'linear-gradient(90deg, #ef4444, #f87171)',
  'linear-gradient(90deg, #06b6d4, #22d3ee)',
];

export const CHART_PALETTES = {
  default: ['#2563EB', '#22C55E', '#A78BFA', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#64748B'],
  ocean: ['#0EA5E9', '#06B6D4', '#14B8A6', '#2DD4BF', '#0284C7', '#0891B2', '#0D9488', '#115E59'],
  sunset: ['#F97316', '#EF4444', '#EC4899', '#F59E0B', '#DC2626', '#DB2777', '#D97706', '#BE123C'],
  forest: ['#22C55E', '#16A34A', '#15803D', '#4ADE80', '#86EFAC', '#166534', '#14532D', '#052E16'],
  mono: ['#F8FAFC', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B', '#0F172A'],
  colorblind: ['#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311', '#EE3377', '#BBBBBB', '#000000'],
};
```

- [ ] **Step 2: Add new API functions**

Add these functions to `frontend/src/api.js` after line 229 (after `removeDashboardTile`):

```javascript
  // ── Dashboard Tabs ──
  addTab: (dashboardId, name) =>
    post(`/dashboards/${dashboardId}/tabs`, { name }),
  deleteTab: (dashboardId, tabId) =>
    del(`/dashboards/${dashboardId}/tabs/${tabId}`),

  // ── Dashboard Sections ──
  addSection: (dashboardId, tabId, name) =>
    post(`/dashboards/${dashboardId}/tabs/${tabId}/sections`, { name }),
  deleteSection: (dashboardId, tabId, sectionId) =>
    del(`/dashboards/${dashboardId}/tabs/${tabId}/sections/${sectionId}`),

  // ── Tile CRUD (hierarchical) ──
  addTileToSection: (dashboardId, tabId, sectionId, tile) =>
    post(`/dashboards/${dashboardId}/tabs/${tabId}/sections/${sectionId}/tiles`, tile),
  updateTile: (dashboardId, tileId, updates) =>
    put(`/dashboards/${dashboardId}/tiles/${tileId}`, updates),
  refreshTile: (dashboardId, tileId, connId) =>
    post(`/dashboards/${dashboardId}/tiles/${tileId}/refresh`, { conn_id: connId }),

  // ── Annotations ──
  addDashboardAnnotation: (dashboardId, text, authorName) =>
    post(`/dashboards/${dashboardId}/annotations`, { text, authorName }),
  addTileAnnotation: (dashboardId, tileId, text, authorName) =>
    post(`/dashboards/${dashboardId}/tiles/${tileId}/annotations`, { text, authorName }),

  // ── Generation with preferences ──
  generateDashboardV2: (request, connId, preferences) =>
    post('/queries/generate-dashboard', { request, conn_id: connId, preferences }),
```

- [ ] **Step 3: Add dashboard state to store.js**

Add after the `profile` slice (line 68) in `store.js`:

```javascript
  // Dashboard
  activeDashboardId: null,
  setActiveDashboardId: (id) => set({ activeDashboardId: id }),
```

- [ ] **Step 4: Install new dependencies**

```bash
cd frontend && npm install html2canvas jspdf
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/tokens.js frontend/src/api.js frontend/src/store.js frontend/package.json frontend/package-lock.json
git commit -m "feat: dashboard design tokens, extended API layer, store, and export deps"
```

---

## Task 5: Frontend — Dashboard Sub-Components

**Files:**
- Create: `frontend/src/components/dashboard/CommandBar.jsx`
- Create: `frontend/src/components/dashboard/DashboardHeader.jsx`
- Create: `frontend/src/components/dashboard/TabBar.jsx`
- Create: `frontend/src/components/dashboard/Section.jsx`
- Create: `frontend/src/components/dashboard/KPICard.jsx`
- Create: `frontend/src/components/dashboard/TileWrapper.jsx`
- Create: `frontend/src/components/dashboard/NotesPanel.jsx`

This is the largest task. Each component is independent and follows the mockup design.

- [ ] **Step 1: Create CommandBar.jsx**

See the design mockup — sticky command bar with blur backdrop, search input with Cmd+K shortcut, action buttons.

```javascript
// frontend/src/components/dashboard/CommandBar.jsx
import { useState, useEffect, useRef } from 'react';
import { TOKENS } from './tokens';

export default function CommandBar({ onAddTile, onExport, onSettings, onAICommand }) {
  const [showInput, setShowInput] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowInput(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setShowInput(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onAICommand?.(query.trim());
      setQuery('');
      setShowInput(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 border-b px-6 py-2.5 flex items-center gap-3"
      style={{
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        background: 'rgba(5,5,6,0.82)',
        borderColor: TOKENS.border.default,
      }}>
      {showInput ? (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2.5 rounded-lg px-3.5 py-2"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" style={{ color: TOKENS.text.muted }}>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
          </svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder='Ask AI: "Add a revenue trend chart" or search tiles...'
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: TOKENS.text.primary }} />
          <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace", color: TOKENS.text.muted, background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}` }}>Esc</kbd>
        </form>
      ) : (
        <div className="flex-1 flex items-center gap-2.5 rounded-lg px-3.5 py-2 cursor-text"
          onClick={() => setShowInput(true)}
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, transition: `border-color ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" style={{ color: TOKENS.text.muted }}>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd"/>
          </svg>
          <span className="text-sm" style={{ color: TOKENS.text.muted }}>Ask AI to add a chart, or search tiles...</span>
          <kbd className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace", color: TOKENS.text.muted, background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}` }}>⌘K</kbd>
        </div>
      )}
      <div className="flex gap-1.5">
        <button onClick={onAddTile} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>
          Add Tile
        </button>
        <button onClick={onExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M13.75 7h-3v5.296l1.943-2.048a.75.75 0 011.114 1.004l-3.25 3.5a.75.75 0 01-1.114 0l-3.25-3.5a.75.75 0 111.114-1.004l1.943 2.048V7h-3a1.75 1.75 0 00-1.75 1.75v7.5c0 .966.784 1.75 1.75 1.75h7.5A1.75 1.75 0 0015.5 16.25v-7.5A1.75 1.75 0 0013.75 7z"/></svg>
          Export
        </button>
        <button onClick={onSettings} className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer"
          style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary, transition: `all ${TOKENS.transition}` }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DashboardHeader.jsx**

```javascript
// frontend/src/components/dashboard/DashboardHeader.jsx
import { useState, useRef, useEffect } from 'react';
import { TOKENS } from './tokens';

export default function DashboardHeader({ dashboard, saving, onNameChange }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dashboard?.name || '');
  const inputRef = useRef(null);

  useEffect(() => { setName(dashboard?.name || ''); }, [dashboard?.name]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== dashboard?.name) onNameChange?.(name.trim());
  };

  const relTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex items-center justify-between mb-4 px-6">
      <div className="flex items-center gap-3 group">
        {editing ? (
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)}
            onBlur={save} onKeyDown={e => e.key === 'Enter' && save()}
            className="text-[22px] font-bold tracking-tight bg-transparent outline-none border-b-2"
            style={{ color: TOKENS.text.primary, borderColor: TOKENS.accent, letterSpacing: '-0.02em' }} />
        ) : (
          <h1 className="text-[22px] font-bold tracking-tight cursor-pointer"
            style={{ color: TOKENS.text.primary, letterSpacing: '-0.02em' }}
            onClick={() => setEditing(true)}>
            {dashboard?.name || 'Untitled Dashboard'}
          </h1>
        )}
        <svg onClick={() => setEditing(true)} className="w-3.5 h-3.5 cursor-pointer opacity-0 group-hover:opacity-100"
          style={{ color: TOKENS.text.muted, transition: `opacity ${TOKENS.transition}` }}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z"/>
        </svg>
      </div>
      <div className="flex items-center gap-4">
        {saving && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: TOKENS.text.muted }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: TOKENS.warning }}></span>
            Saving...
          </span>
        )}
        {!saving && dashboard?.updated_at && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: TOKENS.text.muted }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: TOKENS.success }}></span>
            Updated {relTime(dashboard.updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TabBar.jsx**

```javascript
// frontend/src/components/dashboard/TabBar.jsx
import { useState } from 'react';
import { TOKENS } from './tokens';

export default function TabBar({ tabs = [], activeTabId, onSelect, onAdd, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  const startRename = (tab) => { setRenamingId(tab.id); setRenameVal(tab.name); };
  const commitRename = () => {
    if (renameVal.trim() && renamingId) onRename?.(renamingId, renameVal.trim());
    setRenamingId(null);
  };

  return (
    <div className="flex items-center gap-0.5 mb-5 border-b px-6" style={{ borderColor: TOKENS.border.default }}>
      {tabs.map(tab => (
        <div key={tab.id}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium cursor-pointer select-none -mb-px"
          style={{
            color: tab.id === activeTabId ? TOKENS.accentLight : TOKENS.text.muted,
            borderBottom: `2px solid ${tab.id === activeTabId ? TOKENS.accent : 'transparent'}`,
            transition: `all ${TOKENS.transition}`,
          }}
          onClick={() => onSelect?.(tab.id)}
          onDoubleClick={() => startRename(tab)}>
          {renamingId === tab.id ? (
            <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename} onKeyDown={e => e.key === 'Enter' && commitRename()}
              autoFocus className="bg-transparent outline-none text-sm w-24"
              style={{ color: TOKENS.text.primary }} />
          ) : tab.name}
          {tabs.length > 1 && tab.id === activeTabId && (
            <button onClick={e => { e.stopPropagation(); onDelete?.(tab.id); }}
              className="ml-1 opacity-0 group-hover:opacity-100 hover:opacity-100"
              style={{ color: TOKENS.text.muted, transition: `opacity ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z"/>
              </svg>
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd}
        className="px-3 py-1.5 text-sm cursor-pointer rounded-t-md mb-1 ml-1"
        style={{ color: TOKENS.text.muted, border: `1px dashed ${TOKENS.border.default}`, transition: `all ${TOKENS.transition}` }}>
        + Add tab
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create KPICard.jsx**

```javascript
// frontend/src/components/dashboard/KPICard.jsx
import { TOKENS, KPI_ACCENTS } from './tokens';

export default function KPICard({ tile, index = 0, onEdit }) {
  const rows = tile?.rows || [];
  const columns = tile?.columns || [];
  const value = rows[0] ? Object.values(rows[0])[columns.length > 1 ? 1 : 0] : '--';
  const label = tile?.title || (columns[0] || 'Metric');

  const formatValue = (v) => {
    if (v == null || v === '--') return '--';
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Math.abs(n) >= 1e6) return `${(n/1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `${(n/1e3).toFixed(1)}K`;
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
  };

  return (
    <div className="relative overflow-hidden rounded-[14px] p-[18px_20px] cursor-pointer group"
      onClick={() => onEdit?.(tile)}
      style={{
        background: TOKENS.bg.elevated,
        border: `1px solid ${TOKENS.border.default}`,
        transition: `all ${TOKENS.transition}`,
      }}>
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: KPI_ACCENTS[index % KPI_ACCENTS.length] }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: TOKENS.text.muted }}>{label}</span>
      </div>
      <div className="text-[28px] font-bold mb-1.5" style={{ color: TOKENS.text.primary, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
        {tile?.subtitle?.startsWith('$') ? '$' : ''}{formatValue(value)}
      </div>
      {tile?.subtitle && (
        <span className="text-xs" style={{ color: TOKENS.text.muted }}>{tile.subtitle}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create TileWrapper.jsx**

```javascript
// frontend/src/components/dashboard/TileWrapper.jsx
import { TOKENS } from './tokens';
import ResultsChart from '../ResultsChart';
import KPICard from './KPICard';

export default function TileWrapper({ tile, index, onEdit, onEditSQL, onChangeChart, onRemove, onRefresh }) {
  const commentCount = (tile?.annotations || []).length;

  if (tile?.chartType === 'kpi') {
    return <KPICard tile={tile} index={index} onEdit={onEdit} />;
  }

  return (
    <div className="relative overflow-hidden rounded-[14px] group h-full flex flex-col"
      style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}`, transition: `all ${TOKENS.transition}` }}>
      {/* Drag handle */}
      <div className="absolute top-3.5 left-2 w-3 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 cursor-grab"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <span className="block w-full h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] pt-[14px]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: TOKENS.text.primary }}>{tile?.title || 'Untitled'}</span>
          {tile?.subtitle && <span className="text-[11px]" style={{ color: TOKENS.text.muted }}>{tile.subtitle}</span>}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
              style={{ color: TOKENS.text.muted, background: TOKENS.bg.surface }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[11px] h-[11px]"><path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.413a41.1 41.1 0 003.55-.414c1.437-.232 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd"/></svg>
              {commentCount}
            </span>
          )}
          {[
            { title: 'Refresh', icon: 'M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903H14.25a.75.75 0 000 1.5h6a.75.75 0 00.75-.75v-6a.75.75 0 00-1.5 0v2.553l-1.256-1.255a9 9 0 00-14.3 5.842.75.75 0 001.506-.429zM15.245 9.941a7.5 7.5 0 01-12.548 3.364L.794 11.402H5.75a.75.75 0 000-1.5h-6a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-2.553l1.256 1.255a9 9 0 0014.3-5.842.75.75 0 00-1.506.429z', onClick: onRefresh },
            { title: 'Edit SQL', icon: 'M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z', onClick: onEditSQL },
            { title: 'Chart type', icon: 'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z', onClick: onChangeChart },
            { title: 'Edit', icon: 'M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z', onClick: () => onEdit?.(tile) },
          ].map(({ title, icon, onClick }) => (
            <button key={title} onClick={onClick} title={title}
              className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
              style={{ color: TOKENS.text.muted, transition: `all ${TOKENS.transition}` }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d={icon} clipRule="evenodd"/></svg>
            </button>
          ))}
          <button onClick={onRemove} title="Remove"
            className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer"
            style={{ color: TOKENS.danger, transition: `all ${TOKENS.transition}` }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5z" clipRule="evenodd"/></svg>
          </button>
        </div>
      </div>
      {/* Chart body */}
      <div className="flex-1 px-[18px] pb-[18px] pt-3 min-h-[160px]">
        {tile?.rows?.length > 0 ? (
          <ResultsChart columns={tile.columns} rows={tile.rows} embedded
            defaultChartType={tile.chartType} defaultPalette={tile.palette}
            defaultMeasure={tile.selectedMeasure} defaultMeasures={tile.activeMeasures} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: TOKENS.text.muted }}>No data</div>
        )}
      </div>
      {/* Resize handle */}
      <div className="absolute bottom-1 right-1 w-3 h-3 opacity-0 group-hover:opacity-40 cursor-se-resize"
        style={{ transition: `opacity ${TOKENS.transition}` }}>
        <div className="absolute bottom-0 right-0 w-2.5 h-0.5 rounded" style={{ background: TOKENS.text.muted }}/>
        <div className="absolute bottom-0 right-0 w-0.5 h-2.5 rounded" style={{ background: TOKENS.text.muted }}/>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create Section.jsx**

```javascript
// frontend/src/components/dashboard/Section.jsx
import { useState, useRef, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import TileWrapper from './TileWrapper';
import { TOKENS } from './tokens';

const ResponsiveGrid = WidthProvider(Responsive);

export default function Section({ section, onLayoutChange, onTileEdit, onTileEditSQL, onTileChartChange, onTileRemove, onTileRefresh, onAddTile, onEditSection }) {
  const [collapsed, setCollapsed] = useState(section?.collapsed || false);

  const tiles = section?.tiles || [];
  const layout = section?.layout || [];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 cursor-pointer select-none group px-6"
        onClick={() => setCollapsed(!collapsed)}>
        <svg className="w-3.5 h-3.5" style={{ color: TOKENS.text.muted, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: `transform ${TOKENS.transition}` }}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
        </svg>
        <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: TOKENS.text.primary }}>{section?.name || 'Untitled Section'}</span>
        <div className="flex-1 h-px" style={{ background: TOKENS.border.default }}/>
        <span className="text-[11px] px-2 py-px rounded-full" style={{ color: TOKENS.text.muted, background: TOKENS.bg.elevated }}>{tiles.length} tiles</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100" style={{ transition: `opacity ${TOKENS.transition}` }}>
          <button onClick={e => { e.stopPropagation(); onAddTile?.(); }} className="cursor-pointer" style={{ color: TOKENS.text.muted }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/></svg>
          </button>
          <button onClick={e => { e.stopPropagation(); onEditSection?.(); }} className="cursor-pointer" style={{ color: TOKENS.text.muted }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>
          </button>
        </div>
      </div>
      {!collapsed && tiles.length > 0 && (
        <div className="px-6">
          <ResponsiveGrid
            className="layout"
            layouts={{ lg: layout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            cols={{ lg: 12, md: 12, sm: 6 }}
            rowHeight={80}
            margin={[12, 12]}
            isDraggable
            isResizable
            draggableHandle=".cursor-grab"
            onLayoutChange={(newLayout) => onLayoutChange?.(section.id, newLayout)}
          >
            {tiles.map((tile, i) => (
              <div key={tile.id}>
                <TileWrapper tile={tile} index={i}
                  onEdit={onTileEdit}
                  onEditSQL={() => onTileEditSQL?.(tile)}
                  onChangeChart={() => onTileChartChange?.(tile)}
                  onRemove={() => onTileRemove?.(tile.id)}
                  onRefresh={() => onTileRefresh?.(tile.id)} />
              </div>
            ))}
          </ResponsiveGrid>
        </div>
      )}
      {!collapsed && tiles.length === 0 && (
        <div className="flex items-center justify-center py-12 mx-6 rounded-xl border border-dashed"
          style={{ borderColor: TOKENS.border.default, color: TOKENS.text.muted }}>
          <button onClick={onAddTile} className="text-sm cursor-pointer" style={{ color: TOKENS.accentLight }}>
            + Add a tile to this section
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create NotesPanel.jsx**

```javascript
// frontend/src/components/dashboard/NotesPanel.jsx
import { useState } from 'react';
import { TOKENS } from './tokens';

export default function NotesPanel({ annotations = [], userName, onAdd }) {
  const [text, setText] = useState('');

  const initials = (name) => {
    if (!name) return '?';
    const parts = name.split(/\s+/);
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  };

  const relTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString();
  };

  const handleSubmit = () => {
    if (text.trim()) {
      onAdd?.(text.trim());
      setText('');
    }
  };

  return (
    <div className="mx-6 mt-6 rounded-[14px] p-5" style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-semibold" style={{ color: TOKENS.text.primary }}>Notes & Commentary</span>
        <span className="text-[11px] px-2 py-px rounded-full" style={{ color: TOKENS.text.muted, background: TOKENS.bg.surface }}>{annotations.length} notes</span>
      </div>
      {annotations.map((note, i) => (
        <div key={note.id || i} className="flex gap-2.5 py-2.5" style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${TOKENS.accent}, #a78bfa)` }}>
            {initials(note.authorName)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold" style={{ color: TOKENS.text.primary }}>{note.authorName || 'Unknown'}</span>
              <span className="text-[11px]" style={{ color: TOKENS.text.muted }}>{relTime(note.created_at)}</span>
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: TOKENS.text.secondary }}>{note.text}</p>
          </div>
        </div>
      ))}
      <div className="flex gap-2.5 items-center mt-3 pt-3" style={{ borderTop: `1px solid ${TOKENS.border.default}` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #22c55e, #4ade80)' }}>You</div>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Add a note or @mention a collaborator..."
          className="flex-1 bg-transparent outline-none text-[13px] rounded-lg px-3.5 py-2"
          style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }} />
        {text.trim() && (
          <button onClick={handleSubmit} className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: TOKENS.accent, color: 'white' }}>Send</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Commit all sub-components**

```bash
git add frontend/src/components/dashboard/
git commit -m "feat: dashboard sub-components — CommandBar, Header, TabBar, Section, KPICard, TileWrapper, NotesPanel"
```

---

## Task 6: Frontend — Rewrite DashboardBuilder Page

**Files:**
- Rewrite: `frontend/src/pages/DashboardBuilder.jsx` (all 767 lines)

This task replaces the entire DashboardBuilder with the new design. Due to the size (~600+ lines), the implementing agent should write this as a complete file replacement using the sub-components from Task 5.

- [ ] **Step 1: Rewrite DashboardBuilder.jsx**

The new page composes: CommandBar, DashboardHeader, TabBar, Section (for each section in active tab), NotesPanel. Key state: `dashboards`, `activeDashboard`, `activeTabId`, `loading`, `saving`, `editingTile`. Key behaviors: auto-save on layout/tile changes (debounced 800ms), tab/section CRUD via API, tile editing via TileEditor modal.

The implementing agent should write the full file following this structure:

```
Imports (react, api, store, all dashboard sub-components, framer-motion, TileEditor)
→ State hooks (dashboards list, active dashboard, active tab, loading, saving, editing tile, undo)
→ useEffect: load dashboards on mount
→ useEffect: auto-save debounce
→ Handlers: selectDashboard, createDashboard, deleteDashboard, selectTab, addTab, deleteTab, renameTab, sectionLayoutChange, tileEdit, tileRemove (with undo), tileRefresh, addAnnotation, aiCommand, export
→ JSX: CommandBar → DashboardHeader → TabBar → map sections with Section component → NotesPanel → TileEditor modal → Undo toast
```

The implementing agent has full creative freedom to write this file, using the sub-components and following the mockup at `.superpowers/brainstorm/438-1775073672/content/dashboard-layout-v2.html`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/DashboardBuilder.jsx
git commit -m "feat: rewrite DashboardBuilder with tabs, sections, command bar, professional design"
```

---

## Task 7: Frontend — TileEditor Full-Power Modal

**Files:**
- Create: `frontend/src/components/dashboard/TileEditor.jsx`

- [ ] **Step 1: Create TileEditor.jsx**

Full-power tile editing modal with these sections:
1. **Title & Subtitle** — text inputs
2. **Chart Type** — visual icon grid selector (all 12 types)
3. **Measures** — multi-select from columns, single measure toggle
4. **Filters** — date range pickers, custom WHERE clause input
5. **SQL Editor** — syntax-highlighted textarea with "Run Query" button that calls `api.refreshTile()`
6. **Palette** — color swatch picker (6 palettes from tokens.js)
7. **Notes** — tile-level annotations list + input
8. **Delete** — destructive action at bottom

The implementing agent should build this as a Framer Motion modal overlay. Each section is a collapsible panel. The SQL editor should use a monospace font (`JetBrains Mono`). The "Run Query" button calls the refresh endpoint and updates the tile's rows/columns in parent state.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/TileEditor.jsx
git commit -m "feat: full-power TileEditor — chart type, measures, SQL editor, filters, palette, notes"
```

---

## Task 8: Frontend — Export Modal (PDF/PNG)

**Files:**
- Create: `frontend/src/components/dashboard/ExportModal.jsx`

- [ ] **Step 1: Create ExportModal.jsx**

```javascript
// frontend/src/components/dashboard/ExportModal.jsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS } from './tokens';

export default function ExportModal({ show, onClose, dashboardName, onExport }) {
  const [format, setFormat] = useState('pdf');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const target = document.getElementById('dashboard-content');
      if (!target) return;

      const canvas = await html2canvas(target, {
        backgroundColor: TOKENS.bg.deep,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `${dashboardName || 'dashboard'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${dashboardName || 'dashboard'}.pdf`);
      }
      onExport?.();
      onClose?.();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60" onClick={onClose}/>
          <motion.div className="relative rounded-2xl p-6 w-full max-w-sm"
            style={{ background: TOKENS.bg.elevated, border: `1px solid ${TOKENS.border.default}` }}
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: TOKENS.text.primary }}>Export Dashboard</h3>
            <div className="flex gap-3 mb-6">
              {['pdf', 'png'].map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium cursor-pointer"
                  style={{
                    background: format === f ? TOKENS.accentGlow : TOKENS.bg.surface,
                    border: `1px solid ${format === f ? TOKENS.accent : TOKENS.border.default}`,
                    color: format === f ? TOKENS.accentLight : TOKENS.text.secondary,
                  }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: TOKENS.bg.surface, border: `1px solid ${TOKENS.border.default}`, color: TOKENS.text.secondary }}>
                Cancel
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: TOKENS.accent, color: 'white', opacity: exporting ? 0.6 : 1 }}>
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/ExportModal.jsx
git commit -m "feat: PDF/PNG export modal using html2canvas + jsPDF"
```

---

## Task 9: Frontend — Enhanced Chat Dashboard Flow

**Files:**
- Modify: `frontend/src/pages/Chat.jsx` (lines 56, 89-270, 528-565)

- [ ] **Step 1: Update handleDashboardRequest in Chat.jsx**

Replace the dashboard handling in Chat.jsx. Key changes:
1. After detecting dashboard intent (line 56 regex), add guided question chips as a special message type
2. Collect user preferences from chip clicks
3. Call `api.generateDashboardV2()` with preferences
4. Build hierarchical layout from tabs/sections response
5. Render improved inline preview with tabs

The implementing agent should modify `handleDashboardRequest` (lines 528-565) to:
- First push a "guided questions" message with chips for focus, time range, audience
- On chip selection, call `api.generateDashboardV2(question, connId, { focus, timeRange, audience })`
- Render the inline dashboard using tabs from the response

Also update the `InlineDashboard` component (lines 89-270) to display tabs and sections from the new response format.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Chat.jsx
git commit -m "feat: guided dashboard generation flow with preference chips in chat"
```

---

## Task 10: Add Google Fonts and CSS Cleanup

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add Inter and JetBrains Mono fonts to index.html**

Add to the `<head>` section of `frontend/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Add react-grid-layout CSS import**

Add to the top of `frontend/src/index.css` (after the existing font import):

```css
@import 'react-grid-layout/css/styles.css';
@import 'react-resizable/css/styles.css';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html frontend/src/index.css
git commit -m "feat: add Inter + JetBrains Mono fonts and grid layout CSS"
```

---

## Task 11: Integration Testing

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && uvicorn main:app --reload --port 8002 &
cd frontend && npm run dev &
```

- [ ] **Step 2: Verify dashboard CRUD**

1. Navigate to `/analytics`
2. Create a new dashboard — verify it appears with default tab "Overview" and section "General"
3. Rename dashboard title inline
4. Add a new tab, rename it, switch between tabs
5. Verify empty section shows "Add a tile" prompt

- [ ] **Step 3: Verify Chat → Dashboard generation**

1. Navigate to `/chat` with active DB connection
2. Type "Create a sales dashboard"
3. Verify guided question chips appear (focus, time range, audience)
4. Select chips, verify dashboard generates with tabs/sections
5. Click "Open in Dashboard Builder" — verify tiles appear in `/analytics`

- [ ] **Step 4: Verify tile editing**

1. Hover a tile — verify drag handle, resize handle, toolbar appear
2. Click Edit — verify TileEditor modal opens
3. Change chart type, verify chart re-renders
4. Edit SQL, click Run — verify data refreshes
5. Change palette — verify colors update

- [ ] **Step 5: Verify export**

1. Click Export in command bar
2. Select PDF — verify PDF downloads
3. Select PNG — verify PNG downloads

- [ ] **Step 6: Verify annotations**

1. Scroll to Notes section
2. Add a note — verify it appears with avatar and timestamp
3. Add a tile comment — verify badge count updates

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for dashboard redesign"
```
