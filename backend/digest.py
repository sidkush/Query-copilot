"""
Scheduled email digest service for DataLens.

Sends periodic usage summaries to opted-in users. Digest frequency
is per-user (daily / weekly / none) stored in their profile's
``notification_preferences.digest_frequency``.

Scheduler integration:
  Call ``start_digest_scheduler()`` from the app lifespan and
  ``stop_digest_scheduler()`` on shutdown.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from config import settings

logger = logging.getLogger(__name__)

_scheduler = None  # module-level APScheduler instance


# ── HTML Template ────────────────────────────────────────────────

def _build_digest_html(display_name: str, stats: dict, period: str) -> str:
    """Build a styled HTML email for a usage digest."""
    total = stats.get("total_queries", 0)
    success = stats.get("success_count", 0)
    fail = stats.get("fail_count", 0)
    avg_latency = (
        round(stats.get("total_latency_ms", 0) / max(total, 1))
        if total else 0
    )
    success_rate = round(success / max(total, 1) * 100) if total else 0
    last_query = stats.get("last_query_at", "N/A")
    period_label = "Daily" if period == "daily" else "Weekly"
    queries_period = (
        stats.get("queries_today", 0) if period == "daily"
        else stats.get("queries_this_month", 0)
    )

    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f172a;border-radius:12px;color:#e2e8f0;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#818cf8;font-size:24px;margin:0;">Query<span style="color:#a78bfa;">Copilot</span></h1>
        <p style="color:#94a3b8;font-size:13px;margin-top:4px;">Your {period_label} Usage Digest</p>
      </div>
      <div style="background:#1e293b;border-radius:8px;padding:24px;">
        <p style="color:#f1f5f9;font-size:16px;margin:0 0 16px;">Hi {display_name or 'there'},</p>
        <p style="color:#94a3b8;font-size:14px;margin:0 0 20px;">
          Here's your {period_label.lower()} analytics summary:
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 12px;background:#0f172a;border-radius:6px 0 0 0;color:#94a3b8;font-size:13px;">Queries ({period_label})</td>
            <td style="padding:10px 12px;background:#0f172a;border-radius:0 6px 0 0;color:#a5b4fc;font-size:18px;font-weight:700;text-align:right;">{queries_period}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;background:#162032;color:#94a3b8;font-size:13px;">Total Queries (All Time)</td>
            <td style="padding:10px 12px;background:#162032;color:#e2e8f0;font-size:18px;font-weight:700;text-align:right;">{total}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;background:#0f172a;color:#94a3b8;font-size:13px;">Success Rate</td>
            <td style="padding:10px 12px;background:#0f172a;color:#34d399;font-size:18px;font-weight:700;text-align:right;">{success_rate}%</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;background:#162032;color:#94a3b8;font-size:13px;">Avg Latency</td>
            <td style="padding:10px 12px;background:#162032;color:#e2e8f0;font-size:18px;font-weight:700;text-align:right;">{avg_latency} ms</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;background:#0f172a;border-radius:0 0 0 6px;color:#94a3b8;font-size:13px;">Failed Queries</td>
            <td style="padding:10px 12px;background:#0f172a;border-radius:0 0 6px 0;color:{'#f87171' if fail else '#34d399'};font-size:18px;font-weight:700;text-align:right;">{fail}</td>
          </tr>
        </table>
      </div>
      <p style="color:#64748b;font-size:12px;text-align:center;margin-top:20px;">
        You're receiving this because you opted in to {period_label.lower()} digests.
        Update your preferences in Settings → Notifications.
      </p>
    </div>
    """


def _build_digest_text(display_name: str, stats: dict, period: str) -> str:
    """Plain-text fallback for the digest email."""
    total = stats.get("total_queries", 0)
    success = stats.get("success_count", 0)
    fail = stats.get("fail_count", 0)
    avg_latency = round(stats.get("total_latency_ms", 0) / max(total, 1)) if total else 0
    success_rate = round(success / max(total, 1) * 100) if total else 0
    period_label = "Daily" if period == "daily" else "Weekly"
    queries_period = (
        stats.get("queries_today", 0) if period == "daily"
        else stats.get("queries_this_month", 0)
    )

    return (
        f"DataLens — {period_label} Usage Digest\n"
        f"{'=' * 40}\n\n"
        f"Hi {display_name or 'there'},\n\n"
        f"Queries ({period_label}): {queries_period}\n"
        f"Total Queries (All Time): {total}\n"
        f"Success Rate: {success_rate}%\n"
        f"Avg Latency: {avg_latency} ms\n"
        f"Failed Queries: {fail}\n\n"
        f"Update your preferences in Settings → Notifications.\n"
    )


