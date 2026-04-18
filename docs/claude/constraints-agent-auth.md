## Scope

Agent-runtime guardrails + Auth & Access Control + Infrastructure config. Numeric values live in `config-defaults.md`; foundational invariants live in `security-core.md`. **Always-loaded.**

### Agent System

- **Guardrails** — dynamic tool budget (see `config-defaults.md` :: Agent system), phase-aware timeouts (see `config-defaults.md` :: Agent system), per-segment + session caps (see `config-defaults.md`), max SQL retries (see `config-defaults.md`), per-user concurrency cap (see `config-defaults.md`). Agent `run_sql` uses same validator + read-only as main pipeline.
- **Collected steps cap** — `MAX_COLLECTED_STEPS` (see `config-defaults.md`) in `agent_routes.py`. Oldest evicted when cap reached.
- **Waterfall early-return must store in memory** — if tier answers and agent returns early, call `memory.add_turn()` for both question and answer BEFORE returning. Else session history lost.
- **ValidationGate rejects empty hashes** for memory/turbo tiers. Only schema/live tiers pass through without hash.
- **Turbo Mode opt-in per connection** — privacy-sensitive customers can skip. Twin + turbo_status cleaned on disconnect.
- **`cleanup_stale()` on QueryMemory** — auto-scheduled every 6 hours in `main.py` lifespan. `QueryMemory()` instantiated once before loop (not per-iteration) to prevent ChromaDB client proliferation.

### Auth & Access Control

- **`JWT_SECRET_KEY`** — also derives Fernet key for saved DB passwords. Changing invalidates all saved connection configs.
- **Admin auth** is separate JWT flow (`admin_token` in localStorage), not same as user auth.
- **User deletion** is soft-delete — archived in `deleted_users.json`. `create_user()` checks before allowing re-registration.
- **Daily query limits** enforced in `query_routes.py`. Plan-based quotas (see `config-defaults.md` :: Plan-based quotas).
- **Per-user connection limit** — `MAX_CONNECTIONS_PER_USER` (see `config-defaults.md`) in `connection_routes.py`. Returns 429 when exceeded.
- **Per-user share token quota** — plan-based limits in `dashboard_routes.py`. per-plan share-token quotas (see `config-defaults.md`).
- **Share tokens** — dashboard sharing uses time-limited tokens (`SHARE_TOKEN_EXPIRE_HOURS` (see `config-defaults.md`)). Auto-pruned on startup.

### Infrastructure & Config

- **Vite proxy** → `http://localhost:8002`. Backend must run on 8002 during dev. `vite.config.js` has manual chunk splitting for framer-motion, three.js, deck.gl, d3, export libs — keep when adding large deps.
- **CORS** configured for `localhost:5173`, `localhost:3000`, `FRONTEND_URL`. Update for production.
- **OAuth redirect URI** defaults to `http://localhost:5173/auth/callback` (configurable via `OAUTH_REDIRECT_URI`).
- **Redis optional** — `redis_client.py` degrades gracefully. Redis features must have in-memory fallbacks.
- **Thread pool** — explicit `ThreadPoolExecutor(max_workers=THREAD_POOL_MAX_WORKERS)` in lifespan startup (see `config-defaults.md`).
- **SQL Allowlist mode** — `SQL_ALLOWLIST_MODE` (default False) + `SQL_ALLOWED_TABLES` restricts queries to explicit table list.
- **Schema profiling** — `profile_connection()` runs in background thread to avoid blocking connect endpoint on slow DBs.

## See also
- `config-defaults.md` — all numeric limits mentioned (tool budget, session caps, quota tables).
- `security-core.md` — the invariants these rules lean on.
- `arch-backend.md` — how each rule maps onto module-level code.
