# Chart System Redesign — Sub-project C — User-Authored Chart Types + Community Gallery

**Date:** 2026-04-15
**Author:** Drafted autonomously via scheduled task `brainstorm-chart-sub-project-c-user-authored-types` invoking `superpowers:brainstorming` (no live user — sid23 absent for this run; assumptions tagged).
**Status:** Awaiting user review · spec self-reviewed inline
**Research base:** `docs/chart_systems_research.md` (§2.10 Tableau Extensions, §3.5 Power BI Custom Visuals SDK, §4.3 Looker LookML Vis API, §4.9 Looker Studio dscc, §5.10 AntV G2, §5.12 Deneb) · A spec · B spec · existing `chart-ir/userTypes/` foundation
**Scope:** Sub-project C of four — user-authored chart types + community gallery. A=editor+dashboards, B=performance ceiling, **C=user-authored types**, D=semantic layer.

---

## 0. Pre-Read — State of the Foundation

### 0.1 What Already Exists

Sub-project C has a **shipped foundation layer** in `chart-ir/userTypes/`:

| File | What it does | Status |
|---|---|---|
| `types.ts` | `UserChartType`, `UserChartTypeParam`, `InstantiateParams` interfaces | ✅ Implemented + exported from `chart-ir/index.ts` |
| `schema.ts` | `validateUserChartType()` — checks required fields, unique params, placeholder-to-param binding | ✅ Implemented + 6 validator tests |
| `instantiate.ts` | `instantiateUserChartType()` — deep-walks spec template, replaces `${param}` placeholders | ✅ Implemented + 5 instantiation tests |
| `registry.ts` | `UserChartTypeRegistry` class — register/get/list/remove/hydrate/instantiate + `globalUserChartTypeRegistry` singleton | ✅ Implemented + 5 registry tests |
| `__tests__/userTypes/userTypes.test.ts` | 21 test cases covering validator, placeholder collection, instantiation, registry CRUD | ✅ All passing |
| `__tests__/editor/customTypePicker.test.tsx` | 4 tests for `CustomTypePicker` component (fetches from `api.listChartTypes`, renders by category, param form, column-profile-aware dropdowns) | ✅ Tests exist, component implementation TBD |

**Backend (from updated CLAUDE.md):**
- `chart_customization.py` — per-user storage for user-authored chart types already exists
- `chart_customization_routes.py` — `/api/v1/chart-types` CRUD already exists
- `api.listChartTypes` is mocked in the test — backend endpoint is wired

### 0.2 What Sub-project C Must Build On Top

The foundation gives us **Tier 1 data model only** — type definitions, validation, registry, instantiation. What's missing is everything above the data model:

1. **Tier 1 UI** — the visual composer for creating spec templates without writing JSON
2. **Tier 2 (High-code SDK)** — `IChartType` interface, iframe sandbox runtime, postMessage protocol
3. **Community gallery** — browse, import, share, curate, version
4. **Package format** — `.askdbviz` archive for import/export
5. **Agent integration** — the agent knows about and recommends user types
6. **Local dev mode** — hot-reload authoring environment for Tier 2 types
7. **Manifest format** — `manifest.json` with capabilities, data roles, formatting model

### 0.3 Why This Matters — The "Tableau Public Wow Factor"

Tableau Public's magic: anyone publishes a workbook, the community browses thousands of creative visualizations, downloads favorites, learns techniques. The charts themselves become the marketing.

AskDB's equivalent: a user creates a Revenue Waterfall chart type, packages it, shares it to the AskDB Gallery, and every other AskDB user can one-click install it — then **the AI agent automatically suggests it** when the data shape fits. That last part — agent awareness of community chart types — is what no competitor does. Power BI's custom visuals are invisible to Copilot. Tableau's extensions are invisible to Ask Data. AskDB's agent sees everything.

---

## 1. Executive Summary

Sub-project C adds a **two-tier authoring system** for custom chart types that any AskDB user can create, share, and install:

