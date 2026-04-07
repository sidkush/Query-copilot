"""
OTP generation, storage, and verification for DataLens.
Supports email and phone channels with file-based storage,
rate limiting, and thread-safe operations.
Real email delivery via SMTP (Gmail App Password, SendGrid, etc.)
"""

import json
import os
import secrets
import smtplib
import threading
import time
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

DATA_DIR = str(Path(__file__).resolve().parent / ".data")
OTP_STORE_FILE = os.path.join(DATA_DIR, "otp_store.json")
SENT_OTPS_LOG = os.path.join(DATA_DIR, "sent_otps.log")

OTP_TTL_SECONDS = 600  # 10 minutes
MAX_ATTEMPTS = 3
MAX_REQUESTS_PER_HOUR = 10

_lock = threading.Lock()


def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_otp_store() -> dict:
    if not os.path.exists(OTP_STORE_FILE):
        return {}
    with open(OTP_STORE_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def _save_otp_store(store: dict):
    _ensure_data_dir()
    with open(OTP_STORE_FILE, "w") as f:
        json.dump(store, f, indent=2)


def _make_key(identifier: str, channel: str) -> str:
    return f"{channel}:{identifier}"


def _cleanup_expired(store: dict) -> dict:
    """Remove expired entries from the store."""
    now = time.time()
    return {k: v for k, v in store.items() if v.get("expires_at", 0) > now}


def _count_recent_requests(store: dict, identifier: str, channel: str) -> int:
    """Count how many OTP requests this identifier has made in the last hour.

    Only counts from the log file (single source of truth) to avoid double-counting.
    """
    one_hour_ago = time.time() - 3600
    count = 0
    if os.path.exists(SENT_OTPS_LOG):
        try:
            with open(SENT_OTPS_LOG, "r") as f:
                for line in f:
                    if f"| {channel} | {identifier} |" in line:
                        parts = line.strip().split(" | ")
                        if len(parts) >= 4:
                            try:
                                log_time = float(parts[0].strip())
                                if log_time > one_hour_ago:
                                    count += 1
                            except (ValueError, IndexError):
                                pass
        except (IOError, OSError):
            pass
    return count


def _log_sent_otp(identifier: str, channel: str, otp: str):
    """Log sent OTP to file for debugging purposes."""
    _ensure_data_dir()
    timestamp = time.time()
    human_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    log_line = f"{timestamp} | {channel} | {identifier} | OTP_SENT | {human_time}\n"
    with open(SENT_OTPS_LOG, "a") as f:
        f.write(log_line)


def generate_otp(identifier: str, channel: str) -> str:
    """Generate a 6-digit OTP for email or phone.

    Args:
        identifier: Email address or phone number.
        channel: 'email' or 'phone'.

    Returns:
        The 6-digit OTP code string.

    Raises:
        ValueError: If rate limited (more than 5 requests per hour).
    """
    if channel not in ("email", "phone"):
        raise ValueError("Channel must be 'email' or 'phone'")

    identifier = identifier.strip().lower()

    with _lock:
        store = _load_otp_store()
        store = _cleanup_expired(store)

        # Rate limiting check
        recent_count = _count_recent_requests(store, identifier, channel)
        if recent_count >= MAX_REQUESTS_PER_HOUR:
            raise ValueError(
                f"Rate limit exceeded. Maximum {MAX_REQUESTS_PER_HOUR} OTP requests "
                f"per hour for this {channel}. Please try again later."
            )

        # Generate 6-digit OTP using cryptographic randomness
        code = f"{secrets.randbelow(900000) + 100000}"
        now = time.time()

        key = _make_key(identifier, channel)
        store[key] = {
            "code": code,
            "created_at": now,
            "expires_at": now + OTP_TTL_SECONDS,
            "attempts": 0,
            "channel": channel,
        }

        _save_otp_store(store)

    return code


def verify_otp(identifier: str, channel: str, code: str) -> bool:
    """Verify an OTP code.

    Args:
        identifier: Email address or phone number.
        channel: 'email' or 'phone'.
        code: The OTP code to verify.

    Returns:
        True if the OTP is valid, False otherwise.
        Auto-invalidates after 3 wrong attempts or expiry.
    """
    identifier = identifier.strip().lower()
    key = _make_key(identifier, channel)

    with _lock:
        store = _load_otp_store()
        entry = store.get(key)

        if not entry:
            return False

        # Check expiry
        if time.time() > entry.get("expires_at", 0):
            del store[key]
            _save_otp_store(store)
            return False

        # Check if already exceeded max attempts
        if entry.get("attempts", 0) >= MAX_ATTEMPTS:
            del store[key]
            _save_otp_store(store)
            return False

        # Check code — use constant-time comparison to prevent timing oracle
        import hmac
        if hmac.compare_digest(entry["code"], code.strip()):
            # Valid - remove the OTP entry (single use)
            del store[key]
            _save_otp_store(store)
            return True
        else:
            # Wrong code - increment attempts
            entry["attempts"] = entry.get("attempts", 0) + 1
            if entry["attempts"] >= MAX_ATTEMPTS:
                # Max attempts reached, invalidate
                del store[key]
            else:
                store[key] = entry
            _save_otp_store(store)
            return False


def get_remaining_attempts(identifier: str, channel: str) -> int:
    """Get the number of remaining verification attempts for an OTP."""
    identifier = identifier.strip().lower()
    key = _make_key(identifier, channel)

    store = _load_otp_store()
    entry = store.get(key)

    if not entry:
        return 0

    if time.time() > entry.get("expires_at", 0):
        return 0

    return max(0, MAX_ATTEMPTS - entry.get("attempts", 0))


def _build_otp_email_html(otp: str, expiry_minutes: int = 10) -> str:
    """Build a styled HTML email body for the OTP."""
    return f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f172a; border-radius: 12px; color: #e2e8f0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #818cf8; font-size: 24px; margin: 0;">Query<span style="color: #a78bfa;">Copilot</span></h1>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Ask your data anything</p>
      </div>
      <div style="background: #1e293b; border-radius: 8px; padding: 24px; text-align: center;">
        <h2 style="color: #f1f5f9; font-size: 18px; margin: 0 0 8px;">Verify Your Email</h2>
        <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px;">Use the code below to complete your registration:</p>
        <div style="background: #0f172a; border: 2px solid #6366f1; border-radius: 8px; padding: 16px; letter-spacing: 8px; font-size: 32px; font-weight: 700; color: #a5b4fc; font-family: 'Courier New', monospace;">
          {otp}
        </div>
        <p style="color: #f59e0b; font-size: 13px; margin-top: 16px;">⏱ This code expires in <strong>{expiry_minutes} minutes</strong></p>
      </div>
      <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
        If you didn't request this code, please ignore this email.
      </p>
    </div>
    """


def _send_via_resend(email: str, otp: str, settings) -> bool:
    """Send OTP email via Resend API. Returns True on success."""
    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        expiry_min = settings.OTP_EXPIRY_SECONDS // 60
        r = resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [email],
            "subject": f"DataLens — Your verification code is {otp}",
            "html": _build_otp_email_html(otp, expiry_min),
            "text": (
                f"Your DataLens verification code is: {otp}\n\n"
                f"This code expires in {expiry_min} minutes.\n"
                f"If you didn't request this code, please ignore this email."
            ),
        })
        print(f"[OTP] Email sent to {email} via Resend (id={r.get('id', 'unknown') if isinstance(r, dict) else r})")
        return True
    except Exception as exc:
        print(f"[OTP-ERROR] Resend failed for {email}: {exc}")
        return False


def _send_via_smtp(email: str, otp: str, settings) -> bool:
    """Send OTP email via SMTP. Returns True on success."""
    try:
        expiry_min = settings.OTP_EXPIRY_SECONDS // 60
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"DataLens — Your verification code is {otp}"
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL or settings.SMTP_USER}>"
        msg["To"] = email

        text_body = (
            f"Your DataLens verification code is: {otp}\n\n"
            f"This code expires in {expiry_min} minutes.\n"
            f"If you didn't request this code, please ignore this email."
        )
        html_body = _build_otp_email_html(otp, expiry_min)

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(
                settings.SMTP_FROM_EMAIL or settings.SMTP_USER,
                [email],
                msg.as_string(),
            )
        print(f"[OTP] Email sent to {email} via SMTP")
        return True
    except Exception as exc:
        print(f"[OTP-ERROR] SMTP failed for {email}: {exc}")
        return False


def send_email_otp(email: str, otp: str):
    """Send email OTP. Tries Resend API first, then SMTP, then dev-mode fallback."""
    from config import settings

    email = email.strip().lower()
    _log_sent_otp(email, "email", otp)

    # Priority 1: SMTP (Gmail App Password, SendGrid, Brevo, etc.)
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        if _send_via_smtp(email, otp, settings):
            return

    # Priority 2: Resend API (needs API key + verified domain for non-account emails)
    if settings.RESEND_API_KEY:
        if _send_via_resend(email, otp, settings):
            return

    # Priority 3: Dev-mode fallback (log only)
    print(f"[OTP-DEV] Email OTP for {email}: {otp}")
    print(f"[OTP-DEV] No email provider configured. Add SMTP or RESEND credentials to .env")


def _send_sms_via_twilio(phone: str, otp: str, settings) -> bool:
    """Send OTP SMS via Twilio. Returns True on success."""
    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        params = {
            "body": f"Your DataLens verification code is: {otp}. It expires in {settings.OTP_EXPIRY_SECONDS // 60} minutes.",
            "to": phone,
        }
        # Use MessagingServiceSid if available (better deliverability), else from_ number
        if settings.TWILIO_MESSAGING_SERVICE_SID:
            params["messaging_service_sid"] = settings.TWILIO_MESSAGING_SERVICE_SID
        else:
            params["from_"] = settings.TWILIO_FROM_NUMBER
        message = client.messages.create(**params)
        print(f"[OTP] SMS sent to {phone} via Twilio (sid={message.sid}, status={message.status})")
        return True
    except Exception as exc:
        print(f"[OTP-ERROR] Twilio failed for {phone}: {exc}")
        return False


def send_email(to: str, subject: str, html_body: str, text_body: str) -> bool:
    """General-purpose email sender. Tries SMTP → Resend → logs warning.
    Returns True if the email was sent successfully."""
    from config import settings

    # Priority 1: SMTP
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL or settings.SMTP_USER}>"
            msg["To"] = to
            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL or settings.SMTP_USER, [to], msg.as_string())
            return True
        except Exception as exc:
            print(f"[EMAIL-ERROR] SMTP failed for {to}: {exc}")

    # Priority 2: Resend
    if settings.RESEND_API_KEY:
        try:
            import resend
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({"from": settings.RESEND_FROM_EMAIL, "to": [to], "subject": subject, "html": html_body, "text": text_body})
            return True
        except Exception as exc:
            print(f"[EMAIL-ERROR] Resend failed for {to}: {exc}")

    print(f"[EMAIL-WARN] No email provider configured — could not send to {to}")
    return False


def send_phone_otp(phone: str, otp: str):
    """Send phone OTP via Twilio SMS. Falls back to dev-mode if not configured."""
    from config import settings

    phone = phone.strip()
    _log_sent_otp(phone, "phone", otp)

    # Priority 1: Twilio SMS
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and (
        settings.TWILIO_FROM_NUMBER or getattr(settings, "TWILIO_MESSAGING_SERVICE_SID", "")
    ):
        if _send_sms_via_twilio(phone, otp, settings):
            return

    # Priority 2: Dev-mode fallback (log only)
    print(f"[OTP-DEV] Phone OTP for {phone}: {otp}")
    print(f"[OTP-DEV] No SMS provider configured. Add TWILIO credentials to .env")
