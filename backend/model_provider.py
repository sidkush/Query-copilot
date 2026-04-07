"""
Model provider abstraction for DataLens.

Defines the `ModelProvider` ABC that all LLM provider adapters must implement.
Currently only `AnthropicProvider` exists; OpenAI/Google/xAI adapters are future work.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterator, Optional


class InvalidKeyError(Exception):
    """Raised when the provider API key is invalid or revoked."""
    pass


@dataclass
class ProviderResponse:
    """Standard response from a non-streaming, non-tool completion."""
    text: str
    usage: dict  # {"input_tokens": N, "output_tokens": N}
    stop_reason: str  # "end_turn", "max_tokens", "tool_use"


@dataclass
class ContentBlock:
    """Unified content block for tool-use responses.

    Maps to Anthropic's native content blocks:
      - type="text"     → text field populated
      - type="tool_use" → tool_name, tool_input, tool_use_id populated
    """
    type: str  # "text" or "tool_use"
    text: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = None
    tool_use_id: Optional[str] = None


@dataclass
class ProviderToolResponse:
    """Response from a tool-use completion."""
    content_blocks: list[ContentBlock]
    stop_reason: str  # "end_turn", "tool_use", "max_tokens"
    usage: dict


class ModelProvider(ABC):
    """Abstract base class for LLM provider adapters.

    Subclasses must implement the 4 abstract methods.
    `supports_prompt_caching()` and `supports_vision()` return False
    by default — override in providers that support them.
    """
    provider_name: str = "base"

    @abstractmethod
    def complete(
        self, *, model: str, system: str, messages: list,
        max_tokens: int, **kwargs
    ) -> ProviderResponse:
        """Single non-streaming completion."""
        ...

    @abstractmethod
    def complete_stream(
        self, *, model: str, system: str, messages: list,
        max_tokens: int, **kwargs
    ) -> Iterator[str]:
        """Streaming completion. Yields text chunks."""
        ...

    @abstractmethod
    def complete_with_tools(
        self, *, model: str, system: str, messages: list,
        tools: list, max_tokens: int, **kwargs
    ) -> ProviderToolResponse:
        """Tool-use completion. Returns content blocks including tool calls."""
        ...

    @abstractmethod
    def validate_key(self) -> bool:
        """Cheap validation call (~1 token). Returns True if key is valid.
        Raises InvalidKeyError if key is definitively invalid."""
        ...

    def supports_prompt_caching(self) -> bool:
        """Whether this provider supports ephemeral prompt caching."""
        return False

    def supports_vision(self) -> bool:
        """Whether this provider supports image/vision inputs."""
        return False
