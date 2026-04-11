"""
Test for Bug 3.8: Health check blocks on slow connections.

The bug: /health iterates all connections synchronously with no
per-connection timeout. One slow DB blocks the entire endpoint.

The fix: Add a per-connection timeout. Use concurrent execution.
Return partial health status (connection X healthy, Y timed out).
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "main.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_health_check_has_timeout():
    """health_check must include a per-connection timeout."""
    source = _load_source()
    match = re.search(
        r"def health_check\(.*?(?=\n(?:@app|def )|\Z)", source, re.DOTALL
    )
    assert match, "Could not find health_check function"
    body = match.group()
    has_timeout = (
        "timeout" in body.lower()
        or "ThreadPool" in body
        or "concurrent" in body
        or "futures" in body
    )
    assert has_timeout, (
        "health_check() must include a timeout mechanism for connection checks"
    )


def test_health_check_uses_concurrent_execution():
    """health_check should check connections concurrently, not sequentially."""
    source = _load_source()
    match = re.search(
        r"def health_check\(.*?(?=\n(?:@app|def )|\Z)", source, re.DOTALL
    )
    assert match, "Could not find health_check function"
    body = match.group()
    has_concurrent = (
        "ThreadPool" in body
        or "concurrent" in body
        or "futures" in body
        or "submit" in body
    )
    assert has_concurrent, (
        "health_check() must use concurrent execution for connection checks"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
