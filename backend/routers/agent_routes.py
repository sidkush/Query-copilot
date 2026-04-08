"""
Agent SSE streaming endpoints.

POST /api/v1/agent/run   — Start agent loop, stream AgentStep events via SSE
POST /api/v1/agent/respond — Send user response to a waiting agent
"""

import asyncio
import json
import logging
import secrets
import threading
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
import pydantic
from pydantic import BaseModel

from auth import get_current_user
from agent_engine import AgentEngine, SessionMemory, AgentStep
from schema_intelligence import SchemaIntelligence
from waterfall_router import build_default_router
from provider_registry import get_provider_for_user

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

# P0 fix: module-level singleton — avoids creating new ChromaDB clients per request
_waterfall_router = build_default_router()

# ── Session Storage (LRU, max 100) ──────────────────────────────

_sessions: dict[str, SessionMemory] = {}
_sessions_lock = threading.Lock()  # Guards all _sessions dict mutations
_MAX_SESSIONS = 100


def _get_or_create_session(chat_id: str, owner_email: str) -> SessionMemory:
    """Get existing session or create new one. Evicts oldest if at capacity.
    Validates ownership on existing sessions. Thread-safe via _sessions_lock."""
    with _sessions_lock:
        if chat_id in _sessions:
            session = _sessions[chat_id]
            if session.owner_email and session.owner_email != owner_email:
                raise ValueError("Session belongs to a different user")
            session.last_used = time.monotonic()
            return session

        # Evict oldest idle session if at capacity (skip sessions with active agent runs)
        if len(_sessions) >= _MAX_SESSIONS:
            # Snapshot keys to avoid dict-changed-during-iteration
            idle = [(k, v.last_used) for k, v in _sessions.items() if not v._running]
            if idle:
                oldest_id = min(idle, key=lambda x: x[1])[0]
                del _sessions[oldest_id]
                _logger.debug("Evicted session %s (LRU)", oldest_id)
            else:
                # All sessions are running — refuse to create unbounded sessions
                raise ValueError("Server at capacity — all agent sessions are active. Try again shortly.")

        session = SessionMemory(chat_id, owner_email=owner_email)
        _sessions[chat_id] = session
        return session


