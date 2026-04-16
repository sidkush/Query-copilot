# Analyst Pro — Tableau-Parity Freeform Workbook (Archetype #5)

**Date:** 2026-04-16
**Status:** Draft — awaiting user approval
**Branch:** `askdb-global-comp`
**Scope:** Replace existing `workbench` + `tableau` archetypes with a single Tableau-native freeform authoring workbook. Full feature parity including zone tree layout, tiled + floating coexistence, dashboard actions, sets, set actions, and dynamic zone visibility. Performance target: faster than Tableau across every hot path.
**Non-scope:** Archetypes 1-4 (Editorial Terminal / Liquid Analytics / Signal Lab / Kinetic Minimalism). Deferred to a separate spec + spawned task; blocked on this one shipping.

---

## 1. Context

AskDB currently ships 6 dashboard archetypes (briefing, workbench, ops, story, pitch, tableau-classic). Existing `tableau` archetype is a thin skin on `react-grid-layout` — it looks like Tableau but lacks the authoring freedom that makes Tableau Tableau. Investor demos that lead with our Tableau mode collapse the moment a user tries to drag a legend off a chart.

Research (see 2026-04-16 research log, section below) shows Tableau's authoring power comes from six interlocking subsystems, not one:

1. **Zone tree layout** — recursive horz/vert containers with proportional (0-100,000) coordinates, plus a floating layer with absolute pixel coords and z-order.
2. **Object taxonomy as first-class citizens** — worksheet, text, filter, legend, parameter, image, webpage, blank, container-horz, container-vert, navigation, extension — each independently placeable, styleable, and wired.
3. **Actions runtime** — filter / highlight / URL / go-to-sheet / change-parameter / change-set, bound source→target with trigger (hover/select/menu) and field mapping. Fires cascade re-queries.
4. **Sets** — fixed + dynamic (computed). IN/OUT partition exposed as calc field. Set actions mutate membership via UI interaction.
5. **Dynamic Zone Visibility** — boolean field or parameter controls zone render flag without reflow.
6. **Size sheet** — Automatic / Range / Fixed (Desktop, Laptop, iPad portrait/landscape, phone, custom). Dashboards resize proportionally via the 0-100,000 coordinate system.

Shipping only one or two of these produces a superficial clone that falls over in the first serious demo. We ship all six, and we ship them faster than Tableau.

## 2. Goals

### Functional parity

- Users can author dashboards with the same authoring freedom as Tableau Desktop: drag worksheets, text, filters, legends, parameters, images, webpages, blanks onto a canvas; tile or float; group into horz/vert containers; resize with proportional cascade; align/distribute; lock; group/ungroup; z-order.
- Dashboards support all six action types with the same binding flexibility and execution semantics.
- Sets work identically: fixed + dynamic, set actions, IN/OUT calc field.
- Dynamic Zone Visibility works on boolean fields or parameters.
- Size dropdown with all Tableau presets + custom + automatic + range.
- Save/load dashboards in our own JSON schema (layout model serialization) — not `.twb` compat, but functionally equivalent and human-readable.

### Performance targets (we beat Tableau on every axis)

| Metric | Tableau observed | Analyst Pro target |
|---|---|---|
| Cold dashboard first paint | 1.0–1.5s | **< 300ms** |
| Interaction → re-render (filter action) | 300–800ms | **< 120ms** |
| Drag / resize a tile | 30-45fps (DOM thrash) | **60fps steady** |
| 50 tiles × 100k rows pan/zoom | visible jank | **60fps** |
| Action cascade (1 source → 5 targets) | 800-1500ms | **< 250ms** |
| Save dashboard (50 tiles) | 2-3s roundtrip | **< 400ms** |

### Quality targets

