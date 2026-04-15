"""Voice Mode — WebSocket endpoint + ephemeral token mint.

The WebSocket endpoint (/ws/{chat_id}) handles the continuous voice
conversation loop. Only TEXT flows over the wire — browser handles
audio via Web Speech API or whisper.cpp WASM.

The HTTP endpoint POST /session mints short-lived ephemeral tokens
for the hybrid voice tier stack (whisper-local / deepgram / openai-
realtime) — Sub-project A Phase 3. Voice and text share the same
SessionMemory and chat_id.
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel

from auth import get_current_user
from config import settings
from voice_registry import (
    EphemeralToken,
    VoiceProviderError,
    is_valid_tier,
    mint_ephemeral_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/voice", tags=["voice"])


class VoiceSessionRequest(BaseModel):
    tier: str


class VoiceSessionResponse(BaseModel):
    tier: str
    token: str
    expiresAt: int


@router.post("/session", response_model=VoiceSessionResponse)
async def voice_session_mint(
    body: VoiceSessionRequest,
    user: dict = Depends(get_current_user),
) -> VoiceSessionResponse:
    """Mint a short-lived ephemeral token for the requested voice tier."""
    if not settings.VOICE_MODE_ENABLED:
        raise HTTPException(status_code=403, detail="Voice mode disabled")
    if not is_valid_tier(body.tier):
        raise HTTPException(status_code=400, detail=f"Unknown voice tier: {body.tier!r}")

    user_email = user.get("email") or user.get("sub")
    if not user_email:
        raise HTTPException(status_code=401, detail="No user email in token")

    try:
        token: EphemeralToken = mint_ephemeral_token(user_email, body.tier)
    except VoiceProviderError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return VoiceSessionResponse(
        tier=token.tier,
        token=token.token,
        expiresAt=token.expires_at,
    )

_active_connections: dict[str, int] = {}

VALID_MESSAGE_TYPES = {"transcript", "cancel", "voice_config"}


def parse_voice_message(msg: dict) -> Optional[dict]:
    """Parse and validate incoming voice WebSocket message."""
    msg_type = msg.get("type")
    if msg_type not in VALID_MESSAGE_TYPES:
        return None

    if msg_type == "transcript":
        return {
            "type": "transcript",
            "text": msg.get("text", "").strip(),
            "is_interim": msg.get("is_interim", False),
        }
    elif msg_type == "cancel":
        return {"type": "cancel"}
    elif msg_type == "voice_config":
        return {
            "type": "voice_config",
            "tts_provider": msg.get("tts_provider", "browser"),
            "stt_provider": msg.get("stt_provider", "browser"),
            "voice_id": msg.get("voice_id"),
        }
    return None


@router.websocket("/ws/{chat_id}")
async def voice_session(websocket: WebSocket, chat_id: str, token: str = Query(None)):
    """WebSocket endpoint for voice conversation."""
    if not settings.VOICE_MODE_ENABLED:
        await websocket.close(code=1008, reason="Voice mode disabled")
        return

    if not token:
        await websocket.close(code=1008, reason="Missing auth token")
        return

    # Validate JWT
    try:
        from auth import decode_token
        user = decode_token(token)
        user_email = user.get("sub") or user.get("email")
        if not user_email:
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # Connection limit
    current = _active_connections.get(user_email, 0)
    if current >= settings.VOICE_WS_MAX_CONNECTIONS_PER_USER:
        await websocket.close(code=1008, reason="Too many voice connections")
        return

    _active_connections[user_email] = current + 1
    await websocket.accept()
    logger.info(f"Voice session started: {chat_id} for {user_email}")

    try:
        await websocket.send_json({"type": "listening", "active": True})

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            parsed = parse_voice_message(msg)
            if not parsed:
                continue

            if parsed["type"] == "cancel":
                await websocket.send_json({"type": "listening", "active": True})
                continue

            if parsed["type"] == "voice_config":
                continue

            if parsed["type"] == "transcript" and parsed["is_interim"]:
                continue

            if parsed["type"] == "transcript" and parsed["text"]:
                question = parsed["text"]

                await websocket.send_json({
                    "type": "agent_step",
                    "step": {"type": "thinking", "content": "Processing your question...", "brief_thinking": "Processing..."},
                })

                # Voice-adapted response placeholder
                # Full agent integration requires app.state.connections access
                # which will be wired in the next iteration
                voice_text = f"I heard your question about: {question[:100]}. The voice agent pipeline is being connected."
                if len(voice_text) > settings.VOICE_RESPONSE_MAX_CHARS:
                    voice_text = voice_text[:settings.VOICE_RESPONSE_MAX_CHARS]

                await websocket.send_json({
                    "type": "voice_response",
                    "text": voice_text,
                    "speak": True,
                })

                await websocket.send_json({"type": "listening", "active": True})

    except WebSocketDisconnect:
        logger.info(f"Voice session ended: {chat_id}")
    except Exception as e:
        logger.error(f"Voice session error: {e}")
    finally:
        _active_connections[user_email] = max(_active_connections.get(user_email, 1) - 1, 0)
