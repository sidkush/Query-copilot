# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**QueryCopilot** — a natural language-to-SQL analytics SaaS. Users connect their own database, ask questions in plain English, and receive generated SQL (shown for review before execution), results, auto-generated charts, and a natural-language summary. The system supports 18 database engines.

## Setup & Running

```bash
# Backend (Python 3.10+, from backend/)
pip install -r requirements.txt
cp .env.example .env        # fill in ANTHROPIC_API_KEY, JWT_SECRET_KEY, etc.
uvicorn main:app --reload   # http://localhost:8000

# Frontend (from frontend/)
npm install
npm run dev                 # http://localhost:5173 (proxied to backend at localhost:8002)

# Lint frontend
npm run lint
```

There are no automated tests. `backend/test_registration.py` (end-to-end OTP + registration flow) and `backend/regression_test.py` are manual scripts, not pytest suites.

## Architecture

Two independently running services:

### Backend — FastAPI (`/backend`)

**Entry point:** `main.py` — registers 8 routers, initializes `app.state.connections = {}` (the in-memory connection map), CORS for React dev server (localhost:5173, localhost:3000, and `FRONTEND_URL`). Includes a `/api/health` endpoint.

**Active connection map:** `app.state.connections[email][conn_id]` → `ConnectionEntry` (models.py). Each entry holds a `DatabaseConnector`, a `QueryEngine`, `db_type`, `database_name`, and `connected_at`. Connections are created on demand; there is no auto-connect on startup. All connections are gracefully disconnected on app shutdown.

**Core pipeline** (`query_engine.py`):
1. User question is embedded and used to retrieve relevant schema chunks + few-shot examples from ChromaDB (RAG, per-connection namespaced collections).
2. Prompt is built and sent to Claude (Haiku primary → Sonnet fallback on validation failure).
3. Response SQL is cleaned → validated → (optionally) executed → PII-masked → summarized.
4. Positive feedback from users is stored back into ChromaDB to improve future queries.
5. Also supports dashboard generation (multi-query tiles) and query suggestions.

**OTP system** (`otp.py`):
- Two-channel OTP: email (via Resend or SMTP) + SMS (via Twilio).
- 6-digit codes with 10-minute TTL, max 3 attempts per OTP, max 10 requests/hour per identifier.
- Thread-safe file-based storage (`.data/otp_store.json`).

**Router modules** (`routers/`) — 8 routers:

| Router | Prefix | Purpose |
|---|---|---|
| `auth_routes.py` | `/api/auth` | OTP-gated registration, login, Google/GitHub OAuth, tutorial completion |
| `connection_routes.py` | `/api/connections` | Test, connect, disconnect, list, save/load encrypted configs, reconnect. Includes Supabase pooler auto-detection for IPv6-only hosts |
| `query_routes.py` | `/api/queries` | `/generate` (NL→SQL), `/execute` (run approved SQL), `/feedback`, `/stats`, `/suggestions`, `/generate-dashboard` |
| `schema_routes.py` | `/api/schema` | Table listing, DDL, ER diagram position persistence |
| `chat_routes.py` | `/api/chats` | Create/list/load/append/delete chat sessions with XSS sanitization |
| `user_routes.py` | `/api/user` | Profile, account summary, billing, clear history, reset connections, delete account, support tickets |
| `dashboard_routes.py` | `/api/dashboards` | CRUD for named dashboards with tiles (chart type, columns, measures, palette, grid layout) |
| `admin_routes.py` | `/api/admin` | Admin login (separate JWT), user management, plan changes, support ticket CRUD, soft-delete users |

**Security layers:**
- `sql_validator.py` — 6 layers: multi-statement detection → keyword blocklist → sqlglot AST parse (15+ SQL dialects) → SELECT-only enforcement → LIMIT enforcement → dangerous-function detection.
- `pii_masking.py` — column-name pattern matching (email, phone, SSN, credit card, salary, address) + regex value scanning; always called before data is returned to any user or LLM.
- `db_connector.py` — enforces read-only at driver level (SET TRANSACTION READ ONLY / SET readonly = 1) and re-validates in the connector before execution. Supports chunked result fetching (500 rows/chunk) for big data engines.

**Supported database engines (18):**
- Relational: PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, CockroachDB
- Cloud warehouses: Snowflake*, BigQuery*, Redshift, Databricks*
- Analytics: DuckDB, ClickHouse, Trino
- Enterprise: Oracle, SAP HANA*, IBM Db2*
- Managed: Supabase (auto-detects pooler for IPv6 hosts)

\* = driver commented out in `requirements.txt`; install manually.

**Data persistence (file-based, no separate DB):**
- `auth.py` — users/sessions/OAuth state in `.data/*.json` with `threading.Lock()` for safety. Also stores admin credentials and support tickets.
- `user_storage.py` — per-user files under `.data/user_data/{sha256_prefix}/`:
  - `connections.json` — saved DB configs (Fernet-encrypted passwords)
  - `chat_history/{chat_id}.json` — conversation history per connection
  - `query_stats.json` — total queries, monthly counts, latency, success rate
  - `er_positions/{conn_id}.json` — ER diagram layout
  - `dashboards.json` — saved dashboard tiles and layout
  - `profile.json` — display name, company, role, timezone, avatar, preferences
- ChromaDB vector store lives in `.chroma/querycopilot/` (delete = lose all trained context; no re-train command other than reconnecting).

**Config:** `config.py` — Pydantic `BaseSettings` singleton imported as `settings` (40+ fields). All config comes from `backend/.env`. The `.env` path is resolved relative to `config.py`, not the working directory.