# ── Request Models ───────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    question: str
    conn_id: Optional[str] = None
    chat_id: Optional[str] = None
    auto_execute: bool = True
    persona: Optional[str] = None  # explorer, auditor, storyteller
    permission_mode: Optional[str] = "supervised"  # "supervised" or "autonomous"

    @pydantic.field_validator("question")
    @classmethod
    def cap_question_length(cls, v: str) -> str:
        return v[:2000] if len(v) > 2000 else v


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
    if not req.question.strip():
        raise HTTPException(400, "Question cannot be empty")
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

    # Session — use cryptographic nonce if generating new chat_id
    chat_id = req.chat_id or f"agent_{email}_{int(time.time())}_{secrets.token_hex(8)}"
    try:
        memory = _get_or_create_session(chat_id, owner_email=email)
    except ValueError as e:
        msg = str(e)
        if "capacity" in msg:
            raise HTTPException(503, msg)
        raise HTTPException(403, "Session belongs to a different user")

    # Use module-level singleton router (P0 fix: avoids per-request ChromaDB client creation)
    waterfall_router = _waterfall_router

    # Create agent — respect user's auto_execute and permission preferences
    perm_mode = req.permission_mode if req.permission_mode in ("supervised", "autonomous") else "supervised"
    provider = get_provider_for_user(email)
    # Ensure SessionMemory has provider for auto-compaction (P1 adversarial fix)
    if memory.provider is None:
        memory.provider = provider
    engine = AgentEngine(
        engine=entry.engine,
        email=email,
        connection_entry=entry,
        provider=provider,
        memory=memory,
        auto_execute=req.auto_execute,
        permission_mode=perm_mode,
        waterfall_router=waterfall_router,
    )
    # Set persona if provided
    if req.persona:
        engine._persona = req.persona

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
                try:
                    step = await asyncio.wait_for(queue.get(), timeout=30)
                except asyncio.TimeoutError:
                    # Send SSE keep-alive comment to prevent proxy/browser timeout
                    yield ": heartbeat\n\n"
                    continue

                if step is None:
                    # Send final result
                    result_data = engine._result.to_dict()
                    result_data["chat_id"] = chat_id
                    yield f"data: {json.dumps(result_data, default=str)}\n\n"
                    break

                step_data = step.to_dict() if isinstance(step, AgentStep) else step
                step_data["chat_id"] = chat_id
                # Dual-response logging (Task 1.6)
                _step_type = step_data.get("type", "") if isinstance(step_data, dict) else ""
                if _step_type == "cached_result":
                    _logger.info("Dual-response: cached result emitted (age=%.1fs)",
                                step_data.get("cache_age_seconds", 0) or 0)
                elif _step_type == "live_correction":
                    _logger.info("Dual-response: live correction emitted (diff=%s)",
                                step_data.get("diff_summary", ""))
                yield f"data: {json.dumps(step_data, default=str)}\n\n"

        except asyncio.CancelledError:
            _logger.debug("Agent SSE cancelled for %s", chat_id)
            # Guard _cancelled write with lock to prevent killing a new run
            if memory:
                with memory._lock:
                    if memory._running:
                        memory._cancelled = True
        except Exception as e:
            _logger.exception("Agent SSE error")
            # Guard _cancelled write with lock to prevent killing a new run
            if memory:
                with memory._lock:
                    if memory._running:
                        memory._cancelled = True
            safe_msg = str(e)[:200]  # Don't leak internal details via SSE
            yield f"data: {json.dumps({'type': 'error', 'content': safe_msg}, default=str)}\n\n"

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
    email = user.get("email", "")
    with _sessions_lock:
        session = _sessions.get(req.chat_id)
    if not session:
        raise HTTPException(404, "No active agent session")

    if not req.response or not req.response.strip():
        raise HTTPException(400, "Response cannot be empty")

    # All state checks inside the lock to close TOCTOU window
    with session._lock:
        # Ownership check — prevent cross-user session injection
        if session.owner_email and session.owner_email != email:
            raise HTTPException(403, "Session belongs to a different user")

        # Reject responses when agent isn't waiting — prevents response pre-loading
        if not session._running:
            raise HTTPException(409, "No active agent run on this session")

        # Must be actively waiting for user input (not just running)
        if not session._waiting_for_user:
            raise HTTPException(409, "Agent is not waiting for a response")

        if session._user_response is not None:
            raise HTTPException(409, "A response has already been submitted")
        session._user_response = req.response[:2000]  # Cap length
    return {"status": "ok", "chat_id": req.chat_id}


@router.get("/intelligence/stats")
async def intelligence_stats(user: dict = Depends(get_current_user)):
    """Task M2: Returns tier hit rate metrics from audit trail for cache measurement."""
    from audit_trail import get_recent_decisions
    decisions = get_recent_decisions(limit=1000)
    total = len(decisions)
    if total == 0:
        return {"total_decisions": 0, "hit_rate": None, "message": "No data yet"}
    hits = [d for d in decisions if d.get("tier_hit") not in (None, "none", "live")]
    hit_rate = len(hits) / total
    by_tier = {}
    for d in decisions:
        tier = d.get("tier_hit", "none")
        by_tier[tier] = by_tier.get(tier, 0) + 1
    ages = sorted([d.get("cache_age_s", 0) for d in hits if d.get("cache_age_s")])
    return {
        "total_decisions": total,
        "hit_rate": round(hit_rate, 3),
        "hits_by_tier": by_tier,
        "cache_age_p50": ages[len(ages) // 2] if ages else None,
        "cache_age_p95": ages[int(len(ages) * 0.95)] if ages else None,
    }
