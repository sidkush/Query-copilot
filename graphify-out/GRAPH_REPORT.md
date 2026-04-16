# Graph Report - docs/superpowers/plans  (2026-04-16)

## Corpus Check
- 21 files · ~50,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 334 nodes · 334 edges · 40 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.79)
- Token cost: 70,500 input · 9,000 output

## God Nodes (most connected - your core abstractions)
1. `Dashboard Editing Freedom Plan` - 10 edges
2. `Agent UX Rewrite Plan (Claude Code-Style)` - 9 edges
3. `Dashboard Redesign — April 1 Journal` - 8 edges
4. `Agent Rewrite: Adaptive Loop + SQLite Persistence + Planning` - 8 edges
5. `Arrow Data Bridge + Performance UI Plan` - 7 edges
6. `Celery + Redis + ML Engine Plan` - 7 edges
7. `Chart System Sub-project B: Performance Ceiling Plan` - 7 edges
8. `Trigger Doc: Sub-project A Phase 4c Cutover (Real Layouts, C+D UI, ECharts Removal)` - 6 edges
9. `Performance Optimization Plan` - 6 edges
10. `Phase 1 Fix & Stabilize Plan` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Recommendation: Start with Light Agent (Retry on Failure)` --semantically_similar_to--> `Agent Rewrite: Adaptive Loop + SQLite Persistence + Planning`  [INFERRED] [semantically similar]
  docs/Agentic approach.txt → docs/journal-2026-04-08-09-agent-rewrite-and-product-overhaul.md
- `Bidirectional useViewportMount (unmount on scroll-away)` --semantically_similar_to--> `LazyCanvas IntersectionObserver Viewport Gate`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-04-15-b5-telemetry-scroll-polish.md → docs/superpowers/plans/2026-04-02-performance-optimization.md
- `Agent Semantic Context Block in System Prompt (domain vocabulary)` --semantically_similar_to--> `Agent _build_chart_type_context() System Prompt Injection`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-04-15-d1-ai-bootstrap-agent-integration.md → docs/superpowers/plans/2026-04-15-c1-picker-agent-awareness.md
- `Power BI On-Object Editing Pattern` --semantically_similar_to--> `Command Palette (⌘K): Token+Fuzzy Search, Flat Result List, Keyboard Nav`  [INFERRED] [semantically similar]
  docs/chart_systems_research.md → docs/journal-2026-04-12-premium-ux-overhaul.md
- `Adversarial Testing: 20-Analyst Evidence Triangulation Methodology` --semantically_similar_to--> `Adversarial Testing Round 2: 22 NEMESIS Personas, 8 High Fixed`  [INFERRED] [semantically similar]
  docs/journal-2026-04-11-adversarial-hardening.md → docs/journal-2026-04-03-strategic-council.md

## Hyperedges (group relationships)
- **Dashboard Security: SQL Validation + PII Masking + Alert Fix Triangle** — strategic_council_0403_alert_sql_bypass_fix, strategic_council_0403_alert_pii_fix, adversarial_hardening_0411_prevention_playbook [INFERRED 0.85]
- **Chart IR Ecosystem: Grammar-of-Graphics → Vega-Lite IR → AskDB ChartEditor** — chart_research_grammar_of_graphics, chart_research_vega_lite_ir, chart_research_askdb_intermediate_ir, phase4c_flip_plan_flag [EXTRACTED 0.90]
- **Agent System Core Pillars: Adaptive Loop + SQLite Persistence + Dynamic Budget** — agent_rewrite_0408_adaptive_loop, agent_rewrite_0408_sqlite_session_store, agent_rewrite_0408_dynamic_budget, agent_rewrite_0408_planning_step [EXTRACTED 0.95]
- **Arrow Zero-Copy Data Pipeline** — concept_duckdb_fetch_arrow, concept_arrow_bridge_module, concept_arrow_api_boundary, concept_mask_record_batch [INFERRED 0.95]
- **Agent Progress Visibility System** — concept_phase_aware_timeouts, concept_agent_checklist_progress, concept_animated_checklist, concept_verification_badge_ui, concept_smart_verification_pass [INFERRED 0.90]
- **User-Authored Chart Type Full Lifecycle** — concept_spec_template_composer, concept_custom_type_picker, concept_iframe_chart_host, concept_askdbviz_package, concept_chart_type_gallery_ui [INFERRED 0.90]

## Communities

### Community 0 - "Frontend Chart + UI Tech Debt"
Cohesion: 0.1
Nodes (21): Landing Page + Pricing Overhaul: BYOK Positioning, Turbo Mode Feature, Chart Type Canonicalization: bar_h Standard Across 5 Files, Chart Defs Registry: chartDefs.js with family/engine Fields, Dense Tile Types: SparklineKPI, ScorecardTable, HBarCard, HeatMatrix, Engagement Loop: DiffOnLoadBanner + Hot Metric Pulse + Tile Survival Telemetry, ResultsChart.jsx Debt Paydown: Rules-of-Hooks, ESLint Config, Stale useMemo, Rationale: Tremor Abandoned (React 19 incompatible, recharts violation), Frontend Lint Issues 2026-04-08: 137 Errors (3D Animation Purity) (+13 more)

### Community 1 - "New Architecture Modules"
Cohesion: 0.13
Nodes (20): ColorMapEditor.jsx, CorrectionToast.jsx, SemanticSettings.jsx, Arrow Data Bridge Architecture, BYOK Voice: Tiered Infrastructure, ChartSpec IR (Intermediate Representation), DataFusion Integration for Query Planning, Unified InstancePool (supersedes webglContextPool.js) (+12 more)

### Community 2 - "Dashboard Storage + Power BI Editing"
Cohesion: 0.12
Nodes (19): Power BI On-Object Editing Pattern, migrate_dashboard_if_needed() Function Verified, Bug: Dashboard settings Field Silently Dropped on Update, Client-Side PDF/PNG Export (html2canvas + jsPDF), Dashboard Redesign — April 1 Journal, Dashboard Storage Scalability Bottlenecks, Rationale: File-Based JSON Storage Kept for Dashboard, Hierarchical Dashboard Data Model (Dashboard>Tabs>Sections>Tiles) (+11 more)

### Community 3 - "Chart System Sub-project B Performance"
Cohesion: 0.11
Nodes (19): 3 Editor Modes (Default/Stage/Pro Tableau-Classic), 6 Dashboard Archetypes (Exec/Analyst/Ops/Story/Pitch/Workbook), arrowChunkReceiver.ts Frontend SSE Decoder, Arrow IPC Chunks over SSE (progressive chart render), Bidirectional useViewportMount (unmount on scroll-away), chart_downsampler.py Server-Side LTTB DuckDB SQL, ChartSpec IR Types (chart-ir/types.ts), compileToVegaLite() ChartSpec → Vega-Lite Compiler (+11 more)

### Community 4 - "Agent Invariants + Session Design"
Cohesion: 0.11
Nodes (19): Progressive Dual-Response UX Decision, Dynamic Tool Budget Decision, SQLite Session Store Decision, /agent/continue Endpoint, Behavior-Driven Cache Warming (T4), Agent Session Email Scoping, PII Masking Always Runs, SSE Step Types Additive Only (+11 more)

### Community 5 - "Chart IR + Grammar of Graphics"
Cohesion: 0.13
Nodes (18): AskDB Gap: LLM Emits ECharts JSON Directly (No IR Layer), AskDB Intermediate Chart IR (mark, encoding, transform, layer, facet), Grammar of Graphics — Wilkinson IR, Looker Studio Two-Tab Property Panel (Setup/Style), Tableau Marks Card Visual Encoding UX, Tableau Show Me Automatic Chart Recommendation Algorithm (Mackinlay 2007), Tableau VizQL + Polaris Grammar-of-Graphics Architecture, Vega-Lite as Grammar-of-Graphics IR for AskDB (+10 more)

### Community 6 - "Security Hardening + Agent Architecture"
Cohesion: 0.12
Nodes (18): P0: DuckDB 2-tuple Unpack of 3-tuple validate() — Silent Validation Break, P0: JWT Algorithm Downgrade Attack (none algo) — Allowlist Fix, Security Prevention Playbook: No \b for SQL IDs, Substring PII, Unicode Normalize, P0: Thread Pool Exhaustion via ask_user time.sleep() Polling Loop, Agent Rewrite: Adaptive Loop + SQLite Persistence + Planning, Agent Dynamic Tool Budget (heuristic 8/15/20, auto-extend to 100), Model ID + Circuit Breaker Bug: Stale Hardcoded Fallback Model ID, Agent Lightweight Planning: Sonnet Call Generates Task Checklist (+10 more)

### Community 7 - "Security Fixes Round 2"
Cohesion: 0.11
Nodes (18): Constraint: Share Tokens Must Be Opaque Server-Side, Constraint: Version Snapshots on Explicit Actions Only, PII Word-Boundary Regex Decision, P0: DuckDB query_twin 3-tuple Unpack Bug, P0: Thread Pool Exhaustion via time.sleep() Polling, P1 Round2: ChromaDB PersistentClient Proliferation, P1: /continue Missing Concurrency Guard, P1 Round2: Health Endpoint Connection ID Leak (+10 more)

### Community 8 - "Elastic Agent UX Rewrite"
Cohesion: 0.14
Nodes (17): Agent Cancel Endpoint + Concurrency Cap, Agent Checklist Progress Emission (checklist_update SSE steps), agentContext Store Field (query/dashboard/ml), AgentStepRenderer (Context-Agnostic Unified Renderer), AnimatedChecklist Component (Framer Motion), brief_thinking Field in AgentStep (1-2 sentence summary), Phase-Aware Agent Timeouts (planning/schema/sql_gen/db_exec/verify), ProgressiveResult Component (table + chart) (+9 more)

### Community 9 - "Dashboard Editing Freedom"
Cohesion: 0.15
Nodes (16): Conditional Coloring Rules, GlobalFilterBar connId Bug Fix, DashboardThemeEditor Modal, FloatingToolbar Quick-Edit UI, FORMATTING_DEFAULTS Cascade, mergeSection Helper for visualConfig Persistence, Reference Lines (avg/median/min/max), resolveColor Cascade Logic (+8 more)

### Community 10 - "Arrow Zero-Copy Data Pipeline"
Cohesion: 0.16
Nodes (15): Arrow-to-JSON Serialization Only at API Boundary, arrow_bridge.py Zero-Copy Conversion Module, DataFusion Query Engine (federated pushdown), DuckDB fetch_arrow_table() Zero-Copy Output, extract_columns_rows() Arrow/Legacy Format Handler, LiveTier DataFusion Delegation with Fallback, mask_record_batch() Arrow-Native PII Masking, Auto-Generated Materialized Aggregate Tables in Twin (+7 more)

### Community 11 - "Dashboard Constraints + Read-Only"
Cohesion: 0.15
Nodes (14): Constraint: Tile SQL Never Patchable via NL Edit, Dimension/Measure Classification Decision, Blueprint-Then-Approve Dashboard Workflow, Smart Trending Badge (Time-Series Only), SQL Regen on Column Swap, Read-Only Enforcement — Three Independent Layers, Two-Step Query Flow, fieldClassification.js (+6 more)

### Community 12 - "User Chart Types (Sub-project C)"
Cohesion: 0.15
Nodes (13): Agent _build_chart_type_context() System Prompt Injection, CustomTypePicker.jsx (user chart type browser), IframeChartBridge.ts Typed postMessage Protocol, IframeChartHost.jsx CSP-Sandboxed iframe Runtime, SDK types.ts (IChartType, DataRole, RenderContext, DataView), showMe.ts User Type Scoring Extension, SpecTemplateComposer.jsx (MarksCard in template mode), SpecTemplatePreview.jsx with Mock Data + VegaRenderer (+5 more)

### Community 13 - "Dashboard Overhaul Plans"
Cohesion: 0.17
Nodes (12): Cross-Tile Interactivity Design, Hierarchical Dashboard Data Model, Dashboard State Bookmarking, Plan: Adversarial Testing Fixes — Dashboard System, Plan: Dashboard UX — Reactive Zustand Architecture, Plan: Dashboard Overhaul Week 1 (Phase 1 + 2), Plan: Phase 1 — AI-First Analytics + Performance & Caching, Plan: Redis Integration + SSE Live Tile Updates (+4 more)

### Community 14 - "BYOK Provider + Auth Architecture"
Cohesion: 0.21
Nodes (12): Constraint: ChromaDB Path Not Renamed, Constraint: Only anthropic_provider.py Imports anthropic, Elastic Per-Phase Timeout Architecture, BYOK Demo User Design Decision, ModelProvider ABC Design Decision, anthropic_provider.py, model_provider.py, provider_registry.py (+4 more)

### Community 15 - "Semantic Layer (Sub-project D)"
Cohesion: 0.2
Nodes (10): BootstrapReview.jsx Modal (accept/dismiss suggestions), ColorMap Type + resolveColor() Helper, LinguisticModel TypeScript Types (synonyms/phrasings/samples), Per-Connection Semantic Storage Migration (from per-user), semantic_bootstrap.py Haiku-Powered Schema Analysis, Agent Semantic Context Block in System Prompt (domain vocabulary), semantic_layer.py Per-Connection Storage (.data/user_data/{hash}/semantic/{conn_id}/), Sub-project D0: Semantic Storage + Linguistic Types Plan (+2 more)

### Community 16 - "Celery + ML Engine"
Cohesion: 0.36
Nodes (8): Celery Task Queue (ml_quick + ml_training queues), ML Agent Tools (ml_analyze_features/ml_train/ml_evaluate), MLEngine Orchestrator (ingest/detect/train/save), MLEngine.jsx Page with Agent Panel, ml_feature_engine.py Automated Feature Engineering, ML Model Catalog (classification/regression/clustering/anomaly), ML Auto PII Column Exclusion from Training, Celery + Redis + ML Engine Plan

### Community 17 - "Performance Optimization"
Cohesion: 0.33
Nodes (7): Three.js frameloop=demand + AutoInvalidate, asyncio.to_thread Non-blocking DB Queries, LazyCanvas IntersectionObserver Viewport Gate, /refresh-all Bulk Tile Endpoint, React.lazy Route-Level Code Splitting, Performance Optimization Plan, Rationale: Parallel Tile Loading Reduces Dashboard Load to max(query_times)

### Community 18 - "Chart Packages + Community Gallery"
Cohesion: 0.29
Nodes (7): .askdbviz Package Format (ZIP + SHA-256 hash), ChartTypeGallery.jsx Community Marketplace, DevVizLoader.jsx (?dev-viz= Live Reload), gallery_store.py (JSON-based gallery index), Chart Type Import/Export REST Endpoints, Sub-project C3: Dev Tooling + Package Format Plan, Sub-project C4: Community Gallery Plan

### Community 19 - "Dashboard UX Bug Fixes"
Cohesion: 0.33
Nodes (6): Per-Category Color Control: categoryColors Map in visualConfig, 8-Bug Blitz: Dashboard Save, Sizing, Cross-Filter, Export, CommandBar, handleAICommand Rewrite: Loading State, Auto-Section, Error Display, Fullscreen Dashboard Preview Mode (Component State, not Route), pieColorMap for Stable Cross-Filter Colors After Filtering, Re-fetch After Every Mutation Pattern (getDashboard after save)

### Community 20 - "Phase 2 Innovation Features"
Cohesion: 0.5
Nodes (5): Chart Type Crossfade Animation (AnimatePresence), Cross-Tile Interactivity (crossFilter state), Dynamic Zone Visibility (section.visibilityRule), State Bookmarking (URL params + dashboard.bookmarks[]), Phase 2 Innovation Features Plan

### Community 21 - "Behavior + Predictive Intelligence"
Cohesion: 0.5
Nodes (4): 20-Persona Council Findings on Predictive Intelligence, Behavior Engine: Predict Next Action, 3 Suggestions After Every Response, Behavior Tracking Privacy Mitigations: Opt-in, Raw Signals Never Leave Browser, Predictive Intelligence: Session-Track→Compact→Purge Model

### Community 22 - "Voice Mode"
Cohesion: 0.5
Nodes (4): Text-Only Voice Wire Protocol (browser handles audio), Voice WebSocket Endpoint (/api/v1/voice/ws/{chat_id}), Web Speech API Browser-Native STT/TTS, Voice Mode Continuous Conversation Plan

### Community 23 - "Threading + Deadlock Fixes"
Cohesion: 0.5
Nodes (4): Constraint: Use threading.Lock Not RLock, Restore Version No-Lock Helper Pattern, Version History Restore Deadlock, Dashboard Version Restore Deadlock Fix (2026-04-12)

### Community 24 - "ChromaDB + pandas Compatibility"
Cohesion: 0.67
Nodes (3): ChromaDB EmbeddingFunction Inheritance Fix (1.5.5 API Change), Lazy Import pandas Solution (inside execute_query, mask_dataframe), pandas + ChromaDB Rust Native DLL Conflict on Windows (Import Order)

### Community 25 - "Adversarial Testing Round 1"
Cohesion: 0.67
Nodes (3): Adversarial Testing Round 1: 3 Critical + 9 High Findings Fixed, Critical Fix: Alert Check Leaked PII (C3) — mask_dataframe Added, Critical Fix: Alert SQL Bypassed sql_validator (C1)

### Community 26 - "Dashboard Filter Architecture"
Cohesion: 0.67
Nodes (3): Dashboard Filter Pipeline Architecture (GlobalFilterBar + TileEditor), Reactive Zustand Architecture: Filter/Edit State with Version Counters, Tile Sizing Spread Order Bug ({defaults,...saved} vs {...saved, overrides})

### Community 27 - "Dual-Response + Agent Migration"
Cohesion: 0.67
Nodes (3): Progressive Dual-Response Data Acceleration, Plan: QueryCopilot Agent System (Medium Agent — Claude Tool Use), Postmortem: Progressive Dual-Response Data Acceleration

### Community 28 - "Query Intelligence + PII Hardening"
Cohesion: 0.67
Nodes (3): PII Masking Template Method Enforcement, Plan: Self-Learning Query Intelligence System, Postmortem: Query Intelligence System Hardening

### Community 29 - "Backend State + Dependency Issues"
Cohesion: 1.0
Nodes (2): Backend State 2026-04-08: 11 Routers, 134 Endpoints, Healthy, SQLAlchemy 2.x vs sqlalchemy-redshift Dependency Conflict

### Community 30 - "Adversarial Testing Methodology"
Cohesion: 1.0
Nodes (2): Adversarial Testing: 20-Analyst Evidence Triangulation Methodology, Adversarial Testing Round 2: 22 NEMESIS Personas, 8 High Fixed

### Community 31 - "Dashboard API Audit"
Cohesion: 1.0
Nodes (1): Dashboard API — 24 Endpoints Audit Pass

### Community 32 - "Frontend Build Health"
Cohesion: 1.0
Nodes (1): Frontend Production Build Pass 2026-04-08: 1.09s, 1.1MB gzip

### Community 33 - "Sidebar Persistence"
Cohesion: 1.0
Nodes (1): Collapsible Sidebar with localStorage Persistence

### Community 34 - "State Updater Bug Fix"
Cohesion: 1.0
Nodes (1): White Screen Bug: setMessages Did Not Support Function Updater Pattern

### Community 35 - "Filter System Overhaul"
Cohesion: 1.0
Nodes (1): Filter System Overhaul: Stale Filter Data Fix, Booking Fix

### Community 36 - "Dynamic Dashboard Options"
Cohesion: 1.0
Nodes (1): Dynamic Dashboard Focus Options from Schema (Not Hardcoded)

### Community 37 - "3D Performance Adaptive Quality"
Cohesion: 1.0
Nodes (1): PerformanceMonitor Adaptive 3D Quality

### Community 38 - "3D Canvas Deferred Mount"
Cohesion: 1.0
Nodes (1): startTransition Deferred 3D Canvas Mount

### Community 39 - "Atomic File Writes"
Cohesion: 1.0
Nodes (1): Atomic File Writes

## Knowledge Gaps
- **123 isolated node(s):** `Subagent-Driven Development Strategy`, `React Portal Fix for position:fixed in willChange Ancestor`, `react-grid-layout v2 API Breaking Change (WidthProvider removed)`, `Dashboard Storage Scalability Bottlenecks`, `Secure Agent Tool Loop Design (max 5 iterations, 30s timeout)` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Backend State + Dependency Issues`** (2 nodes): `Backend State 2026-04-08: 11 Routers, 134 Endpoints, Healthy`, `SQLAlchemy 2.x vs sqlalchemy-redshift Dependency Conflict`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Adversarial Testing Methodology`** (2 nodes): `Adversarial Testing: 20-Analyst Evidence Triangulation Methodology`, `Adversarial Testing Round 2: 22 NEMESIS Personas, 8 High Fixed`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dashboard API Audit`** (1 nodes): `Dashboard API — 24 Endpoints Audit Pass`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Build Health`** (1 nodes): `Frontend Production Build Pass 2026-04-08: 1.09s, 1.1MB gzip`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sidebar Persistence`** (1 nodes): `Collapsible Sidebar with localStorage Persistence`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `State Updater Bug Fix`** (1 nodes): `White Screen Bug: setMessages Did Not Support Function Updater Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Filter System Overhaul`** (1 nodes): `Filter System Overhaul: Stale Filter Data Fix, Booking Fix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dynamic Dashboard Options`** (1 nodes): `Dynamic Dashboard Focus Options from Schema (Not Hardcoded)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `3D Performance Adaptive Quality`** (1 nodes): `PerformanceMonitor Adaptive 3D Quality`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `3D Canvas Deferred Mount`** (1 nodes): `startTransition Deferred 3D Canvas Mount`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Atomic File Writes`** (1 nodes): `Atomic File Writes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Subagent-Driven Development Strategy`, `React Portal Fix for position:fixed in willChange Ancestor`, `react-grid-layout v2 API Breaking Change (WidthProvider removed)` to the rest of the system?**
  _123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Chart + UI Tech Debt` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `New Architecture Modules` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Dashboard Storage + Power BI Editing` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Chart System Sub-project B Performance` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Agent Invariants + Session Design` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Chart IR + Grammar of Graphics` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._