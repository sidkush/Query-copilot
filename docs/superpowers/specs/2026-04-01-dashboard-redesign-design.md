# QueryCopilot Dashboard Redesign — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Approach:** Incremental Enhancement (Approach A — rebuild on existing react-grid-layout + Recharts stack)

---

## 1. Overview

Redesign the QueryCopilot dashboard system to be a professional, corporate-grade analytics dashboard with:
- AI-guided dashboard generation from chat
- Tabbed + sectioned layout with drag-drop, resize
- Full-power tile editing (chart type, measures, SQL, filters)
- Collaborative annotations
- Static PDF/PNG export (with data model ready for future live sharing)

## 2. Data Model

### Dashboard
```
{
  id: string,
  name: string,
  description: string,
  created_at: ISO string,
  updated_at: ISO string,
  tabs: Tab[],
  annotations: Annotation[],    // dashboard-level notes
  sharing: { enabled: false, token: null },  // future-ready
}
```

### Tab
```
{
  id: string,
  name: string,
  order: number,
  sections: Section[]
}
```

### Section
```
{
  id: string,
  name: string,
  description: string,
  order: number,
  collapsed: boolean,
  tiles: Tile[],
  layout: GridLayoutItem[]    // react-grid-layout items for this section
}
```

### Tile
```
{
  id: string,
  title: string,
  subtitle: string,
  chartType: string,          // "bar"|"line"|"area"|"pie"|"donut"|"table"|"kpi"|"radar"|"scatter"|"treemap"|"stacked_bar"|"horizontal_bar"
  sql: string,
  question: string,           // original NL question
  columns: string[],
  rows: object[],
  selectedMeasure: string,
  activeMeasures: string[],
  filters: {
    dateRange: { start, end } | null,
    customWhere: string | null
  },
  palette: string,
  refreshConfig: { autoRefresh: boolean, intervalMs: number },
  annotations: Annotation[]
}
```

### Annotation
```
{
  id: string,
  author: string,             // user email
  authorName: string,
  text: string,
  created_at: ISO string,
  position: null              // null = tile/dashboard level
}
```

### GridLayoutItem (react-grid-layout)
```
{
  i: string,                  // tile ID
  x: number, y: number,
  w: number, h: number,
  minW: 3, minH: 3
}
```

### Migration
Existing dashboards get:
- 1 default tab: "Overview"
- 1 default section: "General"
- All existing tiles placed in that section
- Zero breaking changes

## 3. Chat → Dashboard Generation Flow

### Step 1: Detection
Existing regex detects dashboard intent: `/\b(create|build|make|generate|design|set\s*up)\b.{0,30}\bdashboard\b/i`

### Step 2: Guided Questions (NEW)
AI responds with 2-3 interactive chip-based questions:
1. "What area should this focus on?" — chips auto-generated from schema tables (e.g., "Sales", "Customers", "Orders")
2. "What time range?" — chips: "Last 7 days", "Last 30 days", "This quarter", "This year", "All time"
3. "Who's the audience?" — chips: "Executive summary", "Operational detail", "Technical deep-dive"

User can click chips or type free-form.

### Step 3: Backend Generation
- Backend `/api/queries/generate-dashboard` enhanced to accept `{ request, conn_id, preferences: { focus, timeRange, audience } }`
- AI generates 6-12 tiles organized into tabs/sections based on semantic analysis
- Returns tiles with tab/section groupings, pre-executed data

### Step 4: Chat Preview
- Inline mini-dashboard preview in chat
- "Open in Dashboard Builder" button → navigates to `/analytics/:id`
- Auto-saved to backend on generation

### Step 5: Refinement via Chat
- "Add a chart showing monthly revenue trend" → adds tile to appropriate section
- "Move X to a new tab called Y" → restructures

## 4. Dashboard Builder UI (Option C)

### Design System Tokens
```
--bg-deep: #050506
--bg-base: #0a0a0c
--bg-elevated: #111114
--bg-surface: #161619
--bg-hover: #1c1c20
--border: rgba(255,255,255,0.06)
--border-hover: rgba(255,255,255,0.12)
--text-primary: #EDEDEF
--text-secondary: #8A8F98
--text-muted: #5C5F66
--accent: #2563EB
--accent-light: #3B82F6
--success: #22C55E
--warning: #F59E0B
--danger: #EF4444
--radius-sm: 6px, --radius-md: 10px, --radius-lg: 14px
--transition: 200ms cubic-bezier(0.16,1,0.3,1)
--mono: 'JetBrains Mono', monospace
```

Font: Inter (headings 600-700, body 400-500) + JetBrains Mono (data/SQL).
Icons: Heroicons (SVG), no emojis. Lucide as fallback.

