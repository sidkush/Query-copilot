"""
Anthropic provider adapter for AskDB.

Wraps the `anthropic.Anthropic` SDK behind the `ModelProvider` interface.
This is the ONLY file that should import `anthropic` — all other modules
use the provider-agnostic `ModelProvider` ABC.

Preserves Anthropic-specific features:
  - Ephemeral prompt caching (cache_control blocks on system prompts)
  - Native tool-use content blocks → ContentBlock translation
  - Token-level streaming via messages.stream()
  - Circuit breaker (3 failures → 30s cooldown)
"""

import json as _json
import logging
import threading
import time
from datetime import datetime as _dt, timezone as _tz
from pathlib import Path as _Path
from typing import Iterator, Optional

import anthropic

# Plan 4 T5: cache stats emission path. Best-effort append-only; never
# raised into caller.
_CACHE_STATS_PATH = _Path(".data/audit/cache_stats.jsonl")


def _emit_cache_stats(model: str, usage) -> None:
    try:
        _CACHE_STATS_PATH.parent.mkdir(parents=True, exist_ok=True)
        rec = {
            "ts": _dt.now(_tz.utc).isoformat(),
            "model": model,
            "input_tokens": getattr(usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(usage, "output_tokens", 0) or 0,
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        }
        with _CACHE_STATS_PATH.open("a", encoding="utf-8") as f:
            f.write(_json.dumps(rec) + "\n")
    except Exception:
        pass

from model_provider import (
    ModelProvider,
    ProviderResponse,
    ContentBlock,
    ProviderToolResponse,
    InvalidKeyError,
)

logger = logging.getLogger(__name__)


# AMEND-W2-22 — capability gate. Models that accept the `thinking` kwarg
# without 400-ing. Anthropic adds capability per model family; this set
# is checked via `provider.supports_extended_thinking(model)` before the
# agent passes a thinking parameter into messages.create / messages.stream.
THINKING_CAPABLE: frozenset = frozenset({
    "claude-sonnet-4-5-20250514",
    "claude-sonnet-4-6",
    "claude-opus-4-7-1m-20260115",
    "claude-opus-4-7",
})


class _CircuitBreaker:
    """Simple circuit breaker: after N consecutive failures, block calls for cooldown_sec + jitter."""

    def __init__(self, threshold: int = 5, cooldown_sec: int = 30, jitter_sec: int = 30):
        self.threshold = threshold
        self.cooldown_sec = cooldown_sec
        self.jitter_sec = jitter_sec
        self._failures = 0
        self._open_since: Optional[float] = None
        self._cooldown_actual: float = cooldown_sec
        self._lock = threading.Lock()

    def record_success(self):
        with self._lock:
            self._failures = 0
            self._open_since = None

    def record_failure(self):
        import random
        with self._lock:
            self._failures += 1
            if self._failures >= self.threshold:
                # Add random jitter to prevent thundering herd on recovery
                self._cooldown_actual = self.cooldown_sec + random.uniform(0, self.jitter_sec)
                self._open_since = time.time()
                logger.warning(
                    "Circuit breaker OPEN after %d consecutive API failures (cooldown %.0fs)",
                    self._failures, self._cooldown_actual,
                )

    def is_open(self) -> bool:
        with self._lock:
            if self._open_since is None:
                return False
            elapsed = time.time() - self._open_since
            if elapsed >= self._cooldown_actual:
                self._open_since = None
                self._failures = 0
                logger.info("Circuit breaker half-open — allowing retry")
                return False
            return True

    @property
    def status(self) -> str:
        if self._open_since is None:
            return "closed" if self._failures == 0 else "degraded"
        return "open"


# Per-API-key circuit breakers — prevents one user's failures from
# blocking all users. Keyed by the first 16 chars of the API key hash.
import hashlib as _hashlib
_breakers: dict[str, _CircuitBreaker] = {}
_breakers_lock = threading.Lock()


def _get_breaker(api_key: str) -> _CircuitBreaker:
    """Get or create a circuit breaker scoped to this API key."""
    key_hash = _hashlib.sha256(api_key.encode()).hexdigest()[:16]
    with _breakers_lock:
        if key_hash not in _breakers:
            _breakers[key_hash] = _CircuitBreaker(threshold=5, cooldown_sec=30, jitter_sec=30)
        return _breakers[key_hash]


class AnthropicProvider(ModelProvider):
    """Anthropic Claude adapter implementing ModelProvider."""

    provider_name = "anthropic"

    def __init__(
        self,
        api_key: str,
        default_model: str = "claude-haiku-4-5-20251001",
        fallback_model: Optional[str] = None,
        timeout: float = 60.0,
    ):
        self.api_key = api_key
        self.default_model = default_model
        self.fallback_model = fallback_model or "claude-sonnet-4-5-20250514"
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        self._breaker = _get_breaker(api_key)  # Per-key circuit breaker

    # ── Capabilities ───────────────────────────────────────────────

    def supports_prompt_caching(self) -> bool:
        return True

    def supports_vision(self) -> bool:
        return True

    # ── Core methods ───────────────────────────────────────────────

    def complete(
        self, *, model: str, system: str, messages: list,
        max_tokens: int, **kwargs
    ) -> ProviderResponse:
        """Non-streaming completion."""
        self._check_breaker()
        system_blocks = self._build_system(system, kwargs.get("cache", True))
        try:
            response = self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_blocks if system else anthropic.NOT_GIVEN,
                messages=messages,
            )
            self._breaker.record_success()
            _emit_cache_stats(model, response.usage)
            text = response.content[0].text if response.content else ""
            return ProviderResponse(
                text=text,
                usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
                stop_reason=response.stop_reason or "end_turn",
            )
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except anthropic.APIError as e:
            self._breaker.record_failure()
            raise RuntimeError(f"AI service error: {str(e)}")

    def complete_stream(
        self, *, model: str, system: str, messages: list,
        max_tokens: int, **kwargs
    ) -> Iterator[str]:
        """Streaming completion. Yields text chunks."""
        self._check_breaker()
        system_blocks = self._build_system(system, kwargs.get("cache", True))
        try:
            with self._client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_blocks if system else anthropic.NOT_GIVEN,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield text
            self._breaker.record_success()
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except anthropic.APIError as e:
            self._breaker.record_failure()
            raise RuntimeError(f"AI service error: {str(e)}")

    def complete_with_tools(
        self, *, model: str, system: str, messages: list,
        tools: list, max_tokens: int, **kwargs
    ) -> ProviderToolResponse:
        """Tool-use completion. Returns ContentBlock list."""
        self._check_breaker()
        try:
            response = self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system if system else anthropic.NOT_GIVEN,
                messages=messages,
                tools=tools,
            )
            self._breaker.record_success()
            _emit_cache_stats(model, response.usage)
            blocks = []
            for block in response.content:
                if block.type == "text":
                    blocks.append(ContentBlock(type="text", text=block.text))
                elif block.type == "tool_use":
                    blocks.append(ContentBlock(
                        type="tool_use",
                        tool_name=block.name,
                        tool_input=block.input,
                        tool_use_id=block.id,
                    ))
            return ProviderToolResponse(
                content_blocks=blocks,
                stop_reason=response.stop_reason or "end_turn",
                usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
            )
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except anthropic.APIError as e:
            self._breaker.record_failure()
            raise RuntimeError(f"AI service error: {str(e)}")

    def supports_extended_thinking(self, model: str) -> bool:
        """AMEND-W2-22 — capability gate. Returns True only for models known
        to accept the `thinking` kwarg without raising 400. Default-deny so a
        new model is never assumed capable until added to THINKING_CAPABLE.
        """
        return (model or "") in THINKING_CAPABLE

    def complete_with_tools_stream(
        self, *, model: str, system: str, messages: list,
        tools: list, max_tokens: int, **kwargs
    ):
        """W2 T2a — streaming tool-use completion (AMEND-W2-12..14, 19, 21, 23).

        Yields dicts:
            {"type": "text_delta",            "text": str, "turn_id":..., "block_index": int}
            {"type": "thinking_delta",        "text": str, "turn_id":..., "block_index": int}
            {"type": "tool_use_start",        "id": str, "name": str, "block_index": int}
            {"type": "tool_use_input_delta",  "id": str, "partial_json": str, "block_index": int}
            {"type": "message_stop",          "block_index": int}     # content_block_stop
            {"type": "stream_error",          "reason": str}          # AMEND-14 byte cap
            {"type": "error",                 "message": str, "classification": "client_error"|"server_error"}
            {"type": "final",                 "blocks": list[ContentBlock], "stop_reason":..., "usage":..., "salvaged_text": str}

        Optional kwargs:
            cancel_check: callable -> bool. AMEND-W2-13 — invoked after each event;
                True returns early so the SDK __exit__ can close the HTTP socket.
            max_stream_bytes: int. AMEND-W2-14 override of settings.W2_MAX_STREAM_BYTES.
            turn_id: str. AMEND-W2-19 — propagated onto every text/thinking delta.
        """
        from config import settings as _settings

        cancel_check = kwargs.get("cancel_check")
        max_bytes = kwargs.get("max_stream_bytes", getattr(_settings, "W2_MAX_STREAM_BYTES", 2_000_000))
        turn_id = kwargs.get("turn_id")

        self._check_breaker()
        accumulated_bytes = 0
        accumulated_text: list[str] = []
        emitted_error = False
        try:
            stream_kwargs: dict = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
                "tools": tools or [],
            }
            if system:
                stream_kwargs["system"] = system
            # AMEND-W2-25/27 — extended thinking pass-through with budget clamp.
            thinking_kwarg = kwargs.get("thinking")
            if thinking_kwarg and isinstance(thinking_kwarg, dict):
                budget = int(thinking_kwarg.get("budget_tokens") or 0)
                # AMEND-W2-27 — budget_tokens must be < max_tokens. Clamp to
                # max_tokens-256; if that drops below the API floor of 1024,
                # drop the thinking kwarg entirely.
                if budget >= max_tokens:
                    budget = max_tokens - 256
                if budget < 1024:
                    thinking_kwarg = None
                else:
                    thinking_kwarg = dict(thinking_kwarg)
                    thinking_kwarg["budget_tokens"] = budget
            if thinking_kwarg:
                stream_kwargs["thinking"] = thinking_kwarg
            with self._client.messages.stream(**stream_kwargs) as stream:
                current_tool_id: Optional[str] = None
                current_block_index = 0
                aborted_byte_cap = False
                try:
                    for event in stream:
                        if cancel_check is not None:
                            try:
                                if cancel_check():
                                    return
                            except Exception:
                                pass

                        et = getattr(event, "type", "")
                        idx = getattr(event, "index", current_block_index)

                        if et == "content_block_start":
                            current_block_index = idx
                            cb = getattr(event, "content_block", None)
                            cb_type = getattr(cb, "type", "") if cb is not None else ""
                            if cb_type == "tool_use":
                                current_tool_id = getattr(cb, "id", None)
                                yield {
                                    "type": "tool_use_start",
                                    "id": current_tool_id,
                                    "name": getattr(cb, "name", ""),
                                    "block_index": current_block_index,
                                }
                            elif cb_type == "redacted_thinking":
                                # AMEND-W2-25 — surface redacted blocks so caller
                                # can echo them verbatim on the next turn (API
                                # contract — replay must be byte-identical).
                                yield {
                                    "type": "redacted",
                                    "data": getattr(cb, "data", "") or "",
                                    "block_index": current_block_index,
                                }
                        elif et == "content_block_delta":
                            current_block_index = idx
                            delta = getattr(event, "delta", None)
                            dt = getattr(delta, "type", "")
                            if dt == "text_delta":
                                text = getattr(delta, "text", "") or ""
                                accumulated_bytes += len(text.encode("utf-8", errors="ignore"))
                                if accumulated_bytes > max_bytes:
                                    yield {
                                        "type": "stream_error",
                                        "reason": f"byte cap exceeded ({accumulated_bytes} > {max_bytes})",
                                    }
                                    aborted_byte_cap = True
                                    break
                                accumulated_text.append(text)
                                yield {
                                    "type": "text_delta",
                                    "text": text,
                                    "turn_id": turn_id,
                                    "block_index": current_block_index,
                                }
                            elif dt == "thinking_delta":
                                yield {
                                    "type": "thinking_delta",
                                    "text": getattr(delta, "thinking", "") or "",
                                    "turn_id": turn_id,
                                    "block_index": current_block_index,
                                }
                            elif dt == "input_json_delta":
                                yield {
                                    "type": "tool_use_input_delta",
                                    "id": current_tool_id,
                                    "partial_json": getattr(delta, "partial_json", "") or "",
                                    "block_index": current_block_index,
                                }
                            elif dt == "signature_delta":
                                # AMEND-W2-25 hook — surface signature for thinking
                                # block reconstruction. Caller can choose to ignore.
                                yield {
                                    "type": "signature_delta",
                                    "signature": getattr(delta, "signature", "") or "",
                                    "block_index": current_block_index,
                                }
                        elif et == "content_block_stop":
                            current_block_index = idx
                            yield {"type": "message_stop", "block_index": current_block_index}
                            current_tool_id = None
                except anthropic.BadRequestError as e:
                    # AMEND-W2-23 — 400 is a deterministic client bug. Do NOT
                    # touch the breaker; classify so the caller can route the
                    # error without a 30s account-wide blackout.
                    emitted_error = True
                    yield {
                        "type": "error",
                        "message": str(e),
                        "classification": "client_error",
                    }
                    return
                except anthropic.APIError as e:
                    # AMEND-W2-12 — disposition: yield error event AND record
                    # breaker failure. Caller treats absence of `final` as
                    # StreamIncompleteError.
                    emitted_error = True
                    self._breaker.record_failure()
                    yield {
                        "type": "error",
                        "message": str(e),
                        "classification": "server_error",
                    }
                    return

                if aborted_byte_cap or emitted_error:
                    return

                final_msg = stream.get_final_message()
                blocks = []
                for block in final_msg.content:
                    bt = getattr(block, "type", "")
                    if bt == "text":
                        blocks.append(ContentBlock(type="text", text=block.text))
                    elif bt == "tool_use":
                        blocks.append(ContentBlock(
                            type="tool_use",
                            tool_name=block.name,
                            tool_input=block.input,
                            tool_use_id=block.id,
                        ))
                self._breaker.record_success()
                _emit_cache_stats(model, final_msg.usage)
                yield {
                    "type": "final",
                    "blocks": blocks,
                    "stop_reason": final_msg.stop_reason or "end_turn",
                    "usage": {
                        "input_tokens": final_msg.usage.input_tokens,
                        "output_tokens": final_msg.usage.output_tokens,
                    },
                    # AMEND-W2-21 — caller reconciles streamed text against
                    # final_msg text and prefers streamed on divergence.
                    "salvaged_text": "".join(accumulated_text),
                }
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except anthropic.BadRequestError as e:
            # AMEND-W2-23 — handle 400 raised at stream construction (before
            # iteration). Same classification: do not trip breaker.
            yield {
                "type": "error",
                "message": str(e),
                "classification": "client_error",
            }
        except anthropic.APIError as e:
            self._breaker.record_failure()
            yield {
                "type": "error",
                "message": str(e),
                "classification": "server_error",
            }
        finally:
            # Drop accumulator reference to release memory promptly under cap.
            accumulated_text.clear()

    def validate_key(self) -> bool:
        """Cheap 1-token call to verify the API key is valid."""
        try:
            self._client.messages.create(
                model=self.default_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True
        except anthropic.AuthenticationError:
            raise InvalidKeyError("Invalid Anthropic API key")
        except anthropic.PermissionDeniedError:
            raise InvalidKeyError("API key lacks required permissions")
        except Exception:
            return False  # Network error, rate limit — key may be valid

    # ── Internal helpers ───────────────────────────────────────────

    def _check_breaker(self):
        """Raise if circuit breaker is open."""
        if self._breaker.is_open():
            raise RuntimeError(
                "AI service temporarily unavailable (circuit breaker open). "
                "Please retry in 30 seconds."
            )

    def _build_system(self, system_text, cache: bool = True) -> list:
        """Wrap system prompt with ephemeral cache control if caching is enabled.

        Plan 4 T4: accepts both:
          - str: legacy path, wrap in single cached block.
          - list[dict]: block path (agent_engine._build_system_payload).
            Each block already has `type` + `text` + optional `cache_control`
            with explicit ttl. Pass through unchanged so the 4-breakpoint
            TTL policy from caching-breakpoint-policy.md is respected.
        """
        if not system_text:
            return []
        if isinstance(system_text, list):
            return system_text  # already Anthropic-shaped blocks
        block = {"type": "text", "text": system_text}
        if cache and self.supports_prompt_caching():
            block["cache_control"] = {"type": "ephemeral"}
        return [block]


# Module-level prompt-cache token counter for cache stats aggregator (Phase I).
# Keyed by tenant_id -> {cache_read: int, total_input: int}
_cache_token_counter: dict = {}


def prompt_cache_hit_rate_for_tenant(tenant_id: str) -> float:
    """Return prompt-cache hit token fraction for tenant. 0.0 if no data."""
    try:
        c = _cache_token_counter.get(tenant_id, {})
        total = c.get("total_input", 0)
        cached = c.get("cache_read", 0)
        return (cached / total) if total else 0.0
    except Exception:
        return 0.0


def prompt_cache_miss_rate_for_tenant(tenant_id: str) -> float:
    return 1.0 - prompt_cache_hit_rate_for_tenant(tenant_id)
