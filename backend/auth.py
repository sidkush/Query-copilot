"""
JWT Authentication for AskDB.
Includes email/password auth + Google & GitHub OAuth.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import json
import logging
import os
from pathlib import Path
import secrets
import time
import threading
from urllib.parse import urlencode
import requests as http_requests

from config import settings
from identity_hardening import (
    sign_oauth_state,
    verify_oauth_state,
    OAuthStateInvalid,
    is_disposable_email,
)

import re

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
_MIN_PASSWORD_LENGTH = 8
_MAX_NAME_LENGTH = 100
_MAX_EMAIL_LENGTH = 254


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
security = HTTPBearer()

USERS_FILE = str(Path(__file__).resolve().parent / ".data" / "users.json")
DELETED_USERS_FILE = str(Path(__file__).resolve().parent / ".data" / "deleted_users.json")
_lock = threading.Lock()


class UserCreate(BaseModel):
    email: str
    password: str
    confirm_password: str
    name: str = ""
    phone: str = ""
    country_code: str = ""


class UserLogin(BaseModel):
    email: str = ""      # Can login with email OR phone
    phone: str = ""
    country_code: str = ""
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class User(BaseModel):
    email: str
    name: str = ""
    created_at: str = ""


def _load_users() -> dict:
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save_users(users: dict):
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    tmp = USERS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(users, f, indent=2)
    os.replace(tmp, USERS_FILE)


def _sanitize_text(text: str) -> str:
    """Strip HTML tags, entities, and dangerous URI schemes from user input."""
    import html
    # Decode HTML entities first so encoded tags become real tags for stripping
    text = html.unescape(text)
    # Strip HTML tags
    text = re.sub(r"<[^>]*>", "", text)
    # Strip dangerous URI schemes
    text = re.sub(r"(?i)\b(javascript|vbscript)\s*:", "", text)
    text = re.sub(r"(?i)\bdata\s*:\s*text/html\b[^,]*,?", "", text)
    return text.strip()


_PHONE_RE = re.compile(r"^\d{4,15}$")
PENDING_VERIFICATIONS_FILE = str(Path(__file__).resolve().parent / ".data" / "pending_verifications.json")


def _load_verifications() -> dict:
    if not os.path.exists(PENDING_VERIFICATIONS_FILE):
        return {}
    with open(PENDING_VERIFICATIONS_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save_verifications(data: dict):
    os.makedirs(os.path.dirname(PENDING_VERIFICATIONS_FILE), exist_ok=True)
    tmp = PENDING_VERIFICATIONS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, PENDING_VERIFICATIONS_FILE)


def mark_verified(identifier: str, channel: str):
    """Mark an email or phone as verified."""
    identifier = identifier.strip().lower()
    key = f"{channel}:{identifier}"
    with _lock:
        vdata = _load_verifications()
        vdata[key] = {
            "verified": True,
            "channel": channel,
            "identifier": identifier,
            "verified_at": time.time(),
        }
        _save_verifications(vdata)


def is_verified(identifier: str, channel: str) -> bool:
    """Check if email or phone has been verified."""
    identifier = identifier.strip().lower()
    key = f"{channel}:{identifier}"
    with _lock:
        vdata = _load_verifications()
    entry = vdata.get(key)
    if not entry:
        return False
    return entry.get("verified", False)


def clear_verification(identifier: str):
    """Clear verification records after successful registration."""
    identifier = identifier.strip().lower()
    with _lock:
        vdata = _load_verifications()
        keys_to_remove = [k for k in vdata if k.endswith(f":{identifier}")]
        for k in keys_to_remove:
            del vdata[k]
        _save_verifications(vdata)


def check_verification_status(email: str, phone: str = "") -> dict:
    """Returns whether email and phone OTPs have been verified for a pending registration."""
    result = {
        "email_verified": is_verified(email, "email"),
    }
    if phone:
        result["phone_verified"] = is_verified(phone, "phone")
    else:
        result["phone_verified"] = False
    return result


def _load_deleted_users() -> dict:
    if not os.path.exists(DELETED_USERS_FILE):
        return {}
    try:
        with open(DELETED_USERS_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def _normalize_phone(phone: str) -> str:
    """Strip spaces and dashes from phone, return digits only."""
    return re.sub(r"[\s\-]", "", phone)


def create_user(email: str, password: str, name: str = "",
                confirm_password: str = "", phone: str = "",
                country_code: str = "") -> dict:
    # Validate email format
    email = email.strip().lower()
    if not email or len(email) > _MAX_EMAIL_LENGTH or not _EMAIL_RE.match(email):
        raise ValueError("Invalid email address")

    # H20 Phase H — block disposable-email domains.
    if is_disposable_email(email):
        raise ValueError("disposable email not allowed")

    # Validate password match
    if password != confirm_password:
        raise ValueError("Passwords do not match")

    # Validate password strength
    if not password or len(password) < _MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {_MIN_PASSWORD_LENGTH} characters")

    # Sanitize and limit name length
    name = _sanitize_text(name)[:_MAX_NAME_LENGTH]

    # Validate phone format if provided
    if phone:
        normalized_phone = _normalize_phone(phone)
        if not _PHONE_RE.match(normalized_phone):
            raise ValueError("Invalid phone number. Must be 4-15 digits (spaces/dashes allowed).")
        phone = normalized_phone

    with _lock:
        users = _load_users()
        if email in users:
            raise ValueError("User already exists")

        # Block re-registration of deleted accounts
        deleted = _load_deleted_users()
        if email in deleted:
            raise ValueError(
                "This account was previously deleted. Contact support to reactivate."
            )

        users[email] = {
            "email": email,
            "name": name,
            "password_hash": _hash_password(password),
            "phone": phone,
            "country_code": country_code.strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "tutorial_completed": False,
        }
        _save_users(users)
        return {"email": email, "name": name, "is_new": True, "tutorial_completed": False}


def authenticate_user(email: str = "", password: str = "",
                      phone: str = "", country_code: str = "") -> Optional[dict]:
    """Authenticate by email+password or phone+password."""
    users = _load_users()

    user = None
    if email:
        user = users.get(email.strip().lower())
    elif phone:
        # Look up user by phone number
        full_phone = f"{country_code}{phone}".strip()
        for u in users.values():
            stored_phone = f"{u.get('country_code', '')}{u.get('phone', '')}"
            if stored_phone == full_phone:
                user = u
                break

    if not user:
        return None
    if not _verify_password(password, user["password_hash"]):
        return None
    return {
        "email": user["email"],
        "name": user["name"],
        "tutorial_completed": user.get("tutorial_completed", False),
    }


def mark_tutorial_complete(email: str):
    """Mark the tutorial as completed for a user."""
    with _lock:
        users = _load_users()
        if email in users:
            users[email]["tutorial_completed"] = True
            _save_users(users)


def is_tutorial_completed(email: str) -> bool:
    """Check if a user has completed the tutorial."""
    users = _load_users()
    user = users.get(email)
    if not user:
        return False
    return user.get("tutorial_completed", False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_admin_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create an admin JWT signed with ADMIN_JWT_SECRET_KEY (or JWT_SECRET_KEY as fallback)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    to_encode["aud"] = "askdb-admin"
    to_encode["iss"] = "askdb"
    secret = settings.ADMIN_JWT_SECRET_KEY or settings.JWT_SECRET_KEY
    return jwt.encode(to_encode, secret, algorithm=settings.JWT_ALGORITHM)


def get_admin_jwt_secret() -> str:
    """Return the admin JWT secret (separate from user secret when configured)."""
    return settings.ADMIN_JWT_SECRET_KEY or settings.JWT_SECRET_KEY


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        email: str = payload.get("sub")
        # D7 adversarial fold (P0) — reject empty / whitespace-only / None.
        # Without this guard, a JWT with `sub=" "` passes `if not email`
        # (truthy), then _canon_email(" ") = "" elsewhere, and a session
        # with empty owner_email skips ownership checks (`if session.owner_email and ...`)
        # at /respond, /cancel, /cancel/commit — full impersonation surface.
        if not email or not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"email": email, "name": payload.get("name", "")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OAuth — Google & GitHub
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OAUTH_STATES_FILE = ".data/oauth_states.json"
OAUTH_STATE_TTL = 600  # 10 minutes

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAIL_URL = "https://api.github.com/user/emails"


def _load_oauth_states() -> dict:
    if not os.path.exists(OAUTH_STATES_FILE):
        return {}
    with open(OAUTH_STATES_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save_oauth_states(states: dict):
    os.makedirs(os.path.dirname(OAUTH_STATES_FILE), exist_ok=True)
    tmp = OAUTH_STATES_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(states, f, indent=2)
    os.replace(tmp, OAUTH_STATES_FILE)


def _new_oauth_state(provider: str) -> str:
    """HMAC-signed state (H20). File-backed store retained only for legacy in-flight states."""
    return sign_oauth_state(provider=provider)


def _consume_oauth_state(state: str) -> Optional[str]:
    try:
        return verify_oauth_state(state)
    except OAuthStateInvalid:
        return None  # caller rejects with 400


def google_auth_url(redirect_uri: str) -> Tuple[str, str]:
    client_id = settings.GOOGLE_CLIENT_ID
    if not client_id:
        return "", ""
    state = _new_oauth_state("google")
    params = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    })
    return f"{GOOGLE_AUTH_URL}?{params}", state


def github_auth_url(redirect_uri: str) -> Tuple[str, str]:
    client_id = settings.GITHUB_CLIENT_ID
    if not client_id:
        return "", ""
    state = _new_oauth_state("github")
    params = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email",
        "state": state,
    })
    return f"{GITHUB_AUTH_URL}?{params}", state


def _google_userinfo(code: str, redirect_uri: str) -> Optional[dict]:
    logger = logging.getLogger("oauth.google")
    try:
        logger.info(f"Exchanging code with redirect_uri={redirect_uri}")
        r = http_requests.post(GOOGLE_TOKEN_URL, data={
            "code": code, "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        }, timeout=10)
        if not r.ok:
            logger.error(f"Google token exchange failed: {r.status_code} {r.text[:500]}")
            return None
        token_data = r.json()
        token = token_data.get("access_token")
        if not token:
            logger.error(f"No access_token in Google response: {token_data}")
            return None
        info = http_requests.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if not info.ok:
            logger.error(f"Google userinfo failed: {info.status_code} {info.text[:500]}")
            return None
        return info.json()
    except Exception as exc:
        logger.error(f"Google OAuth exception: {exc}")
        return None


def _github_userinfo(code: str, redirect_uri: str) -> Optional[dict]:
    logger = logging.getLogger("oauth.github")
    try:
        logger.info(f"Exchanging code with redirect_uri={redirect_uri}")
        r = http_requests.post(GITHUB_TOKEN_URL, json={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code, "redirect_uri": redirect_uri,
        }, headers={"Accept": "application/json"}, timeout=10)
        if not r.ok:
            logger.error(f"GitHub token exchange failed: {r.status_code} {r.text[:500]}")
            return None
        token = r.json().get("access_token")
        if not token:
            logger.error(f"No access_token in GitHub response: {r.json()}")
            return None
        hdrs = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        user = http_requests.get(GITHUB_USER_URL, headers=hdrs, timeout=10)
        if not user.ok:
            logger.error(f"GitHub user fetch failed: {user.status_code} {user.text[:500]}")
            return None
        data = user.json()
        if not data.get("email"):
            er = http_requests.get(GITHUB_EMAIL_URL, headers=hdrs, timeout=10)
            if er.ok:
                primary = next((e for e in er.json() if e.get("primary") and e.get("verified")), None)
                if primary:
                    data["email"] = primary["email"]
        return data
    except Exception as exc:
        logger.error(f"GitHub OAuth exception: {exc}")
        return None


def handle_oauth_callback(provider: str, code: str, state: str, redirect_uri: str) -> Tuple[bool, Optional[str], str, Optional[dict]]:
    """Complete OAuth flow. Returns (success, jwt_token, error_message, user_dict)."""
    valid_provider = _consume_oauth_state(state)
    if not valid_provider:
        return False, None, "OAuth state token is invalid or has expired.", None
    if valid_provider != provider:
        return False, None, "OAuth state mismatch.", None

    if provider == "google":
        info = _google_userinfo(code, redirect_uri)
        if not info:
            return False, None, "Could not retrieve user info from Google.", None
        email = info.get("email", "")
        name = info.get("name") or email
    elif provider == "github":
        info = _github_userinfo(code, redirect_uri)
        if not info:
            return False, None, "Could not retrieve user info from GitHub.", None
        email = info.get("email") or f"{info.get('login', 'user')}@users.noreply.github.com"
        name = info.get("name") or info.get("login") or "GitHub User"
    else:
        return False, None, f"Unknown provider: {provider}", None

    # Find or create user
    is_new = False
    tutorial_completed = False
    with _lock:
        users = _load_users()
        existing = users.get(email)
        if not existing:
            is_new = True
            users[email] = {
                "email": email,
                "name": name,
                "password_hash": None,
                "oauth_provider": provider,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "tutorial_completed": False,
            }
            _save_users(users)
        else:
            tutorial_completed = existing.get("tutorial_completed", False)

    token = create_access_token({"sub": email, "name": name})
    return True, token, "", {
        "email": email,
        "name": name,
        "is_new": is_new,
        "tutorial_completed": tutorial_completed,
    }
