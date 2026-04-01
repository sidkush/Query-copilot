"""Chat history API routes."""

import re
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from typing import Optional

from auth import get_current_user
from user_storage import create_chat, list_chats, load_chat, append_message, delete_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chats", tags=["chats"])

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


def _validate_message(msg: dict) -> dict:
    """Sanitize and validate an incoming chat message dict.

    The frontend sends messages with varying shapes depending on type:
      - user:        {type, content}
      - sql_preview: {type, question, sql, rawSQL, model, latency, connId, dbLabel}
      - result:      {type, question, sql, summary, columns, rows, rowCount, latency, ...}
      - error:       {type, content}
      - system:      {type, content}

    We store the full dict as-is so chat history loads back correctly.
    """
    if not isinstance(msg, dict) or "type" not in msg:
        raise ValueError("Message must have a 'type' field")
    # Truncate content if present
    if "content" in msg and isinstance(msg["content"], str) and len(msg["content"]) > _MAX_CONTENT_LENGTH:
        msg["content"] = msg["content"][:_MAX_CONTENT_LENGTH]
    return msg


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