# ── Digest Runner ────────────────────────────────────────────────

def _send_digests(frequency: str):
    """Iterate over all users and send digests to those opted in for *frequency*."""
    from user_storage import _backend, load_profile, load_query_stats
    from otp import send_email

    # Discover all user directories
    user_keys = _backend.list_keys("user_data", suffix="")
    # Deduplicate to user prefixes (each key is a directory entry)
    seen_prefixes = set()
    for key in user_keys:
        # key looks like "user_data/{hash}/something"
        parts = key.split("/")
        if len(parts) >= 2:
            seen_prefixes.add(parts[1])

    if not seen_prefixes:
        # Fallback: scan the user_data directory directly
        user_data_dir = Path(__file__).resolve().parent / ".data" / "user_data"
        if user_data_dir.exists():
            seen_prefixes = {d.name for d in user_data_dir.iterdir() if d.is_dir()}

    sent = 0
    for user_hash in seen_prefixes:
        try:
            # Load profile to get email and preferences
            profile = _backend.read_json(f"user_data/{user_hash}/profile.json")
            if not profile:
                continue

            # Check digest opt-in
            notif_prefs = profile.get("notification_preferences", {})
            user_freq = notif_prefs.get("digest_frequency", "none")
            if user_freq != frequency:
                continue

            email = profile.get("email")
            if not email:
                continue

            # Load stats
            stats = _backend.read_json(f"user_data/{user_hash}/query_stats.json") or {}
            if stats.get("total_queries", 0) == 0:
                continue  # No activity, skip

            display_name = profile.get("display_name", "")
            subject = f"DataLens — Your {'Daily' if frequency == 'daily' else 'Weekly'} Analytics Digest"
            html = _build_digest_html(display_name, stats, frequency)
            text = _build_digest_text(display_name, stats, frequency)

            if send_email(email, subject, html, text):
                sent += 1

        except Exception as exc:
            logger.warning("Digest failed for user_hash=%s: %s", user_hash, exc)
            continue

    logger.info("Sent %d %s digest emails", sent, frequency)


def run_daily_digest():
    """Job entry point for daily digests."""
    _send_digests("daily")


def run_weekly_digest():
    """Job entry point for weekly digests."""
    _send_digests("weekly")


# ── Scheduler Lifecycle ──────────────────────────────────────────

def start_digest_scheduler():
    """Start the APScheduler background scheduler for email digests."""
    global _scheduler

    if not settings.DIGEST_ENABLED:
        logger.info("Digest scheduler disabled (DIGEST_ENABLED=False)")
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        logger.warning("apscheduler not installed — digest scheduler disabled. Run: pip install apscheduler>=3.10")
        return

    # Use Redis job store if available (prevents duplicate jobs across workers)
    jobstores = {}
    try:
        from redis_client import get_redis
        r = get_redis()
        if r:
            from urllib.parse import urlparse
            parsed = urlparse(settings.REDIS_URL)
            from apscheduler.jobstores.redis import RedisJobStore
            jobstores["default"] = RedisJobStore(
                host=parsed.hostname or "localhost",
                port=parsed.port or 6379,
                db=int(parsed.path.lstrip("/") or 0),
            )
            logger.info("Digest scheduler using Redis job store")
    except Exception as exc:
        logger.info("Digest scheduler using memory job store (Redis unavailable: %s)", exc)

    _scheduler = BackgroundScheduler(daemon=True, jobstores=jobstores)

    # Daily digest — runs at DIGEST_HOUR_UTC every day
    _scheduler.add_job(
        run_daily_digest,
        CronTrigger(hour=settings.DIGEST_HOUR_UTC, minute=0),
        id="daily_digest",
        replace_existing=True,
    )

    # Weekly digest — runs at DIGEST_HOUR_UTC on DIGEST_WEEKDAY
    _scheduler.add_job(
        run_weekly_digest,
        CronTrigger(day_of_week=settings.DIGEST_WEEKDAY, hour=settings.DIGEST_HOUR_UTC, minute=0),
        id="weekly_digest",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Digest scheduler started — daily at %02d:00 UTC, weekly on day %d",
        settings.DIGEST_HOUR_UTC,
        settings.DIGEST_WEEKDAY,
    )


def stop_digest_scheduler():
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Digest scheduler stopped")
