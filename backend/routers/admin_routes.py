"""Admin dashboard API routes — user management, support tickets, plan changes."""

import json
import os
import logging
import bcrypt
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from jose import JWTError, jwt

from config import settings
from auth import _load_users, _save_users, create_access_token
from pii_masking import add_suppressed_column, remove_suppressed_column, list_suppressed_columns
from user_storage import (
    load_query_stats, load_connection_configs, list_chats,
    load_profile, save_profile, clear_chat_history,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

_DATA_DIR = Path(__file__).resolve().parent.parent / ".data"
_ADMIN_FILE = _DATA_DIR / "admin_credentials.json"
_TICKETS_FILE = _DATA_DIR / "support_tickets.json"
_DELETED_USERS_FILE = _DATA_DIR / "deleted_users.json"
_lock = threading.Lock()

security = HTTPBearer()


# ── Admin credential helpers ─────────────────────────────────

def _load_admins() -> dict:
    if not _ADMIN_FILE.exists():
        return {}
    with open(_ADMIN_FILE, "r") as f:
        return json.load(f)


def _save_admins(admins: dict):
    _ADMIN_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_ADMIN_FILE, "w") as f:
        json.dump(admins, f, indent=2)


# ── Support tickets helpers ──────────────────────────────────

def _load_tickets() -> list:
    if not _TICKETS_FILE.exists():
        return []
    with open(_TICKETS_FILE, "r") as f:
        return json.load(f)


def _save_tickets(tickets: list):
    _TICKETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_TICKETS_FILE, "w") as f:
        json.dump(tickets, f, indent=2)


# ── Deleted users archive ───────────────────────────────────

def _load_deleted_users() -> dict:
    if not _DELETED_USERS_FILE.exists():
        return {}
    with open(_DELETED_USERS_FILE, "r") as f:
        return json.load(f)


def _save_deleted_users(data: dict):
    _DELETED_USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_DELETED_USERS_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ── Admin auth dependency ────────────────────────────────────

