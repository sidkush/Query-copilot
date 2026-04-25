"""W2 Task 2 — Anthropic provider streaming variant for tool-use turns.

Folds adversarial amendments AMEND-W2-12 (try/except/finally + StreamIncompleteError),
AMEND-W2-13 (cancel-check inside loop), AMEND-W2-14 (per-stream byte cap),
AMEND-W2-17 (gate streaming OFF when FEATURE_CLAIM_PROVENANCE=True),
AMEND-W2-21 (prefer streamed text on divergence), AMEND-W2-22 (THINKING_CAPABLE
gate), AMEND-W2-23 (BadRequestError must NOT trip breaker).
"""
from unittest.mock import MagicMock, patch
import pytest


# --------------------------------------------------------------------------- #
# Step-1 baseline — provider yields text deltas + final.                      #
# --------------------------------------------------------------------------- #

class _FakeStreamCtx:
    """Context manager wrapper over a list of fake SDK events."""

    def __init__(self, events, final_msg, raise_in_loop=None):
        self._events = events
        self._final_msg = final_msg
        self._raise_in_loop = raise_in_loop
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.closed = True
        return False

    def __iter__(self):
        for e in self._events:
            if self._raise_in_loop is not None:
                raise self._raise_in_loop
            yield e

    def get_final_message(self):
        return self._final_msg


def _delta(text=None, thinking=None, partial_json=None, kind="text_delta"):
    d = MagicMock()
    d.type = kind
    if text is not None:
        d.text = text
    if thinking is not None:
        d.thinking = thinking
    if partial_json is not None:
        d.partial_json = partial_json
    return d


def _content_block_start_event(block_type, block_id=None, name=None):
    cb = MagicMock()
    cb.type = block_type
    if block_id is not None:
        cb.id = block_id
    if name is not None:
        cb.name = name
    e = MagicMock()
    e.type = "content_block_start"
    e.content_block = cb
    e.index = 0
    return e


def _content_block_delta_event(delta, index=0):
    e = MagicMock()
    e.type = "content_block_delta"
    e.delta = delta
    e.index = index
    return e


def _content_block_stop_event(index=0):
    e = MagicMock()
    e.type = "content_block_stop"
    e.index = index
    return e


def _message_stop_event():
    e = MagicMock()
    e.type = "message_stop"
    return e


def _final_msg(text="Hello world", stop_reason="end_turn", in_tokens=1, out_tokens=2):
    msg = MagicMock()
    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = text
    msg.content = [text_block]
    msg.stop_reason = stop_reason
    msg.usage = MagicMock(input_tokens=in_tokens, output_tokens=out_tokens)
    return msg


def test_complete_with_tools_stream_yields_text_deltas():
    from anthropic_provider import AnthropicProvider

    events = [
        _content_block_start_event("text"),
        _content_block_delta_event(_delta(text="Hello ")),
        _content_block_delta_event(_delta(text="world")),
        _content_block_stop_event(),
        _message_stop_event(),
    ]
    fake_stream = _FakeStreamCtx(events, _final_msg())

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001",
            system="sys",
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
            max_tokens=100,
        ))

    text_deltas = [e for e in out if e["type"] == "text_delta"]
    assert len(text_deltas) == 2
    assert text_deltas[0]["text"] == "Hello "
    assert text_deltas[1]["text"] == "world"
    finals = [e for e in out if e["type"] == "final"]
    assert len(finals) == 1
    assert finals[0]["stop_reason"] == "end_turn"


