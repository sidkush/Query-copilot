"""
DataLens — FastAPI Backend
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth_routes, query_routes, schema_routes, connection_routes, user_routes, chat_routes, admin_routes, dashboard_routes, alert_routes, agent_routes, behavior_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — no auto DB connection; user connects via /api/connections/connect
    logger.info("Starting DataLens backend (lazy mode — waiting for user to connect a database)...")
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
    yield
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
    logger.info("DataLens backend shut down.")


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


@app.get("/api/v1/health")
def health_check():
    any_alive = False
    total_connections = 0
    for email, user_conns in app.state.connections.items():
        for conn_id, entry in user_conns.items():
            total_connections += 1
            try:
                if entry.connector.test_connection():
                    any_alive = True
            except Exception:
                pass
    return {
        "status": "healthy",
        "database_connected": any_alive,
        "active_connections": total_connections,
    }