def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify the caller is an authenticated admin using the separate admin JWT secret."""
    from auth import get_admin_jwt_secret
    token = credentials.credentials
    try:
        payload = jwt.decode(token, get_admin_jwt_secret(), algorithms=[settings.JWT_ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")
        if not username or role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return {"username": username, "role": role}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")


# ── Admin Login ──────────────────────────────────────────────

class AdminLogin(BaseModel):
    username: str
    password: str


@router.post("/login")
def admin_login(body: AdminLogin):
    """Authenticate admin and return JWT token."""
    admins = _load_admins()
    admin = admins.get(body.username)
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(body.password.encode("utf-8"), admin["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    from auth import create_admin_token
    token = create_admin_token({"sub": body.username, "name": "Admin", "role": "admin"})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": body.username, "role": admin.get("role", "superadmin")},
    }


# ── Dashboard Overview ───────────────────────────────────────

@router.get("/dashboard")
def admin_dashboard(admin: dict = Depends(get_admin_user)):
    """Get overview stats for the admin dashboard."""
    users = _load_users()
    deleted = _load_deleted_users()
    tickets = _load_tickets()

    # Gather per-user stats
    total_queries = 0
    total_chats = 0
    active_users_this_month = 0
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")

    for email in users:
        stats = load_query_stats(email)
        total_queries += stats.get("total_queries", 0)
        total_chats += len(list_chats(email))
        if stats.get("current_month") == current_month and stats.get("queries_this_month", 0) > 0:
            active_users_this_month += 1

    # Active connections
    from main import app
    total_active_connections = sum(
        len(conns) for conns in app.state.connections.values()
    )

    open_tickets = len([t for t in tickets if t.get("status") == "open"])

    return {
        "total_users": len(users),
        "deleted_users": len(deleted),
        "active_users_this_month": active_users_this_month,
        "total_queries": total_queries,
        "total_chats": total_chats,
        "total_active_connections": total_active_connections,
        "open_tickets": open_tickets,
        "total_tickets": len(tickets),
    }


# ── User Management ─────────────────────────────────────────

@router.get("/users")
def list_all_users(admin: dict = Depends(get_admin_user)):
    """List all registered users with their stats."""
    users = _load_users()
    result = []
    from main import app

    for email, info in users.items():
        stats = load_query_stats(email)
        profile = load_profile(email)
        configs = load_connection_configs(email)
        chats = list_chats(email)
        user_conns = app.state.connections.get(email, {})

        result.append({
            "email": email,
            "name": info.get("name", ""),
            "phone": info.get("phone", ""),
            "country_code": info.get("country_code", ""),
            "oauth_provider": info.get("oauth_provider"),
            "created_at": info.get("created_at", ""),
            "plan": profile.get("plan", "free"),
            "company": profile.get("company", ""),
            "role": profile.get("role", ""),
            "status": "active",
            "query_stats": {
                "total_queries": stats.get("total_queries", 0),
                "queries_this_month": stats.get("queries_this_month", 0),
                "last_query_at": stats.get("last_query_at"),
            },
            "saved_connections": len(configs),
            "chat_count": len(chats),
            "active_connections": len(user_conns),
        })

    result.sort(key=lambda u: u.get("created_at", ""), reverse=True)
    return {"users": result}


@router.get("/users/{email}")
def get_user_detail(email: str, admin: dict = Depends(get_admin_user)):
    """Get detailed info for a specific user."""
    users = _load_users()
    if email not in users:
        raise HTTPException(status_code=404, detail="User not found")

    info = users[email]
    stats = load_query_stats(email)
    profile = load_profile(email)
    configs = load_connection_configs(email)
    chats = list_chats(email)

    from main import app
    user_conns = app.state.connections.get(email, {})
    active = [
        {"conn_id": e.conn_id, "db_type": e.db_type, "database_name": e.database_name}
        for e in user_conns.values()
    ]

    saved = [{"id": c.get("id"), "label": c.get("label", ""), "db_type": c.get("db_type")} for c in configs]

    return {
        "email": email,
        "name": info.get("name", ""),
        "phone": info.get("phone", ""),
        "country_code": info.get("country_code", ""),
        "oauth_provider": info.get("oauth_provider"),
        "created_at": info.get("created_at", ""),
        "tutorial_completed": info.get("tutorial_completed", False),
        "plan": profile.get("plan", "free"),
        "company": profile.get("company", ""),
        "role": profile.get("role", ""),
        "timezone": profile.get("timezone", ""),
        "avatar_color": profile.get("avatar_color", "indigo"),
        "query_stats": stats,
        "active_connections": active,
        "saved_connections": saved,
        "chats": chats,
    }


# ── Change User Plan ─────────────────────────────────────────

class PlanUpdate(BaseModel):
    plan: str  # "free", "pro", "team"


@router.put("/users/{email}/plan")
def update_user_plan(email: str, body: PlanUpdate, admin: dict = Depends(get_admin_user)):
    """Change a user's subscription plan (admin only)."""
    users = _load_users()
    if email not in users:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_plans = {"free", "pro", "team", "weekly", "monthly", "yearly", "enterprise"}
    if body.plan not in allowed_plans:
        raise HTTPException(status_code=400, detail=f"Plan must be one of: {', '.join(sorted(allowed_plans))}")

    profile = load_profile(email)
    profile["plan"] = body.plan
    profile["plan_changed_at"] = datetime.now(timezone.utc).isoformat()
    profile["plan_changed_by"] = admin["username"]
    save_profile(email, profile)

    logger.info("Admin %s changed plan for %s to %s", admin["username"], email, body.plan)
    return {"status": "ok", "email": email, "plan": body.plan}


# ── Delete User Account (soft-delete) ────────────────────────

@router.delete("/users/{email}")
def delete_user_account(email: str, admin: dict = Depends(get_admin_user)):
    """Soft-delete a user account. Retains data but revokes access."""
    return _soft_delete_user(email, deleted_by=f"admin:{admin['username']}")


