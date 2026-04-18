## Scope

Frontend deep-dive: React 19 + Vite 8 + Zustand slices, React Router v7 gates, ChartEditor, Vega-Lite rendering via react-vega, SSE agent UI. Numeric defaults in `config-defaults.md`. **On-demand** — read when the task touches UI.

### Frontend — React 19 + Vite 8 (`/frontend`)

**Mostly JavaScript** with a TypeScript carve-out for `chart-ir/**` and `components/editor/**/*.{ts,tsx}`. Vitest 2.x test suite: **1189 tests across 141 files** (`npm run test:chart-ir`). tsconfig scope: `src/chart-ir/**` + `src/components/editor/**/*.{ts,tsx}`. Rest of `src/components/` stays `.jsx`.

**State:** Zustand store (`store.js`) — auth, connections, chat, profile, agent, theme, chartEditor, activeSemanticModel. Token persisted to localStorage. chartEditor slice: `{currentSpec, history, historyIndex, mode, historyCap}` + `setChartEditorSpec`/`initChartEditorSpec`/`undoChartEditor`/`redoChartEditor`/`setChartEditorMode`. Agent slice properties:
- Core: `agentSteps`, `agentLoading`, `agentError`, `agentWaiting`, `agentWaitingOptions`, `agentAutoExecute`, `agentChatId`
- UI panel: `agentDock` (float/right/bottom/left), `agentPanelWidth`, `agentPanelHeight`, `agentPanelOpen`, `agentResizing`
- Progress: `agentChecklist`, `agentPhase`, `agentElapsedMs`, `agentEstimatedMs`, `agentSessionProgress`, `agentVerification`
- Permissions: `agentPersona`, `agentPermissionMode`
- Dual-response: `dualResponseActive`, `cachedResultStep`
- Intelligence: `agentTierInfo`, `turboStatus`, `queryIntelligence`

**API layer:** `api.js` — injects JWT `Authorization` header. 401 redirects to `/login`. Admin API use separate `admin_token` in localStorage.

**Routing:** `App.jsx` — React Router v7 with `ProtectedRoute` HOC and `AnimatePresence` page transitions. `ProtectedRoute` gates on `apiKeyStatus` — BYOK users without valid key redirected to setup. Route map:
- Public: `/` (Landing), `/login`, `/auth/callback`, `/admin/login`, `/admin`, `/shared/:id` (SharedDashboard)
- Protected (no sidebar): `/tutorial`, `/onboarding`
- Protected (with `AppLayout` sidebar): `/dashboard`, `/schema`, `/chat`, `/profile`, `/account`, `/billing`, `/analytics`, `/ml-engine`
- `/dashboard` → `Dashboard.jsx` (view-only, query result tiles); `/analytics` → `AnalyticsShell.jsx` → `DashboardShell.jsx` (6-mode archetype shell with ChartEditor tiles — Vega-Lite rendering, no ECharts); `/ml-engine` → `MLEngine.jsx` (AutoML pipeline UI — 6 stages: Ingest → Clean → Features → Train → Evaluate → Results)
- Dev-only (import.meta.env.DEV): `/dev/chart-editor` (ChartEditor smoke test), `/dev/dashboard-shell` (DashboardShell smoke test)

**Top-level shared components** (`src/components/`): `AppLayout.jsx` (sidebar + main content wrap), `AppSidebar.jsx`, `DatabaseSwitcher.jsx` (connection picker), `ERDiagram.jsx` (schema viz), `ResultsTable.jsx` (query result table), `SQLPreview.jsx`, `SchemaExplorer.jsx`, `StatSummaryCard.jsx`, `AskDBLogo.jsx`, `UserDropdown.jsx`.

**Agent UI** (`src/components/agent/`):
- `AgentPanel.jsx` — draggable/resizable dockable panel (float/right/bottom/left)
- `AgentStepFeed.jsx` — renders agent thinking, tool calls, user questions, results in real-time
- `AgentQuestion.jsx` — inline question UI (buttons or text input) for `ask_user` tool responses
- Wired into Chat page (streaming steps) and Dashboard (floating progress overlay + dockable panel)

**Animation system** (`src/components/animation/`): Three.js 3D backgrounds (`Background3D`, `SectionBackground3D`, `FrostedBackground3D`, `NeonBackground3D`) lazy-loaded with `WebGLErrorBoundary` fallback to `AnimatedBackground` (2D). Also: `PageTransition`, `StaggerContainer`, `MotionButton`, `AnimatedCounter`, `SkeletonLoader`, `useScrollReveal` hook.