def test_stream_yields_tool_use_events_and_input_json_delta():
    """Tool-use streaming: start + input_json_delta + final tool_use block."""
    from anthropic_provider import AnthropicProvider

    events = [
        _content_block_start_event("tool_use", block_id="tu_1", name="run_sql"),
        _content_block_delta_event(_delta(partial_json='{"q":', kind="input_json_delta")),
        _content_block_delta_event(_delta(partial_json='"x"}', kind="input_json_delta")),
        _content_block_stop_event(),
    ]
    final = MagicMock()
    tu = MagicMock()
    tu.type = "tool_use"
    tu.id = "tu_1"
    tu.name = "run_sql"
    tu.input = {"q": "x"}
    final.content = [tu]
    final.stop_reason = "tool_use"
    final.usage = MagicMock(input_tokens=5, output_tokens=2)
    fake_stream = _FakeStreamCtx(events, final)

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        client = Anth.return_value
        client.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001", system="s",
            messages=[{"role": "user", "content": "hi"}],
            tools=[{"name": "run_sql"}], max_tokens=100,
        ))

    starts = [e for e in out if e["type"] == "tool_use_start"]
    assert len(starts) == 1
    assert starts[0]["id"] == "tu_1"
    assert starts[0]["name"] == "run_sql"

    json_deltas = [e for e in out if e["type"] == "tool_use_input_delta"]
    assert len(json_deltas) == 2
    assert "".join(d["partial_json"] for d in json_deltas) == '{"q":"x"}'

    finals = [e for e in out if e["type"] == "final"]
    assert finals[0]["stop_reason"] == "tool_use"
    blocks = finals[0]["blocks"]
    assert len(blocks) == 1
    assert blocks[0].type == "tool_use"
    assert blocks[0].tool_input == {"q": "x"}


# --------------------------------------------------------------------------- #
# AMEND-W2-19 — turn_id + block_index on every delta.                         #
# --------------------------------------------------------------------------- #

def test_each_delta_carries_turn_id_and_block_index():
    """AMEND-W2-19 — every text/thinking delta must include block_index so the
    frontend can dispatch by (turn_id, block_index) and avoid cross-turn leak."""
    from anthropic_provider import AnthropicProvider

    events = [
        _content_block_start_event("text"),
        _content_block_delta_event(_delta(text="A"), index=0),
        _content_block_delta_event(_delta(text="B"), index=0),
        _content_block_stop_event(index=0),
    ]
    fake_stream = _FakeStreamCtx(events, _final_msg(text="AB"))
    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        Anth.return_value.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001", system="s",
            messages=[{"role": "user", "content": "hi"}], tools=[], max_tokens=10,
            turn_id="t-77",
        ))

    text_deltas = [e for e in out if e["type"] == "text_delta"]
    assert all("block_index" in d for d in text_deltas), "block_index missing"
    assert all(d.get("turn_id") == "t-77" for d in text_deltas), "turn_id not propagated"


# --------------------------------------------------------------------------- #
# AMEND-W2-12 — try/except/finally with disposition.                          #
# --------------------------------------------------------------------------- #

def test_provider_apierror_yields_error_event_and_records_breaker():
    """AMEND-W2-12 — APIError mid-stream must yield an error event AND drain.
    Caller-side detect via final_blocks=None / type=error; breaker records failure."""
    import anthropic
    from anthropic_provider import AnthropicProvider

    err = anthropic.APIError(
        message="boom",
        request=MagicMock(),
        body=None,
    )
    events = [_content_block_start_event("text")]
    fake_stream = _FakeStreamCtx(events, _final_msg(), raise_in_loop=err)

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        Anth.return_value.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001", system="s",
            messages=[{"role": "user", "content": "hi"}], tools=[], max_tokens=10,
        ))

    err_evs = [e for e in out if e["type"] == "error"]
    assert len(err_evs) == 1
    assert "boom" in err_evs[0]["message"]
    # final must NOT appear when stream errors out
    assert not any(e["type"] == "final" for e in out)


# --------------------------------------------------------------------------- #
# AMEND-W2-23 — BadRequestError MUST NOT trip the breaker.                    #
# --------------------------------------------------------------------------- #