def _soft_delete_user(email: str, deleted_by: str = "self"):
    """Archive user record and remove from active users.json (access revoked, data retained)."""
    with _lock:
        users = _load_users()
        if email not in users:
            raise HTTPException(status_code=404, detail="User not found")

        user_record = users.pop(email)
        user_record["deleted_at"] = datetime.now(timezone.utc).isoformat()
        user_record["deleted_by"] = deleted_by

        # Archive to deleted_users.json
        deleted = _load_deleted_users()
        deleted[email] = user_record
        _save_deleted_users(deleted)

        # Remove from active users
        _save_users(users)

    # Disconnect any active connections
    from main import app
    user_conns = app.state.connections.pop(email, {})
    for entry in user_conns.values():
        try:
            entry.connector.disconnect()
        except Exception:
            pass

    logger.info("User %s soft-deleted by %s", email, deleted_by)
    return {"status": "ok", "message": f"Account {email} deleted. Data retained for records."}


# ── Support Tickets ──────────────────────────────────────────

class TicketCreate(BaseModel):
    subject: str
    message: str
    category: str = "general"  # general, bug, feature, billing


class TicketReply(BaseModel):
    message: str


@router.post("/tickets")
def create_ticket(body: TicketCreate, admin: dict = Depends(get_admin_user)):
    """Admin can create a ticket on behalf of a user or for internal tracking."""
    with _lock:
        tickets = _load_tickets()
        ticket_id = f"TK-{len(tickets)+1:04d}"
        ticket = {
            "id": ticket_id,
            "subject": body.subject,
            "message": body.message,
            "category": body.category,
            "created_by": admin["username"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "open",
            "replies": [],
        }
        tickets.append(ticket)
        _save_tickets(tickets)
    return ticket


@router.get("/tickets")
def list_tickets(admin: dict = Depends(get_admin_user)):
    """List all support tickets."""
    tickets = _load_tickets()
    return {"tickets": tickets}


@router.put("/tickets/{ticket_id}/reply")
def reply_to_ticket(ticket_id: str, body: TicketReply, admin: dict = Depends(get_admin_user)):
    """Add a reply to a support ticket."""
    with _lock:
        tickets = _load_tickets()
        for ticket in tickets:
            if ticket["id"] == ticket_id:
                ticket["replies"].append({
                    "message": body.message,
                    "by": admin["username"],
                    "at": datetime.now(timezone.utc).isoformat(),
                })
                _save_tickets(tickets)
                return ticket
        raise HTTPException(status_code=404, detail="Ticket not found")


@router.put("/tickets/{ticket_id}/close")
def close_ticket(ticket_id: str, admin: dict = Depends(get_admin_user)):
    """Close a support ticket."""
    with _lock:
        tickets = _load_tickets()
        for ticket in tickets:
            if ticket["id"] == ticket_id:
                ticket["status"] = "closed"
                ticket["closed_at"] = datetime.now(timezone.utc).isoformat()
                ticket["closed_by"] = admin["username"]
                _save_tickets(tickets)
                return ticket
        raise HTTPException(status_code=404, detail="Ticket not found")


# ── Deleted Users Archive ────────────────────────────────────

@router.get("/deleted-users")
def list_deleted_users(admin: dict = Depends(get_admin_user)):
    """View all soft-deleted user accounts."""
    deleted = _load_deleted_users()
    return {"deleted_users": [
        {**v, "email": k} for k, v in deleted.items()
    ]}


# ── PII Suppression Registry ──────────────────────────────────

class PIISuppressionRequest(BaseModel):
    conn_id: str
    column: str


@router.get("/pii-suppressions")
def get_pii_suppressions(conn_id: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    """List all admin-flagged PII suppression columns."""
    return {"suppressions": list_suppressed_columns(conn_id)}


@router.post("/pii-suppressions")
def add_pii_suppression(body: PIISuppressionRequest, admin: dict = Depends(get_admin_user)):
    """Flag a column as always-redacted for a connection."""
    add_suppressed_column(body.conn_id, body.column)
    return {"status": "added", "conn_id": body.conn_id, "column": body.column}


@router.delete("/pii-suppressions")
def remove_pii_suppression(body: PIISuppressionRequest, admin: dict = Depends(get_admin_user)):
    """Remove a column from the PII suppression registry."""
    remove_suppressed_column(body.conn_id, body.column)
    return {"status": "removed", "conn_id": body.conn_id, "column": body.column}


# ── Phase F — Correction-pipeline promotion review ──────────────────────────
from pathlib import Path as _Path

from admin_ceremony import (
    AdminCeremony, CeremonyError, CeremonyState, RateLimitExceeded,
)


def _ceremony_root() -> _Path:
    root = _Path(__file__).resolve().parent.parent.parent / ".data" / "admin_ceremony"
    root.mkdir(parents=True, exist_ok=True)
    return root


class _AckBody(BaseModel):
    reason: Optional[str] = None


@router.get("/promotions/pending")
def list_pending_promotions(admin: dict = Depends(get_admin_user)):
    c = AdminCeremony(root=_ceremony_root())
    items = []
    for rec in c.list_pending():
        items.append({
            "candidate_id": rec.candidate_id,
            "question": rec.question,
            "proposed_sql": rec.proposed_sql,
            "state": rec.state.value,
            "first_admin": rec.first_admin,
            "first_ack_at": rec.first_ack_at,
        })
    return {"items": items, "count": len(items)}


@router.post("/promotions/{candidate_id}/approve")
def approve_promotion(candidate_id: str, body: _AckBody,
                      admin: dict = Depends(get_admin_user)):
    c = AdminCeremony(root=_ceremony_root())
    try:
        rec = c.ack(candidate_id=candidate_id,
                    admin_email=admin["email"], approve=True)
    except RateLimitExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    except CeremonyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "candidate_id": rec.candidate_id,
        "state": rec.state.value,
        "first_admin": rec.first_admin,
        "second_admin": rec.second_admin,
    }


@router.post("/promotions/{candidate_id}/reject")
def reject_promotion(candidate_id: str, body: _AckBody,
                     admin: dict = Depends(get_admin_user)):
    c = AdminCeremony(root=_ceremony_root())
    try:
        rec = c.ack(candidate_id=candidate_id,
                    admin_email=admin["email"], approve=False,
                    reason=body.reason)
    except CeremonyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "candidate_id": rec.candidate_id,
        "state": rec.state.value,
        "reject_reason": rec.reject_reason,
    }


