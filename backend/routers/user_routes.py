"""User profile and account API routes."""

import re
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth import get_current_user, _load_users
from user_storage import (
    load_profile, save_profile, load_connection_configs,
    list_chats, load_query_stats, clear_chat_history,
    delete_connection_config,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])

_MAX_DISPLAY_NAME = 100
_MAX_FIELD = 200


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    timezone: Optional[str] = None
    avatar_color: Optional[str] = None
    notification_preferences: Optional[dict] = None
    preferences: Optional[dict] = None


def _sanitize(val: str, max_len: int = _MAX_FIELD) -> str:
    """Strip HTML tags and cap length."""
    return re.sub(r"<[^>]*>", "", val).strip()[:max_len]


@router.get("/profile")
def get_profile(user: dict = Depends(get_current_user)):
    """Return merged user info (from users.json) + profile.json."""
    email = user["email"]
    users = _load_users()
    user_record = users.get(email, {})
    profile = load_profile(email)
    return {
        "email": email,
        "name": user_record.get("name", user.get("name", "")),
        "display_name": profile.get("display_name", user_record.get("name", "")),
        "phone": user_record.get("phone", ""),
        "country_code": user_record.get("country_code", ""),
        "company": profile.get("company", ""),
        "role": profile.get("role", ""),
        "timezone": profile.get("timezone", ""),
        "avatar_color": profile.get("avatar_color", "indigo"),
        "notification_preferences": profile.get("notification_preferences", {
            "email_notifications": True,
            "query_alerts": False,
        }),
        "preferences": profile.get("preferences", {}),
        "created_at": user_record.get("created_at", ""),
        "oauth_provider": user_record.get("oauth_provider"),
    }


@router.put("/profile")
def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    """Update display_name, company, role, timezone, avatar_color, and/or preferences."""
    email = user["email"]
    profile = load_profile(email)
    if body.display_name is not None:
        profile["display_name"] = _sanitize(body.display_name, _MAX_DISPLAY_NAME)
    if body.company is not None:
        profile["company"] = _sanitize(body.company)
    if body.role is not None:
        profile["role"] = _sanitize(body.role)
    if body.timezone is not None:
        profile["timezone"] = _sanitize(body.timezone, 60)
    if body.avatar_color is not None:
        allowed_colors = {"indigo", "blue", "green", "red", "purple", "pink", "orange", "cyan"}
        if body.avatar_color in allowed_colors:
            profile["avatar_color"] = body.avatar_color
    if body.notification_preferences is not None:
        profile["notification_preferences"] = body.notification_preferences
    if body.preferences is not None:
        profile["preferences"] = body.preferences
    save_profile(email, profile)
    return {"status": "ok", "profile": profile}


@router.get("/account")
def get_account(user: dict = Depends(get_current_user)):
    """Return comprehensive account summary."""
    email = user["email"]
    users = _load_users()
    user_record = users.get(email, {})
    configs = load_connection_configs(email)
    chats = list_chats(email)
    stats = load_query_stats(email)

    # Get active connections from app.state
    from main import app
    user_conns = app.state.connections.get(email, {})
    active_connections = []
    trained_tables = 0
    for conn_id, entry in user_conns.items():
        active_connections.append({
            "conn_id": entry.conn_id,
            "db_type": entry.db_type,
            "database_name": entry.database_name,
        })
        try:
            trained_tables += entry.engine.schema_collection.count()
        except Exception:
            pass

    # Saved connections summary
    saved_connections_list = []
    for cfg in configs:
        saved_connections_list.append({
            "id": cfg.get("id"),
            "label": cfg.get("label", cfg.get("database", "")),
            "db_type": cfg.get("db_type", ""),
        })

    # Compute averages
    total_q = stats.get("total_queries", 0)
    avg_latency = round(stats.get("total_latency_ms", 0) / total_q, 1) if total_q > 0 else 0
    success_rate = round(stats.get("success_count", 0) / total_q * 100, 1) if total_q > 0 else 0

    return {
        "email": email,
        "name": user_record.get("name", ""),
        "created_at": user_record.get("created_at", ""),
        "oauth_provider": user_record.get("oauth_provider"),
        "plan": "free",
        "active_connection_count": len(active_connections),
        "active_connections": active_connections,
        "query_stats": {
            "total_queries": total_q,
            "queries_this_month": stats.get("queries_this_month", 0),
            "avg_latency_ms": avg_latency,
            "success_rate": success_rate,
            "last_query_at": stats.get("last_query_at"),
        },
        "saved_connections": len(configs),
        "saved_connections_list": saved_connections_list,
        "chat_count": len(chats),
        "trained_tables": trained_tables,
    }


@router.get("/billing")
def get_billing(user: dict = Depends(get_current_user)):
    """Placeholder billing endpoint."""
    return {
        "plan": "free",
        "features": [
            "Unlimited queries",
            "All 16 databases",
            "Chat history",
        ],
    }


@router.post("/clear-history")
def clear_history(user: dict = Depends(get_current_user)):
    """Delete all chat history for the current user."""
    email = user["email"]
    clear_chat_history(email)
    return {"status": "ok", "message": "Chat history cleared"}


@router.post("/reset-connections")
def reset_connections(user: dict = Depends(get_current_user)):
    """Disconnect all active connections and delete all saved configs."""
    email = user["email"]

    # Disconnect all active connections
    from main import app
    user_conns = app.state.connections.get(email, {})
    for conn_id, entry in list(user_conns.items()):
        try:
            entry.connector.disconnect()
        except Exception:
            pass
    user_conns.clear()

    # Delete all saved configs
    configs = load_connection_configs(email)
    for cfg in configs:
        delete_connection_config(email, cfg.get("id", ""))

    return {"status": "ok", "message": "All connections disconnected and saved configs removed"}


# ── User Self-Delete ─────────────────────────────────────────

@router.post("/delete-account")
def delete_own_account(user: dict = Depends(get_current_user)):
    """Soft-delete the current user's account. Data is retained, access revoked."""
    from routers.admin_routes import _soft_delete_user
    return _soft_delete_user(user["email"], deleted_by="self")


# ── User Support Tickets ─────────────────────────────────────

class UserTicket(BaseModel):
    subject: str
    message: str
    category: str = "general"


@router.post("/support-ticket")
def submit_support_ticket(body: UserTicket, user: dict = Depends(get_current_user)):
    """Submit a support ticket as a regular user."""
    from routers.admin_routes import _load_tickets, _save_tickets, _lock as admin_lock
    import threading

    with admin_lock:
        tickets = _load_tickets()
        ticket_id = f"TK-{len(tickets)+1:04d}"
        ticket = {
            "id": ticket_id,
            "subject": body.subject[:200],
            "message": body.message[:2000],
            "category": body.category,
            "created_by": user["email"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "open",
            "replies": [],
        }
        tickets.append(ticket)
        _save_tickets(tickets)
    return {"status": "ok", "ticket_id": ticket_id}


@router.get("/support-tickets")
def get_my_tickets(user: dict = Depends(get_current_user)):
    """List the current user's support tickets."""
    from routers.admin_routes import _load_tickets
    tickets = _load_tickets()
    my_tickets = [t for t in tickets if t.get("created_by") == user["email"]]
    return {"tickets": my_tickets}