**Tier 1 — Spec Template Composer (low-code).** A visual UI (reusing Pro Mode's Marks card + encoding rail) that lets users design a new chart type by composing IR primitives — marks, encodings, transforms, layers, facets. The output is a `UserChartType` definition (parameterized `ChartSpec` template) saved to the registry. No code, no sandbox. The existing foundation (`chart-ir/userTypes/`) is the runtime. Inspired by Tableau community charts that compose polygons + path + table calcs into novel forms.

**Tier 2 — Chart SDK (high-code).** A TypeScript SDK exposing an `IChartType` interface with `render()`, `update()`, `destroy()`, `getCapabilities()`. User code runs inside a **sandboxed iframe** (CSP `sandbox="allow-scripts"`) communicating with the host via a typed postMessage protocol. Inspired by Power BI Custom Visuals SDK (`IVisual` + `capabilities.json`), Looker LookML Vis API (`create/updateAsync/destroy`), and Looker Studio dscc (`postMessage` + config JSON). Authors can use any rendering library (D3, Three.js, Canvas, WebGL) inside the sandbox.

Both tiers produce entries in the same `UserChartTypeRegistry`. Both show up in the Show Me picker. Both are visible to the agent's `suggest_chart` tool. Both can be exported as `.askdbviz` packages and shared via the AskDB Community Gallery.

**Six phases, ~7–9 weeks.** Phase C0–C1 deliver Tier 1 (spec templates with full UI). Phase C2–C3 deliver Tier 2 (iframe SDK). Phase C4 delivers the gallery. Phase C5 delivers polish, agent deep integration, and production rollout.

---

## 2. Two-Tier Authoring Model

### 2.1 Why Two Tiers

A single approach can't satisfy both audiences:

| Audience | Need | Solution |
|---|---|---|
| Business analyst who knows the Marks card | "I want a waterfall chart that our org uses for revenue" | Tier 1: compose from existing primitives, no code |
| Data viz developer who wants a radial bar / Sankey / custom canvas | "I need a mark type that doesn't exist in Vega-Lite" | Tier 2: write render code in a sandboxed environment |

Power BI solves this with two separate systems: Quick Measures (low-code) vs Custom Visuals SDK (high-code). AskDB unifies them under one registry and one gallery.

### 2.2 Tier 1 — Spec Template Composer

**What the user does:**
1. Opens the Chart Type Composer (new route: `/chart-types/new` or button in Show Me panel)
2. Sees Pro Mode's Marks card + encoding rail, but in **template mode**: instead of binding real columns, they bind **parameters**
3. Creates parameters: "Category Field" (kind: field, semantic type: nominal), "Value Field" (kind: field, semantic type: quantitative)
4. Drags parameters to encoding channels: `${categoryField}` → X, `${valueField}` → Y
5. Picks mark type, adds transforms, optionally layers multiple marks
6. Previews with mock data (auto-generated from parameter semantic types)
7. Fills in metadata: name, description, category, icon
8. Saves → backend persists via `chart_customization.py`, registry hydrated

**What it produces:** A `UserChartType` JSON object (the type already defined in `chart-ir/userTypes/types.ts`).

**Capabilities:**
- Any composition that Pro Mode supports: single mark, layered marks, faceted, concatenated
- All transforms: filter, bin, aggregate, sample, calculate
- All encoding channels: x, y, color, size, shape, opacity, detail, tooltip, text, row, column
- Conditional defaults: e.g., "if the value field has >100 distinct values, auto-bin"

**Limitations:**
- Cannot render marks that Vega-Lite doesn't support natively (Sankey, chord, radial bar with custom paths)
- Cannot execute arbitrary code
- Cannot call external APIs or load external libraries

### 2.3 Tier 2 — Chart SDK (High-Code)

**What the user does:**
1. Scaffolds a project: `npx create-askdb-viz my-sankey` (CLI tool, or download template ZIP from gallery)
2. Writes TypeScript implementing `IChartType` interface
3. Runs local dev server: `npm run dev` → opens AskDB with the viz mounted in dev mode
4. Publishes: `npm run package` → produces `.askdbviz` file
5. Uploads to gallery or imports directly into their AskDB workspace

**The `IChartType` interface:**

```typescript
interface IChartType {
  /** Unique identifier. Convention: `{scope}:{slug}` */
  readonly id: string;
  /** Display name for the picker. */
  readonly name: string;
  /** Semver string. */
  readonly version: string;

  /**
   * Declare data requirements and format pane schema.
   * Equivalent to Power BI's capabilities.json.
   */
  getCapabilities(): ChartCapabilities;

  /**
   * Initial render. Called once when the chart mounts.
   * `container` is the iframe's root element.
   */
  render(container: HTMLElement, ctx: RenderContext): void;

  /**
   * Called on data change, resize, theme change, or config change.
   * Must be idempotent — host may call rapidly during resize.
   */
  update(ctx: RenderContext): void;

  /**
   * Cleanup. Remove event listeners, release GPU resources.
   */
  destroy(): void;
}

interface ChartCapabilities {
  /** Named data channels the chart needs. */
  dataRoles: DataRole[];
  /** Format pane schema — auto-rendered as Inspector controls. */
  formatting?: FormattingGroup[];
  /** Feature flags. */
  features?: {
    supportsSelection?: boolean;   // cross-filter
    supportsTooltip?: boolean;
    supportsTheme?: boolean;
    supportsDrilldown?: boolean;
  };
  /** Privilege requests — reviewed before gallery publish. */
  privileges?: {
    /** Allow fetch() to listed origins. Default: none. */
    allowedOrigins?: string[];
    /** Allow localStorage. Default: false. */
    localStorage?: boolean;
  };
}

interface DataRole {
  name: string;
  displayName: string;
  kind: 'dimension' | 'measure' | 'any';
  /** Required semantic type constraint. */
  requiredType?: SemanticType;
  /** Min/max fields. Default: {min: 1, max: 1}. */
  cardinality?: { min: number; max: number };
}

interface FormattingGroup {
  name: string;
  displayName: string;
  properties: FormattingProperty[];
}

interface FormattingProperty {
  name: string;
  displayName: string;
  type: 'color' | 'number' | 'text' | 'boolean' | 'select';
  default: unknown;
  /** For 'select' type. */
  options?: { value: string; label: string }[];
}

interface RenderContext {
  /** Typed data mapped by data role name. */
  data: DataView;
  /** Current chart dimensions in pixels. */
  viewport: { width: number; height: number };
  /** Active theme tokens (colors, fonts, spacing). */
  theme: ThemeTokens;
  /** Current formatting property values (from Inspector). */
  config: Record<string, unknown>;
  /** Emit selection events for cross-filtering. */
  selectionManager: SelectionManager;
  /** Show/hide tooltip. */
  tooltipService: TooltipService;
  /** Signal that render is complete (critical for PNG export). */
  renderComplete(): void;
  /** Report an error to the host chrome. */
  reportError(title: string, message: string): void;
}

interface DataView {
  /** Columns mapped by data role name. */
  columns: Record<string, DataColumn>;
  /** Row count. */
  rowCount: number;
  /** Get cell value at (row, roleName). */
  getValue(row: number, roleName: string): unknown;
  /** Get all values for a role as a typed array. */
  getValues(roleName: string): unknown[];
}
```

**Sandboxing details in §3.**

---

## 3. Sandbox Model — iframe + postMessage + CSP

### 3.1 Why iframe

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **iframe + CSP** | Battle-tested (Power BI, Looker, dscc). Full DOM/Canvas/WebGL. Any rendering library works. Process isolation on most browsers. | postMessage serialization cost. Slightly complex host↔guest protocol. | **Chosen** |
| Web Worker only | True thread isolation. Can't touch host DOM. | No DOM — can't use D3, Canvas, WebGL, React. Offscreen Canvas has no Safari support. | Rejected for primary; optional for compute-only transforms |
| Shadow DOM | Same process, lighter. | No security isolation. User code can escape. | Rejected |

### 3.2 iframe Configuration

```html
<iframe
  sandbox="allow-scripts"
  csp="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:;"
  srcdoc="<!DOCTYPE html>..."
  style="width:100%; height:100%; border:none;"
/>
```

**What `sandbox="allow-scripts"` blocks by default:**
- ❌ Top-level navigation (`allow-top-navigation` not set)
- ❌ Form submission
- ❌ Popups (`allow-popups` not set)
- ❌ Same-origin access to parent (`allow-same-origin` not set — critical)
- ❌ Pointer lock, orientation lock
- ✅ Script execution (explicitly allowed)

**What CSP adds:**
- `default-src 'none'` — no network requests unless explicitly allowed
- No `connect-src` — no fetch/XHR/WebSocket by default
- Privileged types that declare `allowedOrigins` in capabilities get a runtime CSP override: `connect-src ${origins.join(' ')}` — only after gallery review

**Without `allow-same-origin`:** the iframe cannot read parent cookies, localStorage, DOM, or postMessage with origin verification. The host sends messages to `iframe.contentWindow.postMessage(msg, '*')` and the guest sends back via `parent.postMessage(msg, '*')`. Origin is not meaningful in srcdoc iframes; security comes from the sandbox attribute + CSP.

### 3.3 Host ↔ Guest Protocol

All messages are JSON with a `type` discriminator:

**Host → Guest (inbound to iframe):**

| Message type | Payload | When sent |
|---|---|---|
| `INIT` | `{capabilities, version}` | Once, after iframe loads |
| `DATA` | `{dataView, viewport, config, theme}` | On data/resize/config/theme change |
| `THEME` | `{tokens}` | On theme switch |
| `RESIZE` | `{width, height}` | On container resize (debounced 100ms) |
| `DESTROY` | `{}` | Before iframe removal |

**Guest → Host (outbound from iframe):**

| Message type | Payload | When sent |
|---|---|---|
| `READY` | `{capabilities}` | After guest finishes init |
| `RENDER_COMPLETE` | `{}` | After render/update finishes (used for PNG export) |
| `SELECT` | `{dataPoints: number[]}` | User clicks data point (cross-filter) |
| `TOOLTIP_SHOW` | `{x, y, items: {label, value}[]}` | Hover |
| `TOOLTIP_HIDE` | `{}` | Mouse leave |
| `ERROR` | `{title, message}` | Runtime error |
| `CONFIG_REQUEST` | `{property, value}` | Guest requests a config change |

**Serialization:** `structuredClone`-compatible (no functions, no DOM nodes). DataView values are plain arrays/objects — no Arrow buffers in the iframe (serialization cost is acceptable for the typical <50k points a custom viz handles; types needing millions of points should use Tier 1 which goes through RSR's server-side LTTB).

### 3.4 Trust Model

| Trust level | Source | What's allowed | How it's marked |
|---|---|---|---|
| **Dev** | Local dev server / direct `.askdbviz` import | Full sandbox. No gallery listing. Yellow "Dev" badge in picker. | `trust: 'dev'` in manifest |
| **Community** | Published to gallery, manual AskDB team review passes | Full sandbox. `privileges` from capabilities honored. Blue "Community" badge. | `trust: 'community'`, `signature` field set |
| **Verified** | AskDB first-party or partner-reviewed with source audit | Same as Community + "Verified" green badge + eligible for "Featured" gallery placement | `trust: 'verified'` |

**Review process for Community trust:**
1. Author submits `.askdbviz` to gallery via upload form
2. AskDB team (initially manual — sid23 or designated reviewer) checks:
   - No obfuscated code
   - `privileges.allowedOrigins` justified (if any)
   - No data exfiltration patterns
   - Renders correctly with mock data
3. If approved, AskDB signs the package with ECDSA-P256 private key
4. Gallery entry gets `signature` field; frontend verifies on install
5. Rejection returns feedback to author

**Future automation:** static analysis pass (AST scan for `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `new Image().src` exfil patterns) before manual review. Not in v1 scope.

---

## 4. Manifest + Package Format

### 4.1 `.askdbviz` Package

A ZIP archive with this structure:

```
my-sankey.askdbviz (ZIP)
├── manifest.json          # required
├── icon.svg               # required (64×64 recommended)
├── preview.png            # optional (gallery thumbnail, 800×600)
├── README.md              # optional (gallery detail page)
├── index.js               # required for Tier 2 (bundled JS)
└── assets/                # optional (fonts, images)
    └── ...
```

For **Tier 1** (spec template) packages, `index.js` is absent — the manifest contains the `specTemplate` inline.

### 4.2 `manifest.json`

```json
{
  "$schema": "askdb/chart-type-manifest/v1",
  "id": "community:sankey-flow",
  "name": "Sankey Flow Diagram",
  "description": "Multi-level flow visualization with weighted paths",
  "version": "1.0.0",
  "author": {
    "name": "Alice Chen",
    "url": "https://github.com/alicechen"
  },
  "license": "MIT",
  "category": "Flow",
  "tier": "code",

  "capabilities": {
    "dataRoles": [
      { "name": "source", "displayName": "Source", "kind": "dimension" },
      { "name": "target", "displayName": "Target", "kind": "dimension" },
      { "name": "weight", "displayName": "Weight", "kind": "measure" }
    ],
    "formatting": [
      {
        "name": "nodes",
        "displayName": "Nodes",
        "properties": [
          { "name": "width", "displayName": "Node Width", "type": "number", "default": 20 },
          { "name": "padding", "displayName": "Node Padding", "type": "number", "default": 10 },
          { "name": "colorScheme", "displayName": "Color Scheme", "type": "select", "default": "tableau10",
            "options": [
              { "value": "tableau10", "label": "Tableau 10" },
              { "value": "viridis", "label": "Viridis" },
              { "value": "category20", "label": "Category 20" }
            ]
          }
        ]
      },
      {
        "name": "links",
        "displayName": "Links",
        "properties": [
          { "name": "opacity", "displayName": "Link Opacity", "type": "number", "default": 0.5 },
          { "name": "curvature", "displayName": "Curvature", "type": "number", "default": 0.5 }
        ]
      }
    ],
    "features": {
      "supportsSelection": true,
      "supportsTooltip": true,
      "supportsTheme": true
    },
    "privileges": {}
  },

  "entryPoint": "./index.js",
  "hash": "sha256:a1b2c3d4...",
  "trust": "dev",
  "signature": null,

  "minAskdbVersion": "1.0.0",
  "tags": ["sankey", "flow", "network", "alluvial"]
}
```

For **Tier 1** packages, replace `"tier": "code"` + `"entryPoint"` with:

```json
{
  "tier": "spec",
  "specTemplate": { ... },
  "parameters": [ ... ]
}
```

### 4.3 Integrity and Signing

- `hash`: SHA-256 of `index.js` (Tier 2) or JSON-serialized `specTemplate` (Tier 1). Verified on install.
- `signature`: ECDSA-P256 signature of `hash` by AskDB's gallery signing key. `null` for unsigned (dev trust). Frontend verifies against a bundled public key before granting Community/Verified trust badges.
- Package tampering (hash mismatch) → install rejected with error.

---

## 5. Community Gallery

### 5.1 Architecture

**Backend:**
- `GET /api/v1/gallery/types` — paginated listing with filters (category, tag, tier, trust level, sort by installs/rating/date)
- `GET /api/v1/gallery/types/{id}` — detail page (manifest, README, screenshots, install count, rating)
- `POST /api/v1/gallery/types` — submit for review (authenticated, upload `.askdbviz`)
- `GET /api/v1/gallery/types/{id}/download` — download `.askdbviz` package
- `POST /api/v1/gallery/types/{id}/rate` — 1–5 star rating
- `POST /api/v1/gallery/types/{id}/report` — flag for review

**Storage:**
- Gallery index: `.data/gallery/index.json` (JSON, same atomic-write pattern as `users.json`)
- Packages: `.data/gallery/packages/{id}/{version}.askdbviz`
- Reviews: `.data/gallery/reviews/{id}.json`

**No external infrastructure.** Gallery is self-hosted on the AskDB backend. For a SaaS deployment, packages could move to S3/GCS via the `StorageBackend` abstraction in `user_storage.py`.

### 5.2 Gallery UI

New frontend route: `/gallery` (protected, requires auth).

**Layout:**
- **Top bar:** search input + category filter chips + tier filter (All / Spec / Code) + sort (Popular / Recent / Top Rated)
- **Grid:** card per type — icon, name, author, install count, star rating, trust badge, "Install" button
- **Detail page:** full manifest display, README rendered as markdown, preview screenshot, "Install to My Library" button, version history, reviews

**Install flow:**
1. User clicks "Install"
2. Frontend `POST /api/v1/chart-types/install` with gallery type ID
3. Backend downloads `.askdbviz`, verifies hash + signature, extracts manifest
4. Manifest + bundle stored in user's `chart_customization.py` storage
5. Frontend hydrates `globalUserChartTypeRegistry` with the new type
6. Type appears in Show Me picker immediately
7. Agent's next turn sees it in the system prompt context

### 5.3 Versioning + Updates

- Each gallery type has a version history (semver)
- When an installed type has a newer version in the gallery, the Show Me picker shows a subtle update dot
- "Update available" notification in workspace settings
- One-click update: re-downloads, re-validates, replaces in registry
- **No auto-update** — user controls when to upgrade (breaking changes in formatting schema could alter saved dashboards)

---

## 6. Local-First Authoring + Dev Mode

### 6.1 Tier 1 Dev Flow

The Spec Template Composer IS the dev environment:

1. Open `/chart-types/new`
2. Design the template using Marks card + encoding rail in template mode
3. Preview with auto-generated mock data
4. Iterate until happy
5. Save → type is live in the workspace immediately

No external tools needed. The full authoring experience is in-browser.

### 6.2 Tier 2 Dev Flow

**Scaffolding:** `npx create-askdb-viz my-chart` generates:

```
my-chart/
├── package.json           # scripts: dev, build, package
├── tsconfig.json
├── manifest.json          # pre-filled template
├── src/
│   └── index.ts           # IChartType skeleton
├── dev/
│   └── mockData.json      # sample data for dev preview
└── icon.svg               # placeholder
```

**Dev server:** `npm run dev` starts a local server that:
1. Watches `src/` for changes
2. Bundles with esbuild (fast, <100ms rebuilds)
3. Serves the bundle at `localhost:PORT`
4. Opens AskDB frontend with `?dev-viz=localhost:PORT` query param

**AskDB dev mode (frontend):**
When `?dev-viz=` param is present:
- AskDB loads the dev bundle into a sandbox iframe
- Shows a floating "Dev Viz" panel with:
  - Console output from the iframe (captured via `ERROR` postMessage + `window.onerror` inside iframe)
  - Performance timing (render duration per `RENDER_COMPLETE`)
  - Data inspector (shows the DataView being sent)
  - Theme toggle (light/dark/stage themes)
  - Resize handles for testing viewport responsiveness
- Hot reloads on bundle change (dev server sends WebSocket notification → AskDB reloads iframe)

**`npm run package`:** esbuild production bundle → generates `manifest.json` hash → creates `.askdbviz` ZIP.

### 6.3 Mock Data Generation

For both tiers, the composer / dev server generates synthetic data from the parameter definitions / data roles:

| Semantic type | Generated mock |
|---|---|
| `nominal` | 5–10 random category labels ("Category A", "Category B", ...) |
| `ordinal` | ["Low", "Medium", "High", "Critical"] |
| `quantitative` | 50 random numbers, Gaussian distribution, range 0–1000 |
| `temporal` | 50 daily dates over the past 2 months |
| `geographic` | 10 US state names with lat/lng |

Users can also paste real query results as mock data or point the dev server at a live DuckDB twin.

---

## 7. Agent Integration — The Differentiator

### 7.1 How the Agent Sees Custom Types

When the user has registered custom types (installed from gallery or authored locally), the agent's system prompt includes them in the chart context:

```
## Available Custom Chart Types

The user has these custom chart types installed. Consider them alongside
built-in types when suggesting charts.

1. org:revenue-waterfall — "Revenue Waterfall"
   Parameters: period (temporal), amount (quantitative)
   Category: Financial
   
2. community:sankey-flow — "Sankey Flow Diagram"  
   Data roles: source (dimension), target (dimension), weight (measure)
   Category: Flow

When the data shape matches a custom type's requirements, prefer it
over a generic built-in if the type name/category aligns with the
user's question context.
```

This block is injected by `agent_engine.py` when building the system prompt, reading from the user's `chart_customization.py` storage. It's included in the prompt-cached schema context block, so it doesn't add per-turn cost.

### 7.2 Agent Tools

**`suggest_chart` — extended:**
- Already emits `ChartSpec`. Now also considers user types.
- When suggesting a user type: emits `ChartSpec` with a new optional field `userTypeId: string` that tells the frontend to instantiate via the registry instead of compiling directly.
- The agent's suggestion reasoning includes: "Using your org's Revenue Waterfall chart type for this period-over-period breakdown."

**New tool: `list_custom_chart_types`:**
- Returns the user's installed types with their parameter/data-role schemas
- Agent can use this to pick the right type for the data

### 7.3 Show Me Recommender Extension

`chart-ir/recommender/showMe.ts` currently recommends from built-in chart types only. Extension:

1. After computing built-in recommendations, iterate `globalUserChartTypeRegistry.list()`
2. For each user type, check if the current column profile satisfies the type's parameter constraints (semantic type match, cardinality checks)
3. If match, append to recommendations with source: `'user-type'`
4. User types that match appear in a "Custom" section of the Show Me panel, below built-ins

---

## 8. Frontend Architecture

### 8.1 New Components

```
frontend/src/
  components/
    editor/
      CustomTypePicker.jsx               # EXISTS (test-scaffolded) — list + param form
      SpecTemplateComposer.jsx            # NEW — Pro Mode editor in template mode
      SpecTemplatePreview.jsx             # NEW — mock data preview pane
    chartTypes/                           # NEW
      ChartTypeGallery.jsx                # Gallery browse page
      ChartTypeGalleryCard.jsx            # Gallery card component
      ChartTypeDetail.jsx                 # Gallery detail page
      ChartTypeInstallButton.jsx          # Install + update flow
      ChartTypeDevPanel.jsx               # Dev mode floating panel
      IframeChartHost.jsx                 # Sandbox iframe host for Tier 2 types
      IframeChartBridge.ts                # postMessage protocol implementation
    picker/
      ShowMePanel.jsx                     # EXTENDED — custom type section
  pages/
    ChartTypeComposer.jsx                 # NEW — route /chart-types/new
    ChartTypeGalleryPage.jsx              # NEW — route /gallery
```

### 8.2 `IframeChartHost.jsx` — The Sandbox Runtime

```
┌─────────────────────────────────────────┐
│  EditorCanvas (host)                     │
│  ┌───────────────────────────────────┐  │
│  │  IframeChartHost                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  <iframe sandbox>            │  │  │
│  │  │    User's render code        │  │  │
│  │  │    (D3 / Canvas / WebGL)     │  │  │
│  │  └─────────────────────────────┘  │  │
│  │  ↕ postMessage                    │  │
│  │  IframeChartBridge.ts             │  │
│  └───────────────────────────────────┘  │
│                                          │
│  Inspector (right rail)                  │
│  ┌───────────────────────────────────┐  │
│  │  Auto-rendered from manifest's     │  │
│  │  formatting groups + properties    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**IframeChartHost lifecycle:**
1. Mount → create `<iframe sandbox="allow-scripts">` with `srcdoc` containing a bootstrap script
2. Bootstrap script loads the user's `index.js` bundle (injected as inline `<script>` in srcdoc — no network fetch)
3. User code calls `askdb.register(myChartType)` → sends `READY` message to host
4. Host sends `INIT` → `DATA` → chart renders
5. On data/resize/config change → host sends `DATA`/`RESIZE`/`THEME` → guest calls `update()`
6. On unmount → host sends `DESTROY` → guest calls `destroy()` → iframe removed

**Performance guard:** if `RENDER_COMPLETE` doesn't arrive within 5s after `DATA`, host shows a "Chart taking too long" warning overlay. After 15s, host kills the iframe and shows an error card. These timeouts are configurable per type in manifest (`renderTimeout`).

### 8.3 Inspector Auto-Rendering

The formatting model in `manifest.json` (capabilities.formatting) is auto-rendered as Inspector sections:

- Each `FormattingGroup` → accordion section in the Style tab
- Each `FormattingProperty` → form control:
  - `color` → color picker (same as existing Color section)
  - `number` → numeric input with optional min/max/step
  - `text` → text input
  - `boolean` → toggle switch
  - `select` → dropdown

Changes dispatch `DATA` message with updated `config` to the iframe. This mirrors Power BI's `capabilities.json` → Format Pane auto-render pattern.

### 8.4 Store Extensions

`store.js` Zustand additions:

```javascript
// chartTypes slice
installedChartTypes: [],           // hydrated from backend on session start
gallerySearchResults: [],
galleryLoading: false,
composerDraft: null,               // WIP spec template in the composer
devVizUrl: null,                   // localhost URL for dev mode
setInstalledChartTypes: (types) => ...,
installChartType: (id) => ...,
uninstallChartType: (id) => ...,
```

---

## 9. Backend Architecture

### 9.1 Existing Modules (from CLAUDE.md update)

- `chart_customization.py` — per-user storage for user-authored chart types. Already exists.
- `chart_customization_routes.py` — `/api/v1/chart-types` CRUD. Already exists.

### 9.2 New/Extended Endpoints

| Endpoint | Method | Purpose | New? |
|---|---|---|---|
| `/api/v1/chart-types` | GET | List user's installed types | Exists |
| `/api/v1/chart-types` | POST | Create/save a new type | Exists |
| `/api/v1/chart-types/{id}` | PUT | Update a type | Exists |
| `/api/v1/chart-types/{id}` | DELETE | Remove a type | Exists |
| `/api/v1/chart-types/install` | POST | Install from gallery | **New** |
| `/api/v1/chart-types/export/{id}` | GET | Download as `.askdbviz` | **New** |
| `/api/v1/chart-types/import` | POST | Upload `.askdbviz` | **New** |
| `/api/v1/gallery/types` | GET | Browse gallery (paginated) | **New** |
| `/api/v1/gallery/types/{id}` | GET | Gallery type detail | **New** |
| `/api/v1/gallery/submit` | POST | Submit type for review | **New** |
| `/api/v1/gallery/types/{id}/rate` | POST | Rate a gallery type | **New** |

### 9.3 New Backend Module: `gallery_store.py`

```python
class GalleryStore:
    """File-based gallery index + package storage.
    
    Storage layout:
      .data/gallery/index.json          # {types: [...], updated_at: ...}
      .data/gallery/packages/{id}/{version}.askdbviz
      .data/gallery/reviews/{id}.json
    
    Atomic writes for index.json (same pattern as users.json).
    """
    
    def list_types(self, page, per_page, category, tier, trust, sort) -> list
    def get_type(self, type_id) -> dict
    def submit_type(self, askdbviz_bytes, author_email) -> str  # returns submission ID
    def approve_type(self, submission_id, signing_key) -> None
    def reject_type(self, submission_id, feedback) -> None
    def download_package(self, type_id, version) -> bytes
    def rate_type(self, type_id, user_email, stars) -> None
    def report_type(self, type_id, user_email, reason) -> None
```

### 9.4 Agent System Prompt Injection

In `agent_engine.py`, when building the system prompt:

```python
def _build_chart_type_context(user_email: str) -> str:
    """Inject user's custom chart types into the agent's schema context."""
    types = chart_customization.list_types(user_email)
    if not types:
        return ""
    lines = ["## Available Custom Chart Types\n"]
    for t in types[:20]:  # cap at 20 to avoid prompt bloat
        params = ", ".join(f"{p['name']} ({p.get('semanticType', p['kind'])})" for p in t['parameters'])
        lines.append(f"- {t['id']} — \"{t['name']}\": {params}")
    return "\n".join(lines)
```

This is appended to the existing schema context block that gets prompt-cached. Cost: ~50 tokens per custom type, max ~1000 tokens for 20 types. Negligible.

---

## 10. Theming, Accessibility, i18n

### 10.1 Theming Inheritance

**Tier 1 (spec templates):** automatic. Templates compile through the same Vega-Lite pipeline, which reads theme tokens from `ThemeProvider`. No extra work.

**Tier 2 (iframe SDK):** host sends `THEME` message with full token set. Well-behaved custom types read `ctx.theme.colors.primary`, `ctx.theme.fonts.body`, etc. The SDK provides a helper: `askdb.getComputedColor('primary')` that resolves token → hex.

### 10.2 Accessibility

**Tier 1:** inherits Vega-Lite's built-in ARIA roles and descriptions.

**Tier 2:** author responsibility. The SDK provides:
- `askdb.setAriaLabel(element, label)` — helper that sets ARIA attributes on iframe-internal elements
- `askdb.announceToScreenReader(text)` — pushes text to a host-side live region via postMessage
- Gallery review checks: custom types that declare `features.supportsTooltip` must also implement keyboard-accessible tooltip triggering

### 10.3 Internationalization

Manifest supports `displayName` overrides per locale:

```json
{
  "name": "Sankey Flow Diagram",
  "i18n": {
    "ja": { "name": "サンキーフロー図" },
    "de": { "name": "Sankey-Flussdiagramm" }
  }
}
```

Not required for v1 gallery launch. English-only acceptable for initial community.

---

## 11. Performance Contracts

### 11.1 Tier 1 (Spec Templates)

Same as built-in charts — goes through RSR (Sub-project B). Server-side LTTB applies. Frame budget tracker monitors. No additional performance concern.

### 11.2 Tier 2 (Iframe SDK)

Isolated by design — iframe is a separate renderer context. **Cannot slow down the main thread.** But:

- Host monitors `RENDER_COMPLETE` latency. If p95 > 500ms over 10 renders, shows amber performance warning in the chart's corner badge.
- If render consistently exceeds `renderTimeout` (default 5s), host shows error overlay.
- Custom types count against the `InstancePool` (Sub-project B). Each mounted iframe = 1 slot of kind `'custom-iframe'` with weight `{webglContext: 0, estimatedMb: 30}`. Pool eviction applies — off-screen custom types unmount their iframe.
- Custom types that declare `features.supportsTheme: false` don't receive `THEME` messages, reducing postMessage traffic.

### 11.3 Bundle Size

- Tier 1: zero additional bundle size (uses existing IR compiler)
- Tier 2: `IframeChartHost.jsx` + `IframeChartBridge.ts` ≈ 5KB gzipped. Lazy-loaded — only imported when a Tier 2 type is mounted.
- Gallery page: lazy-loaded route, not in main bundle.
- `create-askdb-viz` CLI: separate npm package, not bundled with AskDB frontend.

---

## 12. Approaches Considered

### Approach A — "Spec templates only" (lower risk, faster, ~4–5 weeks)

Only Tier 1. No sandbox, no code execution. All user types are parameterized ChartSpec templates.

- **Pros:** Foundation already built. No security surface area. Agent integration trivial.
- **Cons:** Can't render non-Vega-Lite marks (Sankey, chord, radial bar, custom canvas). No "wow" for viz developers. Gallery has limited variety.
- **Verdict:** Ships fast but doesn't achieve the "Tableau Public wow factor."

### Approach B — "Full two-tier with iframe SDK" (chosen, ~7–9 weeks)

Both Tier 1 and Tier 2. iframe sandbox for custom render code. Gallery handles both types.

- **Pros:** Full Power BI custom visuals parity. Any rendering possible. Gallery has variety. Agent-aware. True "wow factor."
- **Cons:** iframe protocol is real engineering. Security review for gallery submissions. More testing surface.
- **Verdict:** **Chosen.** The phased build lets Tier 1 ship early (C0–C1) while Tier 2 develops (C2–C3). Gallery (C4) wraps both.

### Approach C — "Vega-Lite raw JSON editor" (Deneb-style, lightest)

Power users write raw Vega-Lite JSON directly. No parameter system, no SDK, no sandbox.

- **Pros:** Trivial to build. Deneb proves it works.
- **Cons:** Not a "chart type" system — it's a code editor. No reusability, no gallery, no agent awareness.
- **Verdict:** Subsumed. Tier 1's composer already produces VL-compatible output. A "raw JSON" toggle can be added as a Phase C5 polish item for power users who want to hand-edit the spec template.

**Recommendation:** Approach B, phased so Tier 1 value ships in Phase C1 (~2 weeks in).

---

## 13. Build Sequence — Six Phases (~7–9 weeks)

All phases gated behind `CUSTOM_CHART_TYPES_ENABLED` feature flag (default `true` — the foundation is already live). Tier 2 iframe SDK additionally gated behind `CHART_SDK_ENABLED` (default `false` until Phase C3 is stable).

### Phase C0 — Spec Template Composer UI (~1 week)

- Build `SpecTemplateComposer.jsx` — reuses Pro Mode's `MarksCard`, `DataRail`, `ChannelSlot` in template mode. Instead of real columns, rails show user-defined parameters as draggable pills.
- Build parameter editor: form to define `UserChartTypeParam` entries (name, kind, semantic type, required, default).
- Build `SpecTemplatePreview.jsx` — auto-generates mock data from parameter types, instantiates the template, renders via existing `VegaRenderer`.
- Wire metadata form: name, description, category, icon upload.
- Route: `/chart-types/new` → `ChartTypeComposer.jsx` page.
- **Checkpoint:** `c0-composer`. Test: create a waterfall template via UI, preview renders, save persists to backend.

### Phase C1 — Picker Integration + Agent Awareness (~1 week)

- Implement `CustomTypePicker.jsx` (component already test-scaffolded) — fetches from `/api/v1/chart-types`, renders by category, parameter form with column-profile-aware dropdowns.
- Extend `ShowMePanel.jsx` with "Custom" section showing installed user types.
- Extend `showMe.ts` recommender to score user types against column profiles.
- Implement agent system prompt injection (`_build_chart_type_context`).
- Add `list_custom_chart_types` agent tool.
- Extend `suggest_chart` tool to consider user types + emit `userTypeId` field.
- **Checkpoint:** `c1-picker-agent`. Test: install a custom type → appears in Show Me → agent suggests it for matching data.

### Phase C2 — iframe SDK + Host Runtime (~2 weeks)

- Define `IChartType` TypeScript interface + SDK types in `@askdb/chart-sdk` package (published to npm or bundled locally).
- Build `IframeChartHost.jsx` — creates sandboxed iframe, injects bundle as inline script, manages lifecycle.
- Build `IframeChartBridge.ts` — typed postMessage protocol, message serialization, timeout guards.
- Build `ChartTypeDevPanel.jsx` — floating panel for dev mode (console, timing, data inspector).
- Extend `chart-ir/router.ts` to route specs with `userTypeId` to either Tier 1 instantiation or Tier 2 iframe host.
- Extend `InstancePool` with `'custom-iframe'` kind.
- Build Inspector auto-rendering from `capabilities.formatting` schema.
- **Checkpoint:** `c2-iframe-sdk`. Test: load a sample D3 Sankey chart in the iframe, renders correctly, cross-filter selection works via postMessage.

### Phase C3 — Dev Tooling + Package Format (~1 week)

- Build `create-askdb-viz` npm scaffolding package.
- Build `npm run dev` local dev server with esbuild + WebSocket hot reload.
- Implement `?dev-viz=` query param handling in AskDB frontend.
- Implement `.askdbviz` ZIP packaging: `npm run package` → manifest hash → ZIP creation.
- Implement `/api/v1/chart-types/import` — upload `.askdbviz`, validate, extract, register.
- Implement `/api/v1/chart-types/export/{id}` — package installed type as `.askdbviz` download.
- **Checkpoint:** `c3-dev-tooling`. Test: scaffold → dev → hot reload → package → import → type appears in picker.

### Phase C4 — Community Gallery (~1.5 weeks)

- Build `gallery_store.py` backend module.
- Build gallery REST endpoints.
- Build `ChartTypeGallery.jsx`, `ChartTypeGalleryCard.jsx`, `ChartTypeDetail.jsx` UI.
- Build `/gallery` route.
- Build gallery submission + review flow (initially manual via admin tools).
- Implement ECDSA-P256 signing for approved packages.
- Implement signature verification on install.
- Implement "Update available" notification + one-click update.
- Seed gallery with 5–10 first-party example types: Waterfall, Sankey, Funnel, Radar, Bullet, Gauge, Waffle, Dumbbell, Lollipop, Slope.
- **Checkpoint:** `c4-gallery`. Test: submit type → admin approves → appears in gallery → other user installs → works in their workspace.

### Phase C5 — Polish + Production Rollout (~1 week)

- Raw JSON toggle in Spec Template Composer for power users.
- Gallery search + filtering polish.
- Agent suggestion quality tuning (ensure agent prefers custom types when context strongly matches).
- Performance monitoring: add `custom_type_render_ms` to telemetry payload.
- Flip `CHART_SDK_ENABLED` to `true` in staging. 1 week dogfood.
- Flip to `true` in production.
- **Checkpoint:** `c5-production`. Tag `chart-types-v1`.

**Total: ~7–9 weeks** assuming A's editor shell + B's RSR are stable, one strong full-stack engineer + AI assist.

---

## 14. Testing Strategy

### 14.1 Unit + Integration

- **Existing:** 21 tests in `userTypes.test.ts` (validator, instantiator, registry). Keep as-is.
- **Spec Template Composer:** test that creating parameters + dragging to channels produces correct `UserChartType` JSON.
- **iframe protocol:** mock iframe, send DATA, assert RENDER_COMPLETE arrives. Test timeout handling. Test DESTROY cleanup.
- **Gallery store:** CRUD tests, hash verification, signature verification, pagination.
- **Agent integration:** test that `_build_chart_type_context` includes installed types. Test `suggest_chart` prefers matching custom types.

### 14.2 End-to-End

- **Playwright: Tier 1 round-trip.** Create waterfall template in composer → preview renders → save → appears in picker → apply to real data → dashboard tile renders.
- **Playwright: Tier 2 round-trip.** Import `.askdbviz` → type appears → mount on dashboard → cross-filter works → uninstall.
- **Playwright: Gallery flow.** Browse → install → renders → rate → uninstall.

### 14.3 Security

- **iframe escape tests:** assert iframe cannot access `parent.document`, `parent.localStorage`, `document.cookie`.
- **CSP tests:** assert fetch/XHR from iframe blocked when no `allowedOrigins` declared.
- **Package integrity tests:** tamper with `.askdbviz` content → assert install fails with hash mismatch error.
- **Signature tests:** assert unsigned package gets "Dev" trust, community-signed gets "Community" badge.

### 14.4 Performance

- Mount 20 Tier 2 custom types on a dashboard simultaneously. Assert InstancePool evicts correctly, scroll stays at 60fps.
- Tier 2 render latency: send `DATA` to iframe, assert `RENDER_COMPLETE` within 2s for a 10k-point D3 scatter.
- Tier 1 instantiation: assert `instantiateUserChartType` + VL compile < 5ms per call.

---

## 15. Success Metrics

Measured 4 weeks after Phase C5 production rollout:

- **Custom types created per workspace:** target ≥ 1 per active workspace (orgs are using it).
- **Gallery installs per week:** target ≥ 50 after seeding with 10 first-party types.
- **Agent suggestions involving custom types:** target ≥ 5% of all chart suggestions (agent is aware).
- **Tier 1 vs Tier 2 split:** expect ~80% Tier 1, ~20% Tier 2 (most users compose from primitives).
- **Gallery submission rate:** target ≥ 3 community submissions per month after launch.
- **Zero iframe sandbox escapes** in first 90 days.
- **Custom type render p95 latency:** Tier 1 < 50ms, Tier 2 < 1s.

---

## 16. Out of Scope (Sub-project C)

- **Semantic layer** (workspace synonyms, persistent color map, metric definitions) → **Sub-project D**.
- **Proprietary VizQL clone** → future research project.
- **Custom data connectors** (Tableau WDC equivalent — user-authored data sources) → separate scope, not chart types.
- **Marketplace monetization** (paid chart types, revenue sharing) → future, if gallery grows.
- **Automated code review** (AST-based security scan of Tier 2 bundles before gallery publish) → future, manual review in v1.
- **Collaborative type editing** (multiple authors on one type) → future.
- **Type versioning with dashboard migration** (when a type's formatting schema changes, migrate saved dashboards) → Phase C5 polish or follow-up.
- **Mobile-specific rendering for custom types** → deferred, same as A.

---

## 17. Assumptions Made During Autonomous Drafting

This spec was drafted without sid23 present. Decisions below are reasonable defaults; sid23 may override any at spec-review.

1. **iframe + CSP is the sandbox model for Tier 2.** Web Worker rejected due to no DOM access. Shadow DOM rejected due to no security isolation.
2. **Tier 1 foundation already shipped.** The `chart-ir/userTypes/` module, `chart_customization.py`, and `chart_customization_routes.py` are treated as done per CLAUDE.md and file inspection.
3. **Gallery is self-hosted on AskDB backend.** No S3/CDN infra for v1. The `StorageBackend` abstraction allows future migration.
4. **Manual review for gallery submissions.** No automated code analysis in v1. sid23 or designee reviews submissions.
5. **ECDSA-P256 for package signing.** Standard, well-supported. Signing key generated once, stored securely outside the repo.
6. **`create-askdb-viz` is a separate npm package.** Not bundled with AskDB frontend. Published to npm or distributed via gallery docs.
7. **20 custom types cap in agent system prompt.** Prevents prompt bloat. If users install >20, the agent sees the 20 most-recently-used.
8. **No auto-update for installed types.** User controls upgrade timing.
9. **Gallery seeded with 10 first-party example types.** These serve as templates + showcase.
10. **Performance budget: Tier 2 iframe types get 5s render timeout by default.** Configurable in manifest.
11. **`CustomTypePicker` test already scaffolded.** Component implementation builds to pass those existing 4 tests.
12. **Total timeline 7–9 weeks.** Assumes A's editor shell + B's RSR are stable. One strong full-stack engineer + AI assist.

---

## 18. Cross-References

- **Sub-project A spec:** `docs/superpowers/specs/2026-04-15-chart-system-sub-project-a-design.md` — IR types, Marks card, Show Me, Pro Mode editor, dashboard archetypes.
- **Sub-project B spec:** `docs/superpowers/specs/2026-04-15-chart-system-sub-project-b-performance-design.md` — RSR, InstancePool, frame budget tracker, server-side LTTB.
- **Research base:** `docs/chart_systems_research.md`:
  - §2.10 — Tableau Dashboard Extensions + Viz Extensions + Exchange marketplace
  - §3.5 — Power BI Custom Visuals SDK (`IVisual`, `capabilities.json`, `pbiviz` toolchain, AppSource certification)
  - §4.3 — Looker LookML Vis API (sandboxed iframe, `create/updateAsync/destroy`, `options` DSL)
  - §4.9 — Looker Studio dscc (`postMessage`, `@google/dscc`, config JSON, two-deployment model)
  - §5.10 — AntV G2 (grammar of graphics as JS API, mark composition)
  - §5.12 — Deneb (Vega-Lite inside Power BI — the proof that grammar + BI field well works)
- **Existing code:**
  - `frontend/src/chart-ir/userTypes/` — types, schema, instantiate, registry (foundation)
  - `frontend/src/chart-ir/__tests__/userTypes/userTypes.test.ts` — 21 tests
  - `frontend/src/chart-ir/__tests__/editor/customTypePicker.test.tsx` — 4 tests (component TBD)
  - `backend/chart_customization.py` — per-user storage
  - `backend/routers/chart_customization_routes.py` — REST CRUD
  - `backend/agent_engine.py` — `suggest_chart` tool (to be extended)

---

## 19. Sign-off

This spec is **awaiting sid23's review**. Because it was drafted autonomously during a scheduled task run, no live brainstorm questions were asked — all open decisions are listed in §17 with their default choices and reasoning. Sid23 should review §2 (two-tier model), §3 (sandbox model), §4 (manifest/package format), §5 (gallery architecture), §7 (agent integration), §12 (approach choice), §13 (build sequence), and §17 (assumptions) at minimum.

After review, the next step is invocation of `superpowers:writing-plans` to produce the per-task implementation plan. No code is written before that plan exists and sid23 approves it.

**Reminder:** Sub-project D (`brainstorm-chart-sub-project-d-semantic-layer`) is still pending. Its scheduled task is ready to fire when C is approved.

— end of spec —
