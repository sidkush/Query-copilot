"""Provider-layer test: cache_control passthrough + cache stats emission."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch


def test_build_system_accepts_string():
    from anthropic_provider import AnthropicProvider
    # Don't instantiate — just call the bound method.
    provider = AnthropicProvider.__new__(AnthropicProvider)
    provider._model = "claude-haiku-4-5-20251001"
    out = provider._build_system("You are AskDB.", cache=False)
    assert len(out) == 1
    assert out[0]["type"] == "text"
    assert out[0]["text"] == "You are AskDB."


def test_build_system_accepts_list_of_blocks_passthrough():
    """List input preserved verbatim — block-path payloads reach the SDK
    with explicit 1h / 5m TTLs intact."""
    from anthropic_provider import AnthropicProvider
    provider = AnthropicProvider.__new__(AnthropicProvider)
    provider._model = "claude-haiku-4-5-20251001"
    blocks = [
        {"type": "text", "text": "identity", "cache_control": {"type": "ephemeral", "ttl": "1h"}},
        {"type": "text", "text": "schema", "cache_control": {"type": "ephemeral", "ttl": "1h"}},
        {"type": "text", "text": "retrieved", "cache_control": {"type": "ephemeral", "ttl": "5m"}},
    ]
    out = provider._build_system(blocks, cache=True)
    assert out is blocks or out == blocks
    for b in out:
        assert "cache_control" in b
        assert b["cache_control"]["ttl"] in ("1h", "5m")


def test_build_system_empty_returns_empty_list():
    from anthropic_provider import AnthropicProvider
    provider = AnthropicProvider.__new__(AnthropicProvider)
    out = provider._build_system("", cache=True)
    assert out == []
    out2 = provider._build_system(None, cache=True)
    assert out2 == []
