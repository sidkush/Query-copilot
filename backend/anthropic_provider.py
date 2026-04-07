"""
Anthropic provider adapter for DataLens.

Wraps the `anthropic.Anthropic` SDK behind the `ModelProvider` interface.
This is the ONLY file that should import `anthropic` — all other modules
use the provider-agnostic `ModelProvider` ABC.

Preserves Anthropic-specific features:
  - Ephemeral prompt caching (cache_control blocks on system prompts)
  - Native tool-use content blocks → ContentBlock translation
  - Token-level streaming via messages.stream()
  - Circuit breaker (3 failures → 30s cooldown)
"""

import logging
import threading
import time
from typing import Iterator, Optional

import anthropic

from model_provider import (
    ModelProvider,
    ProviderResponse,
    ContentBlock,
    ProviderToolResponse,
    InvalidKeyError,
)

logger = logging.getLogger(__name__)


class _CircuitBreaker:
    """Simple circuit breaker: after N consecutive failures, block calls for cooldown_sec."""

    def __init__(self, threshold: int = 3, cooldown_sec: int = 30):
        self.threshold = threshold
        self.cooldown_sec = cooldown_sec
        self._failures = 0
        self._open_since: Optional[float] = None
        self._lock = threading.Lock()

    def record_success(self):
        with self._lock:
            self._failures = 0
            self._open_since = None

    def record_failure(self):
        with self._lock:
            self._failures += 1
            if self._failures >= self.threshold:
                self._open_since = time.time()
                logger.warning(
                    "Circuit breaker OPEN after %d consecutive API failures",
                    self._failures,
                )

    def is_open(self) -> bool:
        with self._lock:
            if self._open_since is None:
                return False
            elapsed = time.time() - self._open_since
            if elapsed >= self.cooldown_sec:
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
            _breakers[key_hash] = _CircuitBreaker(threshold=3, cooldown_sec=30)
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

    def _build_system(self, system_text: str, cache: bool = True) -> list:
        """Wrap system prompt with ephemeral cache control if caching is enabled."""
        if not system_text:
            return []
        block = {"type": "text", "text": system_text}
        if cache and self.supports_prompt_caching():
            block["cache_control"] = {"type": "ephemeral"}
        return [block]
