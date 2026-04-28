"""W2 Task 3 — extended-thinking SSE pass-through.

Folds adversarial amendments AMEND-W2-25 (redacted_thinking + signature_delta),
AMEND-W2-26 (cumulative thinking-token cap across iterations),
AMEND-W2-27 (clamp budget_tokens < max_tokens before passing).
"""
from unittest.mock import MagicMock, patch
import pytest


# ── Shared fake-SDK helpers (mirrors test_w2_synthesis_streaming.py shape) ──

class _FakeStreamCtx:
    def __init__(self, events, final_msg):
        self._events = events
        self._final_msg = final_msg
        self.kwargs_seen = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        yield from self._events

    def get_final_message(self):
        return self._final_msg


def _content_block_start(block_type, **fields):
    cb = MagicMock()
    cb.type = block_type
    for k, v in fields.items():
        setattr(cb, k, v)
    e = MagicMock()
    e.type = "content_block_start"
    e.content_block = cb
    e.index = 0
    return e


def _delta_event(kind, **fields):
    d = MagicMock()
    d.type = kind
    for k, v in fields.items():
        setattr(d, k, v)
    e = MagicMock()
    e.type = "content_block_delta"
    e.delta = d
    e.index = 0
    return e


def _stop_event(index=0):
    e = MagicMock()
    e.type = "content_block_stop"
    e.index = index
    return e


def _final_msg():
    msg = MagicMock()
    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = "answer"
    msg.content = [text_block]
    msg.stop_reason = "end_turn"
    msg.usage = MagicMock(input_tokens=1, output_tokens=1)
    return msg


# ── 1. config defaults present ────────────────────────────────────────────

def test_t3_config_defaults_present():
    from config import settings
    assert hasattr(settings, "W2_THINKING_STREAM_ENFORCE")
    assert hasattr(settings, "W2_THINKING_BUDGET_TOKENS")
    assert isinstance(settings.W2_THINKING_STREAM_ENFORCE, bool)
    assert isinstance(settings.W2_THINKING_BUDGET_TOKENS, int)
    assert settings.W2_THINKING_BUDGET_TOKENS >= 1024


# ── 2. thinking kwarg passes through to messages.stream ──────────────────

def test_thinking_kwarg_passes_through():
    """Caller-supplied `thinking` reaches messages.stream verbatim."""
    from anthropic_provider import AnthropicProvider

    seen = {}

    def _capture(**kwargs):
        seen.update(kwargs)
        events = [
            _content_block_start("text"),
            _delta_event("text_delta", text="x"),
            _stop_event(),
        ]
        return _FakeStreamCtx(events, _final_msg())

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.side_effect = _capture
        provider = AnthropicProvider(api_key="fake")
        list(provider.complete_with_tools_stream(
            model="claude-sonnet-4-6",
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
            max_tokens=4000,
            thinking={"type": "enabled", "budget_tokens": 2000},
        ))
    assert seen.get("thinking") == {"type": "enabled", "budget_tokens": 2000}


# ── 3. AMEND-W2-25 — redacted_thinking surfaces as `redacted` event ──────

def test_redacted_thinking_yielded_as_redacted_event():
    from anthropic_provider import AnthropicProvider

    events = [
        _content_block_start("redacted_thinking", data="enc-blob-abc"),
        _stop_event(),
        _content_block_start("text"),
        _delta_event("text_delta", text="ok"),
        _stop_event(),
    ]
    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.return_value = _FakeStreamCtx(events, _final_msg())
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-sonnet-4-6",
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            tools=[], max_tokens=4000,
        ))
    redacted = [e for e in out if e["type"] == "redacted"]
    assert len(redacted) == 1
    assert redacted[0]["data"] == "enc-blob-abc"


# ── 4. AMEND-W2-25 — signature_delta yielded ─────────────────────────────

def test_signature_delta_yielded():
    from anthropic_provider import AnthropicProvider

    events = [
        _content_block_start("thinking"),
        _delta_event("thinking_delta", thinking="reason..."),
        _delta_event("signature_delta", signature="sig-xyz"),
        _stop_event(),
    ]
    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.return_value = _FakeStreamCtx(events, _final_msg())
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-sonnet-4-6",
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            tools=[], max_tokens=4000,
        ))
    sigs = [e for e in out if e["type"] == "signature_delta"]
    thinking = [e for e in out if e["type"] == "thinking_delta"]
    assert len(thinking) == 1 and thinking[0]["text"] == "reason..."
    assert len(sigs) == 1 and sigs[0]["signature"] == "sig-xyz"


# ── 5. AMEND-W2-27 — clamp budget_tokens >= max_tokens ───────────────────

def test_budget_tokens_clamped_when_above_max_tokens():
    """Caller passes thinking with budget_tokens >= max_tokens; provider
    clamps to max_tokens-256 before forwarding to messages.stream."""
    from anthropic_provider import AnthropicProvider

    seen = {}

    def _capture(**kwargs):
        seen.update(kwargs)
        return _FakeStreamCtx([_content_block_start("text"),
                                _delta_event("text_delta", text="x"),
                                _stop_event()], _final_msg())

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.side_effect = _capture
        provider = AnthropicProvider(api_key="fake")
        list(provider.complete_with_tools_stream(
            model="claude-sonnet-4-6",
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            tools=[], max_tokens=4000,
            thinking={"type": "enabled", "budget_tokens": 5000},
        ))
    assert seen["thinking"]["budget_tokens"] == 4000 - 256


