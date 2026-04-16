"""Workspace sharing — role-based access for dashboards and semantic layers."""

import hashlib
import json
import logging
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

ROLES = {"owner", "editor", "viewer"}

# Role hierarchy: higher index = more privilege
_ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}

_lock = threading.Lock()


def _shares_key(email: str) -> str:
    """Return storage key prefix for owner's share records."""
    h = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]
    return h


def _shares_path(storage_root: Path, email: str) -> Path:
    h = _shares_key(email)
    return storage_root / h / "shares.json"


def _load_shares(storage_root: Path, email: str) -> dict:
    path = _shares_path(storage_root, email)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_shares(storage_root: Path, email: str, data: dict) -> None:
    path = _shares_path(storage_root, email)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


class WorkspaceSharing:
    """Per-user workspace share management. File-based storage.

    shares.json structure (stored per owner):
    {
      "<dashboard_id>": {
        "members": [
          {"email": "alice@example.com", "role": "viewer"},
          {"email": "bob@example.com",   "role": "editor"}
        ]
      }
    }
    """

    def __init__(self, storage_root: str = ".data/user_data"):
        self.root = Path(storage_root)

    # ── Core CRUD ─────────────────────────────────────────────────

    def share_dashboard(
        self,
        owner_email: str,
        dashboard_id: str,
        target_email: str,
        role: str = "viewer",
    ) -> dict:
        """Grant target_email access to a dashboard at the given role.

        Role must be one of: viewer, editor.
        (Owner role is implicit — not stored in shares.json.)
        Idempotent: re-sharing updates the existing role.
        """
        if role not in ROLES or role == "owner":
            raise ValueError(f"Invalid role '{role}'. Must be one of: viewer, editor.")

        target_email = target_email.lower().strip()
        owner_email = owner_email.lower().strip()

        with _lock:
            shares = _load_shares(self.root, owner_email)
            dashboard_entry = shares.setdefault(dashboard_id, {"members": []})
            members = dashboard_entry.setdefault("members", [])

            # Update role if member already exists
            for member in members:
                if member["email"] == target_email:
                    member["role"] = role
                    _save_shares(self.root, owner_email, shares)
                    logger.info(
                        "Updated share: owner=%s dashboard=%s target=%s role=%s",
                        owner_email, dashboard_id, target_email, role,
                    )
                    return {"email": target_email, "role": role}

            # New member
            members.append({"email": target_email, "role": role})
            _save_shares(self.root, owner_email, shares)
            logger.info(
                "Shared: owner=%s dashboard=%s target=%s role=%s",
                owner_email, dashboard_id, target_email, role,
            )
            return {"email": target_email, "role": role}

    def revoke_share(
        self,
        owner_email: str,
        dashboard_id: str,
        target_email: str,
    ) -> bool:
        """Remove access for target_email. Returns True if entry was found and removed."""
        target_email = target_email.lower().strip()
        owner_email = owner_email.lower().strip()

        with _lock:
            shares = _load_shares(self.root, owner_email)
            entry = shares.get(dashboard_id)
            if not entry:
                return False
            members_before = entry.get("members", [])
            members_after = [m for m in members_before if m["email"] != target_email]
            if len(members_after) == len(members_before):
                return False  # nothing removed

            entry["members"] = members_after
            shares[dashboard_id] = entry
            _save_shares(self.root, owner_email, shares)
            logger.info(
                "Revoked: owner=%s dashboard=%s target=%s",
                owner_email, dashboard_id, target_email,
            )
            return True

    def list_shares(self, owner_email: str, dashboard_id: str) -> list:
        """List all members with access to a dashboard.

        Returns list of {"email": ..., "role": ...} dicts.
        The owner is always included as the first entry.
        """
        owner_email = owner_email.lower().strip()
        shares = _load_shares(self.root, owner_email)
        members = shares.get(dashboard_id, {}).get("members", [])
        # Prepend owner (implicit)
        return [{"email": owner_email, "role": "owner"}] + list(members)

    def check_access(
        self,
        user_email: str,
        owner_email: str,
        dashboard_id: str,
        required_role: str = "viewer",
    ) -> bool:
        """Return True if user_email has at least required_role on this dashboard.

        Role hierarchy: owner > editor > viewer.
        Owner always has access regardless of share records.
        """
        user_email = user_email.lower().strip()
        owner_email = owner_email.lower().strip()

        # Owner always wins
        if user_email == owner_email:
            return True

        required_rank = _ROLE_RANK.get(required_role, 0)

        shares = _load_shares(self.root, owner_email)
        members = shares.get(dashboard_id, {}).get("members", [])

        for member in members:
            if member["email"] == user_email:
                member_rank = _ROLE_RANK.get(member["role"], -1)
                return member_rank >= required_rank

        return False

    def list_shared_with_me(self, user_email: str) -> list:
        """List dashboards shared with this user (across all owners).

        Scans all users' shares.json files. Acceptable cost for
        file-based storage; in production this would be a DB query.

        Returns list of {"owner_email": ..., "dashboard_id": ..., "role": ...}.
        """
        user_email = user_email.lower().strip()
        results = []

        if not self.root.exists():
            return results

        for user_dir in self.root.iterdir():
            if not user_dir.is_dir():
                continue
            shares_file = user_dir / "shares.json"
            if not shares_file.exists():
                continue
            try:
                data = json.loads(shares_file.read_text(encoding="utf-8"))
            except Exception:
                continue

            for dashboard_id, entry in data.items():
                for member in entry.get("members", []):
                    if member["email"] == user_email:
                        # Recover owner email from profile.json if available
                        owner_email = _resolve_owner_email(user_dir)
                        results.append(
                            {
                                "owner_email": owner_email,
                                "dashboard_id": dashboard_id,
                                "role": member["role"],
                            }
                        )
                        break  # no need to scan more members for this dashboard

        return results


def _resolve_owner_email(user_dir: Path) -> Optional[str]:
    """Best-effort: read owner email from the user's profile.json."""
    profile_path = user_dir / "profile.json"
    if profile_path.exists():
        try:
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            return profile.get("email")
        except Exception:
            pass
    return None


# ── Module-level singleton ───────────────────────────────────────────

_workspace_sharing: Optional[WorkspaceSharing] = None


def get_workspace_sharing() -> WorkspaceSharing:
    """Return the process-level WorkspaceSharing singleton.

    Storage root is resolved relative to this file so it works
    regardless of the process working directory.
    """
    global _workspace_sharing
    if _workspace_sharing is None:
        storage_root = Path(__file__).resolve().parent / ".data" / "user_data"
        _workspace_sharing = WorkspaceSharing(storage_root=str(storage_root))
    return _workspace_sharing