# ── Phase H — H23 Support-agent impersonation ceremony ──────────────
from datetime import timedelta
from fastapi import Request
from pydantic import Field
from audit_trail import log_agent_event


class ImpersonateRequest(BaseModel):
    target: str
    justification: str = Field(..., min_length=10, description="Ticket / reason; >=10 chars.")


def _impersonate_core(*, actor_email: str, target_email: str, justification: str) -> dict:
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=settings.SUPPORT_IMPERSONATION_TTL_SECONDS
    )
    log_agent_event(
        email=target_email,
        chat_id="impersonate",
        event="support_impersonate",
        actor_type="support",
        details={
            "actor_email": actor_email,
            "justification": justification,
            "expires_at": expires_at.isoformat(),
        },
    )
    return {
        "granted": True,
        "expires_at": expires_at.isoformat(),
        "actor_type": "support",
    }


@router.post("/impersonate")
def impersonate(body: ImpersonateRequest, request: Request):
    """H23 — support-agent impersonation with justification + TTL + audit."""
    user = getattr(request.state, "user", {}) or {}
    if "impersonate" not in (user.get("scope") or []):
        raise HTTPException(status_code=403, detail="missing impersonate scope")
    return _impersonate_core(
        actor_email=user.get("email", ""),
        target_email=body.target,
        justification=body.justification,
    )
