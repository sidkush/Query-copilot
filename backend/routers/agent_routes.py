"""
Agent SSE streaming endpoints.

POST /api/v1/agent/run   — Start agent loop, stream AgentStep events via SSE
POST /api/v1/agent/respond — Send user response to a waiting agent
"""

import asyncio
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user
from agent_engine import AgentEngine, SessionMemory, AgentStep

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

# ── Session Storage (LRU, max 100) ──────────────────────────────

_sessions: dict[str, SessionMemory] = {}
_MAX_SESSIONS = 100


def _get_or_create_session(chat_id: str) -> SessionMemory:
    """Get existing session or create new one. Evicts oldest if at capacity."""
    if chat_id in _sessions:
        _sessions[chat_id].last_used = time.monotonic()
        return _sessions[chat_id]

    # Evict oldest if at capacity
    if len(_sessions) >= _MAX_SESSIONS:
        oldest_id = min(_sessions, key=lambda k: _sessions[k].last_used)
        del _sessions[oldest_id]
        _logger.debug("Evicted session %s (LRU)", oldest_id)

    session = SessionMemory(chat_id)
    _sessions[chat_id] = session
    return session


# ── Request Models ───────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    question: str
    conn_id: Optional[str] = None
    chat_id: Optional[str] = None


class AgentRespondRequest(BaseModel):
    chat_id: str
    response: str


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/run")
async def agent_run(req: AgentRunRequest, request: Request,
                    user: dict = Depends(get_current_user)):
    """Start an agent run, streaming AgentStep events via SSE."""
    from main import app

    email = user.get("email", "")
    connections = app.state.connections.get(email, {})
    if not connections:
        raise HTTPException(400, "No active database connections")

    # Resolve connection
    if req.conn_id:
        entry = connections.get(req.conn_id)
        if not entry:
            raise HTTPException(404, f"Connection '{req.conn_id}' not found")
    else:
        entry = next(iter(connections.values()))

    # Session
    chat_id = req.chat_id or f"agent_{email}_{int(time.time())}"
    memory = _get_or_create_session(chat_id)

    # Create agent
    engine = AgentEngine(
        engine=entry.engine,
        email=email,
        connection_entry=entry,
        memory=memory,
        auto_execute=True,
    )

    async def event_generator():
        """Yield SSE events from the agent loop."""
        try:
            # Run the blocking agent loop in a thread
            steps = []

            def _run_agent():
                for step in engine.run(req.question):
                    steps.append(step)

            # We need to yield steps as they arrive, so use a queue
            queue: asyncio.Queue = asyncio.Queue()
            done_event = asyncio.Event()

            def _run_agent_with_queue():
                try:
                    for step in engine.run(req.question):
                        asyncio.run_coroutine_threadsafe(
                            queue.put(step), loop
                        )
                except Exception as e:
                    err = AgentStep(type="error", content=str(e))
                    asyncio.run_coroutine_threadsafe(
                        queue.put(err), loop
                    )
                finally:
                    asyncio.run_coroutine_threadsafe(
                        queue.put(None), loop  # Sentinel
                    )

            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, _run_agent_with_queue)

            while True:
                step = await queue.get()
                if step is None:
                    # Send final result
                    result_data = engine._result.to_dict()
                    result_data["chat_id"] = chat_id
                    yield f"data: {json.dumps(result_data)}\n\n"
                    break

                step_data = step.to_dict() if isinstance(step, AgentStep) else step
                step_data["chat_id"] = chat_id
                yield f"data: {json.dumps(step_data)}\n\n"

                # If agent is waiting for user input, pause stream
                if step.type == "ask_user":
                    # Wait for user response via /respond endpoint
                    while memory._user_response is None:
                        await asyncio.sleep(0.5)
                        if await request.is_disconnected():
                            return
                    # Feed response back and continue
                    user_resp = memory._user_response
                    memory._user_response = None
                    engine._waiting_for_user = False
                    memory.add_turn("user", user_resp)

        except asyncio.CancelledError:
            _logger.debug("Agent SSE cancelled for %s", chat_id)
        except Exception as e:
            _logger.exception("Agent SSE error")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/respond")
async def agent_respond(req: AgentRespondRequest,
                        user: dict = Depends(get_current_user)):
    """Send a user response to a waiting agent."""
    session = _sessions.get(req.chat_id)
    if not session:
        raise HTTPException(404, f"No active session for chat_id '{req.chat_id}'")

    session._user_response = req.response
    return {"status": "ok", "chat_id": req.chat_id}