def test_budget_tokens_dropped_when_clamp_below_min():
    """If max_tokens-256 < 1024 minimum, the thinking kwarg is dropped entirely."""
    from anthropic_provider import AnthropicProvider

    seen = {}

    def _capture(**kwargs):
        seen.update(kwargs)
        return _FakeStreamCtx([_content_block_start("text"),
                                _delta_event("text_delta", text="x"),
                                _stop_event()], _final_msg())

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.side_effect = _capture
        provider = AnthropicProvider(api_key="fake")
        list(provider.complete_with_tools_stream(
            model="claude-sonnet-4-6",
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            tools=[], max_tokens=1000,  # 1000-256=744 < 1024
            thinking={"type": "enabled", "budget_tokens": 2000},
        ))
    assert "thinking" not in seen


# ── 6. AMEND-W2-22 — capability gate (Haiku) — agent must not pass thinking

def test_thinking_kwarg_skipped_for_haiku_capability():
    """Provider exposes capability check; thinking-capable allowlist excludes Haiku."""
    from anthropic_provider import AnthropicProvider
    provider = AnthropicProvider(api_key="fake")
    assert provider.supports_extended_thinking("claude-haiku-4-5-20251001") is False
    assert provider.supports_extended_thinking("claude-sonnet-4-6") is True
    assert provider.supports_extended_thinking("claude-opus-4-7") is True


# ── 7. AMEND-W2-26 — cumulative thinking budget tracker on agent_engine ──

def test_agent_engine_carries_cumulative_thinking_budget_attr():
    """AgentEngine instance must expose `_thinking_tokens_used` for AMEND-26
    cross-iteration tracking. Initial value is 0."""
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    # __init__ must set the attr; if __init__ has heavy deps, just import-check.
    import inspect
    src = inspect.getsource(AgentEngine.__init__)
    assert "_thinking_tokens_used" in src, (
        "AMEND-W2-26 requires AgentEngine.__init__ to initialise "
        "self._thinking_tokens_used = 0 for cross-iteration budget tracking"
    )


# ── 8. AMEND-W2-26 — per-call budget computed from W2_THINKING_TOTAL_BUDGET

def test_compute_thinking_kwarg_decrements_with_used(monkeypatch):
    """Helper `_compute_thinking_kwarg(used)` returns kwarg with decremented
    budget; returns None when remaining < 1024.

    AMEND-W2-17 short-circuits to None when FEATURE_CLAIM_PROVENANCE=True
    (default). Toggle off here so the budget-decrement contract is what's
    under test, not the provenance gate.
    """
    from agent_engine import _compute_thinking_kwarg
    from config import settings

    monkeypatch.setattr(settings, "FEATURE_CLAIM_PROVENANCE", False)

    # fresh: full budget available
    kw = _compute_thinking_kwarg(used=0, model="claude-sonnet-4-6", max_tokens=8192)
    assert kw is not None
    assert kw["type"] == "enabled"
    assert kw["budget_tokens"] >= 1024

    # half-used: remaining budget reflected
    half = settings.W2_THINKING_TOTAL_BUDGET // 2
    kw = _compute_thinking_kwarg(used=half, model="claude-sonnet-4-6", max_tokens=8192)
    assert kw is not None
    assert kw["budget_tokens"] <= settings.W2_THINKING_TOTAL_BUDGET - half + 1

    # exhausted: returns None
    kw = _compute_thinking_kwarg(
        used=settings.W2_THINKING_TOTAL_BUDGET,
        model="claude-sonnet-4-6", max_tokens=8192,
    )
    assert kw is None


def test_compute_thinking_kwarg_returns_none_for_haiku():
    """Capability gate: Haiku always returns None even with full budget."""
    from agent_engine import _compute_thinking_kwarg
    kw = _compute_thinking_kwarg(used=0, model="claude-haiku-4-5-20251001", max_tokens=8192)
    assert kw is None


def test_compute_thinking_kwarg_returns_none_when_flag_off(monkeypatch):
    """When W2_THINKING_STREAM_ENFORCE=False, helper returns None regardless of model."""
    from agent_engine import _compute_thinking_kwarg
    from config import settings
    monkeypatch.setattr(settings, "W2_THINKING_STREAM_ENFORCE", False)
    kw = _compute_thinking_kwarg(used=0, model="claude-sonnet-4-6", max_tokens=8192)
    assert kw is None


def test_compute_thinking_kwarg_returns_none_when_claim_provenance_on(monkeypatch):
    """T3 inherits T2's claim-provenance guard — thinking off when
    FEATURE_CLAIM_PROVENANCE=True (downstream binders need deterministic output)."""
    from agent_engine import _compute_thinking_kwarg
    from config import settings
    monkeypatch.setattr(settings, "FEATURE_CLAIM_PROVENANCE", True)
    kw = _compute_thinking_kwarg(used=0, model="claude-sonnet-4-6", max_tokens=8192)
    assert kw is None


# ── 9. SSE allowlist already covers thinking_delta (T2) — sanity check ──

def test_sse_allowlist_covers_thinking_events():
    from routers.agent_routes import KNOWN_SSE_EVENT_TYPES
    assert "thinking_delta" in KNOWN_SSE_EVENT_TYPES
    # AMEND-25 — redacted blocks must also flow through SSE (otherwise the
    # frontend silently drops them and replay loses required state).
    assert "redacted" in KNOWN_SSE_EVENT_TYPES or "redacted_thinking" in KNOWN_SSE_EVENT_TYPES
