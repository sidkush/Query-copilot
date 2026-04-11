"""
Test for Bug 3.5: Schema profiling blocks connect endpoint.

The bug: profile_connection() is called synchronously during /connect.
On slow databases (Snowflake, BigQuery) this blocks the response for
30-120 seconds.

The fix: Run profile_connection() in a background task so the connect
endpoint returns immediately while profiling proceeds asynchronously.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "routers", "connection_routes.py"
)


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_profile_connection_runs_in_background():
    """profile_connection() calls in connect must use background execution."""
    source = _load_source()
    # Find the connect endpoint function body
    match = re.search(
        r"def connect_database\(.*?(?=\ndef |\n@router|\Z)",
        source,
        re.DOTALL,
    )
    assert match, "Could not find connect_database function"
    body = match.group()
    has_background = (
        "run_in_executor" in body
        or "create_task" in body
        or "BackgroundTask" in body
        or "Thread(" in body
        or "background" in body.lower()
    )
    assert has_background, (
        "connect_database must run profile_connection() in background "
        "(run_in_executor/create_task/BackgroundTask/Thread) to avoid blocking"
    )


def test_reconnect_profile_runs_in_background():
    """profile_connection() in reconnect must also use background execution."""
    source = _load_source()
    match = re.search(
        r"def reconnect_from_saved\(.*?(?=\ndef |\n@router|\Z)",
        source,
        re.DOTALL,
    )
    assert match, "Could not find reconnect_from_saved function"
    body = match.group()
    has_background = (
        "run_in_executor" in body
        or "create_task" in body
        or "BackgroundTask" in body
        or "Thread(" in body
        or "background" in body.lower()
    )
    assert has_background, (
        "reconnect_from_saved must run profile_connection() in background "
        "(run_in_executor/create_task/BackgroundTask/Thread) to avoid blocking"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
