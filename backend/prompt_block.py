"""Prompt block dataclass for Anthropic 4-breakpoint caching.

See askdb-skills/core/caching-breakpoint-policy.md for the TTL policy
and invalidation rules. This module only composes the Anthropic API
shape; invocation lives in anthropic_provider.py (unchanged).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

TTL = Literal["1h", "5m"]


@dataclass(frozen=True, slots=True)
class PromptBlock:
    text: str
    ttl: Optional[TTL]  # None = no cache_control (conversation turn)

    def to_anthropic(self) -> dict:
        out: dict = {"type": "text", "text": self.text}
        if self.ttl is not None:
            out["cache_control"] = {"type": "ephemeral", "ttl": self.ttl}
        return out


def compose_system_blocks(
    *,
    identity_core: str,
    schema_context: str,
    retrieved_skills: str,
) -> list[PromptBlock]:
    """Build the three cached system segments. Empty segments are dropped.

    The fourth breakpoint (conversation + latest user turn) is emitted by
    the caller — this function is system-only.
    """
    blocks: list[PromptBlock] = []
    if identity_core.strip():
        blocks.append(PromptBlock(text=identity_core, ttl="1h"))
    if schema_context.strip():
        blocks.append(PromptBlock(text=schema_context, ttl="1h"))
    if retrieved_skills.strip():
        blocks.append(PromptBlock(text=retrieved_skills, ttl="5m"))
    return blocks
