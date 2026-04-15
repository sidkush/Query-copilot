# Chart System Redesign — Sub-project A — Design Spec

**Date:** 2026-04-15
**Author:** Brainstormed via `superpowers:brainstorming` skill with sid23
**Status:** Awaiting user review · spec self-reviewed inline
**Research base:** `docs/chart_systems_research.md` · `docs/chart_ux_implementation_plan.md`
**Scope:** Sub-project A of four (A=editor+dashboards · B=performance ceiling · C=user-authored chart types · D=semantic layer). Triggers for B/C/D persisted as ad-hoc scheduled tasks.

---

## 1. Executive Summary

Replace AskDB's existing chart system (ECharts + 21 chartDefs entries + monolithic `TileEditor.jsx` + monolithic `ResultsChart.jsx`) with a unified, voice-driven, agent-editable chart and dashboard editor built on Vega-Lite, MapLibre GL JS, and deck.gl. The new system has three modes (Default / Stage / Pro) that share one substrate: a Grammar-of-Graphics intermediate representation (`ChartSpec`) that the LLM agent emits, the renderer compiles, the user edits via direct manipulation, and the voice pipeline drives.

The product positioning is **Tableau-class compositional freedom + voice + AI agent + premium maps + dashboard archetype variety.** The chart engine is at parity with Tableau on cartesian/statistical charts (via Vega-Lite, the open intellectual descendant of VizQL), at parity on maps (via MapLibre, the open fork of Mapbox which Tableau itself uses), and ahead of Tableau on big-geo data (deck.gl) and on every voice/agent/dashboard surface.

ECharts and all 21 existing chartDefs are dropped. Three of the existing Three.js engines (Hologram, ParticleFlow) survive as Stage Mode visual material. deck.gl and the WebGL context pool are kept and extended.

The build is six phases over ~8–11 weeks, each ending with a git checkpoint behind a `NEW_CHART_EDITOR_ENABLED` feature flag. The terminal cutover happens in Phase 4 with a one-time migration script that converts existing tile configs to ChartSpec entries.

---

## 2. The Three Modes (Vision)

One React shell. Three rail/dock/canvas configurations selected via top-bar toggle:

### 2.1 Default Mode — Conversational Composer (B)

**Daily-driver layout. Most-seen surface in the product.**

- **Topbar (40px):** logo, workspace switcher, breadcrumb, mode toggle, Cmd-K, refresh, bookmarks, Share, Save, user avatar.
- **Filter sub-bar (36px):** active filter chips, add-filter, live row-count + refresh status.
- **Canvas (full width minus right rail):** dominant chart surface. The chart IS the product.
- **Bottom dock (44px):** voice mic + text input bar (Claude-style). Above the dock, a slim row of step-pills shows the agent's last 2–3 actions (e.g. "✓ picked line · ✓ grouped region · forecast 30d…"). Click a pill to expand into the full agent reasoning trace.
- **Optional right agent panel (340px):** chat history + tool-call cards. Collapsible via `Cmd+B`.

This is the layout the analyst-workbench full mockup demonstrated.

### 2.2 Stage Mode — Cinematic (A)

**Demo / executive / focus mode. Maximum spectacle.**

- **Layered Float layout:** canvas full-screen. Last 2–3 chat messages float in a glass bubble (bottom-left, draggable). Voice mic is a free-floating orb (bottom-right, draggable). Inspector and data rail collapse to icon strips until invoked.
- Wake-word voice flow auto-activates ("Hey Ask" or workspace-custom wake word like "Hey Stark").
- Mode toggle uses a smooth animation: data rail slides out, inspector slides out, chart fills the viewport, theme tokens swap to whichever Stage theme is selected (one of six — see §4).
- Best for: executive presentations, sales demos, analyst focus sessions, NOC walls running customer-facing dashboards.

### 2.3 Pro Mode — Tableau-Class Editor (C)

**Power analyst surface. Direct manipulation of every encoding channel.**

- **Three-pane layout (Tableau Classic):**
  - **Left rail (175px):** Marks card pinned at the top, Data pane below it. Marks card always visible — encoding is the hero. Data pane lists Dimensions (blue pills) + Measures (green pills) + Calculated Fields + Parameters.
  - **Center canvas:** Rows / Cols shelves docked above the canvas. Chart fills below.
  - **Right rail (195px):** Inspector with sectional accordion (Axis · Color · Labels · Legend · Analytics). One section open at a time.
- **`Cmd+.` Focus Mode:** collapses both side rails, leaves canvas fullscreen with floating Marks card. Bridges Pro Mode to Stage Mode without re-mounting components.
- Bottom dock + voice mic persist in Pro Mode — voice is a power-user accelerator for every UI control.
- Pro Mode users can flip agent autonomy from Adaptive (default) to Confirm-Each-Step for full visibility.

### 2.4 Substrate is shared

All three modes mount the same `ChartEditor` React component with different `mode` props that determine which rails/docks render. The IR, agent tools, voice pipeline, theme tokens, and chart renderer are identical underneath.

---

## 3. Visual Quality — Editorial-Premium Base + Stage Mode Themes + Tufte Discipline

**Base aesthetic (Default Mode + Pro Mode):** Premium Editorial. Linear / Stripe / Vercel / Arc inspired. Restrained, sharp, glassy, generous whitespace, micro-motion via Framer Motion. Sustainable for 8-hour analyst sessions. Light + dark theme variants.

**Stage Mode aesthetic:** user picks from six themes (see §4).

**Editorial discipline baked into design tokens:**
- Tufte data-ink ratio target ≥ 0.75 by default
- Minimum gridline approach (auto-hide secondary gridlines)
- Hand-curated color discipline (highlighted vs muted lines)
- Annotation-friendly chart components (leader lines, callouts, Tufte sparklines built into table cells)

**Color palettes (defaults):**
- Categorical: Tableau 10
- Sequential: Viridis (colorblind-safe, perceptually uniform)
- Diverging: ColorBrewer RdBu

Workspace can override via theme JSON files. Per-value semantic color map (e.g., "Europe always blue") shipped as part of Sub-project D — out of scope for A but the IR has a placeholder field for it.

---

## 4. Stage Mode Themes (Six)

Each theme is a token file (colors, fonts, motion settings) plus a small set of theme-specific visual primitives. The chart engine and IR don't change between themes — only the design tokens.

| # | Theme | Audience | Visual signature |
|---|---|---|---|
| 1 | **Quiet Executive** | C-suite, finance, banking, consulting, law | Boardroom polish. Monochrome glass on black. Hairline strokes, generous space, zero ornament. Looks expensive without trying. |
| 2 | **Iron Man** | Creative agencies, startups, dev teams, demos | Holographic Stark Industries HUD. Orange + cyan, particles, orbital rings, scan-lines, corner brackets, monospace readouts. Continuous spin/pulse motion. |
| 3 | **Bloomberg Terminal** | Traders, hedge funds, fintech, power analysts | Amber on black. JetBrains Mono everything. Tabular dense, sparkline accents. Keyboard-first, no decoration. |
| 4 | **Mission Control** | Engineers, DevOps, SRE, science | NASA / SpaceX console. Phosphor green on dark grid. Status pills, callouts, telemetry feel. Realtime aesthetic. |
| 5 | **Cyberpunk Neon** | Gaming, music, crypto, web3, streetwear brands | Magenta + cyan glitch, scan-lines, diagonal corner cuts, blink cursor. Phosphor glow. |
| 6 | **Vision Pro Frost** | Consumer, lifestyle, healthcare, education, wellness | Frosted glass over color blobs. Soft rounded everything, generous radius, gentle motion. Apple-grade premium and friendly. |

