"""Auth API routes — email/password + Google & GitHub OAuth + OTP verification."""

import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from auth import (
    UserCreate, UserLogin, TokenResponse,
    create_user, authenticate_user, create_access_token, get_current_user,
    google_auth_url, github_auth_url, handle_oauth_callback,
    mark_tutorial_complete, is_tutorial_completed,
    mark_verified, is_verified, check_verification_status,
)
from otp import (
    generate_otp, verify_otp, get_remaining_attempts,
    send_email_otp, send_phone_otp, OTP_TTL_SECONDS,
)
from config import settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── OTP Pydantic models ─────────────────────────────────────

class SendOTPRequest(BaseModel):
    email: str


class VerifyOTPRequest(BaseModel):
    email: str
    code: str


class SendPhoneOTPRequest(BaseModel):
    phone: str
    country_code: str


class VerifyPhoneOTPRequest(BaseModel):
    phone: str
    country_code: str
    code: str


# ── OTP endpoints (no auth required — pre-registration) ─────

@router.post("/send-email-otp")
def send_email_otp_endpoint(body: SendOTPRequest):
    """Send a 6-digit OTP to the provided email."""
    import logging
    logger = logging.getLogger("otp")
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    try:
        otp = generate_otp(email, "email")
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    logger.info(f"Sending OTP to {email}...")
    send_email_otp(email, otp)
    logger.info(f"send_email_otp() completed for {email}")
    return {
        "success": True,
        "message": f"OTP sent to {email}",
        "expires_in": OTP_TTL_SECONDS,
        "resend_after": 60,
    }


@router.post("/verify-email-otp")
def verify_email_otp_endpoint(body: VerifyOTPRequest):
    """Verify the email OTP code."""
    email = body.email.strip().lower()
    code = body.code.strip()
    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code are required")

    remaining_before = get_remaining_attempts(email, "email")
    result = verify_otp(email, "email", code)

    if result:
        mark_verified(email, "email")
        return {"verified": True, "remaining_attempts": 0}
    else:
        remaining_after = get_remaining_attempts(email, "email")
        return {"verified": False, "remaining_attempts": remaining_after}


@router.post("/send-phone-otp")
def send_phone_otp_endpoint(body: SendPhoneOTPRequest):
    """Send a 6-digit OTP to the provided phone number."""
    phone = body.phone.strip()
    country_code = body.country_code.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    full_phone = f"{country_code}{phone}"
    try:
        otp = generate_otp(full_phone, "phone")
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    send_phone_otp(full_phone, otp)
    return {
        "success": True,
        "message": f"OTP sent to {country_code} {phone}",
        "expires_in": OTP_TTL_SECONDS,
        "resend_after": 60,
    }


@router.post("/verify-phone-otp")
def verify_phone_otp_endpoint(body: VerifyPhoneOTPRequest):
    """Verify the phone OTP code."""
    phone = body.phone.strip()
    country_code = body.country_code.strip()
    code = body.code.strip()
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Phone and code are required")

    full_phone = f"{country_code}{phone}"
    remaining_before = get_remaining_attempts(full_phone, "phone")
    result = verify_otp(full_phone, "phone", code)

    if result:
        mark_verified(full_phone, "phone")
        return {"verified": True, "remaining_attempts": 0}
    else:
        remaining_after = get_remaining_attempts(full_phone, "phone")
        return {"verified": False, "remaining_attempts": remaining_after}


# ── Registration (updated to require OTP verification) ───────

@router.post("/register", response_model=TokenResponse)
def register(user: UserCreate):
    email = user.email.strip().lower()
    phone = user.phone.strip() if user.phone else ""
    country_code = user.country_code.strip() if user.country_code else ""

    # Require email verification
    if not is_verified(email, "email"):
        raise HTTPException(
            status_code=400,
            detail="Please verify your email address before registering."
        )

    try:
        created = create_user(
            email=user.email,
            password=user.password,
            name=user.name,
            confirm_password=user.confirm_password,
            phone=phone,
            country_code=country_code,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    token = create_access_token({"sub": created["email"], "name": created["name"]})
    return TokenResponse(access_token=token, user=created)


# ── Login ────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(user: UserLogin):
    if not user.email:
        raise HTTPException(status_code=400, detail="Email is required")

    authenticated = authenticate_user(
        email=user.email, password=user.password,
    )
    if not authenticated:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": authenticated["email"], "name": authenticated["name"]})
    return TokenResponse(access_token=token, user=authenticated)


# ── Demo login (for testing — remove before production) ─────
DEMO_EMAIL = "demo@askdb.dev"
DEMO_PASSWORD = "DemoTest2026!"
DEMO_NAME = "Demo User"

@router.post("/demo-login", response_model=TokenResponse)
def demo_login():
    """Create or log in as the demo test user. No OTP required.
    Disabled unless DEMO_ENABLED=true in config."""
    from config import settings
    if not settings.DEMO_ENABLED:
        raise HTTPException(status_code=403, detail="Demo login is disabled")
    import os
    if (os.environ.get("ASKDB_ENV") or os.environ.get("QUERYCOPILOT_ENV", "")).lower() in ("production", "prod", "staging"):
        if not os.environ.get("DEMO_LOGIN_ENABLED", "").lower() in ("true", "1"):
            raise HTTPException(status_code=403, detail="Demo login is disabled in production")
    authenticated = authenticate_user(email=DEMO_EMAIL, password=DEMO_PASSWORD)
    if not authenticated:
        # First time — create the demo user
        try:
            mark_verified(DEMO_EMAIL, "email")
            user_data = create_user(
                email=DEMO_EMAIL,
                password=DEMO_PASSWORD,
                confirm_password=DEMO_PASSWORD,
                name=DEMO_NAME,
                phone="0000000000",
                country_code="+0",
            )
            mark_tutorial_complete(DEMO_EMAIL)
            authenticated = authenticate_user(email=DEMO_EMAIL, password=DEMO_PASSWORD)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create demo user: {str(e)}")
    token = create_access_token({"sub": authenticated["email"], "name": authenticated["name"]})
    return TokenResponse(access_token=token, user=authenticated)


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return user


@router.post("/tutorial-complete")
def complete_tutorial(user: dict = Depends(get_current_user)):
    """Mark the tutorial as completed for the current user."""
    mark_tutorial_complete(user["email"])
    return {"status": "ok", "tutorial_completed": True}


# ── OAuth endpoints ───────────────────────────────────────────

@router.get("/oauth/google")
def oauth_google():
    redirect_uri = settings.OAUTH_REDIRECT_URI
    url, state = google_auth_url(redirect_uri)
    if not url:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    return {"url": url, "state": state}


@router.get("/oauth/github")
def oauth_github():
    redirect_uri = settings.OAUTH_REDIRECT_URI
    url, state = github_auth_url(redirect_uri)
    if not url:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured")
    return {"url": url, "state": state}


@router.get("/oauth/callback")
def oauth_callback(
    provider: str = Query(...),
    code: str = Query(...),
    state: str = Query(...),
):
    logger = logging.getLogger("oauth")
    logger.info(f"OAuth callback received: provider={provider}, state_prefix={state[:8]}...")
    redirect_uri = settings.OAUTH_REDIRECT_URI
    success, token, error, user = handle_oauth_callback(provider, code, state, redirect_uri)
    if not success:
        logger.error(f"OAuth callback failed for provider={provider}: {error}")
        raise HTTPException(status_code=400, detail=error)
    logger.info(f"OAuth callback success for provider={provider}, email={user.get('email')}")
    return {"access_token": token, "token_type": "bearer", "user": user}