### Frontend — React 19 + Vite 8 (`/frontend`)

**State:** Zustand store (`store.js`) — auth (user, token), tutorial status, multi-DB connections (list + active), messages, saved connections, chat list + active chat, user profile. Persisted to localStorage.

**API layer:** `api.js` — 50+ endpoints for both user and admin APIs. Injects JWT `Authorization` header automatically. 401 responses redirect to `/login`. Admin API uses a separate `admin_token` in localStorage.

**Routing** (`App.jsx`): React Router v7 with `ProtectedRoute` HOC, `AnimatePresence` page transitions, and `AppPage` wrapper for sidebar layout.

**Pages** (`src/pages/`) — 13 pages:

| Page | Route | Purpose |
|---|---|---|
| `Landing.jsx` | `/` | Marketing hero page with demo slides |
| `Login.jsx` | `/login` | Email/phone OTP + OAuth login |
| `OAuthCallback.jsx` | `/auth/callback` | OAuth provider callback |
| `Tutorial.jsx` | `/tutorial` | Onboarding tutorial (protected, no sidebar) |
| `Dashboard.jsx` | `/dashboard` | Main DB connection + query interface |
| `SchemaView.jsx` | `/schema` | Table browser + ER diagram |
| `Chat.jsx` | `/chat` | Multi-turn conversation interface |
| `DashboardBuilder.jsx` | `/analytics` | Drag-drop tile dashboard builder |
| `Profile.jsx` | `/profile` | User profile settings |
| `Account.jsx` | `/account` | Account management & history |
| `Billing.jsx` | `/billing` | Subscription info |
| `AdminLogin.jsx` | `/admin/login` | Admin portal login |
| `AdminDashboard.jsx` | `/admin` | Admin panel (users, tickets, analytics) |

**Components** (`src/components/`):
- `SQLPreview` — syntax-highlighted SQL display
- `ResultsTable` — paginated/sortable table with export (CSV/JSON/Markdown/TSV/Text)
- `ResultsChart` — Recharts auto-viz (line, bar, pie, area)
- `ERDiagram` — interactive ER diagram with draggable tables, zoom/pan, FK lines
- `SchemaExplorer` — database schema tree browser
- `StatSummaryCard` — KPI/stat display card
- `AppLayout` / `AppSidebar` — main layout + icon-based nav with tooltips
- `UserDropdown` — user menu
- `animation/` — `PageTransition`, `SkeletonLoader`, `StaggerContainer`, `AnimatedBackground`, `AnimatedCounter`, `MotionButton`, `useScrollReveal`

**Styling:** Tailwind CSS 4.2 + custom glassmorphism classes in `index.css`. Fonts: Poppins (headings) + Open Sans (body). Dark theme (`#06060e` bg). Animations via Framer Motion + GSAP.

## Key Constraints

- **Read-only is enforced at three layers** (driver, SQL validator, connection config). Never weaken these.
- **PII masking (`mask_dataframe()`) must run before any data is returned** — to the user or back to the LLM for summarization.
- **Query flow is two-step by design:** `/generate` shows SQL for user review; `/execute` runs it. Don't collapse these into one call.
- **Daily query limits** are enforced in `query_routes.py` before execution. Free plan: 10/day.
- **Saved DB passwords** are encrypted with Fernet derived from `JWT_SECRET_KEY`. Changing `JWT_SECRET_KEY` in production will invalidate all saved connection configs.
- **OAuth redirect URI** defaults to `http://localhost:5173/auth/callback` (configurable via `OAUTH_REDIRECT_URI`). Update before deploying.
- **Vite dev proxy** points to `http://localhost:8002` — backend must run on that port during development.
- **Admin auth** uses a separate JWT flow and `admin_token` in localStorage — not the same as user auth.
- **User deletion is soft-delete** — archived in `deleted_users.json` with metadata preserved.

## Key Configuration Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required — Claude API access |
| `JWT_SECRET_KEY` | Required in production — also used to derive Fernet key for saved DB passwords |
| `PRIMARY_MODEL` / `FALLBACK_MODEL` | Defaults: `claude-haiku-4-5-20251001` / `claude-sonnet-4-5-20250514` |
| `MAX_TOKENS` | Claude max tokens (default 2048) |
| `MAX_ROWS` / `QUERY_TIMEOUT_SECONDS` | Safety limits (default 1000 / 30s) |
| `CACHE_ENABLED` / `CACHE_TTL_SECONDS` | Query caching (default true / 3600s) |
| `RESEND_API_KEY` or `SMTP_*` | OTP email delivery (SMTP takes priority if configured) |
| `OTP_EXPIRY_SECONDS` | OTP lifetime (default 600s / 10 min) |
| `TWILIO_*` | Phone OTP — `ACCOUNT_SID`, `AUTH_TOKEN`, `FROM_NUMBER`, `MESSAGING_SERVICE_SID` |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | OAuth (optional) |
| `OAUTH_REDIRECT_URI` | OAuth callback URL (default `http://localhost:5173/auth/callback`) |
| `FRONTEND_URL` | Frontend origin for CORS (default `http://localhost:5173`) |
| `CHROMA_PERSIST_DIR` | ChromaDB path (default `.chroma/querycopilot`) |
| `BLOCKED_KEYWORDS` | SQL keywords blocked by validator (DROP, DELETE, UPDATE, INSERT, ALTER, etc.) |
| `APP_TITLE` | Application name (default `QueryCopilot`) |
