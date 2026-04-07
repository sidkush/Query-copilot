# Plan: Redis Integration + SSE Live Tile Updates

**Spec**: User-approved item 4 from strategic roadmap — real-time dashboard tile updates via SSE, backed by Redis for cache, pub/sub, and scheduler locking.
**Approach**: Wire Redis as the backbone for 4 systems (cache, pub/sub, rate-limit, scheduler), then build SSE tile subscription endpoint + frontend EventSource consumer.
**Branch**: `master` (direct, per user's workflow)

## Tasks

### Task 1: Redis dependency + connection helper (~3 min)
- **Files**: `backend/requirements.txt` (modify), `backend/redis_client.py` (create), `backend/config.py` (modify)
- **Intent**: Add `redis>=5.0` to requirements. Create `redis_client.py` with a `get_redis()` singleton that returns a `redis.Redis` connection pool instance. Gracefully returns `None` if Redis is unavailable (allows fallback to in-memory). Add `REDIS_URL` config setting (default `redis://localhost:6379/0`).
- **Critical code** (config.py addition):
  ```python
  REDIS_URL: str = Field(default="redis://localhost:6379/0")
  ```
- **Critical code** (redis_client.py):
  ```python
  import redis
  import logging
  from config import settings

  logger = logging.getLogger(__name__)
  _pool: redis.ConnectionPool | None = None

  def get_redis() -> redis.Redis | None:
      global _pool
      if _pool is None:
          try:
              _pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)
          except Exception as exc:
              logger.warning("Redis unavailable: %s — falling back to in-memory", exc)
              return None
      try:
          r = redis.Redis(connection_pool=_pool)
          r.ping()
          return r
      except Exception:
          return None
  ```
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('redis_client.py', doraise=True); py_compile.compile('config.py', doraise=True); print('OK')"` → expects `OK`
- **Commit**: `feat: add Redis connection helper with graceful fallback`

### Task 2: Migrate TTL cache to Redis-backed with fallback (~5 min)
- **Files**: `backend/query_engine.py` (modify)
- **Intent**: Update `_get_cached()` and `_set_cached()` to try Redis first (using `get_redis()`). If Redis returns `None`, fall back to existing in-memory dict. Redis keys prefixed with `qc:cache:{conn_namespace}:{sha256}`. Use Redis native TTL (`SETEX`) instead of manual timestamp checking. `clear_cache()` uses `SCAN` + `DEL` for the namespace prefix. Keep `self._cache` dict as local fallback.
- **Depends on**: Task 1
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('query_engine.py', doraise=True); print('OK')"` → expects `OK`
- **Commit**: `feat: Redis-backed query cache with in-memory fallback`

### Task 3: Migrate rate limiter to Redis (~4 min)
- **Files**: `backend/routers/query_routes.py` (modify)
- **Intent**: Update `check_connection_rate_limit()` and `record_connection_result()` to use Redis sorted sets for sliding window (ZADD timestamp, ZRANGEBYSCORE to count). Circuit breaker state in Redis keys `qc:circuit:{key}:failures` and `qc:circuit:{key}:open_since`. Fall back to existing module-level dicts if `get_redis()` returns `None`.
- **Depends on**: Task 1
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('routers/query_routes.py', doraise=True); print('OK')"` → expects `OK`
- **Commit**: `feat: Redis-backed rate limiter with in-memory fallback`

### Task 4: SSE tile subscription endpoint (~5 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: Add `GET /dashboards/{dashboard_id}/subscribe` SSE endpoint. Uses `StreamingResponse` with `text/event-stream`. On connect, subscribes to Redis pub/sub channel `qc:tile_updates:{dashboard_id}`. When a message is published (tile refresh complete), yields `data: {"tile_id": "...", "columns": [...], "rows": [...]}`. Client heartbeat every 15s (`data: ping`). Graceful disconnect on client close. If Redis unavailable, return 503.
- **Critical code** (endpoint contract):
  ```python
  @router.get("/{dashboard_id}/subscribe")
  async def subscribe_tile_updates(dashboard_id: str, user: dict = Depends(get_current_user)):
      r = get_redis()
      if not r:
          raise HTTPException(503, "Real-time updates require Redis")
      async def event_generator():
          pubsub = r.pubsub()
          pubsub.subscribe(f"qc:tile_updates:{dashboard_id}")
          try:
              while True:
                  msg = pubsub.get_message(timeout=15)
                  if msg and msg["type"] == "message":
                      yield f"data: {msg['data']}\n\n"
                  else:
                      yield "data: ping\n\n"
          finally:
              pubsub.unsubscribe()
              pubsub.close()
      return StreamingResponse(event_generator(), media_type="text/event-stream",
                               headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
  ```
- **Depends on**: Task 1
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('routers/dashboard_routes.py', doraise=True); print('OK')"` → expects `OK`
- **Commit**: `feat: SSE endpoint for live tile update subscriptions`

### Task 5: Publish tile updates on refresh (~3 min)
- **Files**: `backend/routers/dashboard_routes.py` (modify)
- **Intent**: After a tile refresh succeeds (in both single-tile and batch-refresh endpoints), publish the result to Redis channel `qc:tile_updates:{dashboard_id}`. Payload: JSON with `tile_id`, `columns`, `rows`, `row_count`, `refreshed_at`. Use fire-and-forget `r.publish()`. If Redis unavailable, skip silently (refresh still works, just no live push).
- **Depends on**: Task 4
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('routers/dashboard_routes.py', doraise=True); print('OK')"` → expects `OK`
- **Commit**: `feat: publish tile refresh results to Redis pub/sub`

### Task 6: Frontend EventSource consumer (~5 min)
- **Files**: `frontend/src/api.js` (modify), `frontend/src/pages/DashboardBuilder.jsx` (modify)
- **Intent**: Add `subscribeTileUpdates(dashboardId, onUpdate)` to `api.js` — creates an `EventSource` to `/api/v1/dashboards/{dashboardId}/subscribe`. Returns an object with `.close()` method. Ignores `ping` messages. Parses JSON data and calls `onUpdate(tileData)`. In `DashboardBuilder.jsx`, open subscription in `useEffect` when dashboard loads. On tile update event, merge new data into the active dashboard state (update the matching tile's `rows`/`columns`). Close subscription on unmount.
- **Depends on**: Task 4
- **Test**: `cd frontend && npm run build 2>&1 | tail -3` → expects `built in` and no errors
- **Commit**: `feat: frontend EventSource consumer for live tile updates`

### Task 7: APScheduler Redis job store (~3 min)
- **Files**: `backend/digest.py` (modify)
- **Intent**: If Redis is available, configure APScheduler with `RedisJobStore` to prevent duplicate job execution across multiple workers. Import `apscheduler.jobstores.redis.RedisJobStore`. If `get_redis()` returns a connection, use `jobstores={'default': RedisJobStore(host=..., port=...)}`. Otherwise fall back to default memory job store (current behavior). Parse host/port from `settings.REDIS_URL`.
- **Depends on**: Task 1
- **Test**: `cd backend && python -c "import py_compile; py_compile.compile('digest.py', doraise=True); print('OK')"` → expects `OK`
- **Commit**: `feat: APScheduler Redis job store for multi-worker safety`

### Task 8: Full build verification (~2 min)
- **Files**: none (verification only)
- **Intent**: Run `py_compile` on all backend files and `npm run build` on frontend. Verify no regressions.
- **Depends on**: Tasks 1-7
- **Test**: `cd backend && python -c "import py_compile; [py_compile.compile(f, doraise=True) for f in ['redis_client.py','config.py','query_engine.py','digest.py','main.py','routers/query_routes.py','routers/dashboard_routes.py']]; print('Backend OK')"` → expects `Backend OK`. Then `cd frontend && npm run build 2>&1 | tail -3` → expects `built in`
- **Commit**: none (verification only)

## Parallelism

Tasks 2, 3, 4, and 7 all depend only on Task 1 and are independent of each other — they can run in parallel after Task 1 completes.

Task 5 depends on Task 4. Task 6 depends on Task 4. Task 8 depends on all.

```
Task 1 ──┬── Task 2 (cache)  ──────────────┐
         ├── Task 3 (rate limiter) ─────────┤
         ├── Task 4 (SSE endpoint) ──┬─ Task 5 (publish) ──┤
         │                           └─ Task 6 (frontend)  ──┤
         └── Task 7 (scheduler) ────────────┤
                                     Task 8 (verify) ◄──────┘
```

## Fingerprint
Redis wired into cache/rate-limit/scheduler with graceful in-memory fallback; SSE endpoint at `/api/v1/dashboards/{id}/subscribe` pushes live tile data; frontend auto-subscribes via EventSource on dashboard load.
