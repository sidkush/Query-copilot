"""Tests for the 4-breakpoint system prompt assembly."""
from __future__ import annotations


def test_prompt_block_has_cache_control():
    from prompt_block import PromptBlock
    b = PromptBlock(text="identity + core", ttl="1h")
    d = b.to_anthropic()
    assert d["type"] == "text"
    assert d["text"] == "identity + core"
    assert d["cache_control"] == {"type": "ephemeral", "ttl": "1h"}


def test_prompt_block_no_cache_for_conversation():
    from prompt_block import PromptBlock
    b = PromptBlock(text="user turn", ttl=None)
    d = b.to_anthropic()
    assert "cache_control" not in d


def test_compose_four_breakpoints_in_order():
    from prompt_block import compose_system_blocks
    blocks = compose_system_blocks(
        identity_core="identity + p1 skills",
        schema_context="schema + dialect + domain",
        retrieved_skills="retrieved + memory",
    )
    assert len(blocks) == 3
    assert blocks[0].ttl == "1h"
    assert blocks[1].ttl == "1h"
    assert blocks[2].ttl == "5m"
    assert "identity + p1 skills" in blocks[0].text
    assert "schema + dialect + domain" in blocks[1].text
    assert "retrieved + memory" in blocks[2].text


def test_compose_skips_empty_segments():
    """Don't emit empty cache blocks."""
    from prompt_block import compose_system_blocks
    blocks = compose_system_blocks(
        identity_core="identity",
        schema_context="",
        retrieved_skills="",
    )
    assert len(blocks) == 1
    assert blocks[0].text == "identity"
