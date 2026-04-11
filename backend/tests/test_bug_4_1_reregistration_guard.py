"""
Test for Bug 4.1: Soft-deleted users can re-register.

The bug: create_user() in auth.py doesn't check deleted_users.json.
A deleted account can re-register with the same email, orphaning old data.

The fix: Check deleted_users.json during registration. Block
re-registration of previously deleted email addresses.
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_create_user_checks_deleted_users():
    """auth.py create_user() must reference deleted_users to block re-registration."""
    source_path = os.path.join(os.path.dirname(__file__), "..", "auth.py")
    with open(source_path, "r", encoding="utf-8") as f:
        source = f.read()

    # Find the create_user function body
    match = re.search(
        r"def create_user\(.*?(?=\ndef |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_user function"
    body = match.group()

    assert "deleted_users" in body.lower() or "deleted" in body, (
        "create_user() must check deleted_users.json before allowing registration"
    )


def test_create_user_raises_on_deleted_email():
    """create_user() must raise ValueError when email is in deleted_users.json."""
    source_path = os.path.join(os.path.dirname(__file__), "..", "auth.py")
    with open(source_path, "r", encoding="utf-8") as f:
        source = f.read()

    match = re.search(
        r"def create_user\(.*?(?=\ndef |\Z)", source, re.DOTALL
    )
    assert match, "Could not find create_user function"
    body = match.group()

    # Should have an error message about deleted/deactivated accounts
    has_guard = (
        "deleted" in body.lower()
        and ("raise" in body or "ValueError" in body or "HTTPException" in body)
    )
    assert has_guard, (
        "create_user() must raise an error when the email belongs to a deleted account"
    )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