**Dashboard subsystem** (`src/components/dashboard/`):
- `DashboardShell.jsx` — top-level shell that swaps between 6 archetype layouts via `DashboardModeToggle.jsx`.
- `modes/ExecBriefingLayout.jsx` — importance-scored 12-col bin-packing (KPI cards 3-col, hero chart 12-col, supporting 6-col).
- `modes/AnalystWorkbenchLayout.jsx` — `react-grid-layout` drag-resize, ResizeObserver width measure, layout persistence.
- `modes/LiveOpsLayout.jsx` — 5s auto-refresh via SSE (`useDashboardRefresh` hook) with connected/disconnected indicator.
- `modes/StoryLayout.jsx` — IntersectionObserver scrollytelling, sticky annotation column, chapter activation.
- `modes/PitchLayout.jsx` — wraps `PresentationEngine.jsx` with a ChartSpec → legacy-tile adapter.
- `modes/WorkbookLayout.jsx` — multi-tab with `WorkbookFilterProvider` context pushing filters to tiles.
- `lib/importanceScoring.js` — shared tile-scoring heuristic (used by Briefing + Pitch).
- `lib/DashboardTileCanvas.jsx` — shared tile renderer mounting ChartEditor per tile.
- `lib/useDashboardRefresh.js` — SSE/interval refresh hook for LiveOps.
- `lib/workbookFilterContext.jsx` — React context for workbook-level filter bar.
- `PresentationEngine.jsx` — 16:9 slide-style bin-packing (reused by PitchLayout).
- `AlertManager.jsx` — NL alert create/test/list UI with webhook config.
- `tokens.js` — design tokens (colors, radii, transitions, chart palettes).

**Onboarding flow** (`src/components/onboarding/`, `src/pages/Onboarding.jsx`): Multi-step wizard — Welcome → Tour → API Key setup → DB Connect → First Query. Guide new users through BYOK key entry and first connection. Has Skip button for users who want to explore first.

**SharedDashboard** (`src/pages/SharedDashboard.jsx`): Public read-only dashboard at `/shared/:id`. No auth. Uses `TOKENS` and `CHART_PALETTES` from `tokens.js`.

**Dashboard lib utilities** (`src/lib/`): `dataBlender.js` — client-side left-join across multiple query result sets; `metricEvaluator.js` — KPI threshold/conditional logic; `visibilityRules.js` — tile show/hide rule engine; `formatUtils.js` — number/date formatting; `anomalyDetector.js` — client-side anomaly detection; `formulaSandbox.js` + `formulaWorker.js` — sandboxed formula eval (Web Worker); `exportUtils.js` — dashboard export helpers; `gpuDetect.jsx` — `GPUTierProvider` context for conditional 3D rendering; `behaviorEngine.js` — client-side behavior tracking utils; `fieldClassification.js` — column type classification for auto chart suggestions.

**Charts:** Vega-Lite via `react-vega` rendered through `VegaRenderer.tsx`. ECharts fully removed (Sub-project A Phase 4c). Chart IR (`src/chart-ir/`) defines `ChartSpec` types, compiler (`compileToVegaLite`), Render Strategy Router (RSR), recommender (`showMe`), JSON Patch helper (`applySpecPatch`), transforms (LTTB, uniform, pixel_min_max, aggregate_bin), user-authored types (Sub-project C), and semantic layer (Sub-project D).

**ChartEditor** (`src/components/editor/`): 3-pane Tableau-class editor shell. ChartEditor.jsx (CSS grid, mode toggle Default/Pro/Stage), DataRail.jsx (field pills), EditorCanvas.jsx (RSR dispatch → VegaRenderer), MarksCard.jsx (encoding channel slots + drag-drop), Pill.jsx + ChannelSlot.jsx (drag source + drop target), Inspector/InspectorRoot.jsx (Setup tab with MarksCard + SemanticFieldRail, Style tab stub), BottomDock.jsx (text input + mic), AgentPanel.jsx (editor-scoped agent conversation), onobject/ (OnObjectOverlay + AxisPopover + LegendPopover + SeriesPopover + TitleInlineEditor), renderers/ (VegaRenderer.tsx real mount, MapLibre/Deck/Creative placeholders).

**Theme system:** 8-theme registry in `components/editor/themes/`: 2 base (light/dark Editorial) + 6 Stage Mode themes (quiet-executive, iron-man, bloomberg, mission-control, cyberpunk, vision-pro). `ThemeProvider.jsx` applies CSS custom properties via inline style. Creative-lane registry (`creativeRegistry.js`) lazy-loads ThreeHologram + ThreeParticleFlow for Stage Mode. Light/dark system preference in Zustand (`theme`/`resolvedTheme`), persisted to `localStorage("askdb-theme")`.

**Styling:** Tailwind CSS 4.2 + custom glassmorphism classes in `index.css`. Dark theme default (`#06060e` bg). Fonts: Outfit (headings) + Inter (body). Animations: Framer Motion + GSAP. Three.js for 3D landing backgrounds.

**Linting:** ESLint flat config (`eslint.config.js`) — `@eslint/js` recommended + React Hooks + React Refresh plugins. `no-unused-vars` ignores names matching `^[A-Z_]` (allows unused component imports and `_` prefixed vars). No Prettier; no backend linter (no ruff/flake8/pyproject.toml).

## See also
- `arch-backend.md` — Zustand slice names match backend field names; SSE endpoints come from `agent_routes.py`.
- `config-defaults.md` — ports, feature flags (`NEW_CHART_EDITOR_ENABLED`, etc.).
- `security-core.md` — PII masking invariants apply to client-side rendering.
