"""
Tests for workspace_sharing.py — role-based dashboard access control.

Tests are fully isolated: each uses a fresh tmp_path so they never
interfere with each other or with real .data/ on disk.
"""

import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Fixture ──────────────────────────────────────────────────────────

@pytest.fixture
def ws(tmp_path):
    """Return a WorkspaceSharing instance backed by a temporary directory."""
    from workspace_sharing import WorkspaceSharing
    return WorkspaceSharing(storage_root=str(tmp_path))


# ── Tests ─────────────────────────────────────────────────────────────

def test_share_and_check_access(ws):
    """Sharing with viewer role → check_access returns True for viewer requirement."""
    ws.share_dashboard(
        owner_email="alice@example.com",
        dashboard_id="dash1",
        target_email="bob@example.com",
        role="viewer",
    )
    assert ws.check_access(
        user_email="bob@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash1",
        required_role="viewer",
    ) is True


def test_owner_always_has_access(ws):
    """Owner needs no explicit share entry — check_access returns True unconditionally."""
    # No share_dashboard call — owner checks their own dashboard
    assert ws.check_access(
        user_email="alice@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash_any",
        required_role="owner",
    ) is True
    assert ws.check_access(
        user_email="alice@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash_any",
        required_role="editor",
    ) is True
    assert ws.check_access(
        user_email="alice@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash_any",
        required_role="viewer",
    ) is True


def test_revoke_removes_access(ws):
    """Share then revoke → check_access returns False."""
    ws.share_dashboard("alice@example.com", "dash1", "carol@example.com", "viewer")
    # Confirm access granted
    assert ws.check_access("carol@example.com", "alice@example.com", "dash1", "viewer") is True

    # Revoke
    removed = ws.revoke_share("alice@example.com", "dash1", "carol@example.com")
    assert removed is True

    # Access should be gone
    assert ws.check_access("carol@example.com", "alice@example.com", "dash1", "viewer") is False


def test_editor_can_do_viewer_things(ws):
    """Editor role satisfies viewer-level requirement (hierarchy: editor > viewer)."""
    ws.share_dashboard("alice@example.com", "dash1", "dave@example.com", "editor")
    assert ws.check_access(
        user_email="dave@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash1",
        required_role="viewer",
    ) is True


def test_viewer_cannot_edit(ws):
    """Viewer role fails an editor-level check."""
    ws.share_dashboard("alice@example.com", "dash1", "eve@example.com", "viewer")
    assert ws.check_access(
        user_email="eve@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash1",
        required_role="editor",
    ) is False


def test_list_shares(ws):
    """Share with 2 users → list_shares returns all 3 entries (owner + 2 members)."""
    ws.share_dashboard("alice@example.com", "dash1", "frank@example.com", "viewer")
    ws.share_dashboard("alice@example.com", "dash1", "grace@example.com", "editor")

    members = ws.list_shares("alice@example.com", "dash1")

    # Owner always prepended
    assert members[0]["email"] == "alice@example.com"
    assert members[0]["role"] == "owner"

    emails = {m["email"] for m in members}
    assert "frank@example.com" in emails
    assert "grace@example.com" in emails
    assert len(members) == 3


def test_share_updates_existing_role(ws):
    """Re-sharing a user with a different role updates their role (idempotent share)."""
    ws.share_dashboard("alice@example.com", "dash1", "henry@example.com", "viewer")
    ws.share_dashboard("alice@example.com", "dash1", "henry@example.com", "editor")

    members = ws.list_shares("alice@example.com", "dash1")
    henry = next(m for m in members if m["email"] == "henry@example.com")
    assert henry["role"] == "editor"

    # Only one entry for henry (no duplicates)
    henry_entries = [m for m in members if m["email"] == "henry@example.com"]
    assert len(henry_entries) == 1


def test_revoke_nonexistent_returns_false(ws):
    """Revoking a user who was never shared returns False without error."""
    result = ws.revoke_share("alice@example.com", "dash99", "nobody@example.com")
    assert result is False


def test_check_access_unshared_user_returns_false(ws):
    """User who was never granted access → check_access returns False."""
    assert ws.check_access(
        user_email="stranger@example.com",
        owner_email="alice@example.com",
        dashboard_id="dash1",
        required_role="viewer",
    ) is False


def test_invalid_role_raises(ws):
    """share_dashboard with an invalid role raises ValueError."""
    with pytest.raises(ValueError, match="Invalid role"):
        ws.share_dashboard("alice@example.com", "dash1", "bob@example.com", role="superuser")


def test_owner_role_cannot_be_assigned(ws):
    """share_dashboard with role='owner' raises ValueError (owner is implicit)."""
    with pytest.raises(ValueError):
        ws.share_dashboard("alice@example.com", "dash1", "bob@example.com", role="owner")


def test_list_shared_with_me(ws, tmp_path):
    """list_shared_with_me returns dashboards shared with the target user."""
    # Create a profile.json for alice so owner email can be resolved
    import hashlib, json
    from pathlib import Path

    alice_hash = hashlib.sha256("alice@example.com".encode()).hexdigest()[:16]
    alice_dir = tmp_path / alice_hash
    alice_dir.mkdir(parents=True, exist_ok=True)
    (alice_dir / "profile.json").write_text(
        json.dumps({"email": "alice@example.com"}), encoding="utf-8"
    )

    ws.share_dashboard("alice@example.com", "dash1", "zara@example.com", "viewer")

    shared = ws.list_shared_with_me("zara@example.com")
    assert len(shared) == 1
    assert shared[0]["dashboard_id"] == "dash1"
    assert shared[0]["role"] == "viewer"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