**Custom wake-word per theme + per workspace** (e.g., "Hey Stark" for Iron Man, "Bloomberg, show me…" for Bloomberg). Each workspace owner picks their default theme + wake-word. Stage Mode auto-activates wake-word voice flow when entered.

---

## 5. Voice — Hybrid Flow + Hybrid Tiered Infrastructure (BYOK)

### 5.1 Voice flow — Hybrid (user toggles per workspace)

Three flows ship, user picks:

- **Push-to-Talk (default).** Hold spacebar or mic button to record, release to send. Discord-style. Privacy-safe, open-office friendly, predictable. The default for all users.
- **Wake Word (Stage Mode default).** "Hey Ask" or workspace-custom wake word triggers listening. Mic auto-stops on silence. On-device wake-word detection via openWakeWord (or Porcupine if licensed) so audio never leaves the device until wake fires. Custom wake words per workspace ("Hey Stark", "Hey Bloomberg") become a viral marketing weapon.
- **Hot Mic (opt-in for power users).** Always-listening with continuous transcription. VAD auto-segments sentences. Agent classifies command vs ambient. Visible mute button. For dictation-heavy power-user sessions.

Stage Mode auto-flips to Wake Word for the cinematic demo flow. Pro Mode users can opt into Hot Mic.

### 5.2 Voice infrastructure — Hybrid Tiered, 100% BYOK, $0 to AskDB

Three STT/voice tiers stacked behind a single voice provider abstraction (mirrors `provider_registry.py` for LLM):

| Tier | Engine | Cost to user | Privacy | Latency | When used |
|---|---|---|---|---|---|
| 1 | **Whisper Local (whisper.cpp WASM)** | $0 | 100% local, audio never leaves browser | 300–600ms | Default for everyone. ~95% of users live here. |
| 2 | **Deepgram Streaming** | User's own Deepgram key (~$0.27/hr) | Cloud, BYOK | 120–200ms | Power users in Hot Mic mode. Workspace setting. |
| 3 | **OpenAI Realtime API** | User's own OpenAI key (~$3.60/hr) | Cloud, BYOK | 200–300ms, true conversational with interruption + voice OUT | Stage Mode demos. Executive presentations. |

**AskDB pays $0.** All paid tiers are unlocked by user-supplied API keys, stored Fernet-encrypted in the user profile (same `user_storage.py` pattern as the existing Anthropic key).

**Critical security pattern — ephemeral token mint:** for OpenAI Realtime + Deepgram, audio connects browser-direct to vendor, but the user's permanent API key NEVER ships to the browser. Flow:

1. Frontend requests `POST /api/v1/voice/session` from AskDB backend.
2. Backend reads the user's encrypted permanent key, calls the vendor's mint-ephemeral-token endpoint (OpenAI: `POST /v1/realtime/sessions`; Deepgram: scoped key API), returns short-lived token (60s TTL) to frontend.
3. Frontend opens WebSocket directly to vendor with ephemeral token.
4. Audio bytes go browser → vendor, never touching AskDB infrastructure.
5. Token expires in 60s, can't be reused, can't escalate privileges.

This is the OpenAI-recommended pattern for browser-side Realtime sessions.

**Workspace settings UI:** new "Voice Stack" panel — three slots (Whisper / Deepgram / OpenAI), each shows "Connect [vendor] key" or "Connected ✓". Each tier has per-workspace usage cap with cap-reached warning.

---

## 6. Agent Autonomy — Adaptive

Agent autonomy maps to AskDB's existing `agent_permission_mode` field but with a refined ruleset for chart creation:

**Default mode for all surfaces (Default + Stage):** **Adaptive.** Agent runs end-to-end without confirmation, EXCEPT it pauses for user approval when one of these triggers:

- SQL touches >100k rows (cost protection)
- SQL has aggregation that could spike DuckDB twin (perf protection)
- User question parses two ways with similar confidence (disambiguation)
- User said "delete" or "drop" anything (destructive op confirmation, hard stop)

**Pro Mode toggle:** analysts can flip to **Confirm-Each-Step** for full visibility. Every tool call surfaces a confirmation card with "Approve / Edit / Cancel". Useful for compliance-heavy workflows.

Adaptive mode is voice-friendly: the agent only interrupts when it actually has to, so the conversational flow is smooth.

---

## 7. Dashboard Archetypes — All Six Modes

Dashboards share the same tile-on-grid system but have six selectable display modes that are layout presets + a few mode-specific behaviors. Mode toggle is one click in the dashboard topbar.

