"""
AskDB — FastAPI Backend
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth_routes, query_routes, schema_routes, connection_routes, user_routes, chat_routes, admin_routes, dashboard_routes, alert_routes, agent_routes, behavior_routes, ml_routes, voice_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — no auto DB connection; user connects via /api/connections/connect
    logger.info("Starting AskDB backend (lazy mode — waiting for user to connect a database)...")
    app.state.connections = {}  # {email: {conn_id: ConnectionEntry}}
    # M1: Explicit thread pool to prevent default 8-12 thread bottleneck
    # P2 NEMESIS fix: use get_running_loop() (Python 3.10+ safe in async context)
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    loop = asyncio.get_running_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=settings.THREAD_POOL_MAX_WORKERS))
    logger.info(f"Thread pool configured: max_workers={settings.THREAD_POOL_MAX_WORKERS}")
    # Prune expired share tokens on startup
    try:
        from user_storage import prune_expired_share_tokens
        pruned = prune_expired_share_tokens()
        if pruned:
            logger.info(f"Pruned {pruned} expired/revoked share tokens")
    except Exception:
        pass
    # Start email digest scheduler
    try:
        from digest import start_digest_scheduler
        start_digest_scheduler()
    except Exception as exc:
        logger.warning(f"Digest scheduler failed to start: {exc}")
    # Start periodic cleanup_stale scheduler for query memory (every 6 hours)
    memory_cleanup_task = None
    try:
        async def _periodic_cleanup_stale():
            """Run cleanup_stale() for all active connections every 6 hours."""
            import asyncio as _aio
            from query_memory import QueryMemory
            qm = QueryMemory()  # Create once — reuse across iterations to avoid ChromaDB client proliferation
            INTERVAL = 6 * 3600  # 6 hours
            while True:
                await _aio.sleep(INTERVAL)
                try:
                    for _email, user_conns in list(app.state.connections.items()):
                        for conn_id in list(user_conns.keys()):
                            try:
                                deleted = qm.cleanup_stale(conn_id)
                                if deleted:
                                    logger.info(f"cleanup_stale: pruned {deleted} stale insights for conn={conn_id}")
                            except Exception:
                                logger.debug(f"cleanup_stale: skipped conn={conn_id}")
                except Exception:
                    logger.exception("Periodic cleanup_stale failed")
        memory_cleanup_task = asyncio.create_task(_periodic_cleanup_stale())
        logger.info("Query memory cleanup scheduler started (interval=6h)")
    except Exception as exc:
        logger.warning(f"Query memory cleanup scheduler failed to start: {exc}")
    yield
    # Shutdown — stop cleanup_stale scheduler
    if memory_cleanup_task is not None:
        memory_cleanup_task.cancel()
        logger.info("Query memory cleanup scheduler stopped")
    # Shutdown — stop digest scheduler
    try:
        from digest import stop_digest_scheduler
        stop_digest_scheduler()
    except Exception:
        pass
    # Disconnect all active connections (nested structure)
    for email, user_conns in list(app.state.connections.items()):
        for conn_id, entry in list(user_conns.items()):
            try:
                entry.connector.disconnect()
            except Exception:
                pass
    app.state.connections.clear()
    logger.info("AskDB backend shut down.")


app = FastAPI(
    title=settings.APP_TITLE,
    description="Natural Language to SQL Analytics Copilot",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global exception handler for BYOK key errors ──────────────
# InvalidKeyError can be raised from any route that calls
# get_provider_for_user() — return a 422 with a user-friendly
# message + error code that the frontend auto-detects.
from model_provider import InvalidKeyError
from fastapi.responses import JSONResponse
from fastapi import Request

@app.exception_handler(InvalidKeyError)
async def invalid_key_handler(request: Request, exc: InvalidKeyError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": str(exc),
            "error": "api_key_invalid",
        },
    )

# Mount routers
app.include_router(auth_routes.router)
app.include_router(query_routes.router)
app.include_router(schema_routes.router)
app.include_router(connection_routes.router)
app.include_router(user_routes.router)
app.include_router(chat_routes.router)
app.include_router(admin_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(alert_routes.router)
app.include_router(agent_routes.router)
app.include_router(behavior_routes.router)
app.include_router(ml_routes.router)
app.include_router(voice_routes.router)


@app.get("/api/v1/health")
def health_check():
    from concurrent.futures import ThreadPoolExecutor, as_completed

    HEALTH_CHECK_TIMEOUT = 5  # seconds per connection

    entries = []
    for email, user_conns in app.state.connections.items():
        for conn_id, entry in user_conns.items():
            entries.append((conn_id, entry))

    total_connections = len(entries)
    healthy_count = 0
    unhealthy_count = 0

    if entries:
        def _check(item):
            _cid, entry = item
            try:
                return entry.connector.test_connection()
            except Exception:
                return False

        with ThreadPoolExecutor(max_workers=min(total_connections, 8)) as pool:
            futures = [pool.submit(_check, e) for e in entries]
            for future in as_completed(futures, timeout=HEALTH_CHECK_TIMEOUT):
                try:
                    alive = future.result(timeout=HEALTH_CHECK_TIMEOUT)
                    if alive:
                        healthy_count += 1
                    else:
                        unhealthy_count += 1
                except Exception:
                    unhealthy_count += 1

    return {
        "status": "healthy",
        "database_connected": healthy_count > 0,
        "active_connections": total_connections,
        "healthy_connections": healthy_count,
        "unhealthy_connections": unhealthy_count,
    }