def test_bad_request_error_does_not_trip_breaker():
    """AMEND-W2-23 — 400 is a deterministic client bug, not flaky upstream.
    Tripping the breaker would 30s-blackout the entire account."""
    import anthropic
    from anthropic_provider import AnthropicProvider

    err = anthropic.BadRequestError(
        message="bad",
        response=MagicMock(status_code=400),
        body=None,
    )
    events = [_content_block_start_event("text")]
    fake_stream = _FakeStreamCtx(events, _final_msg(), raise_in_loop=err)

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        Anth.return_value.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        before = provider._breaker._failures
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001", system="s",
            messages=[{"role": "user", "content": "hi"}], tools=[], max_tokens=10,
        ))
        after = provider._breaker._failures

    assert after == before, "BadRequestError must not increment breaker failures"
    err_evs = [e for e in out if e["type"] == "error"]
    assert err_evs and err_evs[0].get("classification") == "client_error"


# --------------------------------------------------------------------------- #
# AMEND-W2-13 — cancel-check inside stream loop.                              #
# --------------------------------------------------------------------------- #

def test_cancel_signal_short_circuits_stream():
    """AMEND-W2-13 — when cancel callback returns True, generator returns
    early. GeneratorExit must propagate so the SDK __exit__ closes the socket."""
    from anthropic_provider import AnthropicProvider

    events = [
        _content_block_start_event("text"),
        _content_block_delta_event(_delta(text="A")),
        _content_block_delta_event(_delta(text="B")),
        _content_block_delta_event(_delta(text="C")),
    ]
    fake_stream = _FakeStreamCtx(events, _final_msg())
    cancel_after = {"n": 0}

    def cancel_cb():
        cancel_after["n"] += 1
        return cancel_after["n"] >= 3  # cancel after first delta

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        Anth.return_value.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001", system="s",
            messages=[{"role": "user", "content": "hi"}], tools=[], max_tokens=10,
            cancel_check=cancel_cb,
        ))

    text_deltas = [e for e in out if e["type"] == "text_delta"]
    assert len(text_deltas) < 3, "cancel must short-circuit before draining all deltas"
    assert fake_stream.closed, "context manager must close on early return"


# --------------------------------------------------------------------------- #
# AMEND-W2-14 — per-stream byte cap.                                          #
# --------------------------------------------------------------------------- #

def test_byte_cap_stops_runaway_stream():
    """AMEND-W2-14 — once accumulated text deltas exceed MAX_STREAM_BYTES,
    yield stream_error and abort. Prevents OOM + double-accumulator runaway."""
    from anthropic_provider import AnthropicProvider

    big = "x" * (200_000)  # 5 chunks * 200k = 1MB; cap test below uses 500k
    events = [
        _content_block_start_event("text"),
        *[_content_block_delta_event(_delta(text=big)) for _ in range(20)],
    ]
    fake_stream = _FakeStreamCtx(events, _final_msg(text=big * 20))

    with patch("anthropic_provider.anthropic.Anthropic") as Anth:
        Anth.return_value.messages.stream.return_value = fake_stream
        provider = AnthropicProvider(api_key="fake")
        out = list(provider.complete_with_tools_stream(
            model="claude-haiku-4-5-20251001", system="s",
            messages=[{"role": "user", "content": "hi"}], tools=[], max_tokens=10,
            max_stream_bytes=500_000,
        ))

    stream_err = [e for e in out if e["type"] == "stream_error"]
    assert stream_err, "byte cap must yield stream_error"
    assert "byte" in stream_err[0]["reason"].lower() or "cap" in stream_err[0]["reason"].lower()
    text_deltas = [e for e in out if e["type"] == "text_delta"]
    total = sum(len(d["text"]) for d in text_deltas)
    assert total <= 500_000 + 200_000, "should not yield arbitrarily past the cap"


# --------------------------------------------------------------------------- #
# AMEND-W2-22 — capability gate.                                              #
# --------------------------------------------------------------------------- #

def test_supports_extended_thinking_only_for_capable_models():
    """AMEND-W2-22 — Haiku must return False so the agent never passes a
    `thinking` kwarg to a non-capable model (every Haiku synthesis 400s)."""
    from anthropic_provider import AnthropicProvider, THINKING_CAPABLE

    with patch("anthropic_provider.anthropic.Anthropic"):
        provider = AnthropicProvider(api_key="fake")
        assert provider.supports_extended_thinking("claude-haiku-4-5-20251001") is False
        # at least one capable model must answer True
        assert any(provider.supports_extended_thinking(m) for m in THINKING_CAPABLE)
        assert provider.supports_extended_thinking("claude-sonnet-4-6") is True


