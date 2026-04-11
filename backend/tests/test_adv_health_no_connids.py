"""
Adversarial fix: /api/v1/health must NOT leak connection IDs.

The health endpoint previously returned a connection_status dict with
actual conn_id UUIDs as keys, allowing unauthenticated callers to
enumerate connection identifiers.

Fix: Strip per-connection details. Only return aggregate counts.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

SOURCE_PATH = os.path.join(os.path.dirname(__file__), "..", "main.py")


def _load_source():
    with open(SOURCE_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_health_does_not_return_connection_status_dict():
    """The health response must NOT contain a 'connection_status' key with per-conn details."""
    source = _load_source()
    match = re.search(
        r"def health_check\(.*?(?=\n(?:@app|def )|\Z)", source, re.DOTALL
    )
    assert match, "Could not find health_check function"
    body = match.group()

    # The old code had: "connection_status": results
    # After the fix, this key must not appear in the return dict.
    has_conn_status = re.search(
        r"""["']connection_status["']\s*:""", body
    )
    assert not has_conn_status, (
        "health_check() still returns 'connection_status' dict with per-connection "
        "details. This leaks conn_id UUIDs to unauthenticated callers."
    )


def test_health_does_not_leak_conn_id_in_response():
    """The health response must not include conn_id values."""
    source = _load_source()
    match = re.search(
        r"def health_check\(.*?(?=\n(?:@app|def )|\Z)", source, re.DOTALL
    )
    assert match, "Could not find health_check function"
    body = match.group()

    # Check the return dict doesn't map conn_ids
    return_match = re.search(r"return\s*\{.*?\}", body, re.DOTALL)
    assert return_match, "Could not find return statement"
    return_body = return_match.group()

    # Must not have conn_id as a key in the returned dict
    assert "conn_id" not in return_body, (
        "health_check() return dict references conn_id — "
        "unauthenticated callers can enumerate connection identifiers."
    )


def test_health_returns_only_aggregate_counts():
    """The return dict should have status, database_connected, and counts — no per-conn breakdown."""
    source = _load_source()
    match = re.search(
        r"def health_check\(.*?(?=\n(?:@app|def )|\Z)", source, re.DOTALL
    )
    assert match, "Could not find health_check function"
    body = match.group()

    return_match = re.search(r"return\s*\{.*?\}", body, re.DOTALL)
    assert return_match, "Could not find return statement"
    return_body = return_match.group()

    # Must have basic aggregate fields
    assert '"status"' in return_body, "Missing 'status' in health response"
    assert '"database_connected"' in return_body or "'database_connected'" in return_body, (
        "Missing 'database_connected' in health response"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
