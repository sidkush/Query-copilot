"""
QueryCopilot — FastAPI Backend
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth_routes, query_routes, schema_routes, connection_routes, user_routes, chat_routes, admin_routes, dashboard_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — no auto DB connection; user connects via /api/connections/connect
    logger.info("Starting QueryCopilot backend (lazy mode — waiting for user to connect a database)...")
    app.state.connections = {}  # {email: {conn_id: ConnectionEntry}}
    yield
    # Shutdown — disconnect all active connections (nested structure)
    for email, user_conns in list(app.state.connections.items()):
        for conn_id, entry in list(user_conns.items()):
            try:
                entry.connector.disconnect()
            except Exception:
                pass
    app.state.connections.clear()
    logger.info("QueryCopilot backend shut down.")


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


@app.get("/api/health")
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