- **Authoring UX**: drag-latency imperceptible. Snap toggleable. Align/distribute tools like Figma. Multi-select with marquee. Keyboard nudge (arrow = 1px, shift+arrow = 10px). Undo/redo full history (no Tableau's 20-step limit).
- **Zero-chrome aesthetic**: invisible tile boundaries by default. Optional outline mode for layout planning (grid overlay + blank placeholder visibility).
- **Premium feel**: use existing `premium-*` motion primitives. Satoshi display. Tableau 10 palette (for brand recognition) with AskDB-warmed neutrals.

## 3. Non-goals

- `.twb` XML format import/export. Defer to v2.
- Subscription to Tableau's own VizQL server. We ship our own.
- Collaboration primitives (live cursors, comments). Defer.
- Mobile authoring. View-only on mobile for v1.
- Story mode, pitch mode, ops mode — handled by archetypes 1-4 in parallel track.

## 4. Layout model

### 4.1 Zone tree

Every dashboard is a tree of **zones**. A zone is either:

- A **container** (`type: "container-horz"` | `"container-vert"` | `"container-tiled"`) holding an ordered list of child zones.
- A **leaf** (`type: "worksheet"` | `"text"` | `"filter"` | `"legend"` | `"parameter"` | `"image"` | `"webpage"` | `"blank"` | `"navigation"` | `"extension"`) rendering an object.

Plus a separate **floating layer** — a flat list of zones positioned absolutely in pixels, rendered above the tiled tree with explicit z-order.

```ts
type Zone =
  | ContainerZone     // recursive
  | LeafZone;         // renders content

type ContainerZone = {
  id: string;                                     // uuid
  type: 'container-horz' | 'container-vert';      // orientation determines split axis
  w: number;                                      // 0-100000 (proportional of parent)
  h: number;                                      // 0-100000
  padding?: { outer: Padding; inner: Padding };
  border?: BorderStyle;
  background?: BackgroundStyle;
  children: Zone[];                               // ordered
};

type LeafZone = {
  id: string;
  type: 'worksheet' | 'text' | 'filter' | 'legend' | 'parameter'
      | 'image' | 'webpage' | 'blank' | 'navigation' | 'extension';
  w: number;                                      // 0-100000 inside a container
  h: number;
  padding?: { outer: Padding; inner: Padding };
  border?: BorderStyle;
  background?: BackgroundStyle;

  // Leaf-specific payload
  worksheetRef?: string;                          // for type='worksheet'
  text?: RichText;                                // for type='text'
  filterRef?: FilterSpec;
  legendRef?: LegendSpec;
  parameterRef?: string;
  imageSrc?: string;
  webpageUrl?: string;
  extensionManifest?: ExtensionManifest;

  // Dynamic zone visibility binding
  visibilityRule?: {
    mode: 'field' | 'parameter';
    source: string;                               // field or parameter id
  };
};

type FloatingZone = LeafZone & {
  floating: true;
  x: number;                                      // pixels from dashboard origin
  y: number;
  pxW: number;                                    // pixels, not proportional
  pxH: number;
  zIndex: number;                                 // explicit
  locked?: boolean;
};

type Dashboard = {
  id: string;
  name: string;
  size: DashboardSize;                            // see 4.3
  tiledRoot: ContainerZone;                       // the zone tree
  floatingLayer: FloatingZone[];                  // absolutely positioned
  worksheets: WorksheetRef[];                     // referenced by leaf zones
  parameters: Parameter[];
  sets: SetDefinition[];
  actions: ActionDefinition[];
  globalStyle: GlobalStyle;                       // defaults for all zones
};
```

The proportional coordinate system matches Tableau exactly: `w=72875` means 72.875% of parent container width. When a parent resizes, children scale proportionally by recursive descent. This is the same math Tableau uses and it works.

### 4.2 Nesting and rearrangement

- Tiled containers arrange children in a single-pass flow: horz containers divide width by child `w` sum, vert containers divide height by child `h` sum. Normalization: if children's w (or h, depending on orientation) sum to anything other than 100000, normalize them proportionally on save.
- Nesting is unlimited in theory; UI warns past depth 8 (matches Tableau's practical usability ceiling).
- Blank zones are first-class content. Designers use them to reserve whitespace. They render nothing but participate in the proportional layout.
- Items can be reordered within a parent via the Layout panel (drag up/down in a tree view) or via `z-index` for floating.

### 4.3 Dashboard size

Dropdown with these options (matches Tableau exactly):

| Option | Behavior |
|---|---|
| Automatic | Fills browser viewport. Proportional recalc on resize. |
| Range | Min/max pixel bounds; within range = proportional; outside = snapped. |
| Fixed: Desktop (1366×768) | Exact pixel size. Scrolls in smaller viewport. |
| Fixed: Laptop (1440×900) | Exact. |
| Fixed: iPad Landscape (1024×768) | Exact. |
| Fixed: iPad Portrait (768×1024) | Exact. |
| Fixed: Phone (375×667) | Exact. |
| Fixed: Custom | User types width × height. |

Sheet size stored in `dashboard.size`. Renderer reads this and clamps canvas accordingly.

### 4.4 Resize algorithm

On dashboard size change OR viewport resize (in Automatic mode):

1. Compute new canvas `(W, H)` in pixels.
2. Recurse the `tiledRoot` tree top-down, passing each container its available `(availW, availH)`:
   - **Horz container** splits `availW` among children by each child's `w` (children's `w` values sum to 100000 after normalization). Each child gets full `availH` as height budget. Child's own `h` is ignored inside a horz parent — it occupies the full row.
   - **Vert container** mirror: splits `availH` by each child's `h` (summing to 100000). Each child gets full `availW` as width budget. Child's `w` is ignored inside a vert parent.
   - Normalization: if children's split-axis values don't sum to 100000, divide each by the current sum and multiply by 100000. Done once per save, or on-the-fly during drag.
   - Leaves receive final pixel `(w, h)`; leaves render at that size.
3. Floating layer ignores the tree. Each floating zone has explicit pixel `(x, y, pxW, pxH)`. Renderer draws them on top of the tiled tree in `zIndex` order.

Resize is O(n) in zones. Target: < 8ms for a 50-tile dashboard = 120fps headroom.

## 5. Object taxonomy — first-class citizens

Every object type below is a standalone leaf zone, draggable, resizable, styleable independently.

| Type | Content source | UI controls |
|---|---|---|
| `worksheet` | A worksheet ref (chart spec + bound data). | Resize, move, style, attach filters/legends/parameters, drillthrough. |
| `text` | Inline rich text (Markdown). | Click-to-edit, font picker, size, color, alignment, variable substitution `{param.name}`. |
| `filter` | A filter widget (dropdown, range slider, multi-select) bound to a field. | Bind field, pick widget, scope (global / this sheet / selected). |
| `legend` | Color / size / shape legend detached from a chart. | Bind to which worksheet + which encoding. |
| `parameter` | A parameter widget (dropdown, slider, free text). | Bind parameter, widget style. |
| `image` | PNG/SVG/JPG. | Source URL or upload, fit (contain/cover/fill), border. |
| `webpage` | Embedded iframe. | URL, sandbox flags. |
| `blank` | Empty rectangle. | Background color, border. For layout spacing. |
| `navigation` | Inter-sheet link (goes to another dashboard or sheet). | Target, label, style. |
| `extension` | Third-party embedded widget via our Extensions API. | Manifest URL. |
| `container-horz` | Contains child zones laid left→right. | Add/remove children, reorder, inner/outer padding, background. |
| `container-vert` | Contains child zones laid top→bottom. | Same. |

Each object exposes a uniform styling interface — padding (outer/inner per side), border (color/width/style per side), background (solid/gradient/image), visibility rule.

## 6. Canvas engine UX

The authoring canvas is the heart of #5. Behavior:

### 6.1 Placement

- **Object library** panel (left sidebar) lists all sheets, object types, and saved "layout containers" (reusable snippets).
- Drag from library → canvas. Drop at cursor position. If cursor is over a container's drop zone, object tiles inside. If over empty canvas or with Shift held, object floats.
- Floating objects can be dragged over tiled objects. Tiled objects cannot be dragged over each other — they displace.

### 6.2 Selection

- Click any zone to select it. Selected zone shows a premium 1px selection ring (indigo accent) + 8 resize handles (corners + midpoints).
- Marquee select: drag on empty canvas to select multiple zones.
- Shift-click to add/remove from selection.
- Cmd-A selects everything in the current dashboard.
- Escape clears selection.

### 6.3 Move

- Drag selected zone(s) to move.
- Tiled move: dragging a tiled zone inside a container reorders it within parent. Dragging to a different container moves it there. Visual indicator (blue insertion line) shows target position.
- Floating move: free drag in pixels.
- Snap (toggle in toolbar): 8px grid snap for floating, or snap-to-edges (of siblings + canvas bounds).
- Arrow keys nudge by 1px (shift+arrow = 10px).

### 6.4 Resize

- Drag any of 8 handles. Corner = both dimensions; side = one dimension. Shift locks aspect ratio.
- Tiled resize: changes `w` or `h` of target zone; siblings compensate proportionally so parent total stays 100000. Visual "width: 34.2%" tooltip during drag.
- Floating resize: updates `pxW` / `pxH`.
- Min size 40×40 px (prevents zero-size zones that become unfindable).

### 6.5 Alignment + distribution

Figma-style toolbar when multiple zones selected:

- Align left / center / right (horizontal)
- Align top / middle / bottom (vertical)
- Distribute horizontally / vertically (equal gaps)
- Fit to container / fit to canvas

### 6.6 Group / ungroup

- Select multiple zones → Cmd+G groups them into a new `container-horz` or `container-vert` (user picks orientation). Grouped zones move/resize as a unit.
- Cmd+Shift+G ungroups (unwraps one level).

### 6.7 Z-order (floating)

- Right-click → Bring to front / Send to back / Bring forward / Send backward.
- Keyboard: `]` forward, `[` backward, Shift+] to front, Shift+[ to back.
- Tree panel shows float stack order.

### 6.8 Lock

- Right-click → Lock. Locked zones can't be moved/resized but render normally. Prevents accidental drag during authoring.

### 6.9 Undo / redo

- Cmd+Z / Cmd+Shift+Z unlimited history (bounded at 500 ops per session for memory).
- History is serialized into the dashboard JSON save (last 50 ops persist).

### 6.10 Layout overlay (optional)

- Toggle on = render hairline grid over canvas (8px or 16px or 24px, user picks) + show blank zone outlines + show container borders. Off by default. Useful during authoring.
- Default rendered view has ZERO visible chrome — invisible tile boundaries per user spec.

### 6.11 Size toggle

Toolbar dropdown to switch dashboard size live (Automatic / Range / Fixed presets). Updates `dashboard.size`, recomputes layout. Preview shows canvas outline at target size.

## 7. Actions subsystem

### 7.1 Definitions

Six action types, defined on dashboard:

```ts
type ActionDefinition =
  | FilterAction
  | HighlightAction
  | UrlAction
  | GoToSheetAction
  | ChangeParameterAction
  | ChangeSetAction;

type BaseAction = {
  id: string;
  name: string;                                   // user-facing, used for sort order
  sourceSheets: string[];                         // which worksheet zones can fire
  trigger: 'hover' | 'select' | 'menu';           // what user action fires it
};

type FilterAction = BaseAction & {
  kind: 'filter';
  targetSheets: string[];                         // which sheets receive the filter
  fieldMapping: { source: string; target: string }[];  // source field → target field
  clearBehavior: 'leave-filter' | 'show-all' | 'exclude-all';
};

// ... Highlight, Url, GoToSheet, ChangeParameter, ChangeSet follow same shape
```

### 7.2 Execution semantics

1. User triggers source sheet (hovers mark, selects mark, or chooses menu).
2. Dashboard runtime iterates all actions whose `sourceSheets` include source and `trigger` matches.
3. Within a type, actions execute in alphabetical order by `name` (Tableau compat).
4. For each matching action, extract data from selected/hovered marks, apply to targets.
5. Targets fire re-query via our existing waterfall router. Schema tier → memory tier → turbo tier → live.
6. Results stream back to target renderers. 60fps throughout.

### 7.3 Cross-sheet filter cascade

Example: user hovers a bar in `WeeklyRevenue` worksheet. A `FilterAction` with source `WeeklyRevenue`, target `TopAccounts` + `ChurnRisk`, field mapping `Week → Week`.

1. Runtime extracts `Week = "2026-W12"` from hovered mark.
2. Injects `Week = "2026-W12"` filter into `TopAccounts` + `ChurnRisk` query plans.
3. Both queries fire in parallel. Waterfall router short-circuits via memory/turbo if possible.
4. Results stream. Target renderers redraw incrementally (Arrow IPC + our VizQL canvas).
5. Action fires cancel-on-newer: if user hovers a new bar before cascade completes, old cascade cancels.

End-to-end target: < 120ms for the fast path (turbo tier hit), < 250ms for slow path (live query).

### 7.4 URL actions

Template strings with field variables: `https://crm.example.com/account/{AccountId}`. On fire, substitute from selected mark data, open in new tab (or embedded iframe if `target="iframe"`).

### 7.5 Change parameter / change set

Mutate a parameter or set in place. All downstream worksheets that reference the parameter/set invalidate and re-query.

### 7.6 Actions UI

- Dashboard menu → Actions dialog lists all actions with table (name / type / source / target / trigger).
- Add / edit / delete. Edit opens form with source picker, target picker, trigger dropdown, field mapping grid.
- Live preview: toggle action on/off without deleting.
- Keyboard: Cmd+A during authoring with a selection of 2+ worksheets opens the Create Action wizard pre-filled with those sheets as source/target.

## 8. Sets subsystem

### 8.1 Definitions

```ts
type SetDefinition =
  | FixedSet
  | DynamicSet;

type FixedSet = {
  id: string;
  name: string;
  kind: 'fixed';
  field: string;                                  // the dimension
  members: (string | number)[];                   // explicit IN list
};

type DynamicSet = {
  id: string;
  name: string;
  kind: 'dynamic';
  field: string;                                  // single dimension
  condition:                                      // re-evaluated on every query
    | { type: 'top-n'; n: number; by: string; direction: 'asc' | 'desc' }
    | { type: 'formula'; expression: string }
    | { type: 'aggregate'; agg: string; field: string; op: '>' | '<' | '>=' | '<=' | '='; value: number }
    | { type: 'wildcard'; pattern: string };
};
```

### 8.2 IN/OUT calc field

When a user creates set `"TopCustomers"`, the system auto-generates a boolean calc field `TopCustomers.InOut` that evaluates:

- For fixed sets: `field IN (members)`.
- For dynamic sets: evaluate condition at query time, return boolean.

This calc field is usable in any worksheet as a dimension (for coloring) or filter.

### 8.3 Set actions

`ChangeSetAction` mutates set membership via UI. Example: user selects a lasso of customers in a scatter plot. Set action `"ClusterOfInterest"` replaces `TopCustomers.members` with those customer IDs. Downstream worksheets filtered on `TopCustomers.InOut` re-query.

Same execution + cascade model as filter actions.

### 8.4 Set UI

- Right-click dimension → Create Set. Dialog: Fixed (pick members) or Dynamic (pick condition).
- Right-click existing set → Edit Set or Create Set Action.

## 9. Dynamic Zone Visibility

Every zone (leaf or container) can have a `visibilityRule`:

```ts
visibilityRule: {
  mode: 'field' | 'parameter';
  source: string;                                 // field id or parameter id
}
```

At render time:
- If `mode === 'parameter'`: read parameter's current boolean value. If true → render; false → skip.
- If `mode === 'field'`: evaluate the field against the *smallest non-empty query result on the dashboard* (usually a KPI worksheet). If the boolean aggregation returns true → render.

Hidden zones do not participate in layout — siblings expand to fill. This matches Tableau's behavior.

Use cases: toggle between chart type variants via a parameter; hide "empty state" zone once data arrives.

## 10. Persistence

### 10.1 Schema (JSON, stored in backend)

```json
{
  "schema_version": "askdb/dashboard/v1",
  "id": "dashboard-uuid",
  "name": "Q3 Revenue Review",
  "archetype": "analyst-pro",
  "size": { "mode": "fixed", "width": 1440, "height": 900 },
  "tiledRoot": {
    "id": "root",
    "type": "container-vert",
    "w": 100000,
    "h": 100000,
    "children": [
      { "id": "z1", "type": "container-horz", "w": 100000, "h": 25000, "children": [...] },
      { "id": "z2", "type": "worksheet", "worksheetRef": "rev12mo", "w": 100000, "h": 50000 },
      { "id": "z3", "type": "blank", "w": 100000, "h": 25000 }
    ]
  },
  "floatingLayer": [
    { "id": "f1", "type": "legend", "floating": true, "x": 880, "y": 20, "pxW": 200, "pxH": 300, "zIndex": 10, "legendRef": {...} }
  ],
  "worksheets": [ { "id": "rev12mo", "chartSpec": {...}, "sql": "...", "dataRef": "..." } ],
  "parameters": [ ... ],
  "sets": [ ... ],
  "actions": [ ... ],
  "globalStyle": { "font": "Satoshi", "background": "var(--archetype-analyst-pro-bg)" }
}
```

### 10.2 Data payload

Worksheet result sets ship as **Arrow IPC** from backend → frontend. Arrow tables land in browser memory; our VizQL canvas reads them zero-copy. This is the performance moat over Tableau (which serializes row-by-row JSON).

Write path: frontend serializes dashboard JSON → POST `/api/dashboards/{id}` → backend writes atomic file to `.data/user_data/{hash}/dashboards.json`.

### 10.3 Versioning

`schema_version` enum. Backend migration layer handles upgrades. Downgrades not supported (forward-only).

### 10.4 Why JSON + Arrow, not binary

Considered options:
- **JSON for everything.** Simple, debuggable, but wastes bytes on numeric data.
- **Protobuf for layout + Arrow for data.** Smaller layout payload but opaque to debugging, and layout is small (< 50kb typical).
- **JSON for layout + Arrow for data** ← chosen.

Rationale: layout JSON is human-readable, versionable, and small (~20-60kb typical). Arrow for data gives us columnar zero-copy in browser without re-serialization. Best quality (debuggable) + best performance (Arrow hot path).

## 11. Performance architecture

How we beat Tableau across every axis.

### 11.1 Cold start (< 300ms vs Tableau 1.0–1.5s)

- **Waterfall router.** Schema tier serves cached metadata in ~7ms. Memory tier serves cached query results in ~19ms. Turbo tier serves DuckDB twin in < 100ms. Only uncommon queries hit live.
- **Arrow IPC.** Backend streams pre-computed Arrow batches; frontend mounts with zero deserialization overhead.
- **Code splitting.** Dashboard JSON loads first (~50kb), then worksheets' data arrow batches stream in chunks. First paint happens on JSON alone (layout visible, tiles show skeletons). Data fills in as it arrives.
- **Server-side layout pre-resolution.** Backend computes pixel dimensions for each zone at the current viewport size, sends `computedLayout` alongside the tree. Frontend renders immediately without layout math.

### 11.2 Interaction-to-render (< 120ms vs Tableau 300-800ms)

- **Action cascade.** On filter action fire, inject filter into target query plans and send all parallel requests in one HTTP/2 multiplex call. Waterfall router short-circuits. Arrow stream returns. Canvas redraws incrementally.
- **No DOM per mark.** Our VizQL canvas renders all marks on a single HTMLCanvasElement per worksheet. Tableau uses SVG/HTML per mark — 10k marks = 10k nodes = GC + reflow hell.
- **WebGL path for dense charts.** > 50k marks → regl-scatter / regl-line on WebGL. Already implemented in `frontend/src/vizql/webgl/`.
- **Cancel-on-newer.** Stale action cascades cancel immediately when a newer action fires.

### 11.3 Drag / resize (60fps steady)

- **Ephemeral layout.** During drag, only the ghost tile and its immediate parent recompute. Siblings freeze. Commit on drag end triggers full tree recompute.
- **Transform-only animation.** We animate `transform: translate3d()` + `scale()` during drag, never `width/height/top/left`. GPU composites; no reflow.
- **Spatial R-tree.** Hit testing (which zone is under the cursor?) uses an R-tree over tiled + floating zones. O(log n) vs O(n) DOM hit test.
- **rAF-throttled mousemove.** Coalesce mousemove events into single paint per frame.

### 11.4 50 tiles × 100k rows (60fps pan/zoom)

- **Viewport culling.** Only tiles in viewport render. Off-screen tiles skip paint.
- **LTTB downsampling.** 100k rows → ~500 visible marks via Largest-Triangle-Three-Buckets. Sub-pixel marks never rendered.
- **Aggregate bin at zoom-out.** At low zoom, 100k rows group into visible bins (pixel_min_max). Zoom in = ungroup adaptively.
- **OffscreenCanvas + worker.** Mark geometry computed in a Web Worker; main thread only composites. Already scaffolded.

### 11.5 Action cascade (< 250ms vs Tableau 800-1500ms)

- **Parallel target queries.** All targets fire concurrently.
- **HTTP/2 multiplex.** Single TCP connection, zero head-of-line blocking.
- **Arrow stream.** Each target's result streams as batches; renderer paints first batch in ~50ms, then fills in.
- **Prompt cache (agent-authored edits).** If cascade is agent-triggered, our prompt cache hits 90% → no LLM round-trip on repeat actions.

### 11.6 Save (< 400ms vs Tableau 2-3s)

- **Diff-based save.** Only changed zones POST. Backend applies diff to stored JSON atomically.
- **Single roundtrip.** One POST, one 200. No multi-step save flow.
- **Optimistic UI.** UI reflects save immediately; if POST fails, rollback + toast.

## 12. Frontend architecture

### 12.1 New files

```
frontend/src/components/dashboard/
  modes/
    AnalystProLayout.jsx                          # archetype shell
  freeform/
    FreeformCanvas.jsx                            # canvas container
    ZoneRenderer.jsx                              # recursive zone renderer
    FloatingLayer.jsx                             # absolute positioned objects
    SelectionOverlay.jsx                          # selection ring + resize handles
    AlignmentToolbar.jsx                          # Figma-style tool bar
    ObjectLibraryPanel.jsx                        # left sidebar object source
    LayoutTreePanel.jsx                           # hierarchy inspector
    SizeToggleDropdown.jsx                        # canvas size picker
    ActionsDialog.jsx                             # actions CRUD modal
    SetsDialog.jsx                                # sets CRUD modal
    ParametersDialog.jsx                          # parameters CRUD modal
    DynamicVisibilityPicker.jsx                   # inline visibility rule editor
    hooks/
      useZoneTree.js                              # tree state + ops
      useFloatingLayer.js                         # float state + ops
      useSelection.js                             # multi-select + marquee
      useDragResize.js                            # drag/resize handlers + rAF
      useSnap.js                                  # snap logic (grid, edges)
      useHistory.js                               # undo/redo history buffer
      useActionRuntime.js                         # action cascade runtime
      useSetRuntime.js                            # set membership runtime
      useSpatialIndex.js                          # R-tree hit testing
      useKeyboardShortcuts.js                     # Cmd+A, Cmd+G, arrow nudge, z-order
    lib/
      zoneTree.js                                 # pure tree ops (insert, remove, resize, normalize)
      layoutResolver.js                           # tree → pixel coords
      actionExecutor.js                           # action cascade orchestration
      setEvaluator.js                             # fixed + dynamic set membership
      visibilityEvaluator.js                      # dynamic zone visibility rule evaluator
      rTree.js                                    # 2D spatial index
      snapMath.js                                 # snap-to-grid + snap-to-edge
```

### 12.2 Component tree

```
<AnalystProLayout>
  <AnalystProTopbar>                 # size dropdown + mode toggle + Share/Save
  <div class="analyst-pro-body">
    <ObjectLibraryPanel/>            # left sidebar
    <FreeformCanvas>
      <ZoneRenderer tree={tiledRoot}/>   # recursive tree render
      <FloatingLayer zones={floatingLayer}/>
      <SelectionOverlay/>
      <AlignmentToolbar/>             # floats near selection
    </FreeformCanvas>
    <LayoutTreePanel/>               # right sidebar; alternate: Inspector panel
  </div>
</AnalystProLayout>
```

### 12.3 State management

- Extend Zustand `store.js` with an `analystPro` slice:
  - `dashboard: Dashboard` — current dashboard JSON.
  - `selection: Set<zoneId>` — selected zones.
  - `dragState: DragState | null` — during drag.
  - `clipboard: Zone[] | null` — for copy/paste.
  - `history: HistoryBuffer` — undo/redo.
  - `actionRuntime: ActionRuntimeState` — inflight action cascades.
- All mutations go through named actions (`addZone`, `moveZone`, `resizeZone`, `reorderZone`, `deleteZone`, `groupZones`, `ungroupZones`, etc.). Each emits a history entry.

### 12.4 Rendering strategy

- **Tiled tree** — recursive React render with memoization per zone (React.memo + stable keys).
- **Floating layer** — portal-rendered. Each floating zone in its own absolute-positioned div.
- **Selection overlay** — single canvas layer on top of entire dashboard, renders ring + handles for all selected zones.
- **During drag** — ephemeral ghost element with transform3d; freeze non-related subtree. Commit on drag end.

## 13. Backend architecture

### 13.1 New endpoints

```
POST   /api/v1/dashboards/{id}/actions            # create
PUT    /api/v1/dashboards/{id}/actions/{aid}      # update
DELETE /api/v1/dashboards/{id}/actions/{aid}      # delete
POST   /api/v1/dashboards/{id}/actions/{aid}/fire # action cascade (returns parallel arrow streams)

POST   /api/v1/dashboards/{id}/sets               # create
PUT    /api/v1/dashboards/{id}/sets/{sid}         # update membership
DELETE /api/v1/dashboards/{id}/sets/{sid}

POST   /api/v1/dashboards/{id}/parameters         # create
PUT    /api/v1/dashboards/{id}/parameters/{pid}   # update value

POST   /api/v1/dashboards/{id}/resolve-layout     # server pre-resolves zone tree at given viewport
POST   /api/v1/dashboards/{id}/evaluate-visibility # returns zone visibility map
```

### 13.2 Storage

Extend `.data/user_data/{hash}/dashboards.json` with the new schema. Migration layer (`dashboard_migration.py`) maps legacy `chartType/columns/rows` + `sections/tiles` tree → new `tiledRoot/floatingLayer/actions/sets` schema.

### 13.3 Action cascade implementation

`actions/fire` endpoint:
1. Parse source mark data from request body.
2. For each target in action, build a modified query plan (inject filter predicate).
3. Fire all target queries in parallel via `asyncio.gather()`.
4. Each target routes through waterfall router (schema → memory → turbo → live).
5. Stream Arrow IPC multipart response back to frontend with per-target chunks.

### 13.4 Set membership evaluator

`sets/{sid}` PUT accepts `members: []` (fixed replace) or `delta: {add: [], remove: []}` (fixed mutate).

Dynamic sets are evaluated at query time in `query_engine.py` by injecting the set condition into the WHERE clause of every query that references `SetName.InOut`.

### 13.5 Visibility evaluator

`evaluate-visibility` endpoint takes current parameter values + boolean fields, returns map `{ zoneId: true | false }`. Frontend filters the zone tree at render time.

## 14. Chart IR integration

No changes to existing chart-ir / VizQL renderer. Worksheet zones reference a chart spec + dataRef; the renderer reads them as today. Only the dashboard layout shell changes.

The only new wiring: the action cascade endpoint emits Arrow IPC chunks; frontend's existing `ArrowChunkReceiver` already handles this.

## 15. Migration story

Existing dashboards (in `backend/dashboards.json`) use old `sections/tiles` schema. Migration:

1. On first load of a legacy dashboard, `dashboard_migration.py` detects old schema and runs `legacy_to_freeform_schema()`.
2. Mapping:
   - Section → horz container.
   - Tiles in a section → worksheet zones in that container with `w=100000/tile_count`.
   - Tile chart specs preserved as `worksheetRef` → `worksheets[]`.
   - No actions in legacy → empty actions array. User adds later.
3. Write migrated dashboard back to storage. Backup saved as `dashboards.backup.{ts}.json`.
4. Old `workbench` / `tableau-classic` mode → `analyst-pro` archetype.

## 16. Testing strategy

### 16.1 Unit

- `zoneTree.js` — insert, remove, move, resize, normalize. 100% coverage.
- `layoutResolver.js` — given tree + viewport, output pixel coords. Snapshot tests for deep nesting.
- `actionExecutor.js` — mock queries, verify cascade order + cancellation.
- `setEvaluator.js` — fixed + dynamic evaluation against sample data.

### 16.2 Integration

- `vitest` tests for FreeformCanvas: mount dashboard, drag a zone, assert new state.
- `pytest` adversarial tests: malformed zone tree, cyclic references, oversized payloads.

### 16.3 Performance

- Lighthouse baseline: current `/analytics` → Analyst Pro. Measure FCP, LCP, TBT.
- Custom benchmark harness: 50-tile dashboard, fire action cascade, measure end-to-end latency (target < 250ms p95).
- Drag-frame benchmark: drag a tile across canvas, measure dropped frames (target 0).

### 16.4 End-to-end

- Playwright script: open Analyst Pro, create 3 worksheets, add filter action, fire it, assert target filtered. Record trace for regression.

## 17. Observability

- Frontend: per-action telemetry to `query_decisions.jsonl` — action type, source/target, trigger, cascade latency, tier hit.
- Backend: action cascade timing in audit trail.
- Dashboard-level metrics: avg interaction latency (rolling window), cache hit rate, p95/p99 cascade time. Surfaced in StatusBar.

## 18. Rollout

### Phase 1 (spec → stable v1, target 4 weeks)

- Week 1: Layout model + zone tree + FreeformCanvas basic rendering (no actions yet).
- Week 2: Drag/resize/select + align/distribute + undo/redo + object library.
- Week 3: Actions (filter + highlight + URL + go-to-sheet).
- Week 4: Sets + change-parameter + change-set + dynamic zone visibility + size dropdown + polish.

### Phase 2 (post-v1)

- Archetypes 1-4 unblock (see spawned task).
- `.twb` import as experimental.
- Collaboration primitives (live cursors).
- Extension marketplace.

### Feature flag

`FEATURE_ANALYST_PRO` (default false) behind which entire new code path sits. Flip to true for internal testing, then demo, then general.

## 19. Open questions

- **How strict is Tableau-compat on action execution order?** Tableau does alphabetical within type. We copy. Does user want a different semantics for AskDB? (Assumption: copy Tableau, document.)
- **Set action performance when set grows large (10k+ members).** Fixed set membership check is O(n) per row unless indexed. Decision: for fixed sets > 1000 members, compile to `IN (...)` with hashset lookup on DB side. Never send the membership list over the wire more than once.
- **Dynamic Zone Visibility eval frequency.** Every parameter change re-evals. Every query-invalidation re-evals. Potentially expensive. Decision: memoize by parameter+field signature; invalidate only when dependencies change.
- **Floating zone max count.** Tableau has no hard cap but breaks past ~100. Decision: soft-cap at 50 floating zones, warn past 100.
- **Extension API parity.** Our Extensions API doesn't exist yet. Decision: add `type: "extension"` as placeholder in the schema; defer API implementation to Phase 2.

## 20. Summary

This spec commits to full Tableau-authoring parity in a single major release: zone tree, object taxonomy, actions runtime, sets, dynamic zone visibility, size dropdown. Performance targets beat Tableau across every measured axis: cold start (5×), interaction (3-6×), drag (60fps vs 30-45fps), save (5-7×).

The performance moat comes from architectural assets we already have:
- Waterfall router (schema/memory/turbo tiers)
- Arrow IPC pipeline
- DuckDB twin replicas
- Our own VizQL canvas renderer
- WebGL fallback for dense marks

The feature moat comes from architectural choices:
- JSON layout schema (debuggable, versionable)
- Zone tree with proportional coords (matches Tableau exactly, scales cleanly)
- First-class object taxonomy (everything is a zone, uniform styling)
- R-tree spatial index (O(log n) hit testing for 50+ tiles)
- HTTP/2 multiplex for action cascades

The non-goals keep this shippable in 4 weeks: no `.twb` compat, no collaboration, no mobile authoring, no extension marketplace. Each of those is a multi-week spec on its own and can slot into Phase 2.

---

**Next step (after approval):** invoke the `superpowers:writing-plans` skill to convert this spec into a phased implementation plan with concrete tasks, file lists, and test checkpoints.