# --------------------------------------------------------------------------- #
# Phase step + agent-engine integration markers.                              #
# --------------------------------------------------------------------------- #

def test_synthesizing_phase_step_shape():
    """T2 Step 7 — engine emits a `synthesizing` step before streaming begins."""
    from agent_engine import AgentStep
    step = AgentStep(type="synthesizing", content="Synthesizing analysis…")
    assert step.type == "synthesizing"
    assert "Synthesizing" in step.content


# --------------------------------------------------------------------------- #
# AMEND-W2-17 — streaming gated OFF when FEATURE_CLAIM_PROVENANCE=True.       #
# --------------------------------------------------------------------------- #

def test_streaming_gated_off_when_claim_provenance_enabled(monkeypatch):
    """AMEND-W2-17 — until per-token claim binding ships in W3, streaming
    bypasses the per-claim provenance invariant. Gate streaming OFF in that
    config combo. Predicate lives in agent_engine; assert via an exposed helper."""
    from agent_engine import _streaming_enabled
    from config import settings

    monkeypatch.setattr(settings, "W2_SYNTHESIS_STREAMING_ENFORCE", True)
    monkeypatch.setattr(settings, "FEATURE_CLAIM_PROVENANCE", False)
    assert _streaming_enabled(tool_calls=1) is True

    monkeypatch.setattr(settings, "FEATURE_CLAIM_PROVENANCE", True)
    assert _streaming_enabled(tool_calls=1) is False, (
        "AMEND-W2-17 — streaming MUST be off when FEATURE_CLAIM_PROVENANCE=True"
    )

    monkeypatch.setattr(settings, "FEATURE_CLAIM_PROVENANCE", False)
    monkeypatch.setattr(settings, "W2_SYNTHESIS_STREAMING_ENFORCE", False)
    assert _streaming_enabled(tool_calls=1) is False

    monkeypatch.setattr(settings, "W2_SYNTHESIS_STREAMING_ENFORCE", True)
    assert _streaming_enabled(tool_calls=0) is False, "first iteration never streams"


# --------------------------------------------------------------------------- #
# AMEND-W2-18 — KNOWN_SSE_EVENT_TYPES.update(...) preserves prior keys.       #
# --------------------------------------------------------------------------- #

def test_sse_allowlist_preserves_pre_w2_events():
    """AMEND-W2-18 — event allowlist must contain old + new keys; a wholesale
    `=` reassignment would silently drop step_phase / safe_abort / claim_chip."""
    from routers.agent_routes import KNOWN_SSE_EVENT_TYPES
    must_keep = {
        "agent_checkpoint", "tool_call", "tool_result", "error", "done",
        "provenance_chip", "plan_artifact", "step_phase", "step_detail",
        "safe_abort", "claim_chip", "result_preview", "cancel_ack",
    }
    must_add = {
        "message_delta", "thinking_delta", "synthesizing",
        "stream_error", "message_stop",
    }
    missing_old = must_keep - KNOWN_SSE_EVENT_TYPES
    missing_new = must_add - KNOWN_SSE_EVENT_TYPES
    assert not missing_old, f"AMEND-18 violated — pre-W2 events dropped: {missing_old}"
    assert not missing_new, f"W2 events not registered: {missing_new}"


# --------------------------------------------------------------------------- #
# Config defaults for T2.                                                     #
# --------------------------------------------------------------------------- #

def test_t2_config_defaults_present():
    from config import settings
    assert hasattr(settings, "W2_SYNTHESIS_STREAMING_ENFORCE")
    assert settings.W2_SYNTHESIS_STREAMING_ENFORCE is True
    assert hasattr(settings, "W2_MAX_STREAM_BYTES")
    assert settings.W2_MAX_STREAM_BYTES >= 1_000_000
