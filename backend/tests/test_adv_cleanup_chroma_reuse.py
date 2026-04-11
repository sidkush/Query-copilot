"""
Adversarial fix: periodic cleanup_stale must NOT create a new QueryMemory
(and thus a new ChromaDB PersistentClient) on every iteration.

The bug: _periodic_cleanup_stale() calls QueryMemory() inside the while-loop,
creating a new PersistentClient every 6 hours. Over time this leaks resources.

The fix: Create the QueryMemory instance once (before the loop) and reuse it.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "main.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_querymemory_created_outside_loop():
    """QueryMemory() must be instantiated BEFORE the while True loop, not inside it."""
    source = _load_source()
    match = re.search(
        r"async def _periodic_cleanup_stale\(.*?(?=\n    (?:memory_cleanup_task|except|yield))",
        source,
        re.DOTALL,
    )
    assert match, "Could not find _periodic_cleanup_stale function"
    body = match.group()

    # Find where QueryMemory() is instantiated
    qm_pos = body.find("QueryMemory()")
    assert qm_pos != -1, "QueryMemory() not found in _periodic_cleanup_stale"

    # Find the while True loop
    while_pos = body.find("while True")
    assert while_pos != -1, "while True loop not found in _periodic_cleanup_stale"

    # QueryMemory() must appear BEFORE while True
    assert qm_pos < while_pos, (
        f"QueryMemory() is created inside the while-loop (pos {qm_pos} > {while_pos}). "
        "This creates a new ChromaDB PersistentClient every iteration. "
        "Move it before the loop to reuse the client."
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
