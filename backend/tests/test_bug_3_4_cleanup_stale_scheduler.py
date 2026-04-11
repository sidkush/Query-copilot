"""
Test for Bug 3.4: cleanup_stale() is never auto-scheduled.

The bug: QueryMemory.cleanup_stale(conn_id) exists but is never called
automatically. Over time, ChromaDB collections grow unbounded with stale
insights, degrading performance.

The fix: Add a periodic cleanup job in main.py lifespan startup that
calls cleanup_stale() for all active connections every 6 hours.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "main.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_lifespan_schedules_cleanup_stale():
    """main.py lifespan must schedule periodic cleanup_stale() calls."""
    source = _load_source()
    match = re.search(
        r"async def lifespan\(.*?(?=\nasync def |\napp\s*=|\Z)",
        source,
        re.DOTALL,
    )
    assert match, "Could not find lifespan function"
    body = match.group()
    assert "cleanup_stale" in body, (
        "lifespan() must schedule periodic cleanup_stale() calls "
        "to prevent unbounded ChromaDB growth"
    )


def test_cleanup_runs_periodically():
    """The cleanup job must use a scheduler or periodic mechanism."""
    source = _load_source()
    match = re.search(
        r"async def lifespan\(.*?(?=\nasync def |\napp\s*=|\Z)",
        source,
        re.DOTALL,
    )
    assert match, "Could not find lifespan function"
    body = match.group()
    has_periodic = (
        "scheduler" in body.lower()
        or "interval" in body.lower()
        or "add_job" in body.lower()
        or "periodic" in body.lower()
        or "create_task" in body.lower()
    )
    assert has_periodic, (
        "cleanup_stale must be scheduled periodically (scheduler/interval/add_job), "
        "not just called once at startup"
    )


def test_cleanup_shutdown():
    """Lifespan must stop the cleanup scheduler on shutdown."""
    source = _load_source()
    # After yield in lifespan, there should be cleanup scheduler shutdown
    match = re.search(
        r"async def lifespan\(.*?(?=\nasync def |\napp\s*=|\Z)",
        source,
        re.DOTALL,
    )
    assert match, "Could not find lifespan function"
    body = match.group()
    # Split on yield — shutdown code is after yield
    parts = body.split("yield")
    assert len(parts) >= 2, "lifespan must have a yield"
    shutdown = parts[1]
    has_cleanup_shutdown = (
        "cleanup" in shutdown.lower()
        or "stale" in shutdown.lower()
        or "memory_scheduler" in shutdown.lower()
    )
    assert has_cleanup_shutdown, (
        "lifespan shutdown (after yield) must stop the cleanup scheduler"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
