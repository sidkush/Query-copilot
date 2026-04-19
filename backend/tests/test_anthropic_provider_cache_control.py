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


def test_emit_cache_stats_writes_jsonl(tmp_path, monkeypatch):
    """Every successful response appends a line to cache_stats.jsonl."""
    import anthropic_provider
    monkeypatch.setattr(anthropic_provider, "_CACHE_STATS_PATH", tmp_path / "cache_stats.jsonl")

    from anthropic_provider import _emit_cache_stats
    fake_usage = MagicMock(
        input_tokens=500, output_tokens=25,
        cache_read_input_tokens=400, cache_creation_input_tokens=30,
    )
    _emit_cache_stats("claude-haiku-4-5-20251001", fake_usage)

    stats_path = tmp_path / "cache_stats.jsonl"
    assert stats_path.exists()
    lines = stats_path.read_text().strip().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec["cache_read_input_tokens"] == 400
    assert rec["cache_creation_input_tokens"] == 30
    assert rec["input_tokens"] == 500
    assert rec["model"] == "claude-haiku-4-5-20251001"
    assert "ts" in rec


def test_emit_cache_stats_never_raises(tmp_path, monkeypatch):
    """Even with malformed usage, never raise."""
    import anthropic_provider
    monkeypatch.setattr(anthropic_provider, "_CACHE_STATS_PATH", tmp_path / "cache_stats.jsonl")
    from anthropic_provider import _emit_cache_stats
    # None usage — missing all attrs.
    _emit_cache_stats("model", None)  # must not raise
    # Path unwritable (directory in place of file at a fresh location).
    dir_as_file = tmp_path / "unwritable"
    dir_as_file.mkdir()
    monkeypatch.setattr(anthropic_provider, "_CACHE_STATS_PATH", dir_as_file)
    _emit_cache_stats(
        "model",
        MagicMock(input_tokens=1, output_tokens=1,
                  cache_read_input_tokens=0, cache_creation_input_tokens=0),
    )
    # No exception = pass.