### 7.1 Executive Briefing
- Premium Linear/Notion feel. Off-white app canvas (#f8f8fa), white tile shadows, blue accent.
- 4 KPI cards (top row, ~92px tall) with delta pills.
- Hero chart (full-width, ~200px tall) below KPIs.
- Two supporting tiles + AI narrative box at the bottom.
- AI-generated narrative paragraph that updates with filter changes, with highlighted phrases (e.g. "Revenue is up **$478K (24.7%)**...").
- Audience: C-suite, board meetings, monthly business reviews.

### 7.2 Analyst Dense Workbench
- Tableau-class density on warm gray canvas (#ededf0).
- 12-column grid, ~15+ tiles in view.
- Filter chip bar at top, click-to-cross-filter behavior across tiles.
- Mix of small KPIs, sparklines, funnels, heatmaps, bar charts, line charts, tables, activity feeds.
- Reference layout: the full mockup at `analyst-workbench-full.html` from the brainstorm session.
- Audience: power analysts, BI teams, sales ops, finance.

### 7.3 Live Operations
- Pure dark theme (#08080d), Datadog/Grafana feel.
- Traffic-light KPI status pills (green/amber blinking critical red).
- 5-second auto-refresh via WebSocket push (extends existing query routes).
- Threshold lines on charts (yellow dashed = warning, red = critical).
- Color-coded log stream component with timestamps + ERR/WRN/INF level pills.
- Alert ticker bar at the bottom with priority IDs.
- Audience: DevOps, SRE, NOC walls, manufacturing, trading floors.

### 7.4 Story / Scrollytelling
- Cream paper background (#faf7f0), Georgia serif typography.
- Vertical scroll layout with chapter sections.
- Editorial kicker + headline + byline + lede + annotated charts.
- Hand-curated annotations with leader lines (highlighted lines + muted background lines = Tufte color discipline).
- Sequential reveal as user scrolls.
- AI agent generates first-draft narrative, author edits.
- Scroll progress bar on right edge.
- Audience: annual reports, internal narratives, investor decks, customer success stories.

### 7.5 Pitch / Presentation Deck
- Cinematic dark with subtle purple gradient glow, Apple Keynote feel.
- Slide-by-slide navigation (←/→ keys, F11 fullscreen).
- 32px gradient headlines, one hero chart per slide.
- Page counter, prev/next/fullscreen icons in topbar.
- **Wraps the existing `PresentationEngine.jsx`** which already implements importance-scored bin-packing of tiles into 16:9 slides. The redesign replaces the chart renderer inside it; the bin-packing logic stays.
- Audience: board decks, sales pitches, investor updates, all-hands.

### 7.6 Multi-Tab Workbook
- Excel/Google Sheets visual language. Light app canvas (#f0f0f4).
- Realistic browser-tab style at the top — active tab visibly elevated with shadow + lighter background, color-coded dot icons, × close buttons, + add tab.
- Each tab is its own dashboard with its own layout (each tab can be a different archetype).
- Workbook-level shared filters apply across tabs.
- Audience: recurring reports, departmental hubs, long-running analyses.

### 7.7 Mode toggle UX

A three-position toggle in the dashboard topbar (visible only in dashboard view, not chart-editor view):
```
[ Briefing ] [ Workbench ] [ Ops ] [ Story ] [ Pitch ] [ Workbook ]
```
Click to swap modes. The same underlying tile data is re-rendered in the new mode's layout. Tile-to-tile mappings handled by mode-specific layout strategies.

---

## 8. Agent-Editable Dashboards — The Selling Point

The differentiator: **the agent can manipulate the dashboard from the chat.** Voice or text instruction → agent calls dashboard-editing tools → tile is created, moved, resized, restyled, deleted, or saved → user sees the change live in the canvas.

### 8.1 New agent tools (added to `agent_engine.py`)

| Tool | Purpose | Args |
|---|---|---|
| `create_tile` | Add a new tile to the dashboard at a grid position | `{type, title, sql, chart_spec, grid: {col, row, w, h}}` |
| `update_tile_layout` | Move or resize an existing tile | `{tile_id, grid: {col, row, w, h}}` |
| `edit_tile` | Modify a tile's chart spec (encoding, mark, transform, style) | `{tile_id, patch: {...JSON Patch}}` |
| `move_tile` | Reorder/reposition (alias for update_tile_layout for clarity) | `{tile_id, target}` |
| `delete_tile` | Remove a tile | `{tile_id}` |
| `save_dashboard` | Persist current dashboard state | `{dashboard_id}` |
| `set_dashboard_mode` | Switch between the 6 archetypes | `{dashboard_id, mode}` |
| `set_dashboard_filter` | Apply a workbook-level filter | `{field, op, value}` |
| `set_dashboard_theme` | Apply a Stage Mode theme | `{theme}` |

Each tool call emits to the SSE stream and renders as a **dashboard-action confirmation pill** in the agent panel (e.g., "Funnel resized · moved to row 2").

### 8.2 Visual feedback for in-progress edits

When the agent is editing a specific tile, that tile shows a visible "agent editing" badge with a pulsing dot in the corner and a blue glow border. This is the visual you saw in the analyst-workbench mockup.

### 8.3 Voice-driven dashboard editing

Same tools, voice input. Examples:
- "Make the funnel chart taller and move it next to velocity"
- "Color the heatmap by churn risk"
- "Add a forecast tile at the bottom right"
- "Switch to Pitch mode"
- "Apply Iron Man theme"
- "Remove the loss reasons donut"

The agent parses these into one or more tool calls, executes them, and the dashboard updates live. This is the killer demo.

### 8.4 Suggestion chips

The agent proactively suggests edits based on the current dashboard state and recent user actions. Suggestion chips appear above the input bar:
- "Enlarge heatmap"
- "Add forecast tile"
- "Color funnel by region"

Click a chip to execute. Chips are generated by the agent reasoning over the current dashboard structure.

---

## 9. IR Architecture — Vega-Lite + MapLibre + deck.gl + Three (Stage)

### 9.1 The ChartSpec IR

Every chart in AskDB is described by a `ChartSpec` JSON object — a Vega-Lite-compatible subset extended with map and large-geo spec types. The agent emits ChartSpec, the user edits it via the Marks card, the renderer compiles it to whichever rendering engine is appropriate.

```typescript
type SpecType = 'cartesian' | 'map' | 'geo-overlay' | 'creative';

interface ChartSpec {
  $schema: 'askdb/chart-spec/v1';
  type: SpecType;
  title?: string;
  description?: string;

  // Cartesian / statistical (Vega-Lite subset)
  mark?: Mark | { type: Mark; [prop: string]: unknown };
  encoding?: Encoding;
  transform?: Transform[];
  selection?: Selection[];
  layer?: ChartSpec[];
  facet?: { row?: FieldRef; column?: FieldRef; spec: ChartSpec };
  hconcat?: ChartSpec[];
  vconcat?: ChartSpec[];

  // Map (MapLibre/Mapbox/Google)
  map?: {
    provider: 'maplibre' | 'mapbox' | 'google';
    style: string;          // tile style URL or built-in name
    center: [number, number];
    zoom: number;
    layers: MapLayer[];     // markers, choropleth, lines, etc.
  };

  // Geo overlay (deck.gl on top of base map)
  overlay?: {
    layers: DeckLayer[];    // ScatterplotLayer, HexagonLayer, ArcLayer, etc.
  };

  // Creative (Stage Mode visuals)
  creative?: {
    engine: 'three' | 'r3f';
    component: string;      // identifier from the creative-lane registry
    props: Record<string, unknown>;
  };

  config?: {
    theme?: string;         // 'light' | 'dark' | 'iron-man' | etc.
    palette?: string;
    density?: 'comfortable' | 'compact';
  };
}

type Mark = 'bar' | 'line' | 'area' | 'point' | 'circle' | 'square' | 'tick'
          | 'rect' | 'arc' | 'text' | 'geoshape' | 'boxplot' | 'errorbar'
          | 'rule' | 'trail' | 'image';

type SemanticType = 'nominal' | 'ordinal' | 'quantitative' | 'temporal' | 'geographic';

type Aggregate = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct'
               | 'median' | 'stdev' | 'variance' | 'p25' | 'p75' | 'p95' | 'none';

interface FieldRef {
  field: string;
  type: SemanticType;
  aggregate?: Aggregate;
  bin?: boolean | { maxbins: number };
  timeUnit?: 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour';
  sort?: 'asc' | 'desc' | { field: string; op: Aggregate };
  format?: string;
  title?: string;
}

interface Encoding {
  x?: FieldRef;
  y?: FieldRef;
  x2?: FieldRef;
  y2?: FieldRef;
  color?: FieldRef & { scheme?: string };
  size?: FieldRef;
  shape?: FieldRef;
  opacity?: FieldRef;
  detail?: FieldRef[];      // level-of-detail split, no visible encoding
  tooltip?: FieldRef[];
  text?: FieldRef;
  row?: FieldRef;           // facet row
  column?: FieldRef;        // facet column
  order?: FieldRef;
}

interface Transform {
  filter?: { field: string; op: string; value: unknown };
  bin?: { field: string; maxbins?: number };
  aggregate?: { field: string; op: Aggregate; as: string };
  sample?: { n: number; method: 'lttb' | 'uniform' };
  calculate?: { as: string; expr: string };
}

interface Selection {
  name: string;
  type: 'interval' | 'point';
  on?: 'click' | 'hover';
  encodings?: (keyof Encoding)[];
  clear?: 'dblclick' | 'escape';
}
```

### 9.2 IR Router

`frontend/src/chart-ir/router.ts` inspects `spec.type` and routes to the appropriate renderer:

```
spec.type === 'cartesian' → react-vega (Vega-Lite)
spec.type === 'map'        → MapLibreCanvas component (wraps maplibre-gl)
spec.type === 'geo-overlay'→ DeckGLCanvas (deck.gl over MapLibre)
spec.type === 'creative'   → CreativeCanvas (three/r3f from registry)
```

Each renderer is a React component with the same props interface (`{spec, resultSet, theme, density, onElementClick}`). The ChartEditor swaps the renderer based on spec type — the rest of the editor (Marks card, inspector, agent panel) is renderer-agnostic.

### 9.3 What the Renderer Matrix Looks Like

| Need | Renderer | Notes |
|---|---|---|
| Bar, line, area, scatter, point, box, violin, histogram, density, ridgeline, heatmap, treemap, sunburst, parallel coords, layered, faceted, custom Vega marks | **Vega-Lite via react-vega** | The 80% case. Default. |
| Sankey, chord, hexbin, radial bar, custom polygon-based marks | **Vega-Lite + custom Vega marks** | Compositional freedom. |
| Country/state choropleth, point map, bubble map, smooth pan/zoom, road labels, vector tiles | **MapLibre GL JS** (free default) | BYOK Mapbox token unlocks Mapbox premium tiles. BYOK Google Maps key unlocks Google Maps tiles. Same BYOK pattern as voice infra. |
| Millions of geo points, hexagonal aggregation, arc/flow layers, 3D building extrusions, trip animations | **deck.gl** as a layer over MapLibre | GPU-accelerated. Already in codebase. |
| Stage Mode cinematic 3D (Iron Man HUD, particle flow, custom shaders) | **Three.js / react-three-fiber** | Lazy-loaded, NOT in default bundle. Reused: Hologram, ParticleFlow. Retired: Scatter3D, LiquidGauge, D3Ridgeline, the rest. |

### 9.4 What Gets Dropped

- **ECharts entirely.** `echarts` and `echarts-for-react` removed from `package.json` after Phase 4 cutover.
- **All 21 chartDefs entries** in `frontend/src/components/charts/defs/chartDefs.js` deleted.
- **`ResultsChart.jsx`** (1233 LOC) — replaced by the new ChartEditor.
- **`dashboard/CanvasChart.jsx`** (117 LOC) — replaced.
- **`dashboard/TileEditor.jsx`** (1308 LOC monolith) — replaced by the modular ChartEditor + Inspector subcomponents.
- **`charts/engines/ThreeScatter3D.jsx`** — retired.
- **`charts/engines/LiquidGauge.jsx`** — retired (Vega-Lite has gauge support via arc mark).
- **`charts/engines/D3Ridgeline.jsx`** — retired (Vega-Lite supports ridgeline natively).

### 9.5 What Gets Kept (Repurposed)

- **`charts/engines/ThreeHologram.jsx`** → registered in the Stage Mode creative-lane registry. Gated behind GPU tier detection.
- **`charts/engines/ThreeParticleFlow.jsx`** → same.
- **`charts/engines/GeoMap.jsx`** → rebuilt on top of the new MapLibre + deck.gl renderer module. Conceptually replaced.
- **`webglContextPool.js`** — extended with priority lanes for Stage Mode creative tiles (LRU eviction stays).
- **`gpuDetect.jsx`** — used to gate Stage Mode shaders + creative-lane registrations.
- **`PresentationEngine.jsx`** — wrapped as the Pitch dashboard mode (its bin-packing logic is reused, only the chart renderer inside it changes).
- **`GlobalFilterBar.jsx`** — extended for workbook-level shared filters (Multi-Tab Workbook mode).
- **`BookmarkManager.jsx`** — kept as-is, used for dashboard state snapshots.
- **`CommandPalette.jsx`** — extended with new chart/dashboard commands. Cmd-K stays the entrypoint.
- **`FloatingToolbar.jsx`** — refactored into `onobject/FloatingToolbar.jsx` for element-level edit actions.
- **`FormulaInput.jsx`** — kept for the calculated-field formula editor (Phase 7 of the original plan, deferred to Sub-project D).

### 9.6 Why Not VizQL Clone Now

A clean-room VizQL clone (built from the Polaris paper, VizQL paper, Show Me paper, and Tableau patents — never from leaked source) is a 6–12 month focused engineering project. It's the only way to surpass the last 5–8% of Tableau's render quality ceiling. **It is not in scope for Sub-project A.** It is captured as a future scheduled task: `build-proprietary-vizql-renderer`. When Sub-project A+B+C+D ship and AskDB has time and bandwidth, that task fires and starts the clone work.

The strategic rationale: ship 95% of Tableau's quality in 18 weeks via the proposed stack, then close the last 5% with the proprietary engine when the product is mature.

---

## 10. Surfaces — Both, Unified

The new ChartEditor replaces both:

- **Chat result charts** (currently `ResultsChart.jsx`, 1233 LOC) — the chart that appears after a query in the agent step feed. First-touch surface for new users.
- **Dashboard tiles** (currently `dashboard/TileEditor.jsx`, 1308 LOC + `dashboard/CanvasChart.jsx`, 117 LOC) — multi-chart dashboard surface where the Tableau gap is biggest.

Both surfaces mount the SAME `ChartEditor` component with different props:
- `<ChartEditor mode="default" surface="chat-result" />` — embedded in agent step feed, no rails, mini bottom dock.
- `<ChartEditor mode="default|stage|pro" surface="dashboard-tile" />` — full editor, rails, agent panel, mode toggle.

A chat-result chart can be promoted to a dashboard tile with one click ("Add to dashboard" button in the chart's overflow menu) — the spec gets persisted as a tile in the active dashboard.

---

## 11. Architecture Overview

### 11.1 New frontend modules

```
frontend/src/
  chart-ir/                                  # NEW
    types.ts                                 # ChartSpec, Encoding, Mark, Transform, Selection types
    router.ts                                # spec.type → renderer dispatch
    schema.json                              # JSON Schema for ChartSpec validation
    recommender/
      showMe.ts                              # Mackinlay-Hanrahan-Stolte rules
      resultShape.ts                         # column profile analysis
      chartTypes.ts                          # registry of chart type metadata + thumbnails
    renderers/
      VegaRenderer.tsx                       # wraps react-vega, compiles ChartSpec → VL spec
      MapLibreRenderer.tsx                   # wraps maplibre-gl, compiles spec.map
      DeckRenderer.tsx                       # wraps deck.gl, compiles spec.overlay
      CreativeRenderer.tsx                   # registers Stage Mode creative tiles
    transforms/
      lttb.ts                                # client-side LTTB sampling (server version in DuckDB twin)
      bin.ts
      aggregate.ts
      calculate.ts                           # sandboxed expression evaluator (reused from FormulaInput)
    voice/
      voiceProvider.ts                       # tier abstraction over Whisper/Deepgram/OpenAI
      whisperLocal.ts                        # whisper.cpp WASM wrapper
      deepgramStreaming.ts                   # Deepgram WebSocket adapter (browser-side)
      openaiRealtime.ts                      # OpenAI Realtime WebSocket adapter
      ephemeralToken.ts                      # frontend helper that calls /api/v1/voice/session
      wakeWord.ts                            # openWakeWord browser detection
      vad.ts                                 # voice activity detection for hot mic
  components/
    editor/                                  # NEW — the unified editor shell
      ChartEditor.jsx                        # top-level, hosts rails + canvas + dock + agent panel
      ChartEditorTopbar.jsx                  # logo + crumb + mode toggle + actions
      DataRail.jsx                           # left rail: schema, dimensions, measures, calc fields
      EditorCanvas.jsx                       # center, hosts the active renderer + on-object overlay
      BottomDock.jsx                         # voice mic + text input + agent step pills
      AgentPanel.jsx                         # right rail: chat history + tool-call cards + suggestions
      MarksCard.jsx                          # the encoding tray widget
      Pill.jsx                               # draggable field pill with aggregation dropdown
      ChannelSlot.jsx                        # drop target for a pill
      Inspector/
        InspectorRoot.jsx                    # right rail in Pro Mode, two-tab
        SetupTab.jsx                         # encoding tray, data source, aggregations, filters
        StyleTab.jsx                         # axes, colors, labels, legend, annotations, theming
        sections/
          AxisSection.jsx
          ColorSection.jsx
          LegendSection.jsx
          LabelSection.jsx
          TitleSection.jsx
          FilterSection.jsx
          AnalyticsSection.jsx               # reference lines, trend lines, forecast, clusters
    onobject/                                # NEW — on-object editing
      OnObjectOverlay.jsx                    # invisible hit layer over EditorCanvas
      AxisPopover.jsx
      LegendPopover.jsx
      TitleInlineEditor.jsx
      SeriesPopover.jsx
      FloatingToolbar.jsx                    # refactored from dashboard/FloatingToolbar.jsx
    picker/                                  # NEW — Show Me chart picker
      ShowMePanel.jsx
      ChartThumbnails.jsx
      ChartCategories.jsx
    dashboard/                               # EXTENDED
      DashboardShell.jsx                     # NEW — wraps multiple ChartEditor instances
      DashboardModeToggle.jsx                # NEW — Briefing/Workbench/Ops/Story/Pitch/Workbook
      modes/                                 # NEW — one layout strategy per archetype
        ExecBriefingLayout.jsx
        AnalystWorkbenchLayout.jsx
        LiveOpsLayout.jsx
        StoryLayout.jsx
        PitchLayout.jsx                      # wraps existing PresentationEngine
        WorkbookLayout.jsx
    voice/
      VoiceMic.jsx                           # mic widget with state animations
      WakeWordIndicator.jsx                  # gentle breathe animation for wake mode
      VoiceTranscript.jsx                    # streaming transcription preview
    themes/                                  # NEW
      tokens/
        light.ts                             # base Premium Editorial light
        dark.ts                              # base Premium Editorial dark
        stage-quiet-executive.ts
        stage-iron-man.ts
        stage-bloomberg.ts
        stage-mission-control.ts
        stage-cyberpunk.ts
        stage-vision-pro.ts
      ThemeProvider.jsx                      # Zustand-backed theme switcher
```

### 11.2 Existing files modified

| File | Change |
|---|---|
| `ResultsChart.jsx` (1233 LOC) | Replaced. Calls migrate to `<ChartEditor surface="chat-result" />`. |
| `dashboard/TileEditor.jsx` (1308 LOC) | Deleted. Tile editing happens in `<ChartEditor surface="dashboard-tile" />` mounted by `DashboardShell`. |
| `dashboard/CanvasChart.jsx` (117 LOC) | Deleted. |
| `dashboard/CommandPalette.jsx` | Extended with new chart/dashboard commands (set mode, apply theme, focus chart, etc.). |
| `dashboard/FloatingToolbar.jsx` | Moved to `onobject/FloatingToolbar.jsx`, expanded to handle element-level actions. |
| `dashboard/tokens.js` | Migrated into `themes/tokens/light.ts` + `dark.ts`. New token files added for the 6 Stage themes. |
| `store.js` (Zustand) | Add `chartEditor` slice (current spec, history stack, undo/redo, focus mode), `voice` slice (active tier, wake-word state, mute), `dashboard` slice (mode, agent-edit state). |
| `App.jsx` | Wrap routes in new `ThemeProvider`. Existing routes unchanged. |
| `package.json` | Add: `vega`, `vega-lite`, `react-vega`, `maplibre-gl`, `@maplibre/maplibre-gl-leaflet` (compat layer), `@google/dscc` (for the Sub-project C SDK, deferred). Remove: `echarts`, `echarts-for-react` after Phase 4 cutover. |

### 11.3 Backend changes

```
backend/
  agent_engine.py                            # MODIFIED
    suggest_chart                            # tool now emits ChartSpec instead of {chart_type, x_axis, y_axis}
    create_tile                              # NEW agent tool — adds tile to dashboard
    update_tile_layout                       # NEW
    edit_tile                                # NEW (JSON Patch on chart spec)
    move_tile                                # NEW
    delete_tile                              # NEW
    save_dashboard                           # NEW
    set_dashboard_mode                       # NEW
    set_dashboard_theme                      # NEW
  query_engine.py                            # MODIFIED
    return column_profile alongside result rows
  schema_intelligence.py                     # MODIFIED
    profile_columns()                        # extends existing schema profiling for chart recommendation
  routers/
    voice_routes.py                          # MODIFIED
      POST /api/v1/voice/session             # NEW — mints ephemeral STT tokens for browser
      GET /api/v1/voice/providers            # NEW — lists configured voice providers per workspace
    dashboard_routes.py                      # MODIFIED
      POST /api/v1/dashboards/{id}/tiles     # accepts ChartSpec instead of legacy chart_type
      PATCH /api/v1/dashboards/{id}/tiles/{tile_id}  # JSON Patch support
      POST /api/v1/dashboards/{id}/migrate   # NEW — one-time migration from legacy tiles to ChartSpec
      POST /api/v1/dashboards/{id}/mode      # NEW — switch dashboard archetype mode
    chart_routes.py                          # NEW
      POST /api/v1/charts/recommend          # backend version of Show Me ruleset (for non-LLM contexts)
      POST /api/v1/charts/compile            # OPTIONAL — server-side ChartSpec → render output for digests
  voice/                                     # NEW
    deepgram_provider.py                     # mint ephemeral Deepgram scoped key
    openai_realtime_provider.py              # mint ephemeral OpenAI Realtime token
    voice_registry.py                        # tier dispatch (mirrors provider_registry.py)
  user_storage.py                            # MODIFIED
    add fields: deepgram_key, openai_key, voice_tier_preference, wake_word, default_theme
```

### 11.4 Backend contract — column profile

Query result payload (`POST /api/v1/queries/execute` response) gains a `column_profile` field:

```json
{
  "columns": ["region", "month", "revenue"],
  "rows": [...],
  "row_count": 1247,
  "column_profile": [
    {
      "name": "region",
      "dtype": "string",
      "role": "dimension",
      "semantic_type": "nominal",
      "cardinality": 4,
      "null_pct": 0.0,
      "sample_values": ["North", "South", "East", "West"]
    },
    {
      "name": "month",
      "dtype": "date",
      "role": "dimension",
      "semantic_type": "temporal",
      "cardinality": 12,
      "null_pct": 0.0,
      "sample_values": ["2026-01-01", "2026-02-01", ...]
    },
    {
      "name": "revenue",
      "dtype": "float",
      "role": "measure",
      "semantic_type": "quantitative",
      "cardinality": 1247,
      "null_pct": 0.02,
      "sample_values": [12450.0, 8902.5, 15670.25]
    }
  ]
}
```

This profile feeds the Show Me recommender + the agent's chart suggestions.

---

## 12. Build Sequence — Six Phases

Each phase ends with a git checkpoint commit + tag (`v0-foundations`, `v1-editor-shell`, etc.) and is gated by the `NEW_CHART_EDITOR_ENABLED` feature flag (default `false`). Until Phase 4 cutover, the existing TileEditor + ResultsChart keep running for production traffic.

### Phase 0 — Foundations (1–2 weeks)
- Add `vega`, `vega-lite`, `react-vega`, `maplibre-gl` to `package.json` (lazy-load via dynamic imports for non-default routes).
- Define `ChartSpec` TypeScript types in `chart-ir/types.ts`. Generate JSON Schema for runtime validation.
- Build `chart-ir/router.ts` that dispatches by `spec.type` to a stub renderer.
- Build `chart-ir/recommender/showMe.ts` with the Mackinlay-Hanrahan-Stolte rules ported from research doc §2.2.
- Build `chart-ir/recommender/resultShape.ts` to analyze column profiles.
- Backend: extend `query_engine.py` to return `column_profile` in query responses.
- Backend: rewrite `agent_engine.py::suggest_chart` to emit `ChartSpec` JSON. Update system prompt with IR schema in cached context.
- **Checkpoint commit:** `v0-foundations`. Tests: snapshot tests for IR compiler with 24 canonical chart shapes from research doc §2.1.

### Phase 1 — Editor shell (1–2 weeks)
- Build `editor/ChartEditor.jsx` 3-pane shell (data rail + canvas + inspector). CSS grid, collapsible columns.
- Build `editor/ChartEditorTopbar.jsx` with breadcrumb + Default/Pro/Stage mode toggle + Save/Share.
- Build `editor/DataRail.jsx` — accordion sections for Dimensions / Measures / Calculated / Parameters. Drag-drop pill components.
- Build `editor/EditorCanvas.jsx` that hosts a `VegaRenderer.tsx` stub.
- Build `editor/Inspector/InspectorRoot.jsx` skeleton with Setup/Style tabs.
- Build `editor/BottomDock.jsx` with text input + mock mic button.
- New routes test page mounts `<ChartEditor>` for visual validation.
- **Checkpoint commit:** `v1-editor-shell`. Tests: Playwright clicks through 3-pane resize, rail collapse, mode toggle.

### Phase 2 — Marks card + on-object editing (2 weeks)
- Build `editor/MarksCard.jsx` with channel slots (Color/Size/Label/Detail/Tooltip/Shape/Path/Angle).
- Build `editor/Pill.jsx` with aggregation dropdown, sort, filter, format actions.
- Build `editor/ChannelSlot.jsx` with HTML5 drag-drop, slot-type validation, shift-drag semantics.
- Wire drag-drop from DataRail → Marks card → ChartSpec patch → re-render.
- Build `onobject/OnObjectOverlay.jsx` that captures clicks on chart elements via Vega event hooks.
- Build `onobject/AxisPopover.jsx`, `LegendPopover.jsx`, `SeriesPopover.jsx`, `TitleInlineEditor.jsx`. Use `@floating-ui/react`.
- Refactor `dashboard/FloatingToolbar.jsx` → `onobject/FloatingToolbar.jsx` with element-aware actions.
- Build `chart-ir/applySpecPatch.ts` JSON Patch helper.
- Implement Cmd-Z / Cmd-Shift-Z spec history (capped at 100).
- **Checkpoint commit:** `v2-marks-card`. Tests: drag a field from data rail to Color slot → ChartSpec updates → renders. Click axis → popover opens. Edit title inline → spec updates.

### Phase 3 — Voice + agent dashboard editing (1–2 weeks)
- Build `chart-ir/voice/voiceProvider.ts` tier abstraction.
- Build `chart-ir/voice/whisperLocal.ts` — whisper.cpp WASM wrapper, lazy-loaded.
- Build `chart-ir/voice/deepgramStreaming.ts`, `openaiRealtime.ts` — vendor adapters.
- Build `chart-ir/voice/wakeWord.ts` — openWakeWord browser detection.
- Backend: implement `POST /api/v1/voice/session` ephemeral token mint endpoint. Implement `voice_registry.py` tier dispatch.
- Backend: store user voice keys (Fernet-encrypted) in `user_storage.py`.
- Frontend: workspace settings UI for connecting Deepgram + OpenAI keys.
- Build `editor/AgentPanel.jsx` with chat history + tool-call cards + suggestion chips.
- Add new agent tools to `agent_engine.py`: `create_tile`, `update_tile_layout`, `edit_tile`, `move_tile`, `delete_tile`, `save_dashboard`, `set_dashboard_mode`, `set_dashboard_theme`. Each emits SSE events that the AgentPanel renders as confirmation pills.
- Wire voice flow toggles (PTT default, Wake Word, Hot Mic) in workspace settings + global settings.
- **Checkpoint commit:** `v3-voice-agent`. Tests: voice dictation in Whisper tier produces correct transcript. Agent receives "make this stacked" and the bar chart actually re-renders. Ephemeral token mint endpoint tested for token TTL expiry.

### Phase 4 — Dashboard archetypes + cutover (2 weeks)
- Build `dashboard/DashboardShell.jsx` and `DashboardModeToggle.jsx`.
- Build `dashboard/modes/ExecBriefingLayout.jsx`, `AnalystWorkbenchLayout.jsx`, `LiveOpsLayout.jsx`, `StoryLayout.jsx`, `PitchLayout.jsx` (wraps existing `PresentationEngine`), `WorkbookLayout.jsx`.
- Implement Live Ops 5-second WebSocket auto-refresh (extends agent SSE infrastructure).
- Implement Story scroll system + annotation primitives.
- Implement Workbook tab persistence + workbook-level shared filters (extends `GlobalFilterBar`).
- **Migration script:** `POST /api/v1/dashboards/{id}/migrate` — reads legacy tile config, generates equivalent ChartSpec, writes back. Idempotent. Backed up before run.
- Migrate all existing dashboards to the new ChartSpec format via the migration script.
- Flip `NEW_CHART_EDITOR_ENABLED` default to `true` in staging.
- **Checkpoint commit:** `v4-dashboard-modes`. Tests: each archetype renders with sample data. Agent edit tool calls update tiles live. Migration script idempotent on representative dashboards.

### Phase 5 — Stage Mode + 6 themes (1 week)
- Build `themes/tokens/stage-quiet-executive.ts`, `stage-iron-man.ts`, `stage-bloomberg.ts`, `stage-mission-control.ts`, `stage-cyberpunk.ts`, `stage-vision-pro.ts`.
- Build `editor/ChartEditor.jsx` Stage Mode layout: Layered Float, glass chat bubble, free-floating mic orb, collapsed rails.
- Mode-switch animation: rails slide out, theme tokens swap, layout transitions via Framer Motion.
- Custom wake-word per workspace: workspace settings field, openWakeWord trains on the custom phrase via a small training step (or uses a precomputed model from the wake-word vendor).
- Three.js Hologram + ParticleFlow rebuilt as `creative` spec-type renderers, registered in the creative-lane registry. Gated by GPU tier detection.
- **Checkpoint commit:** `v5-stage-mode`. Tests: each theme renders correctly. Mode-switch animation completes in <500ms. Wake word fires on test phrase.

**Total: 8–11 weeks** for one strong frontend + backend engineer with AI assistance.

### 12.1 Feature flag rollout strategy

- `NEW_CHART_EDITOR_ENABLED=false` is the default through Phases 0–3. Existing `TileEditor` and `ResultsChart` keep running.
- During Phases 0–3, the new editor is mounted on a dev-only test route (`/dev/chart-editor`).
- At Phase 4, after migration script runs in staging, flip default to `true` for staging.
- After 1 week of staging dogfood, flip default to `true` in production.
- Existing TileEditor + ResultsChart kept in code for one release as a rollback safety net.
- After two stable releases, delete the old code and `echarts` deps from `package.json`.

---

## 13. Testing Strategy

### 13.1 Unit + integration

- **`chart-ir` unit tests.** For every chart shape in the Show Me catalog, author a canonical `ChartSpec`, compile to Vega-Lite output, snapshot. Render in jsdom + `@testing-library/react`, compare bounding boxes against golden files.
- **Recommender tests.** ~30 column-profile fixtures with expected top recommendations. Adversarial tests for null measures, huge cardinalities, mixed types, geographic strings that aren't countries.
- **Backend tests.** Extend existing `test_adv_*.py` pattern: `test_adv_chart_spec_validation.py` (reject malformed specs), `test_adv_voice_session_token.py` (TTL expiry, scope correctness, replay protection), `test_adv_dashboard_migration.py` (idempotent, no data loss).
- **Migration script tests.** Run against representative legacy dashboards, assert ChartSpec output renders identically.

### 13.2 End-to-end

- **Playwright suite for the editor.** Drag-drop pill, click-axis-popover, Cmd-K command palette, mode toggle, Cmd+. focus mode, undo/redo.
- **Voice tests.** Mock STT provider that returns predetermined transcripts. Assert agent receives correct text + executes correct tool call.
- **Agent dashboard edit tests.** End-to-end: voice "make funnel taller, move next to velocity" → assert tile grid coordinates updated.

### 13.3 Visual regression

- Ladle/Storybook with all chart types in light + dark + comfortable + compact + each Stage Mode theme.
- CI runs Percy / Chromatic snapshots on PRs.

### 13.4 Performance

- Compile 1000 random ChartSpecs in a perf test, p95 must be <5ms per compile.
- Render 50 concurrent dashboard tiles, assert no dropped frames during scroll.
- Voice latency: end-to-end test from "user speaks" → "chart updates" must be <2s in Whisper Local tier on a mid-spec laptop.

---

## 14. Migration Plan

1. Phases 0–3 ship behind feature flag, default off. Existing system unchanged.
2. Phase 4 migration script runs in staging against a copy of production dashboards. Validates 1:1 visual fidelity for migrated tiles (snapshot diff, manual review for edge cases).
3. Failures are logged with the original tile config + the generated ChartSpec for manual triage. Acceptable failure rate: <2% of tiles, all reviewed by hand.
4. Flip flag to `true` in staging. Internal dogfood for 1 week.
5. Flip flag to `true` in production. Existing TileEditor + ResultsChart kept in code as rollback safety net.
6. Monitor: error rate, time-to-first-chart, chart-edit count, Cmd-K usage, agent-edit-tool calls per session, voice tier utilization. Compare against legacy baseline.
7. After 2 stable releases, delete old code + `echarts` deps. Final cleanup commit.

---

## 15. Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vega-Lite render perf inadequate at >100k points | Medium | High | Route to deck.gl for scatter >50k, server-side LTTB sampling via DuckDB twin (Sub-project B closes this fully) |
| Migration script breaks existing dashboards | Medium | High | Snapshot diff every migrated tile against pre-migration render. Manual review queue for failures. Backup before run. |
| Voice latency in Whisper Local tier too slow on weak laptops | Medium | Medium | Use Whisper Tiny (~75MB) by default, allow upgrade to Base (~150MB). Background-load on first session. Fall back to PTT if real-time mode lags. |
| Bundle size regression | Medium | Medium | Lazy-load Vega, MapLibre, deck.gl, Three per route. Daily-use bundle target ≤ 700KB gzipped. CI bundle-size budget gate. |
| Custom wake-word detection unreliable across browsers | Low | Low | Ship PTT as the universal fallback. Wake-word is opt-in for Stage Mode only. |
| Agent emits invalid ChartSpec | Medium | Low | Server-side JSON Schema validation + auto-repair retry loop (reuse pattern from `sql_validator.py`). |
| OpenAI Realtime API still beta, breaking changes | Low | Medium | Adapter pattern in `openai_realtime_provider.py` isolates upstream changes. BYOK means Anthropic infra isn't on the hook for outages. |
| Dropping ECharts breaks existing dashboards in production | High if rushed | High | Phases 0–3 don't touch existing code. Phase 4 migration is gated, reversible, and one-release-cycle behind ECharts deletion. |
| Three.js + WebGL context exhaustion | Low | Medium | Existing `webglContextPool.js` LRU eviction handles this. Stage Mode tiles count against the pool. |
| Agent dashboard-edit tools cause race conditions on persisted state | Medium | Medium | Tile updates use optimistic locking via version field. Conflicts surface as "agent edit conflict, retry?" to the user. |
| Story/Scrollytelling annotation system underestimated | Medium | Low | Cut to a minimal first version (kicker + headline + lede + one annotated chart). Scrolly reveal can be Phase 5 polish. |

---

## 16. Success Metrics

Measured 4 weeks after Phase 4 cutover:

- **Time-to-first-chart from NL prompt:** target <2s (baseline: measure existing system before cutover).
- **Chart edits per session:** target 2× existing baseline (users iterate, don't just accept AI output).
- **Cmd-K palette usage:** ≥30% of sessions.
- **Voice mode usage:** ≥10% of sessions try voice in the first week.
- **Agent dashboard-edit tool calls per session:** target 1.5+ (the killer demo is happening).
- **Dashboard mode switches per session:** ≥0.5 (people are exploring archetypes).
- **Stage Mode activations per workspace per week:** ≥2 (used for actual demos, not just curiosity).
- **Agent re-prompt rate** (user says "change this" then re-prompts because UI couldn't do it): -50% vs baseline.
- **Ad-hoc qualitative survey** ("does AskDB feel like Tableau?"): ≥7/10 average.

---

## 17. Out of Scope (Sub-project A)

The following are explicitly NOT in Sub-project A. Each has its own scheduled task / spec:

- **Performance ceiling work** (LTTB integration deeper into DuckDB twin, progressive rendering, frame budgets, 10M+ row benchmarks) → **Sub-project B**, scheduled task `brainstorm-chart-sub-project-b-performance`.
- **User-authored chart types + community gallery** (custom marks SDK, sandboxed user code, gallery UI, import/export) → **Sub-project C**, scheduled task `brainstorm-chart-sub-project-c-user-authored-types`.
- **Semantic layer** (workspace synonyms, persistent color map, reusable metric definitions, teach-by-correction) → **Sub-project D**, scheduled task `brainstorm-chart-sub-project-d-semantic-layer`.
- **Proprietary VizQL clone** (clean-room implementation from Polaris/VizQL/Show Me papers, custom Canvas+WebGL renderer) → future research project, scheduled task `build-proprietary-vizql-renderer`.
- **Calculated field formula editor** (Monaco-based, schema-aware autocomplete, on-the-fly validation) → deferred to Sub-project D where it's needed for metric definitions.
- **Drillthrough actions** (right-click data point → jump to detail page pre-filtered) → deferred, may land in Sub-project A polish or moved to a future enhancement.
- **Bookmark system extensions** (existing `BookmarkManager.jsx` is kept as-is, no new features).
- **Mobile-specific layout author mode** (Power BI's mobile layout view) → deferred. Responsive grid via CSS handles the 80% case.
- **Tooltip embedded mini-chart** (Tableau's "Viz in Tooltip" pattern) → deferred to a Sub-project A polish phase if time permits, otherwise Sub-project B.

---

## 18. Open Questions for Review

These are decisions I made on user behalf during the spec write-up that I'd like sid23 to explicitly confirm before invoking writing-plans:

1. **Vega-Lite version.** Latest stable (v5.x as of April 2026)? Or pin to a specific version with a known-good release? I assumed latest stable.
2. **MapLibre version.** Latest stable. Same question.
3. **Default base tile provider for MapLibre.** OpenStreetMap raster tiles are free but legally require attribution. Free vector tile providers (e.g., MapTiler free tier) need a key. I assumed OSM raster as the no-key default; users with a MapTiler/Mapbox/Google key get vector tiles. Confirm OK.
4. **`@floating-ui/react` for popover positioning.** Standard React popover lib. Or do you have an existing preference (e.g., already using Radix UI)?
5. **Storybook vs Ladle for visual regression CI.** Ladle is faster + smaller; Storybook has more tooling. I assumed Ladle.
6. **Default voice tier when no key configured.** Whisper Local downloads ~75MB on first session. Is that acceptable? Or should we ask user permission first ("Download voice model? 75MB")?
7. **Custom wake-word vendor.** openWakeWord is FOSS but training a custom phrase requires a small dataset. Alternative: Picovoice Porcupine which has commercial pricing for custom phrases. I assumed openWakeWord with a "premium custom wake words" upgrade path via Porcupine BYOK.
8. **Agent SSE event format extension.** New tool-call cards need a `type: "dashboard_action"` event variant. Confirm extending the existing SSE schema is OK vs versioning it.
9. **Tile schema migration backward compatibility.** Once migrated, can the old TileEditor still read the new ChartSpec format (for emergency rollback)? I assumed yes — we keep a `legacy_chart_type` field on the migrated tile pointing to the closest old equivalent.

If any of these need different answers, tell me before I invoke writing-plans.

---

## 19. References

- **Existing AskDB code:** `frontend/src/components/ResultsChart.jsx`, `dashboard/TileEditor.jsx`, `dashboard/CanvasChart.jsx`, `dashboard/CommandPalette.jsx`, `dashboard/PresentationEngine.jsx`, `dashboard/GlobalFilterBar.jsx`, `dashboard/BookmarkManager.jsx`, `dashboard/tokens.js`, `charts/defs/chartDefs.js`, `charts/engines/*`, `agent_engine.py`, `voice_routes.py`, `query_engine.py`, `provider_registry.py`, `user_storage.py`, `webglContextPool.js`, `gpuDetect.jsx`.
- **Research synthesis:** `docs/chart_systems_research.md` (1432 lines, 9 sections covering Tableau, Power BI, Looker, chart libraries, UI patterns).
- **Original chart UX redesign plan:** `docs/chart_ux_implementation_plan.md` (the precursor to this spec, replaced by it).
- **Brainstorming session artifacts:** `.superpowers/brainstorm/3298-1776222737/content/*.html` — visual mockups for vision direction, visual quality, stage themes, default mode layout, voice flow, voice infra, pro mode editor (v1 + v2), dashboard archetypes (v1 + v2), and the full analyst-workbench mockup.
- **Foundational papers (clean-room VizQL future work, not Sub-project A):**
  - Stolte, Tang, Hanrahan (2002) — *Polaris* — IEEE TVCG vol. 8.
  - Hanrahan (2006) — *VizQL: A Language for Query, Analysis and Visualization* — SIGMOD.
  - Mackinlay, Hanrahan, Stolte (2007) — *Show Me: Automatic Presentation for Visual Analysis* — IEEE TVCG 13(6).
  - Mackinlay (1986) — *Automating the Design of Graphical Presentations of Relational Information* — ACM TOG.
- **Vega-Lite paper:** *Vega-Lite: A Grammar of Interactive Graphics* (Satyanarayan, Moritz, Wongsuphasawat, Heer, 2017, IEEE InfoVis). Hanrahan was on the committee.
- **Apache Superset multi-renderer pattern:** SIP-50 (Superset's ECharts adoption decision), validating the multi-engine architecture.
- **Power BI Deneb:** the proof point that Vega-Lite inside a production BI tool gives users Tableau-class compositional freedom.

---

## 20. Sign-off

Sub-project A scope, architecture, modes, themes, voice stack, agent autonomy, dashboard archetypes, IR, surfaces, build sequence, and rollout plan are all locked per the brainstorm session 2026-04-15 with sid23.

When user confirms this spec is acceptable, I invoke `superpowers:writing-plans` skill which produces the detailed implementation plan with task-level breakdowns, dependency ordering, and per-phase checkpoints. After that, the new branch + worktree gets created and Phase 0 begins.

**Decisions awaiting user re-confirmation:** the 9 open questions in §18.

— end of spec —