### Layout Structure
```
[Command Bar — sticky, blur backdrop]
  Search/AI input | + Add Tile | Export | Settings

[Dashboard Header]
  Title (inline editable) | Auto-save status | Updated timestamp | Collaborators

[Tab Bar]
  Tab1(active) | Tab2 | Tab3 | + Add Tab

[Section: Key Metrics — collapsible]
  [KPI] [KPI] [KPI] [KPI]    ← 4-column grid, colored top accent, sparklines

[Section: Trends — collapsible]
  [Area Chart 7-col] [Donut 5-col]
  [Table 12-col]

[Notes & Commentary]
  Note items with avatar, timestamp, text
  Input area for new notes
```

### Tile Interactions
- **Drag handle**: left edge, appears on hover, `cursor: grab`
- **Resize handle**: bottom-right corner, appears on hover
- **Hover toolbar**: Edit SQL (code icon), Change chart type (bar icon), Comments badge, More options (dots)
- **Click tile**: Opens inline editing overlay with:
  - Title/subtitle editing
  - Chart type selector (visual icons)
  - Measure selector (multi-select from columns)
  - Date range filter
  - Custom WHERE clause input
  - SQL editor (syntax highlighted, with "Run" button)
  - Color palette picker
  - Refresh interval setting
  - Delete tile (with undo toast)

### KPI Card Variant
Special tile type for single-metric display:
- Large numeric value with tabular-nums
- Delta badge (up/down with color + icon)
- Sparkline (mini bar chart)
- Comparison period label
- Colored top accent bar per card

### Section Features
- Collapsible (chevron toggle)
- Section name editable inline
- Section description (optional)
- Tile count badge
- Hover-reveal: Add tile button, Edit section button
- Drag to reorder sections

### Tab Features
- Click to switch
- Active tab has accent underline
- Double-click to rename
- Drag to reorder
- "+ Add tab" button (dashed border)
- Right-click context menu: Rename, Duplicate, Delete

## 5. Backend Changes

### Updated Dashboard Model (user_storage.py)
Replace flat `{ tiles[], layout[] }` with hierarchical `{ tabs[{ sections[{ tiles[], layout[] }] }] }`.

### Updated Routes (dashboard_routes.py)
- `PUT /api/dashboards/{id}` — accepts full hierarchical structure
- `POST /api/dashboards/{id}/tabs` — add tab
- `PUT /api/dashboards/{id}/tabs/{tab_id}` — update tab
- `DELETE /api/dashboards/{id}/tabs/{tab_id}` — delete tab
- `POST /api/dashboards/{id}/tabs/{tab_id}/sections` — add section
- `PUT /api/dashboards/{id}/tabs/{tab_id}/sections/{section_id}` — update section
- `DELETE /api/dashboards/{id}/tabs/{tab_id}/sections/{section_id}` — delete section
- `POST /api/dashboards/{id}/annotations` — add annotation
- `PUT /api/dashboards/{id}/tiles/{tile_id}` — update individual tile (SQL, chart type, measures, filters)
- `POST /api/dashboards/{id}/tiles/{tile_id}/refresh` — re-execute tile SQL and return fresh data

### Updated Generation (query_engine.py)
- Accept `preferences` dict in `generate_dashboard()`
- Return tiles grouped by tab/section (AI decides grouping)
- Generate appropriate chartType per tile based on data shape

### Tile Refresh Endpoint
- `POST /api/dashboards/{id}/tiles/{tile_id}/refresh`
- Re-executes the tile's SQL against the active connection
- Returns fresh `{ columns, rows }` with PII masking
- Respects query limits

## 6. Export (Static)

### PDF/PNG Export
- Frontend: Use `html2canvas` + `jsPDF` for client-side rendering
- Captures current tab view as image
- Adds dashboard title, date, section headers
- Export button in command bar

### Future-Ready Sharing
Data model includes `sharing: { enabled, token }` on dashboard.
No sharing endpoints implemented now — placeholder for future:
- `POST /api/dashboards/{id}/share` → generates read-only token
- `GET /api/shared/{token}` → renders dashboard without auth

## 7. Annotations

### Dashboard-Level Notes
- Stored in `dashboard.annotations[]`
- Rendered in Notes & Commentary section below tiles
- Shows avatar (initials), author name, timestamp, text
- Input area at bottom for new notes

### Tile-Level Comments
- Stored in `tile.annotations[]`
- Comment count badge on tile header
- Click badge to expand comment thread inline
- Same format: avatar, author, timestamp, text

### Data Model Ready for Collaboration
- Author stored as email + display name
- Timestamps on all annotations
- Position field for future inline positioning
- Currently single-user writes, model supports multi-user reads

## 8. Key Constraints Preserved

- Read-only enforcement at 3 layers (driver, validator, config) — unchanged
- PII masking runs before any data return — unchanged
- Two-step query flow (generate → execute) — unchanged for individual queries; dashboard generation combines both steps with user's prior consent
- Daily query limits respected — each tile generation/refresh counts as 1 query
- Fernet encryption for saved passwords — unchanged
- Max 100 rows per tile — unchanged

## 9. Dependencies

### New npm packages needed:
- `html2canvas` — for PDF/PNG export
- `jspdf` — for PDF generation
- No other new dependencies; react-grid-layout and Recharts already installed

### No new Python packages needed.
Backend changes are purely data model and route additions.
