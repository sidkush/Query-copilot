# QueryCopilot Dashboard Redesign — Development Journal

**Date:** 2026-04-01
**Scope:** Complete dashboard system overhaul + scroll-to-top bug fix
**Final Stats:** 22 files changed, 2,890 insertions, 866 deletions across 11 commits

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Methodology & Approach](#2-methodology--approach)
3. [Phase 1: Bug Fix — Scroll-to-Top Button](#3-phase-1-bug-fix--scroll-to-top-button)
4. [Phase 2: Idea & Planning — Dashboard Redesign](#4-phase-2-idea--planning--dashboard-redesign)
5. [Phase 3: Implementation — 11-Task Execution](#5-phase-3-implementation--11-task-execution)
6. [Challenges & Resolutions](#6-challenges--resolutions)
7. [Subagent Coordination Issues](#7-subagent-coordination-issues)
8. [Architecture Decisions & Trade-offs](#8-architecture-decisions--trade-offs)
9. [Known Bottlenecks & Future Breakpoints](#9-known-bottlenecks--future-breakpoints)
10. [Scaling Roadmap](#10-scaling-roadmap)

---

## 1. Executive Summary

Rebuilt the QueryCopilot dashboard from a flat, single-page tile grid into a professional corporate-grade analytics platform with:

- **Hierarchical data model**: Dashboard > Tabs > Sections > Tiles + Annotations
- **AI-guided generation**: Chat-based dashboard creation with preference chips (focus, time range, audience)
- **Full-power editing**: 12 chart types, SQL editor, measure selection, filters, palette picker
- **Drag-drop + resize**: react-grid-layout per section with auto-layout computation
- **Collaborative annotations**: Dashboard-level notes + tile-level comments
- **Static export**: PDF/PNG via html2canvas + jsPDF
- **Professional design system**: OLED dark theme with Inter + JetBrains Mono typography

Also fixed a persistent scroll-to-top button visibility bug caused by CSS containing block behavior.

---

## 2. Methodology & Approach

### Process Flow

```
User Request
    |
    v
Brainstorming (superpowers:brainstorming skill)
    |-- Explored project context (files, docs, commits)
    |-- Visual companion (browser-based mockup server)
    |-- 8 clarifying questions (one at a time, chip-based)
    |-- 3 approach proposals (A: incremental, B: new framework, C: headless)
    |-- Section-by-section design approval
    |
    v
Design Spec (docs/superpowers/specs/2026-04-01-dashboard-redesign-design.md)
    |
    v
Implementation Plan (docs/superpowers/plans/2026-04-01-dashboard-redesign.md)
    |-- 11 tasks with full code, exact file paths, commit messages
    |-- Byte-level precision on line numbers to modify
    |
    v
Subagent-Driven Development (superpowers:subagent-driven-development)
    |-- Fresh subagent per task (isolated context)
    |-- Parallel execution where tasks are independent
    |-- Build verification after all tasks
    |-- Integration fix loop for build errors
```

### Why Subagent-Driven Development

The plan had 11 tasks touching 22 files across backend and frontend. Running them in a single context window would have caused:
- Context pollution (agent confused by earlier task details)
- Token exhaustion (plan alone was 1,700+ lines)
- Error cascading (one mistake affecting all subsequent tasks)

Instead, each subagent received only the code it needed to write, the exact file paths, and the surrounding context. This kept each task focused and fast.

### Execution Strategy

- **Tasks 1-3** (backend): Sequential — each depended on the previous
- **Tasks 4-5** (frontend foundation): Sequential — tokens.js needed before components
- **Task 6** (DashboardBuilder rewrite): Depended on Tasks 4-5
- **Tasks 7-8** (TileEditor + ExportModal): Parallel — independent components
- **Task 9** (Chat enhancement): Independent of Tasks 7-8
- **Task 10** (fonts/CSS): Independent — done while Tasks 7-8 ran in background
- **Task 11** (integration testing): Build verification, caught WidthProvider issue

---

## 3. Phase 1: Bug Fix — Scroll-to-Top Button

### Problem
The scroll-to-top button on the Landing page was invisible after scrolling. It only appeared after reaching the very bottom of the page, and even then was unreliable.

### Investigation

**Attempt 1:** Lowered the scroll threshold from 300px to 100px. **Result:** Did not fix it.

**Root Cause Discovery:** The `PageTransition` component wraps all pages in a Framer Motion `motion.div` with:
```css
willChange: "opacity, transform, filter"
```

This CSS property creates a **new containing block** for `position: fixed` elements. Instead of being positioned relative to the viewport, the scroll-to-top button was positioned relative to the PageTransition wrapper — effectively trapped inside the scrolling container.

This is a well-known but subtle CSS behavior. When any ancestor has `willChange`, `transform`, or `filter`, all `position: fixed` descendants lose their viewport anchoring.

### Resolution
Wrapped the scroll-to-top button in a **React portal** to render it outside the PageTransition wrapper entirely:

```javascript
import { createPortal } from "react-dom";

{createPortal(
  <button className={`scroll-top-btn ${showScrollTop ? "visible" : ""}`}>...</button>,
  document.body
)}
```

### Lesson for Future
Any time `position: fixed` elements misbehave, check ancestor elements for `willChange`, `transform`, or `filter` properties. React portals are the clean escape hatch.

---

## 4. Phase 2: Idea & Planning — Dashboard Redesign

### Brainstorming Decisions

| Question | Options Considered | Decision | Reasoning |
|----------|-------------------|----------|-----------|
| Database types | SQL-only, mixed, NoSQL | Mixed (both) | User has SQL + NoSQL connections |
| AI guidance | None, guided, autonomous | Guided questions | Balance between control and convenience |
| Tile customization | Read-only, basic, full-power | Full-power | Corporate users need SQL editing |
| Layout model | Flat grid, grouped, tabbed+sectioned | Tabbed + Sectioned | Scalable for 50+ tile dashboards |
| Annotations | None, notes, collaborative | Collaborative (future-ready) | Data model for multi-user, implement single-user |
| Sharing/Export | None, static, live | Static now + live infra | Export needed now, sharing can wait |

### Approach Selection

Three approaches were evaluated:

- **Approach A (Chosen):** Incremental enhancement on existing react-grid-layout + Recharts stack. Lowest risk, fastest delivery, no new dependencies beyond html2canvas/jspdf.
- **Approach B:** Migrate to AG Grid + ECharts. More powerful but requires relearning, migration risk, and license costs.
- **Approach C:** Headless dashboard engine with pluggable renderers. Over-engineered for current scale.

### Visual Companion

A browser-based mockup server was used during brainstorming to show layout options. The user reviewed two iterations:
- **v1** (dashboard-layout.html): Basic layout — user said "looks unprofessional"
- **v2** (dashboard-layout-v2.html): Redesigned with design system tokens, proper typography, glassmorphism toned down, accent bars on KPI cards — user approved: "looks perfect"

The approved mockup became the visual reference for all frontend implementation.

---

## 5. Phase 3: Implementation — 11-Task Execution

### Commit Timeline

| # | Commit | Files | Lines Changed | Duration |
|---|--------|-------|---------------|----------|
| 1 | `d4918de` feat: hierarchical dashboard storage | 1 | +240 | ~6 min |
| 2 | `0a4bf8c` feat: dashboard routes rewrite | 1 | +272 | ~1.5 min |
| 3 | `2d63c33` feat: enhanced dashboard generation | 2 | +218 | ~4.5 min |
| 4 | `367fd16` feat: design tokens + API layer | 5 | +293 | ~2 min (manual) |
| 5 | `b4dc50d` feat: dashboard sub-components | 7 | +454 | ~5.5 min |
| 6 | `e7fd3be` feat: DashboardBuilder rewrite | 1 | +1,101 | ~7.5 min |
| 7 | `634218d` feat: TileEditor modal | 1 | +405 | ~1.7 min (background) |
| 8 | `6bed027` feat: ExportModal | 1 | +83 | ~0.7 min (background) |
| 9 | `1f24015` feat: chat dashboard flow | 1 | +135 | ~8 min |
| 10 | `5b3e71a` feat: fonts + CSS | 2 | +5 | ~0.5 min (manual) |
| 11 | `8564595` fix: WidthProvider → useContainerWidth | 1 | +39/-28 | ~1 min (fix) |

### Files Created (10 new files)

```
frontend/src/components/dashboard/
  tokens.js          — Design system constants (44 lines)
  CommandBar.jsx     — AI command bar with Ctrl+K (80 lines)
  DashboardHeader.jsx — Editable title + auto-save status (64 lines)
  TabBar.jsx         — Tab navigation + rename/delete (50 lines)
  Section.jsx        — Collapsible section + grid layout (82 lines)
  KPICard.jsx        — Single-metric card with accent bar (39 lines)
  TileWrapper.jsx    — Tile chrome with hover toolbar (73 lines)
  TileEditor.jsx     — Full-power editing modal (405 lines)
  NotesPanel.jsx     — Annotations section (66 lines)
  ExportModal.jsx    — PDF/PNG export dialog (83 lines)
```

### Files Modified (12 files)

```
backend/
  user_storage.py         — Dashboard CRUD rewritten (lines 428-679)
  routers/dashboard_routes.py — Complete rewrite (109 → 265 lines)
  routers/query_routes.py — DashboardRequest + endpoint (lines 184-224)
  query_engine.py         — DASHBOARD_PROMPT + generate_dashboard (lines 248-396)

frontend/
  src/pages/DashboardBuilder.jsx — Complete rewrite (767 → 1,101 lines)
  src/pages/Chat.jsx             — +DashboardChips, updated handlers (lines 89-565)
  src/api.js                     — +15 new API functions (lines 230-263)
  src/store.js                   — +activeDashboardId state
  src/index.css                  — +react-grid-layout CSS imports
  index.html                     — +Inter + JetBrains Mono font links
  package.json                   — +html2canvas, +jspdf
```

---

## 6. Challenges & Resolutions

### Challenge 1: CSS Containing Block (Scroll-to-Top)

**Symptom:** `position: fixed` button invisible during scroll.
**Root cause:** Framer Motion's `willChange: "opacity, transform, filter"` on ancestor `motion.div` creates a new containing block.
**Resolution:** React portal to render outside the containing block.
**Time to diagnose:** 2 attempts. First attempt (lowering threshold) failed, prompting deeper investigation.

### Challenge 2: react-grid-layout API Breaking Change

**Symptom:** Build failed with `"WidthProvider" is not exported by "react-grid-layout"`.
**Root cause:** The installed version of react-grid-layout (v2+) removed `WidthProvider` and `Responsive` exports, replacing them with `useContainerWidth` hook and `GridLayout` component.
**Resolution:** Rewrote `Section.jsx` to use `useContainerWidth(containerRef)` + `GridLayout` instead of `WidthProvider(Responsive)`. Created a `SectionGrid` inner component that holds the ref and measures width.
**Impact:** Only caught at build time (Task 11). The plan was written assuming the old API because the v1 codebase already used `GridLayout` directly, but the plan's Section component used the v2 `Responsive` + `WidthProvider` pattern from documentation that referenced an older version.

### Challenge 3: Data Model Migration (Zero Downtime)

**Symptom:** Existing dashboards use flat `{ tiles: [], layout: [] }` format. New system expects `{ tabs: [{ sections: [{ tiles: [], layout: [] }] }] }`.
**Resolution:** `migrate_dashboard_if_needed()` function that:
1. Checks for `"tabs"` key — if present, already migrated
2. Wraps old tiles/layout into a default "Overview" tab with "General" section
3. Adds empty `annotations` and `sharing` fields
4. Removes old `tiles` and `layout` keys
5. Called automatically in `load_dashboard()`, saves migration result

**Trade-off:** Migration happens lazily (on load) rather than eagerly (batch migration script). This means the first load of an old dashboard is slightly slower, but avoids a migration script that could fail mid-way.

### Challenge 4: Hierarchical Tile SQL Execution

**Symptom:** Dashboard generation returns a nested `tabs > sections > tiles` structure. Each tile's SQL needs to be validated, executed, and PII-masked before returning to the frontend.
**Resolution:** Nested loop in `generate_dashboard()` that walks tabs → sections → tiles, executes each SQL, and replaces the tile's rows/columns in-place. Failed tiles are silently dropped (with warning log) rather than failing the entire dashboard.
**Risk:** If 12 tiles each query a slow database, generation could take 30+ seconds. No parallelism is used for tile SQL execution (see Bottlenecks section).

### Challenge 5: Frontend-Backend Interface Mismatch

**Symptom:** The old `api.generateDashboard()` returned `{ tiles: [...] }`. The new endpoint returns `{ tabs: [{ sections: [{ tiles: [...] }] }] }`. The Chat inline dashboard still expected flat tiles.
**Resolution:** `handleDashboardChipSelect` in Chat.jsx flattens the hierarchical response back to flat tiles+layout for the inline preview, while preserving the full `tabs` structure in the message for the "Open in Dashboard Builder" flow.

---

## 7. Subagent Coordination Issues

### Issue 1: Background Agent Git Permission Denied

**What happened:** Tasks 7 (TileEditor) and 8 (ExportModal) were dispatched as background agents. Both successfully wrote their files but were denied permission to run `git commit`.
**Impact:** Files existed on disk but were uncommitted. The orchestrator had to commit them manually.
**Root cause:** Background agents run with different permission context — the user approves tool calls for the main session but background agents may not inherit those approvals.
**Lesson:** For background agents, either (a) don't include git commands in their instructions, or (b) expect the orchestrator to handle commits after the agent completes.

### Issue 2: Plan Assumed Old react-grid-layout API

**What happened:** The implementation plan specified `import { Responsive, WidthProvider } from 'react-grid-layout'` which doesn't exist in the installed version. Five subagents wrote code using this pattern before the build caught it.
**Impact:** Required a post-implementation fix (commit `8564595`). Only the Section.jsx file was affected because other components don't directly use react-grid-layout.
**Root cause:** The plan was written based on react-grid-layout v1 documentation. The project had v2 installed. The brainstorming phase didn't verify the installed version's API surface.
**Lesson:** Before writing implementation plans, verify the actual installed version of key dependencies and their API. Run `node -e "console.log(Object.keys(require('package')))"` to check exports.

### Issue 3: Large Task Context for DashboardBuilder

**What happened:** Task 6 (DashboardBuilder rewrite) was the largest task — the subagent had to write ~600 lines of new code composing 7 sub-components with complex state management.
**Impact:** The subagent produced a working file but some handler implementations were more verbose than necessary.
**Lesson:** For files exceeding ~400 lines, consider splitting the task into smaller sub-tasks (e.g., "write state management hooks", "write JSX template", "wire up handlers").

---

## 8. Architecture Decisions & Trade-offs

### Decision: File-Based JSON Storage (Kept)

QueryCopilot uses file-based JSON storage (`dashboards.json` per user) rather than a database. We kept this architecture because:
- **Pro:** Zero deployment complexity, no database server needed
- **Pro:** Works for single-user and small-team scenarios
- **Con:** No concurrent write safety beyond Python's `threading.Lock`
- **Con:** Entire dashboard list loaded into memory on every operation
- **Con:** No query indexing — finding a tile by ID requires nested loop traversal

### Decision: Inline Styles with TOKENS (Chosen over CSS Modules)

All dashboard components use inline `style={{ }}` with TOKENS constants rather than Tailwind classes or CSS modules:
- **Pro:** Design token values are centralized in one file
- **Pro:** No CSS specificity battles
- **Pro:** Theme changes only require editing tokens.js
- **Con:** Slightly larger JSX, harder to scan visually
- **Con:** No hover/focus pseudo-class support without additional state management

### Decision: Lazy Migration (Chosen over Batch Migration)

Old dashboards are migrated to the new format on first load rather than via a one-time migration script:
- **Pro:** No migration script to maintain or debug
- **Pro:** Works even if new dashboards are created between deployments
- **Con:** First load of old dashboard has migration overhead
- **Con:** If migration logic has a bug, it could corrupt data on load

### Decision: Client-Side Export (Chosen over Server-Side)

PDF/PNG export uses html2canvas + jsPDF in the browser:
- **Pro:** No server-side rendering infrastructure needed
- **Pro:** Captures exactly what the user sees
- **Con:** Large library payload (html2canvas: 200KB, jsPDF: 400KB gzipped)
- **Con:** Cannot export dashboards the user isn't currently viewing
- **Con:** Canvas rendering may differ from actual rendering (fonts, shadows)

---

## 9. Known Bottlenecks & Future Breakpoints

### CRITICAL: File-Based Storage Will Not Scale

**Current state:** Every dashboard operation reads the entire `dashboards.json`, modifies it, and writes it back.

**Breakpoint triggers:**
- User with 50+ dashboards (each with 3 tabs, 5 sections, 40 tiles) — JSON file grows to several MB
- Concurrent requests (e.g., auto-save from two browser tabs) — race condition despite `threading.Lock`
- Any tile refresh or annotation triggers a full file write

**Mitigation path:**
1. **Short-term:** Split each dashboard into its own JSON file (`dashboard_{id}.json`) — eliminates loading all dashboards for single-dashboard operations
2. **Medium-term:** Move to SQLite with WAL mode — concurrent reads, single-writer safety, indexed queries
3. **Long-term:** PostgreSQL/Supabase with proper connection pooling

### HIGH: Sequential Tile SQL Execution

**Current state:** `generate_dashboard()` executes each tile's SQL one at a time. A 12-tile dashboard with 500ms queries takes 6+ seconds.

**Breakpoint triggers:**
- Slow database connections (cloud databases with network latency)
- Complex SQL queries generated by the AI
- Users requesting dashboards with many tiles

**Mitigation path:**
1. **Short-term:** Use `asyncio.gather()` or `concurrent.futures.ThreadPoolExecutor` to execute tile SQLs in parallel
2. **Medium-term:** Add a tile-level loading state so tiles render as they complete (streaming)
3. **Long-term:** Cache tile results with TTL, only re-execute on manual refresh

### HIGH: No Tile Data Caching

**Current state:** Tile data (rows/columns) is stored directly in the dashboard JSON file. Every tile refresh re-executes the full SQL query.

**Breakpoint triggers:**
- Large result sets (100 rows x 50 columns = significant JSON size)
- Frequent dashboard opens (each load sends the full tile data over the wire)
- Multiple users viewing the same dashboard (each gets their own copy)

**Mitigation path:**
1. **Short-term:** Store tile data in separate files from dashboard structure
2. **Medium-term:** Redis/Memcached cache with configurable TTL per tile
3. **Long-term:** Materialized views or data warehouse extracts

### MEDIUM: Auto-Save Thundering Herd

**Current state:** DashboardBuilder auto-saves on every layout change with 800ms debounce. Rapid drag operations could still generate many API calls.

**Breakpoint triggers:**
- User rapidly dragging/resizing multiple tiles
- Slow backend response causing save queue buildup
- Network instability causing retries

**Mitigation path:**
1. **Short-term:** Increase debounce to 1500ms, add save queue with deduplication
2. **Medium-term:** Optimistic UI — save in background, only alert on failure
3. **Long-term:** WebSocket-based sync instead of HTTP PUT for real-time collaboration

### MEDIUM: Client-Side Export Quality

**Current state:** html2canvas renders the DOM to a canvas element, which is then converted to PDF/PNG.

**Breakpoint triggers:**
- Recharts SVG charts may not render correctly in html2canvas
- Custom fonts (JetBrains Mono) may not load in canvas context
- Large dashboards may cause browser memory issues during canvas rendering
- Print-quality exports needed (300 DPI) would require huge canvas dimensions

**Mitigation path:**
1. **Short-term:** Add `scale: 2` (already done) for retina quality
2. **Medium-term:** Use Puppeteer/Playwright on server for pixel-perfect rendering
3. **Long-term:** Generate PDF server-side using a headless browser in a container

### MEDIUM: Chat Inline Dashboard Memory

**Current state:** When a dashboard is generated in chat, all tile data (rows, columns) is stored in the chat message state. Long chat sessions with multiple dashboard generations accumulate significant memory.

**Breakpoint triggers:**
- User generates 5+ dashboards in one chat session
- Each dashboard has 12 tiles with 100 rows each
- Chat history persisted to backend includes all tile data

**Mitigation path:**
1. **Short-term:** Collapse tile data after the user saves or dismisses the inline dashboard
2. **Medium-term:** Store tile data by reference (tile ID) rather than inline
3. **Long-term:** Paginated/virtualized chat message list

### LOW: Single-Threaded Annotation System

**Current state:** Annotations are stored inline in the dashboard JSON. Adding an annotation requires loading the entire dashboard, appending, and saving.

**Breakpoint triggers:**
- Multi-user scenarios (future live sharing feature)
- High-frequency annotation activity
- Annotation threading (replies, edits, deletions)

**Mitigation path:**
1. **Short-term:** Keep current approach (sufficient for single-user)
2. **Medium-term:** Separate annotations into their own storage with dashboard_id foreign key
3. **Long-term:** Real-time annotation sync via WebSocket + conflict resolution

### LOW: Bundle Size

**Current state:** Production bundle is 1.3MB (377KB gzipped). The largest contributors are jspdf (400KB), html2canvas (200KB), and recharts (150KB).

**Breakpoint triggers:**
- Mobile users on slow connections
- First-load performance targets below 3 seconds

**Mitigation path:**
1. **Short-term:** Dynamic import for jspdf and html2canvas (already done — they're loaded on demand)
2. **Medium-term:** Route-based code splitting (Dashboard page separate from Chat page)
3. **Long-term:** Consider lighter chart library (lightweight-charts, uPlot) for simple chart types

---

## 10. Scaling Roadmap

### Phase 1: Stability (Now → 2 weeks)

- [ ] End-to-end manual testing with real database connections
- [ ] Fix any rendering issues in TileEditor SQL execution flow
- [ ] Test migration path with existing user dashboards
- [ ] Verify export quality with different chart types
- [ ] Add error boundaries around dashboard components

### Phase 2: Performance (2-4 weeks)

- [ ] Parallel tile SQL execution in `generate_dashboard()`
- [ ] Split dashboard storage into individual files per dashboard
- [ ] Add loading skeletons for tile data fetching
- [ ] Implement tile-level refresh with optimistic UI
- [ ] Route-based code splitting for Dashboard vs Chat pages

### Phase 3: Collaboration Infrastructure (1-2 months)

- [ ] Implement `POST /api/dashboards/{id}/share` → read-only token generation
- [ ] Build `GET /api/shared/{token}` → public dashboard viewer (no auth)
- [ ] Add WebSocket layer for real-time dashboard updates
- [ ] Multi-user annotation with conflict resolution
- [ ] Dashboard versioning (snapshot history)

### Phase 4: Enterprise Features (2-4 months)

- [ ] Server-side PDF generation (Puppeteer in Docker)
- [ ] Scheduled dashboard email delivery (cron + PDF generation)
- [ ] Dashboard templates (save/load dashboard structures without data)
- [ ] Role-based access control on dashboards (viewer, editor, admin)
- [ ] Audit log for dashboard changes
- [ ] Migrate storage to SQLite or PostgreSQL

---

## Appendix: File Inventory

### New Files (10)
| File | Lines | Purpose |
|------|-------|---------|
| `frontend/src/components/dashboard/tokens.js` | 44 | Design system constants |
| `frontend/src/components/dashboard/CommandBar.jsx` | 80 | AI command bar (Ctrl+K) |
| `frontend/src/components/dashboard/DashboardHeader.jsx` | 64 | Editable title + save status |
| `frontend/src/components/dashboard/TabBar.jsx` | 50 | Tab navigation |
| `frontend/src/components/dashboard/Section.jsx` | 82 | Collapsible section with grid |
| `frontend/src/components/dashboard/KPICard.jsx` | 39 | Single-metric card |
| `frontend/src/components/dashboard/TileWrapper.jsx` | 73 | Tile container with toolbar |
| `frontend/src/components/dashboard/TileEditor.jsx` | 405 | Full-power editing modal |
| `frontend/src/components/dashboard/NotesPanel.jsx` | 66 | Annotations section |
| `frontend/src/components/dashboard/ExportModal.jsx` | 83 | PDF/PNG export dialog |

### Modified Files (12)
| File | Lines | Change |
|------|-------|--------|
| `backend/user_storage.py` | 679 | Dashboard CRUD → hierarchical model |
| `backend/routers/dashboard_routes.py` | 265 | Complete rewrite — tabs/sections/annotations/refresh |
| `backend/routers/query_routes.py` | 224 | +preferences in dashboard generation |
| `backend/query_engine.py` | 545 | New prompt + hierarchical generation |
| `frontend/src/pages/DashboardBuilder.jsx` | 1,101 | Complete rewrite |
| `frontend/src/pages/Chat.jsx` | 1,499 | +DashboardChips, updated handlers |
| `frontend/src/api.js` | +30 | 15 new API functions |
| `frontend/src/store.js` | +4 | activeDashboardId state |
| `frontend/src/index.css` | +2 | Grid layout CSS imports |
| `frontend/index.html` | +3 | Font preconnect + load |
| `frontend/package.json` | +2 | html2canvas, jspdf deps |
| `frontend/package-lock.json` | +213 | Lockfile update |

### Reference Documents
| File | Purpose |
|------|---------|
| `docs/superpowers/specs/2026-04-01-dashboard-redesign-design.md` | Approved design specification |
| `docs/superpowers/plans/2026-04-01-dashboard-redesign.md` | 11-task implementation plan |
| `.superpowers/brainstorm/438-1775073672/content/dashboard-layout-v2.html` | Approved visual mockup |
