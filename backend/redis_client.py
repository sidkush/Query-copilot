"""
Redis connection helper for AskDB.

Provides a singleton connection pool with graceful fallback — returns
``None`` if Redis is unavailable so callers can fall back to in-memory.

Uses TTL-based backoff: after a failure, retries after ``_BACKOFF_SECONDS``
instead of permanently disabling Redis for the process lifetime.
"""

import logging
import time

from config import settings

logger = logging.getLogger(__name__)

_pool = None
_unavailable_until: float = 0  # timestamp after which we retry
_BACKOFF_SECONDS = 30  # wait 30s before retrying after failure


def get_redis():
    """Return a ``redis.Redis`` client or ``None`` if Redis is unreachable.

    The connection pool is created once and reused. If connection fails,
    subsequent calls return ``None`` for ``_BACKOFF_SECONDS`` to avoid
    blocking every request with a connection timeout, then retry.
    """
    global _pool, _unavailable_until

    if _unavailable_until > 0 and time.monotonic() < _unavailable_until:
        return None

    try:
        import redis as _redis
    except ImportError:
        logger.warning("redis package not installed — pip install redis>=5.0")
        _unavailable_until = time.monotonic() + 300  # retry import after 5 min
        return None

    if _pool is None:
        try:
            _pool = _redis.ConnectionPool.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        except Exception as exc:
            logger.warning("Redis connection pool failed: %s — retrying in %ds", exc, _BACKOFF_SECONDS)
            _unavailable_until = time.monotonic() + _BACKOFF_SECONDS
            return None

    try:
        r = _redis.Redis(connection_pool=_pool)
        r.ping()
        # Successful connection — clear any backoff
        _unavailable_until = 0
        return r
    except Exception:
        logger.warning("Redis ping failed — retrying in %ds", _BACKOFF_SECONDS)
        _unavailable_until = time.monotonic() + _BACKOFF_SECONDS
        _pool = None  # Reset pool so next retry creates a fresh one
        return None


def reset():
    """Reset the connection state (useful after config change or in tests)."""
    global _pool, _unavailable_until
    _pool = None
    _unavailable_until = 0
