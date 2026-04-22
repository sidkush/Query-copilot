"""Chat history API routes."""

import json
import re
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from typing import Optional

from auth import get_current_user
from user_storage import create_chat, list_chats, load_chat, append_message, delete_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chats", tags=["chats"])

_MAX_TITLE_LENGTH = 500
_MAX_CONTENT_LENGTH = 10000


def _sanitize(text: str) -> str:
    """Strip HTML tags from text to prevent stored XSS."""
    return re.sub(r"<[^>]*>", "", text).strip()


class CreateChatRequest(BaseModel):
    title: str
    conn_id: Optional[str] = None
    db_type: Optional[str] = None
    database_name: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        v = re.sub(r"<[^>]*>", "", v).strip()
        if not v:
            raise ValueError("Title must not be empty")
        if len(v) > _MAX_TITLE_LENGTH:
            v = v[:_MAX_TITLE_LENGTH]
        return v


_VALID_MSG_TYPES = {
    "user", "assistant", "sql_preview", "result", "error", "system",
    "chart", "dashboard", "dashboard_chips",
    "agent_steps", "agent_ask",
}
_ALLOWED_MSG_FIELDS = {
    "type", "content", "question", "sql", "rawSQL", "model", "latency",
    "connId", "dbLabel", "summary", "columns", "rows", "rowCount",
    "chartType", "chartConfig", "chartSuggestion", "timestamp",
    "dashboardId", "tileId", "error",
    # Agent stream persistence
    "steps", "status", "startTime", "chatId", "waiting", "waitingOptions",
    "options", "phase",
    # Turbo Mode flags on assistant messages
    "turboInstant", "turboVerified", "turboUpdated", "cacheAge",
}
_MAX_FIELD_SIZE = 50000  # 50KB cap per string field
_MAX_ROWS = 500  # Cap stored rows
_MAX_STEPS = 120  # Cap steps per agent_steps message
_ALLOWED_STEP_FIELDS = {
    "type", "content", "tool_name", "tool_input", "tool_result",
    "tool_use_id", "tier", "tier_name", "cache_age_seconds",
    "diff_summary", "metadata", "elapsed_ms", "estimated_total_ms",
    "sub_query_index", "total_sub_queries", "brief_thinking",
    "chart_suggestion", "chat_id", "timestamp",
}


def _validate_message(msg: dict) -> dict:
    """Sanitize and validate an incoming chat message dict.

    The frontend sends messages with varying shapes depending on type:
      - user:        {type, content}
      - sql_preview: {type, question, sql, rawSQL, model, latency, connId, dbLabel}
      - result:      {type, question, sql, summary, columns, rows, rowCount, latency, ...}
      - error:       {type, content}
      - system:      {type, content}

    We store validated fields only — unknown keys are stripped.
    """
    if not isinstance(msg, dict) or "type" not in msg:
        raise ValueError("Message must have a 'type' field")
    # Validate type is a known string
    if not isinstance(msg["type"], str) or msg["type"] not in _VALID_MSG_TYPES:
        raise ValueError(f"Invalid message type: {msg.get('type')}")
    # Strip unknown fields
    cleaned = {k: v for k, v in msg.items() if k in _ALLOWED_MSG_FIELDS}
    # Cap string fields
    for key in ("content", "sql", "rawSQL", "summary", "question"):
        if key in cleaned and isinstance(cleaned[key], str) and len(cleaned[key]) > _MAX_FIELD_SIZE:
            cleaned[key] = cleaned[key][:_MAX_FIELD_SIZE]
    # Sanitize content for XSS
    if "content" in cleaned and isinstance(cleaned["content"], str):
        cleaned["content"] = _sanitize(cleaned["content"])
    # Cap rows to prevent storage exhaustion
    if "rows" in cleaned and isinstance(cleaned["rows"], list):
        cleaned["rows"] = cleaned["rows"][:_MAX_ROWS]
    # Sanitize + cap nested agent step records so replayed history is safe.
    if "steps" in cleaned and isinstance(cleaned["steps"], list):
        cleaned["steps"] = [
            _sanitize_step(s) for s in cleaned["steps"][:_MAX_STEPS] if isinstance(s, dict)
        ]
    # Agent-ask option list: strings only, cap length + count.
    for opt_field in ("options", "waitingOptions"):
        if opt_field in cleaned and isinstance(cleaned[opt_field], list):
            cleaned[opt_field] = [
                _sanitize(o)[:500] for o in cleaned[opt_field][:20] if isinstance(o, str)
            ]
    return cleaned


def _sanitize_step(step: dict) -> dict:
    """Strip unknown keys from a nested agent step, XSS-sanitize text."""
    out = {k: v for k, v in step.items() if k in _ALLOWED_STEP_FIELDS}
    for key in ("content", "tool_name", "brief_thinking", "diff_summary", "tier", "tier_name"):
        if key in out and isinstance(out[key], str):
            out[key] = _sanitize(out[key])[:_MAX_FIELD_SIZE]
    # tool_result / tool_input can be arbitrary JSON — cap size by serializing.
    for key in ("tool_result", "tool_input"):
        if key in out:
            try:
                as_str = out[key] if isinstance(out[key], str) else json.dumps(out[key])
            except (TypeError, ValueError):
                as_str = str(out[key])
            if len(as_str) > _MAX_FIELD_SIZE:
                out[key] = as_str[:_MAX_FIELD_SIZE]
    return out


@router.get("/")
def list_user_chats(user: dict = Depends(get_current_user)):
    """List all chats for the current user."""
    email = user["email"]
    chats = list_chats(email)
    return {"chats": chats}


@router.post("/")
def create_new_chat(body: CreateChatRequest, user: dict = Depends(get_current_user)):
    """Create a new chat conversation."""
    email = user["email"]
    chat = create_chat(
        email=email,
        title=body.title,
        conn_id=body.conn_id,
        db_type=body.db_type,
        database_name=body.database_name,
    )
    return chat


@router.get("/{chat_id}")
def get_chat(chat_id: str, user: dict = Depends(get_current_user)):
    """Load a full chat with messages."""
    email = user["email"]
    chat = load_chat(email, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found")
    return chat


@router.put("/{chat_id}/messages")
async def add_message(chat_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Append a message to a chat and update updated_at.

    Accepts raw JSON body to preserve all frontend message fields
    (type, content, sql, summary, columns, rows, etc.) without Pydantic filtering.
    """
    email = user["email"]
    # Verify chat exists
    chat = load_chat(email, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found")
    try:
        body = await request.json()
        message = _validate_message(body)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        append_message(email, chat_id, message)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found")
    return {"status": "ok", "chat_id": chat_id}


@router.delete("/{chat_id}")
def remove_chat(chat_id: str, user: dict = Depends(get_current_user)):
    """Delete a chat conversation."""
    email = user["email"]
    chat = load_chat(email, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=f"Chat '{chat_id}' not found")
    delete_chat(email, chat_id)
    return {"status": "deleted", "chat_id": chat_id}
