# QueryCopilot Dashboard System — Complete Deep Dive

## From Chat Window to AI-Powered Dashboard Builder

> This document captures the full story of QueryCopilot's dashboard system — how it evolved from a simple SQL chat interface into a multi-tab, drag-and-drop, AI-generated analytics dashboard builder. It covers architecture, UI design, component anatomy, data flow, the generation pipeline, and a roadmap for where to take it next.

---

## Table of Contents

1. [The Journey: Chat → Dashboard](#1-the-journey-chat--dashboard)
2. [Architecture Overview](#2-architecture-overview)
3. [Design System](#3-design-system)
4. [UI Anatomy — Component by Component](#4-ui-anatomy--component-by-component)
5. [The Dashboard Builder Page](#5-the-dashboard-builder-page)
6. [AI Dashboard Generation Pipeline](#6-ai-dashboard-generation-pipeline)
7. [Backend: Routes, Storage, Refresh](#7-backend-routes-storage-refresh)
8. [Auto-Visualization Engine](#8-auto-visualization-engine)
9. [Current Feature Set](#9-current-feature-set)
10. [UI/UX Improvement Roadmap](#10-uiux-improvement-roadmap)
11. [More Freedom for Users](#11-more-freedom-for-users)

---

## 1. The Journey: Chat → Dashboard

### Phase 0 — The SQL Chat Window

QueryCopilot started as a straightforward NL-to-SQL chat interface. Users typed a question in plain English, the system generated SQL via Claude, executed it against their connected database, and returned:

- The generated SQL (shown for review before execution)
- A results table (paginated, sortable, exportable)
- An auto-generated chart (bar, line, pie — picked by a scoring algorithm)
- A natural language summary

This was the entire product. One question, one answer, one chart. The UI was a full-screen chat window with a sidebar for conversation history — think ChatGPT but for databases.

### The Problem

Users kept asking the same sets of questions:
- "What's our revenue this month?"
- "How many orders this week?"
- "Top 5 products by sales?"

Every time they opened the app, they re-typed the same queries. There was no way to save a collection of analyses, no persistent view of key metrics, and no way to get a holistic picture of their data at a glance.

### Phase 1 — Flat Dashboard (v0)

The first dashboard attempt was simple: a flat list of tiles, each holding a chart. No tabs, no sections, no drag-and-drop. The backend stored tiles as a flat JSON array. Users could generate a dashboard from chat by saying "build me a sales dashboard" — Claude would produce 4-6 SQL queries, execute them, and save the results as tiles.

**Commit:** `7b36876 initial: pre-dashboard-redesign baseline`

### Phase 2 — Hierarchical Redesign

The flat list hit limits immediately. Users wanted to organize metrics by topic (revenue vs. marketing vs. customer segments), compare periods, and have different views for different audiences. This required structure.

The redesign introduced a three-level hierarchy:

```
Dashboard
└── Tabs (e.g., "Revenue Overview", "Campaign Analysis")
    └── Sections (e.g., "Core KPIs", "Daily Trend")
        └── Tiles (individual charts/KPIs)
```

This was a ground-up rewrite of both backend storage and frontend rendering.

**Key commits (in build order):**
```
d4918de  feat: rewrite dashboard storage with hierarchical tabs/sections/tiles model
0a4bf8c  feat: rewrite dashboard routes with tabs, sections, annotations, refresh
2d63c33  feat: enhanced dashboard generation with tabs/sections, preferences, and chart types
367fd16  feat: dashboard design tokens, extended API layer, store, and export deps
b4dc50d  feat: dashboard sub-components — CommandBar, Header, TabBar, Section, KPICard, TileWrapper, NotesPanel
e7fd3be  feat: rewrite DashboardBuilder with tabs, sections, command bar, professional design
5b3e71a  feat: add Inter + JetBrains Mono fonts and grid layout CSS
1f24015  feat: guided dashboard generation flow with preference chips in chat
634218d  feat: full-power TileEditor — chart type, measures, SQL editor, filters, palette, notes
6bed027  feat: PDF/PNG export modal using html2canvas + jsPDF
8564595  fix: use GridLayout + useContainerWidth instead of removed WidthProvider
```

### Phase 3 — AI-Guided Generation with Preferences

Instead of just "build me a dashboard", the system now shows preference chips in the chat interface when it detects a dashboard request:

- **Focus**: Revenue, Growth, Churn, Support, Operations
- **Time Range**: Today, Last 7 days, This month, This quarter, This year
- **Audience**: Executive, Department Head, Analyst, Customer

These preferences are injected into the Claude prompt, producing dashboards tailored to the user's actual need — an executive sees KPIs and trends, an analyst sees detailed breakdowns and comparisons.

**Detection regex:**
```javascript
/\b(create|build|make|generate|design|set\s*up)\b.{0,30}\bdashboard\b/i
```

### Phase 4 — Polish & Power Features

The final phase added:
- **Global filters** (date range + field filters applied across all tiles)
- **Tile refresh** (re-execute SQL with current filters)
- **Auto-refresh on load** (tiles with SQL but no cached data are refreshed automatically)
- **PDF/PNG export** via html2canvas + jsPDF
- **Annotations** at both dashboard and tile level
- **Undo** for tile deletion (5-second toast with restore)
- **Chart type picker** inline on each tile
- **Full TileEditor** modal with SQL editor, measure selection, palette picker, filters, and notes

---

## 2. Architecture Overview

### System Flow

```
User asks "Build me a marketing dashboard"
        │
        ▼
  Chat.jsx detects dashboard intent (regex)
        │
        ▼
  Show preference chips (focus, timeRange, audience)
        │
        ▼
  POST /api/queries/generate-dashboard
        │
        ▼
  query_engine.py → generate_dashboard()
    1. Embed question → ChromaDB RAG (schema + examples)
    2. Build prompt with preferences + schema context
    3. Claude generates JSON: { tabs > sections > tiles }
    4. For each tile: validate SQL → execute → PII mask → serialize
        │
        ▼
  Frontend receives tiles with columns + rows
        │
        ▼
  Chat.jsx creates dashboard via API:
    1. POST /api/dashboards/ (create)
    2. PUT /api/dashboards/{id} (save tabs with tile data + layout)
        │
        ▼
  Navigate to /analytics → DashboardBuilder renders the dashboard
```

### Data Hierarchy

```json
{
  "id": "1f4078379280",
  "name": "Marketing Dashboard",
  "tabs": [
    {
      "id": "npnmbnwq",
      "name": "Revenue Overview",
      "sections": [
        {
          "id": "sec_abc123",
          "name": "Core Revenue KPIs",
          "tiles": [
            {
              "id": "wibg0qq3",
              "title": "Total Revenue (Last 30 Days)",
              "chartType": "kpi",
              "sql": "SELECT SUM(amount) AS total_revenue FROM orders WHERE ...",
              "columns": ["total_revenue"],
              "rows": [{"total_revenue": "1982.79"}],
              "palette": "default",
              "annotations": []
            }
          ],
          "layout": [
            { "i": "wibg0qq3", "x": 0, "y": 0, "w": 3, "h": 2, "minW": 2, "minH": 1 }
          ]
        }
      ]
    }
  ],
  "globalFilters": { "dateColumn": "", "range": "all_time" },
  "annotations": []
}
```

### File Persistence

Dashboards are stored as JSON on disk at:
```
backend/.data/user_data/{sha256_prefix}/dashboards.json
```

All writes use atomic write-then-rename for crash safety. A `threading.Lock()` prevents concurrent file corruption. There is no application database — this is intentional for simplicity but has known scaling limits (see PROJECT_JOURNAL.md §8).

---

## 3. Design System

### tokens.js — Single Source of Truth

Every dashboard component imports `TOKENS` from `tokens.js`. No raw hex values appear in dashboard components.

#### Background Layers
| Token | Value | Usage |
|-------|-------|-------|
| `bg.deep` | `#050506` | Page background, export canvas |
| `bg.base` | `#0a0a0c` | Sidebar background |
| `bg.elevated` | `#111114` | Cards, tiles, modals, inputs |
| `bg.surface` | `#161619` | Secondary surfaces, badges |
| `bg.hover` | `#1c1c20` | Hover states on interactive elements |

#### Border System
| Token | Value | Usage |
|-------|-------|-------|
| `border.default` | `rgba(255,255,255,0.06)` | Default borders (nearly invisible) |
| `border.hover` | `rgba(255,255,255,0.12)` | Hover/focus borders (subtle reveal) |

#### Typography Colors
| Token | Value | Usage |
|-------|-------|-------|
| `text.primary` | `#EDEDEF` | Titles, KPI values, primary content |
| `text.secondary` | `#8A8F98` | Labels, descriptions, button text |
| `text.muted` | `#5C5F66` | Placeholder text, disabled states, drag handles |

#### Accent Colors
| Token | Value | Usage |
|-------|-------|-------|
| `accent` | `#2563EB` | Primary blue — active tabs, buttons, focus rings |
| `accentLight` | `#3B82F6` | Lighter blue — active tab text, links |
| `accentGlow` | `rgba(37,99,235,0.15)` | Glassmorphism glow on active elements |
| `success` | `#22C55E` | Save confirmation, positive trends |
| `warning` | `#F59E0B` | Saving indicator, caution states |
| `danger` | `#EF4444` | Delete buttons, negative trends, errors |

#### Radius & Transitions
| Token | Value |
|-------|-------|
| `radius.sm` | `6px` |
| `radius.md` | `10px` |
| `radius.lg` | `14px` (tiles, cards) |
| `radius.xl` | `18px` (modals) |
| `transition` | `200ms cubic-bezier(0.16, 1, 0.3, 1)` |

The cubic-bezier curve `(0.16, 1, 0.3, 1)` is an aggressive ease-out — elements snap into place quickly then coast to a stop. This gives the UI a responsive, tactile feel.

### KPI Accent Gradients

Six CSS linear gradients cycle across KPI cards based on their index:

| Index | Gradient |
|-------|----------|
| 0 | Blue → Light Blue |
| 1 | Green → Light Green |
| 2 | Purple → Light Purple |
| 3 | Orange → Light Orange |
| 4 | Red → Light Red |
| 5 | Cyan → Light Cyan |

Each KPI card shows a 3px accent bar at the top using `KPI_ACCENTS[index % 6]`.

### Chart Color Palettes

Six named palettes, each with 8 colors:

| Palette | Character | First Color |
|---------|-----------|-------------|
| `default` | Corporate blue-first | `#2563EB` |
| `ocean` | Cool blues and teals | `#0EA5E9` |
| `sunset` | Warm oranges and reds | `#F97316` |
| `forest` | Natural greens and teals | `#22C55E` |
| `mono` | Grayscale | `#E5E7EB` |
| `colorblind` | WCAG-accessible | `#0072B2` |

### Typography

| Usage | Font | Weight | Size |
|-------|------|--------|------|
| Page headings | Poppins | 700 | 22px |
| Section headers | System | 600 | 13px (uppercase, tracked) |
| Tile titles | System | 600 | 13px |
| Tile subtitles | System | 400 | 11px |
| KPI values | System | 700 | 32px (tabular-nums) |
| Body/labels | System | 400 | 14px |
| Code/SQL | JetBrains Mono | 400 | 14px |
| Badges/chips | System | 500 | 10-11px |

### Glassmorphism

The CommandBar is the most prominent glassmorphism element:
```css
backdrop-filter: blur(20px) saturate(1.4);
background: rgba(5, 5, 6, 0.82);
```

Tiles use a simpler elevated surface (`bg.elevated` = `#111114`) with a 1px border at 6% white opacity. The effect is "floating dark glass" — surfaces feel layered without the heavy blur performance cost on every tile.

---

## 4. UI Anatomy — Component by Component

### DashboardHeader

**File:** `frontend/src/components/dashboard/DashboardHeader.jsx` (65 lines)

The header sits between the CommandBar and TabBar. It shows:
- **Editable dashboard name** — rendered as a plain `<span>` that becomes an `<input>` on click. The edit icon (pencil) fades in on hover. Changes trigger debounced auto-save.
- **Save status** — an amber pulsing dot + "Saving..." during save, or a green checkmark + relative timestamp ("Updated 2 min ago") when idle.

### TabBar

**File:** `frontend/src/components/dashboard/TabBar.jsx` (50 lines)

A horizontal row of tabs with:
- **Active indicator** — 2px blue bottom border on the active tab, text switches from `text.muted` to `accentLight`
- **Double-click rename** — inline input replaces tab name, commits on Enter/blur
- **Delete button** — small X icon appears on hover, only on the active tab, only if 2+ tabs exist
- **"+ Add tab"** — dashed-border button at the end

The entire bar has a bottom border separating it from the content below. Tabs use `select-none` to prevent text selection during rapid clicking.

### CommandBar

**File:** `frontend/src/components/dashboard/CommandBar.jsx` (81 lines)

A sticky toolbar at the top of the dashboard (z-index: 50) with glassmorphic blur background. It has two modes:

**Collapsed (default):** A search-like input placeholder ("Ask AI to add a chart, or search tiles...") with a `Ctrl+K` shortcut badge. Clicking anywhere opens the expanded mode.

**Expanded (Ctrl+K):** A real form input that accepts natural language commands. Submitting sends the text to the AI command handler, which generates tiles from the prompt.

**Action buttons (right side):**
- **+ Add Tile** — adds a blank tile to the first section
- **Export** — opens the export modal
- **Settings** (gear icon) — placeholder for future settings panel

### Section

**File:** `frontend/src/components/dashboard/Section.jsx` (95 lines)

Each section is a collapsible container with:
- **Header row:** Collapse arrow (rotates 90° on collapse), section name (uppercase, 13px, bold), horizontal divider line, tile count badge, hover actions (add tile, edit section)
- **Grid body:** `react-grid-layout` with 12 columns, 80px row height, 12px gaps. Tiles are draggable (via `.cursor-grab` handle) and resizable.
- **Empty state:** A dashed-border box with "+ Add a tile to this section" centered text

The grid uses a `ResizeObserver` to measure the container width, passing it to `GridLayout`. The grid doesn't render until `width > 0` (prevents layout flash on mount).

### TileWrapper

**File:** `frontend/src/components/dashboard/TileWrapper.jsx` (164 lines)

The shell around every non-KPI tile. Rounded corners (14px), elevated background, 1px border.

**Three visual zones:**
1. **Drag handle** (top-left) — three horizontal lines, opacity 0→100 on group hover
2. **Header** — tile title + subtitle on the left, action toolbar on the right (appears on hover)
3. **Chart body** — fills remaining space (min 160px height)

**Toolbar actions (left to right):**
- Comment count badge (if annotations exist)
- Refresh (re-execute SQL)
- Edit SQL (opens TileEditor in SQL mode)
- Edit (opens full TileEditor)
- Chart type picker (inline 2-column dropdown with 10 chart types)
- Delete (red, always last)

**Chart body states:**
- **Has data** (`rows.length > 0`): Renders `ResultsChart` with the tile's `chartType`, `palette`, and `measures`
- **Has SQL but no data** (`sql` exists, no `rows`): Spinning loader + "Loading data..." — indicates auto-refresh in progress
- **No SQL**: Empty state icon + "No data" message

### KPICard

**File:** `frontend/src/components/dashboard/KPICard.jsx` (127 lines)

A single-metric card with:
- **3px accent gradient bar** at the top (cycles through 6 colors by index)
- **Metric label** — the tile title, `text-sm font-semibold`, muted color
- **Main value** — `32px bold`, tabular-nums for alignment, formatted:
  - ≥1M → "1.23M"
  - ≥1K → "1.2K"
  - Decimal → one decimal place
  - null → "--"
- **Trend indicator** — green up-arrow or red down-arrow badge with percentage, calculated from the last two data rows
- **Sparkline** — 80×40px Recharts BarChart in the bottom-right, previous values at 40% opacity, current at 100%. Only shown if 3+ data points.

KPI cards use the **twin-query system** — when global filters are applied, the backend executes two queries (current period + previous period) and returns both rows for trend calculation.

### TileEditor

**File:** `frontend/src/components/dashboard/TileEditor.jsx` (405 lines)

A scrollable modal (600px max-width, 85vh max-height) for editing tile properties. Sections separated by horizontal borders:

1. **Title & Subtitle** — text inputs
2. **Chart Type** — 4-column button grid with 10 types (bar, line, area, pie, donut, table, kpi, stacked_bar, horizontal_bar, scatter). Active type highlighted with blue border + glow.
3. **Measures** — checkboxes for each column, dropdown for primary measure
4. **Filters** — date range inputs, custom WHERE clause textarea
5. **SQL Editor** — monospace textarea (JetBrains Mono 14px) with "Run Query" button (green). Shows query errors inline.
6. **Color Palette** — vertical list of 6 palettes, each showing name + 8 color swatches (18px circles). Selected palette has blue border + glow.
7. **Tile Notes** — display existing annotations with author initials in gradient circles, input for new notes
8. **Delete** — full-width red button at the bottom

### GlobalFilterBar

**File:** `frontend/src/components/dashboard/GlobalFilterBar.jsx` (312 lines)

A thin bar below the TabBar with:
- **Filter icon** — turns blue when filters are active
- **Date column input** — autocomplete from schema columns (loaded lazily via `api.getTables`)
- **Range selector** — dropdown with 12 options: All Time, Today, Yesterday, This/Last Week, This/Last Month, This/Last Quarter, This/Last Year, Custom Range
- **Custom date range** — two date inputs (shown only when "Custom Range" selected)
- **Field filter chips** — active filters shown as `column operator value` pills with remove (×) button
- **"+ Add Filter" popover** — column search, operator dropdown (=, !=, >, <, >=, <=, LIKE, IN), value input
- **Apply button** — sends all filters to backend, triggers refresh of all tiles in active tab
- **Clear button** — resets all filters (only visible when filters are active)

### NotesPanel

**File:** `frontend/src/components/dashboard/NotesPanel.jsx` (67 lines)

Positioned at the bottom of the dashboard. Shows:
- **Existing annotations** — author initials in a gradient circle (blue→purple), name + relative time, annotation text
- **Input row** — "You" badge, text input with @mention placeholder, send button (appears when text is non-empty)

### ExportModal

**File:** `frontend/src/components/dashboard/ExportModal.jsx` (84 lines)

A modal with format selection (PDF or PNG). Export flow:
1. `html2canvas` captures the dashboard DOM at 2× scale with `bg.deep` background
2. **PNG**: Direct canvas download
3. **PDF**: `jsPDF` creates document, calculates orientation from aspect ratio, adds canvas as image

---

## 5. The Dashboard Builder Page

**File:** `frontend/src/pages/DashboardBuilder.jsx` (~1270 lines)

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ [Fixed 3D Background — 8% opacity, pointer-events: none]│
├────────────┬─────────────────────────────────────────────┤
│            │ CommandBar [sticky top-0, z-50, glassmorphic]│
│  Sidebar   ├─────────────────────────────────────────────┤
│  (280px)   │ DashboardHeader [name, save status]         │
│            ├─────────────────────────────────────────────┤
│ Dashboard  │ TabBar [tab1 | tab2 | tab3 | + Add tab]    │
│   list     ├─────────────────────────────────────────────┤
│            │ GlobalFilterBar [date range, field filters]  │
│ + Create   ├─────────────────────────────────────────────┤
│            │ Section: "Core KPIs"            [4 tiles]   │
│            │ ┌──────┬──────┬──────┬──────┐               │
│            │ │ KPI  │ KPI  │ KPI  │ KPI  │               │
│            │ └──────┴──────┴──────┴──────┘               │
│            │                                             │
│            │ Section: "Daily Trend"          [2 tiles]   │
│            │ ┌─────────────┬─────────────┐               │
│            │ │ Line Chart  │ Area Chart  │               │
│            │ └─────────────┴─────────────┘               │
│            │                                             │
│            │ [+ Add Section]                             │
│            │                                             │
│            │ NotesPanel [annotations]                    │
├────────────┴─────────────────────────────────────────────┤
│ [TileEditor Modal]  [ExportModal]  [Undo Toast]         │
└──────────────────────────────────────────────────────────┘
```

### State Management

All state lives in React `useState` hooks within DashboardBuilder:

| State | Type | Purpose |
|-------|------|---------|
| `dashboards` | `Dashboard[]` | Summary list for sidebar |
| `activeDashboard` | `Dashboard \| null` | Full object with all tabs/sections/tiles |
| `activeTabId` | `string \| null` | Currently visible tab |
| `editingTile` | `Tile \| null` | Tile being edited in TileEditor |
| `undoStack` | `UndoEntry[]` | Recently deleted tiles (5s restore window) |
| `globalFilters` | `object` | Active date range + field filters |
| `saving` | `boolean` | Auto-save in progress |

To avoid stale closure bugs (caused by `useCallback` capturing outdated `activeDashboard`), all handlers access the latest state via `useRef`:
```javascript
const dashboardRef = useRef(activeDashboard);
dashboardRef.current = activeDashboard;

const activeTabIdRef = useRef(activeTabId);
activeTabIdRef.current = activeTabId;
```

### Auto-Refresh System

On dashboard load, a `useEffect` scans all tiles across all tabs. Any tile with `sql` but empty/missing `rows` is queued for refresh. Tiles are refreshed sequentially (to avoid rate-limiting the backend), and each successful refresh updates the tile in-place using a functional state setter:

```javascript
setActiveDashboard(prev => ({
  ...prev,
  tabs: prev.tabs.map(tab => ({
    ...tab,
    sections: tab.sections.map(sec => ({
      ...sec,
      tiles: sec.tiles.map(t => t.id === tileId ? { ...t, ...res } : t),
    })),
  })),
}));
```

The effect has a cancellation flag — navigating away mid-refresh stops further API calls.

### Auto-Save

An 800ms debounced save fires after any structural change (layout, name, section edits). It sends the full dashboard state (name, description, tabs, annotations) to `PUT /api/dashboards/{id}`.

### Undo System

When a tile is deleted:
1. The tile object and its section ID are captured
2. An undo entry is pushed to `undoStack`
3. A toast with spring animation slides in from the right
4. After 5 seconds, the entry auto-expires
5. Clicking "Undo" restores the previous dashboard state via `PUT /api/dashboards/{id}`

---

## 6. AI Dashboard Generation Pipeline

### Trigger (Chat.jsx)

When the user types something matching the dashboard regex in the chat, the system:
1. Shows preference chips (focus, timeRange, audience)
2. User selects preferences (or skips)
3. Calls `POST /api/queries/generate-dashboard` with the question, connection ID, and preferences

### Backend (query_engine.py)

**Step 1 — Context Assembly**
- User question is embedded and used for ChromaDB RAG retrieval (`top_k=15`)
- Retrieved schema chunks (table names, column types, sample values) are injected into the prompt
- Database dialect is detected for SQL syntax rules
- Preferences are appended to the request text

**Step 2 — Claude Call**
- System prompt instructs Claude to generate RFC 8259 JSON with the `{ tabs > sections > tiles }` structure
- Each tile must include: `title`, `subtitle`, `question`, `sql`, `chartType`
- Max tokens: 16,384 (high ceiling for complex dashboards)
- Model: tries fallback model first (Sonnet — smarter), falls back to primary (Haiku) on rate limit

**Step 3 — JSON Parsing**
- Direct parse attempt
- If that fails: repair pass (strip markdown fences, fix trailing commas, close unclosed brackets, convert single quotes)
- If still fails: extract outermost JSON object by brace matching
- If all fail: raise error

**Step 4 — SQL Execution**
For each tile (up to 8 per section):
1. Validate SQL through 6-layer validator (multi-statement check → keyword blocklist → sqlglot AST → SELECT-only → LIMIT enforcement → dangerous function detection)
2. Execute against user's database via `DatabaseConnector`
3. Apply PII masking (`mask_dataframe()`)
4. Serialize Decimal → float, datetime → ISO string
5. Cap at 100 rows

**Step 5 — Response**
Return the full dashboard structure with populated `columns` and `rows` per tile.

### Frontend Save (Chat.jsx)

1. Create a new dashboard: `POST /api/dashboards/`
2. Generate layout positions for each tile (KPIs: 3×2, charts: 6×4, 12-column grid)
3. Save everything: `PUT /api/dashboards/{id}` with the full tab structure including tiles with data
4. Navigate to `/analytics`
5. Show success message in chat

---

## 7. Backend: Routes, Storage, Refresh

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/dashboards/` | List all dashboards (summary) |
| `POST` | `/api/dashboards/` | Create new dashboard |
| `GET` | `/api/dashboards/{id}` | Load full dashboard with all data |
| `PUT` | `/api/dashboards/{id}` | Update dashboard (name, tabs, filters, etc.) |
| `DELETE` | `/api/dashboards/{id}` | Delete dashboard |
| `POST` | `/api/dashboards/{id}/tabs` | Add new tab |
| `DELETE` | `/api/dashboards/{id}/tabs/{tabId}` | Remove tab |
| `POST` | `/api/dashboards/{id}/tabs/{tabId}/sections` | Add section to tab |
| `DELETE` | `/api/dashboards/{id}/tabs/{tabId}/sections/{secId}` | Remove section |
| `POST` | `/api/dashboards/{id}/tabs/{tabId}/sections/{secId}/tiles` | Add tile |
| `PUT` | `/api/dashboards/{id}/tiles/{tileId}` | Update tile properties |
| `DELETE` | `/api/dashboards/{id}/tiles/{tileId}` | Remove tile |
| `POST` | `/api/dashboards/{id}/tiles/{tileId}/refresh` | Re-execute tile SQL |
| `POST` | `/api/dashboards/{id}/annotations` | Add dashboard annotation |
| `POST` | `/api/dashboards/{id}/tiles/{tileId}/annotations` | Add tile annotation |

### Tile Refresh (The Most Complex Endpoint)

`POST /api/dashboards/{id}/tiles/{tileId}/refresh` does:

1. **Load tile** — find the tile in the dashboard JSON
2. **Resolve connection** — use provided `conn_id` or fall back to any active connection
3. **Validate SQL** — run through SQLValidator
4. **Apply date filters** — if `filters.dateColumn` and `filters.range` are set:
   - Wrap the original SQL in a subquery: `SELECT * FROM ({original_sql}) sq_wrap WHERE {dateCol} >= '{start}' AND {dateCol} <= '{end}'`
   - Supports 11 predefined ranges (today, yesterday, this/last week/month/quarter/year)
5. **KPI twin-query** — if `chartType == "kpi"` and filters are active:
   - Execute current period query
   - Execute previous period query
   - Return both rows (for trend calculation)
6. **Apply field filters** — additional WHERE clauses for custom field filters
7. **Execute** — run the final SQL, mask PII, serialize, cap at 100 rows
8. **Persist** — save `columns` and `rows` back to the tile in dashboards.json
9. **Return** — `{ columns, rows, rowCount }`

### Storage Functions (user_storage.py)

| Function | Purpose |
|----------|---------|
| `create_dashboard(email, name)` | Creates with default "Overview" tab + "General" section |
| `load_dashboard(email, id)` | Loads full dashboard, auto-migrates old flat format |
| `update_dashboard(email, id, updates)` | Partial update (name, description, tabs, annotations) |
| `add_tile_to_section(...)` | Creates tile with auto-computed layout position |
| `update_tile(email, dash_id, tile_id, updates)` | Updates tile properties |
| `migrate_dashboard_if_needed(dashboard)` | Converts flat tile arrays to hierarchical structure |

**Auto-layout computation:**
New tiles are placed in a 2-column stagger pattern (left column x=0, right column x=6, each 6 units wide, 4 units tall). KPI tiles are smaller (3×2).

---

## 8. Auto-Visualization Engine

**File:** `frontend/src/components/ResultsChart.jsx`

When a tile has data but no explicit chart type preference, the auto-viz algorithm scores each chart type:

### Data Analysis Phase
- Count numeric vs. dimension columns
- Detect date-like dimensions (YYYY-MM-DD patterns)
- Check if all values are positive (required for pie/donut)
- Calculate average label length (long labels → horizontal bars)
- Measure value variance (high variance → proportional charts like pie)

### Scoring (examples)
| Chart Type | Bonus Conditions |
|-----------|-----------------|
| **Bar** | +20 if 2-20 rows, +15 if 2+ metrics |
| **Line** | +35 if date-like dimension, +15 if 5+ rows |
| **Pie** | +40 if 2-8 rows AND all positive, +10 if high variance |
| **KPI** | +50 if exactly 1 row and 1 numeric column |
| **Stacked Bar** | +35 if 2+ metrics, -50 if only 1 metric |
| **Horizontal Bar** | +25 if average label length > 12 chars |
| **Scatter** | +30 if 20+ rows and 2+ numeric columns |

Minimum score of 30 required. Highest scorer becomes the default chart type.

---

## 9. Current Feature Set

### Dashboard Management
- Create, rename, delete dashboards
- Sidebar navigation between dashboards
- Auto-save on every structural change

### Organization
- Multi-tab support (e.g., "Revenue", "Marketing", "Customer Segments")
- Collapsible sections within each tab
- Drag-and-drop tile reordering (react-grid-layout)
- Tile resizing

### Tile Types
- 10 chart types: bar, line, area, pie, donut, table, kpi, stacked_bar, horizontal_bar, scatter
- Inline chart type switching (dropdown picker on each tile)
- 6 color palettes

### AI Generation
- Natural language dashboard creation from chat
- Preference-based generation (focus, time range, audience)
- AI command bar (Ctrl+K) for adding tiles to existing dashboards

### Filters
- Global date range filters (11 presets + custom range)
- Field-level filters with 8 operators
- Filters applied across all tiles in the active tab

### Data
- Auto-refresh: tiles with SQL but no data are refreshed on load
- Manual refresh per tile
- SQL editing in TileEditor with live execution
- PII masking on all results

### Collaboration
- Dashboard-level annotations
- Tile-level annotations
- Author tracking with initials

### Export
- PDF export (auto-orientation based on aspect ratio)
- PNG export (2× resolution)

### UX
- Undo tile deletion (5-second window)
- Keyboard shortcuts (Ctrl+K for command bar, Esc to close modals)
- Loading states for tiles being refreshed
- Debounced auto-save with visual feedback

---

## 10. UI/UX Improvement Roadmap

### High Impact — Near Term

**1. Drag-and-Drop Between Sections**
Currently, tiles can only be reordered within a section. Allow dragging tiles from one section to another, or even between tabs.

**2. Tile Templates**
Preset tile configurations: "Revenue KPI", "Time Series Trend", "Top N Table", "Pie Breakdown". Users pick a template, connect it to a column, done.

**3. Dashboard Templates**
Pre-built dashboard layouts: "Executive Summary", "Sales Pipeline", "Marketing Attribution", "Customer Health". Populates tabs, sections, and tile placeholders.

**4. Real-Time Collaborative Editing**
Multiple users editing the same dashboard simultaneously. Show cursor presence, live tile updates, conflict resolution.

**5. Responsive Mobile Layout**
The current 12-column grid doesn't adapt to mobile. Add breakpoints: 1 column on mobile, 2 on tablet, full grid on desktop.

**6. Tile Loading Skeletons**
Replace the spinner with animated skeleton placeholders that match the expected chart shape (bar skeleton, line skeleton, KPI skeleton).

**7. Dashboard Search**
Full-text search across dashboard names, tile titles, and SQL content. Highlight matching tiles and scroll to them.

**8. Breadcrumb Navigation**
Show `Dashboard > Tab > Section` breadcrumbs when scrolled deep into a dashboard.

### Medium Impact — Medium Term

**9. Custom CSS/Theming**
Let users customize: accent color, background darkness, font size, tile padding. Store per-dashboard or per-user.

**10. Tile Linking / Cross-Filtering**
Click a bar in one chart → filter all other tiles by that value. True BI-style cross-filtering.

**11. Drill-Down**
Click a data point → expand into a detailed view (new SQL with WHERE clause for that value).

**12. Conditional Formatting**
KPI cards change color based on value thresholds (e.g., red if revenue < target, green if above).

**13. Auto-Refresh Schedule**
Set tiles to refresh every N minutes automatically. Show last-refreshed timestamp.

**14. Dashboard Versioning**
Save snapshots of dashboard state. Roll back to a previous version. Diff between versions.

**15. Tile Comments Thread**
Expand tile annotations into a threaded discussion (reply, resolve, tag users).

**16. Keyboard Navigation**
Arrow keys to move between tiles, Enter to open editor, Delete to remove, Tab to cycle sections.

### Lower Impact — Long Term

**17. Custom Chart Types**
Allow users to upload Vega-Lite or ECharts specs for custom visualizations.

**18. Embedded Dashboards**
Generate a public URL or iframe embed code for read-only dashboard sharing.

**19. Scheduled Email Reports**
Email dashboard screenshots on a schedule (daily, weekly, monthly).

**20. Natural Language Filters**
Type "show me last quarter's data" into the filter bar instead of selecting from dropdowns.

---

## 11. More Freedom for Users

### Give Users Control Over Everything

**SQL Editing Everywhere**
Currently, SQL editing is buried in the TileEditor modal. Surface it:
- Double-click any tile → inline SQL editor overlay
- Edit SQL directly, hit Ctrl+Enter to execute
- See results update in real time

**Freeform Layout**
Currently, tiles snap to a 12-column grid. Add a "freeform" mode:
- Pixel-perfect positioning
- Arbitrary sizes
- Overlapping allowed (for layered dashboards)
- Canvas-style zoom and pan

**Custom Calculations**
Let users create derived metrics:
- "Revenue per Customer" = SUM(revenue) / COUNT(DISTINCT customer_id)
- Define once, use across tiles
- Auto-update when source data refreshes

**Data Blending**
Combine data from multiple queries into one chart:
- Query A returns monthly revenue
- Query B returns monthly costs
- Chart shows both as overlaid lines
- No need for SQL UNION — the frontend blends the datasets

**Annotations on Data Points**
Click a specific bar or data point → add a note explaining it ("This spike was from the Black Friday campaign"). Notes render as small markers on the chart.

**Dashboard Variables**
Define variables (e.g., `$target_revenue = 100000`) that can be referenced in SQL:
```sql
SELECT revenue, revenue - $target_revenue AS gap FROM monthly_revenue
```
Change the variable → all tiles using it refresh automatically.

**Tile Cloning**
Right-click a tile → "Duplicate" → creates an identical copy. Then modify the clone (change chart type, adjust SQL, move to another section).

**Section Templates**
Save a section configuration as a template. Apply it to other dashboards or tabs. Share templates between users.

**Full-Screen Tile View**
Click a tile → expands to full screen with:
- Larger chart
- Full data table below
- SQL query
- Annotation thread
- Export options
- Drill-down controls

**Dashboard Sharing with Permissions**
- View-only link (no login required)
- Edit access (login required)
- Admin access (can delete/restructure)
- Expiring links

**Undo/Redo Stack**
Full undo/redo for all dashboard operations (not just tile deletion):
- Layout changes
- Section additions/removals
- Tab operations
- Filter changes
- Ctrl+Z / Ctrl+Shift+Z

---

*This document was generated from a comprehensive analysis of the QueryCopilot V1 codebase as of April 2026. The dashboard system spans ~4,000 lines of frontend code across 12 components, ~700 lines of backend routes and storage, and ~400 lines of AI generation logic.*
