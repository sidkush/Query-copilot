# QueryCopilot — Full Project Journal
## Idea → Architecture → UI Overhaul → Animation Redesign

> **Scope:** This document covers the complete engineering journey of QueryCopilot V1 — from the initial glassmorphism styling pass through the 66-item UI/UX audit, to the full Framer Motion + GSAP animation redesign. It records methodology, implementation decisions, every significant blocker encountered, how each was resolved, and a detailed analysis of future scaling bottlenecks.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Session 1 — Glassmorphism Styling Pass](#2-session-1--glassmorphism-styling-pass)
3. [Session 2 — 66-Item UI/UX Audit & Implementation](#3-session-2--66-item-uiux-audit--implementation)
4. [Session 3 — Full Visual Redesign (Framer Motion + GSAP)](#4-session-3--full-visual-redesign-framer-motion--gsap)
5. [Blockers, Root Causes & Resolutions](#5-blockers-root-causes--resolutions)
6. [Sub-Agent Coordination — Lessons Learned](#6-sub-agent-coordination--lessons-learned)
7. [Known Technical Debt](#7-known-technical-debt)
8. [Future Breakpoints & Scaling Analysis](#8-future-breakpoints--scaling-analysis)
9. [Scaling Architecture for Large Userbase](#9-scaling-architecture-for-large-userbase)

---

## 1. Project Overview

**QueryCopilot** is a natural-language-to-SQL analytics copilot. Users connect a database, ask questions in plain English, and receive generated SQL (powered by Claude Haiku/Sonnet), an auto-generated chart, and a natural language summary — all in a chat-style interface.

### Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 + Tailwind CSS 4 + Zustand |
| Backend | FastAPI (Python) + Pydantic |
| AI | Anthropic Claude API (Haiku primary, Sonnet fallback) |
| Vector DB | ChromaDB (local, schema + few-shot examples) |
| Auth | JWT + bcrypt + Google/GitHub OAuth |
| Storage | File-based JSON (no application DB) |
| Charts | Recharts (10 chart types, 6 color palettes) |
| Grid | react-grid-layout (drag/resize dashboard) |
| Databases | 16 supported engines (PostgreSQL → IBM Db2) |

### Architecture Constraints That Shaped All Decisions

- **Read-only enforced at 3 layers** — driver-level, SQL validator (6-layer), connector re-validation. Never removable.
- **PII masking runs before any data leaves the system** — `mask_dataframe()` wraps all query results.
- **Two-step query flow is intentional** — `/generate` → user reviews → `/execute`. Never collapse.
- **File-based storage** — atomic write-then-rename for crash safety. This was a deliberate early-stage choice with known scaling limits.
- **`JWT_SECRET_KEY` doubles as Fernet encryption key** for saved DB passwords — changing it invalidates all saved configs.

---

## 2. Session 1 — Glassmorphism Styling Pass

### Methodology

Applied a comprehensive dark glassmorphism design system across the entire frontend in a single pass:

- **Design tokens established:** Base background `#06060e`, indigo→violet gradient accents, Poppins (headings) + Open Sans (body)
- **CSS utility classes created:** `.glass`, `.glass-card`, `.glass-input`, `.glass-navbar`, `.glass-light` with `backdrop-filter: blur()` + `saturate()`
- **20+ CSS keyframe animations added:** `floatOrb`, `shimmer`, `fadeScaleIn`, `drawLine`, `pulseRing`, `checkDraw`, `skeleton-shimmer`, `typing-dot`, etc.
- **Component-level styling:** Every page updated to use glass utilities instead of raw Tailwind backgrounds

### Key Decisions

- Used `rgba()` backgrounds rather than Tailwind opacity modifiers — more precise control over glassmorphism depth
- `backdrop-filter: blur(16px) saturate(1.4)` as base; navbar uses `blur(20px)` for stronger separation
- Kept animation keyframes in `index.css` rather than component-scoped — enables reuse across all pages without import overhead

---

## 3. Session 2 — 66-Item UI/UX Audit & Implementation

### Audit Methodology

A comprehensive 66-item audit was conducted covering all 13 pages and shared components, categorized by severity:

- **Critical (5 items):** Missing ARIA roles, broken keyboard navigation, inaccessible modals
- **High (18 items):** Missing focus indicators, no error feedback, dead scroll areas
- **Medium (27 items):** Visual inconsistencies, missing loading states, mobile gaps
- **Low (16 items):** Minor copy issues, cosmetic polish

### Implementation Strategy

Items implemented in strict priority order (Critical → High → Medium → Low). 54/66 items completed before context limit.

**Notable implementations:**

| Item | Solution |
|------|----------|
| Account modal accessibility | Full focus trap with `previousFocusRef`, Escape key handler, `role="dialog"` + `aria-modal` |
| Chat history search | `historySearch` state, filter on `chat.title`, "No matching chats" fallback |
| SQL formatter | `formatSQL()` — uppercases keywords, newlines before `SELECT/FROM/WHERE/JOIN/GROUP BY/ORDER BY/HAVING/LIMIT` |
| Phone auto-format | `formatPhone(raw, pattern)` helper matching country-specific formats |
| Colorblind chart palette | 8-color WCAG-compliant palette added to ResultsChart |
| SchemaView zoom | `erZoom` state with +/−/Reset toolbar, `transform: scale()` on ERDiagram |
| Billing usage bar | Color-coded `<50%` indigo, `50-80%` amber, `>80%` red |
| Skip-to-content | SR-only link at top of AppLayout |
| Table ARIA | `role`, `aria-sort`, `aria-label` on all ResultsTable columns |

---

## 4. Session 3 — Full Visual Redesign (Framer Motion + GSAP)

### Decision: Why Both Framer Motion AND GSAP?

The user explicitly requested maximum animation power. The two libraries serve different strengths:

| Library | Used For |
|---------|---------|
| **Framer Motion** | React-native spring physics, `AnimatePresence` enter/exit, `layoutId` shared layout, `useInView` scroll triggers, route transitions |
| **GSAP** | `AnimatedCounter` (number count-up with snap), `AnimatedBackground` RAF-loop for floating orbs |

### 8-Phase Implementation Plan

#### Phase 1: Foundation — Packages + Shared Components

**Packages installed:** `framer-motion`, `gsap`, `@gsap/react`

**7 animation components created in `src/components/animation/`:**

```
PageTransition.jsx       — fade+slide+blur route transition wrapper
StaggerContainer.jsx     — orchestrated spring stagger (+ StaggerItem)
AnimatedCounter.jsx      — GSAP count-up with snap (triggers on scroll)
SkeletonLoader.jsx       — CardSkeleton, TableSkeleton, ChartSkeleton
AnimatedBackground.jsx   — RAF-loop floating gradient orbs (GPU-accelerated)
MotionButton.jsx         — whileHover scale+lift, whileTap press spring
useScrollReveal.js       — hook wrapping framer-motion useInView
```

**`StatSummaryCard.jsx`** — glass card with AnimatedCounter, mini sparkline bars, trend badge, gradient accent border.

#### Phase 2: Cross-Cutting Changes

- **`App.jsx`** — `<AnimatePresence mode="wait">` wraps all routes via `AnimatedRoutes` component using `useLocation()` key
- **`AppLayout.jsx`** — sidebar slides in from `x: -56`, main content fades with 0.15s delay
- **`AppSidebar.jsx`** — `layoutId="sidebar-indicator"` for smooth sliding active pill, `motion.button` whileHover scale on all nav items, animated tooltip with AnimatePresence

#### Phase 3: DashboardBuilder — Hybrid Redesign

4 `StatSummaryCard` components above the grid:
1. Total Queries (indigo, sparkline)
2. Success Rate (emerald, % suffix)
3. Avg Response Time (amber, ms suffix)
4. Active Connections (violet)

Data sourced from `api.getAccount()` on mount. Tiles gain `motion.div` with `layout` prop for smooth drag reorder. Modals wrapped in AnimatePresence with spring scale. Undo toast slides from right.

#### Phase 4: Landing Page

- Hero: `motion.h1` spring entrance, `StaggeredText` splits subtitle into `motion.span` words
- Stats: `AnimatedCounter` (GSAP count-up)
- Demo carousel: `AnimatePresence mode="wait"` crossfade between GIFs
- Sections: `RevealSection` wrapper using `useScrollReveal` replacing custom IntersectionObserver
- CTAs: `MotionButton` spring physics

#### Phase 5: Login + Tutorial

- **Login:** Step crossfade via `AnimatePresence mode="wait"` keyed by `login`/`reg-0`/`reg-1`/`reg-2`; field stagger; error shake `x: [0, -8, 8, -4, 4, 0]`; OTP `whileFocus={{ scale: 1.08 }}`; `AnimatedBackground` replaces static CSS orbs
- **Tutorial:** Step cards crossfade; progress dots animate `width: 24px ↔ 8px` with spring; `MotionButton` Back/Next/Get Started

#### Phase 6: Chat

- Message bubbles: `motion.div` spring slide-up replacing CSS `.msg-enter`
- Toast: `AnimatePresence` — slides from right, spring physics, auto-exit
- Sidebar: `motion.div` in `AnimatePresence`, `x: -288 → 0` spring
- Chat list items: `motion.div` `whileHover={{ x: 4 }}`
- Typing indicator: Framer stagger dots replacing CSS `typing-dot`
- SQL preview + results panels: `motion.div` expand from `height: 0`
- ER Diagram panel: `motion.div` slide from `x: 100`

#### Phase 7: Secondary Pages

Every remaining page received Framer Motion treatment:

| Page | Treatment |
|------|-----------|
| Dashboard | StaggerContainer DB cards, AnimatePresence overlays, error shake, MotionButton, form slide-in |
| SchemaView | Section entrance, ChartSkeleton loader, suggestion StaggerContainer, MotionButton |
| Profile | StaggerContainer fields, avatar color spring, AnimatePresence unsaved-changes banner |
| Account | AnimatedCounter stats, StaggerContainer sections, AnimatePresence modal |
| Billing | Animated progress bar (motion.div width), plan card stagger+hover |
| AdminLogin | Logo spring rotation entrance, field stagger, error shake, AnimatedBackground |
| AdminDashboard | Tab crossfade `AnimatePresence mode="wait"`, AnimatedCounter stats, StaggerContainer user/ticket lists, AnimatePresence modals |

#### Phase 8: CSS Enhancement

- Added `.glass-card-elevated` — `blur(24px)`, inner light border `inset 0 1px 0 rgba(255,255,255,0.04)`, deeper hover glow
- Trimmed `.stagger-children` CSS from 16 nth-child rules to 6 (Framer handles the rest)
- Added reduced-motion support for `glass-card-elevated:hover` transform

---

## 5. Blockers, Root Causes & Resolutions

### B-01: JSX Fragment Closing Tag (DashboardBuilder)

**Symptom:** Build failed after adding duplicate button — `<>` fragment opened but `</>` was missing.

**Root cause:** Agent added code inside a React Fragment but placed the closing tag one level too deep, inside the sibling JSX instead of wrapping both buttons.

**Resolution:** Read the exact block first, then used Edit tool to insert `</>` at correct indentation level.

**Prevention:** Always read the surrounding 10 lines before inserting JSX — fragments are invisible in structure and easy to misplace.

---

### B-02: Edit Without Prior Read

**Symptom:** `Edit` tool failed with `"File has not been read yet"` on AdminLogin.jsx.

**Root cause:** The Edit tool enforces a read-before-write contract to prevent blind overwrites. The tool was called directly without a preceding Read.

**Resolution:** Read the file first, then applied the edit.

**Prevention:** Every file touched in a session must be Read at least once before Edit can be used. Adopted as a strict workflow rule.

---

### B-03: Unused Import Lint Errors (Multiple Files)

**Symptom:** After edits, Landing.jsx had unused `useCallback` and `demoGif`; Profile.jsx had unused `useCallback`; Tutorial.jsx had unused `useCallback`.

**Root cause:** Edits removed code that was the sole consumer of those imports, but the import lines themselves weren't cleaned up.

**Resolution:** Removed stale imports in a cleanup pass. In Tutorial.jsx, `useCallback` was re-added correctly when wrapping `finish` in `useCallback` to satisfy the `useEffect` dependency array.

**Prevention:** After any refactor that changes what a component does, audit the import block for orphans.

---

### B-04: `useEffect` Missing Dependency (Tutorial)

**Symptom:** ESLint warning — `finish` used inside `useEffect` but not listed in dependency array.

**Root cause:** `finish` was defined as a plain function inside the component, then called inside `useEffect`. Without wrapping in `useCallback`, every render creates a new function reference, triggering infinite re-renders if added naively to the dep array.

**Resolution:** Wrapped `finish` in `useCallback` with `[setTutorialComplete, navigate]` deps, then added `finish` to the `useEffect` dependency array.

**Prevention:** Functions used inside `useEffect` should either be defined outside the component, moved inside the effect, or wrapped in `useCallback`.

---

### B-05: Chat.jsx Race Condition During Build

**Symptom:** Build failed with `"Expected corresponding JSX closing tag for motion.div"` — error pointed to lines that showed correct JSX when read afterward.

**Root cause:** The Chat agent was still writing the file (mid-Write operation) when the build was triggered. The build tool read a partially-written file with truncated JSX structure.

**Resolution:** Waited for the agent to complete its Write, then re-ran the build — it passed cleanly.

**Prevention:** Never trigger a build while a background agent is known to be writing. Wait for all agent `completed` notifications before running builds.

---

### B-06: AnimatePresence Breaks in Chat (Multiple Unclosed Tags)

**Symptom:** Two separate build errors — `AnimatePresence` unclosed at line 1355, `motion.div` unclosed at line 809 (first build attempt after Chat agent).

**Root cause:** The Chat agent was still writing the file. The Vite build parser saw an intermediate state where JSX tags from the partially-written file were mismatched.

**Resolution:** Re-ran build after file write completed — all tags were properly balanced.

**Prevention:** Same as B-05. Also: background agents should be given a completion signal before dependent operations proceed.

---

### B-07: Chat Page Layout Collapse (Critical UI Bug)

**Symptom:** After adding PageTransition wrapper, the Chat page appeared as a small block at the top of the screen with a large dark void below. The flex-fill height was broken.

**Root cause:** The render chain was:

```
AppLayout (h-screen, flex)
  motion.main (flex-1, flex flex-col, overflow-hidden)
    PageTransition (motion.div — no height/flex classes!)
      Chat (flex flex-1 h-full)
```

`PageTransition` was a raw `motion.div` without any flex or height classes. It broke the flex chain — `Chat`'s `flex-1 h-full` had no flex parent to stretch into, so it collapsed to natural (content) height.

**Resolution:** Added `flex-1 flex flex-col min-h-0` to the `PageTransition` wrapper's className, restoring the flex chain.

**Prevention:** Any wrapper component inserted between a flex parent and a flex child MUST pass through flex context. Layout-transparent wrappers need `flex-1 flex flex-col min-h-0` to be truly transparent.

---

### B-08: Chat Sidebar Scroll Frozen

**Symptom:** The chat history sidebar appeared but could not be scrolled — items were frozen even though `overflow-y-auto` was on the list container.

**Root cause (1):** The `motion.div` sidebar wrapper had no `overflow-hidden` constraint, so the flex layout wasn't correctly bounded — the scrollable child had no finite height to scroll within.

**Root cause (2):** The `stagger-children` CSS class was applied to the chat list. This class sets `opacity: 0` on all children with `animation: fadeScaleIn ... both` — `animation-fill-mode: both` means items stay invisible before/after the animation. On items beyond the animated range (>6th), they remained permanently invisible/layout-hidden, preventing scroll calculation.

**Resolution:**
1. Added `overflow-hidden` to the sidebar `motion.div` and `flex-shrink-0` to the header
2. Removed `stagger-children` CSS class from the chat list (Framer Motion `motion.div whileHover` handles the per-item animation instead)

**Prevention:** Never mix CSS animation `fill-mode: both` with scroll containers — it permanently hides elements that don't complete their animation. When Framer Motion is available, use it exclusively for list animations.

---

### B-09: Chat Content Width Too Narrow

**Symptom:** Messages, SQL preview, results, and the input bar were all constrained to ~672px (`max-w-2xl`) centered on a 1440px+ screen, leaving ~380px of dark void on each side.

**Root cause:** The original Chat page was designed for a smaller viewport. After adding the sidebar and expanding to full-screen layout, the `max-w-2xl` constraint (intended for comfortable reading width) became visually wrong on large displays.

**Resolution:** Changed all message/panel containers and the input form from `max-w-2xl` to `max-w-4xl` (896px), and widened the empty-state suggestion grid to `max-w-2xl w-full`.

**Prevention:** Design for the actual container width. When a component lives inside a full-height sidebar layout, its inner max-width should be calibrated to the available content area, not a generic reading-width assumption.

---

### B-10: Dev Server Failed to Start (Exit Code 3221225786)

**Symptom:** `Failed to start preview server: Process exited with code 3221225786`.

**Root cause:** Exit code `3221225786` (`0xC000026A`) is a Windows `STATUS_DLL_NOT_FOUND` or more commonly a Node.js native module failure. This is typically caused by a native addon (in this case likely `gsap`'s optional native bindings or node-gyp compiled modules) failing to load on the specific Node.js version/architecture.

**Resolution:** Created `.claude/launch.json` with the Vite dev server configuration, then started via `preview_start`. The dev server started successfully on port 8502.

**Prevention:** Always create `launch.json` before first preview attempt. Exit code 3221225786 on Windows is almost always a native module issue — check `node_modules` for `.node` binary files and ensure Node version compatibility.

---

### B-11: AdminDashboard Agent Silent Failure

**Symptom:** The AdminDashboard agent was launched with instructions to add Framer Motion, StaggerContainer, AnimatedCounter, and MotionButton. When checked, none of these imports were present in the file.

**Root cause:** The agent appeared to have decided not to modify the file (possibly due to complexity or conservative interpretation of the task). It returned a completion status but made no changes.

**Resolution:** Manually added `motion`, `AnimatePresence` imports and wrapped `StatCard` in `motion.div` with spring entrance + `whileHover`. The agent subsequently ran again in a re-dispatch and completed the full enhancement.

**Prevention:** After every agent completes, verify with a targeted `Grep` for expected new imports before marking the task done. Never trust agent completion status alone.

---

## 6. Sub-Agent Coordination — Lessons Learned

### What Worked Well

**Parallel dispatch for independent files** — Launching 6 agents simultaneously (DashboardBuilder, Landing, Login+Tutorial, Dashboard, AdminDashboard, Chat) gave ~6× throughput. Since each agent owned a distinct file, there were zero merge conflicts.

**Agent specialization** — Each agent received a specific, scoped prompt with exact import paths, exact requirements list, and explicit "IMPORTANT" constraints. Specificity correlated strongly with output quality.

**Background agents for slow transforms** — Files >300 lines were delegated to background agents so the main context could work on other files concurrently.

### What Caused Problems

| Issue | Cause | Fix |
|-------|-------|-----|
| Race condition (build during write) | Build triggered while agent still writing | Wait for all `completed` notifications first |
| Silent agent non-completion (AdminDashboard) | Agent interpreted task as "done" without changes | Grep for expected imports after every agent |
| File too large to context (Chat.jsx 1355 lines) | Agent read file in chunks but produced mismatched JSX in one pass | Read in multiple passes, produce output in sections |
| Agents not reading existing code | Overwrote logic they didn't understand | Mandate "Read the ENTIRE file first" in all agent prompts |

### Agent Prompt Template That Works Best

```
TASK: [one-sentence description]
FILE: [absolute path]

REQUIREMENTS:
1. [specific change]
2. [specific change]

IMPORTS to add:
[exact import statements]

IMPORTANT:
- Read the file first
- Keep ALL existing [functionality]
- Build must pass — no import errors, no syntax errors
- [specific constraint based on file]
```

---

## 7. Known Technical Debt

### Frontend

| Item | Location | Risk |
|------|----------|------|
| Bundle size 368KB gzipped | All pages in single chunk | Slow initial load on slow connections |
| No code splitting | `vite.config.js` | All 13 pages loaded upfront |
| `page-enter` CSS class still referenced in some components | Dashboard.jsx (some older patterns) | Redundant with PageTransition |
| `sidebar-active` CSS still present | `index.css` | Redundant with `layoutId` indicator |
| `AnimatedCounter` re-animates on every mount | `AnimatedCounter.jsx` | `hasAnimated.current` resets between route changes |
| `motion` imported but flagged unused by ESLint in SchemaView | JSX member expression not recognized by no-unused-vars rule | False positive — works correctly |

### Backend

| Item | Location | Risk |
|------|----------|------|
| `JWT_SECRET_KEY` = Fernet key | `config.py` | Rotating auth key invalidates all saved DB passwords |
| File-based user storage | `.data/users.json` | Not concurrent-safe at scale |
| `app.state.connections` is in-process | `main.py` | Lost on restart, not shared across workers |
| ChromaDB is local single-node | `.chroma/` | Not horizontally scalable |
| No global rate limiting | `main.py` | API abuse possible |
| No query result caching | `query_engine.py` | Same query re-executed every time |
| OAuth redirect URI hardcoded | Multiple files | Must change before production |

---

## 8. Future Breakpoints & Scaling Analysis

### Breakpoint 1: File-Based Storage → ~100 concurrent users

**What breaks:** `users.json` uses atomic write-then-rename, which is safe for single-process but breaks under multiple Uvicorn workers. Two workers could read the same file, make different modifications, and the second write overwrites the first.

**Symptom:** Lost registrations, missing chat history, password resets that don't persist.

**Threshold:** ~50-100 users with `--workers 2+`

**Fix:** Migrate to PostgreSQL or SQLite (with WAL mode) using SQLAlchemy. Schema is simple — users, chats, connections, stats tables. Estimated migration effort: 2-3 days.

---

### Breakpoint 2: In-Process Connection State → Multi-Worker Deployment

**What breaks:** `app.state.connections[email][conn_id]` stores live database connections in FastAPI's application state. This is per-process. With multiple Uvicorn workers or a load balancer, a connection established on worker 1 is invisible to worker 2.

**Symptom:** "No active connection" errors despite user having connected, depending on which worker handles the request.

**Threshold:** Any multi-worker deployment (`uvicorn --workers 2` or Docker with multiple replicas)

**Fix:**
- Store connection *configs* in Redis (serializable metadata)
- Rebuild the `DatabaseConnector` + `QueryEngine` lazily per-request from config
- Or: sticky sessions (all requests from a user route to same worker) — simpler but not truly scalable

---

### Breakpoint 3: ChromaDB Local Single-Node → 10K+ Trained Tables

**What breaks:** ChromaDB is running as an embedded local store in `.chroma/`. It has no replication, no backup, and its performance degrades with very large vector collections. More critically, it's a single point of failure — delete the folder and all trained schema context is gone.

**Symptom:** Slow RAG retrieval (>2s), inconsistent SQL quality as the vector store grows stale, data loss on server restart if volume isn't persisted.

**Threshold:** ~5,000+ embeddings (hundreds of connections × tables × columns)

**Fix:**
- Migrate to a managed vector DB: Pinecone, Weaviate Cloud, or pgvector (PostgreSQL extension)
- Implement per-user namespaced collections
- Add embedding cache to avoid re-embedding the same schema

---

### Breakpoint 4: Claude API Rate Limits → High Concurrency

**What breaks:** Each query generates 1-2 Claude API calls (Haiku + optional Sonnet fallback). At 100 concurrent users × 1 query/10s = 10 requests/s. Anthropic's rate limits (tokens per minute, requests per minute) will throttle the system.

**Symptom:** 429 errors from Claude API, queries timing out, degraded SQL quality when fallback logic fails.

**Threshold:** ~50-100 daily active users running multiple queries

**Fix:**
- Implement a request queue with `asyncio.Queue` or Celery
- Add exponential backoff on 429 responses
- Cache SQL results for identical (question, schema_hash) pairs
- Implement per-user daily limits more aggressively (already partially done)

---

### Breakpoint 5: Frontend Bundle Size → Mobile / Slow Networks

**What breaks:** Single 368KB gzipped JS bundle means first meaningful paint is delayed on slow 3G connections (~3-5 seconds). All 13 pages, Framer Motion, GSAP, Recharts, react-grid-layout all load upfront.

**Threshold:** Any user on <10Mbps connection will feel it. On mobile 3G it's unusable.

**Fix:**
```js
// vite.config.js — add dynamic imports
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardBuilder = lazy(() => import('./pages/DashboardBuilder'));
// etc.
```
Expected result: Initial bundle drops to ~120KB, pages load on-demand. Recharts alone is ~80KB gzipped — lazy-loading it behind the Analytics route saves significant initial load time.

---

### Breakpoint 6: CORS + OAuth Hardcoded to localhost

**What breaks:** `main.py` has `allow_origins=["http://localhost:5173"]`. OAuth redirect URIs are hardcoded to `http://localhost:5173/auth/callback`. Deploying to any other domain = auth completely broken.

**Threshold:** Any production deployment

**Fix:**
- Move origins to `settings.ALLOWED_ORIGINS` (list, comma-separated env var)
- OAuth redirect URIs must be registered in Google/GitHub developer consoles for the production domain
- Add `FRONTEND_URL` env var and use it everywhere

---

### Breakpoint 7: JWT_SECRET_KEY = Fernet Key Coupling

**What breaks:** The same key (`JWT_SECRET_KEY`) is used as both the JWT signing secret and the Fernet symmetric encryption key for saved database passwords. If the key is rotated (expired tokens, security incident), all saved connection configs are permanently unreadable — users lose all saved databases silently.

**Threshold:** First key rotation event

**Fix:**
- Separate `FERNET_KEY` from `JWT_SECRET_KEY` in `config.py`
- Add a key rotation script that re-encrypts all saved passwords
- Never couple auth tokens with data encryption keys

---

### Breakpoint 8: No Query Result Caching

**What breaks:** Performance. Every "Top 5 products by revenue" query hits the database fresh every time, even if the data hasn't changed. For analytical (OLAP) databases with heavy queries, this creates unnecessary load.

**Threshold:** Any frequent repeated queries, especially on cold databases (Snowflake, BigQuery) where spinning up a warehouse costs money

**Fix:**
- Add Redis-based result cache keyed by `(conn_id, sql_hash)`
- TTL: configurable per connection type (30s for OLTP, 5min for OLAP)
- Cache invalidation: manual via UI or automatic on schema change detection

---

## 9. Scaling Architecture for Large Userbase

### Target: 10,000 DAU

This is the architecture QueryCopilot needs to reach production-grade scale.

```
                        ┌─────────────────────────────┐
                        │       CDN (CloudFront)       │
                        │   Static React bundle + GIFs │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │      Load Balancer (ALB)     │
                        └──────┬───────────────┬───────┘
                               │               │
               ┌───────────────▼──┐   ┌────────▼────────────┐
               │  API Server 1    │   │   API Server 2       │
               │  FastAPI/Gunicorn│   │   FastAPI/Gunicorn   │
               └───────┬──────────┘   └────────┬─────────────┘
                       │                        │
         ┌─────────────▼────────────────────────▼──────────┐
         │                  Shared Services                  │
         │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
         │  │PostgreSQL│  │  Redis   │  │  Celery Queue │  │
         │  │(users,   │  │(sessions,│  │  (AI calls,   │  │
         │  │ chats,   │  │ cache,   │  │   async SQL)  │  │
         │  │ stats)   │  │ rate lim)│  │               │  │
         │  └──────────┘  └──────────┘  └───────────────┘  │
         │                                                   │
         │  ┌──────────────────────────────────────────┐    │
         │  │  Vector DB (Pinecone / pgvector)          │    │
         │  │  Per-user namespaced schema embeddings    │    │
         │  └──────────────────────────────────────────┘    │
         └────────────────────────────────────────────────┘
```

### Component Migration Path

| Current | Target | When |
|---------|--------|------|
| `.data/users.json` | PostgreSQL (SQLAlchemy) | >100 users |
| `app.state.connections` | Redis-backed lazy reconnect | Multi-worker |
| `.chroma/` | pgvector or Pinecone | >5K embeddings |
| Synchronous Claude calls | Celery + Redis queue | >50 DAU |
| No caching | Redis result cache (TTL-based) | Any repeat queries |
| Single Uvicorn process | Gunicorn + multiple Uvicorn workers | Any production |
| Hardcoded CORS | Env-var origin whitelist | Pre-deployment |
| Coupled JWT/Fernet key | Separate keys + rotation script | Pre-deployment |
| Single bundle JS | Vite code splitting + lazy routes | >500 users |
| No CDN | CloudFront / Vercel CDN | Any production |

### Cost Estimate at Scale

| Users (DAU) | Claude API (est.) | Infra | Total/month |
|-------------|-------------------|-------|-------------|
| 100 | ~$30 (10 queries avg) | $50 (small VPS) | ~$80 |
| 1,000 | ~$300 | $200 (managed DB + Redis) | ~$500 |
| 10,000 | ~$3,000 | $800 (multi-AZ, CDN, queue) | ~$3,800 |
| 100,000 | ~$30,000 | $4,000 (auto-scaling) | ~$34,000 |

> **Key insight:** Claude API cost dominates at scale. Aggressive caching (identical queries, schema embeddings) and routing simple queries to Haiku while reserving Sonnet for fallbacks is the primary cost lever.

### Frontend Scaling Checklist

- [ ] Code-split all routes with `React.lazy()`
- [ ] Move Recharts to dynamic import (saves ~80KB initial)
- [ ] Service worker for offline shell caching
- [ ] Preload critical fonts (already using Google Fonts CDN)
- [ ] Compress GIF demos to WebP/WebM (currently 380KB+ per GIF)
- [ ] Image optimization pipeline for any user-uploaded assets

### Backend Scaling Checklist

- [ ] Migrate file storage → PostgreSQL
- [ ] Add Redis for sessions + result cache + rate limiting
- [ ] Implement Celery for async AI call queue
- [ ] Separate JWT_SECRET_KEY from FERNET_KEY
- [ ] Add per-endpoint rate limiting (FastAPI-limiter)
- [ ] Add health check endpoint `/health` for load balancer
- [ ] Structured logging (JSON) for observability
- [ ] Add OpenTelemetry traces for Claude API call latency
- [ ] Migrate ChromaDB → pgvector (co-located with PostgreSQL)
- [ ] Add database connection pooling (PgBouncer for PostgreSQL)
- [ ] Implement graceful shutdown handling for live DB connections

---

## Appendix A: Animation Component Quick Reference

| Component | Props | Use Case |
|-----------|-------|---------|
| `PageTransition` | `className` | Wrap every page for route transitions |
| `StaggerContainer` | `as`, `className` | Grid/list parent — children stagger in |
| `StaggerItem` | `as`, `className` | Individual item in a stagger list |
| `AnimatedCounter` | `value`, `duration`, `decimals`, `prefix`, `suffix` | Numbers that count up on scroll |
| `CardSkeleton` | `count`, `className` | Loading placeholder for cards |
| `TableSkeleton` | `rows`, `cols` | Loading placeholder for tables |
| `ChartSkeleton` | `className` | Loading placeholder for charts |
| `AnimatedBackground` | `className` | Floating orb background (GPU-accelerated) |
| `MotionButton` | All button props | Any button needing spring physics |
| `useScrollReveal` | `once`, `margin`, `amount` | Trigger animation when element enters viewport |
| `StatSummaryCard` | `title`, `value`, `suffix`, `prefix`, `decimals`, `icon`, `color`, `trend`, `sparkline` | Dashboard KPI card |

---

## Appendix B: CSS Class Reference (Glassmorphism System)

| Class | Blur | Use |
|-------|------|-----|
| `.glass` | 16px | General surface, non-interactive |
| `.glass-light` | 12px | Lighter panels, secondary surfaces |
| `.glass-card` | 16px | Interactive cards (hover effects) |
| `.glass-card-elevated` | 24px | Hero cards, stat summaries |
| `.glass-input` | 12px | Form inputs |
| `.glass-navbar` | 20px | Sticky navigation bars |
| `.btn-glow` | — | Gradient glow on hover |
| `.input-glow` | — | Blue focus ring on inputs |

---

*Document generated: 2026-04-01 | QueryCopilot V1 | Full engineering record*
