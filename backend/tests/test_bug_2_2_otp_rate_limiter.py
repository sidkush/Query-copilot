"""
Test for Bug 2.2: File-based OTP rate limiter bypass.

The bug: _count_recent_requests() reads from sent_otps.log on disk.
An attacker with filesystem access can delete the log to bypass rate limiting.

The fix: Use an in-memory rate limiter (defaultdict + TTL eviction) as the
primary enforcement. The log file remains for auditing but is not the source
of truth for rate limiting.
"""

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _isolated_otp_module(tmp_dir):
    """Import otp module with store redirected to a temp directory."""
    import otp as otp_mod

    otp_mod.DATA_DIR = tmp_dir
    otp_mod.OTP_STORE_FILE = os.path.join(tmp_dir, "otp_store.json")
    otp_mod.SENT_OTPS_LOG = os.path.join(tmp_dir, "sent_otps.log")
    return otp_mod


def test_in_memory_rate_tracker_exists():
    """otp.py must define an in-memory rate tracking structure."""
    import otp as otp_mod
    assert hasattr(otp_mod, "_rate_tracker"), (
        "otp.py must define _rate_tracker for in-memory rate limiting"
    )


def test_rate_limit_survives_log_deletion():
    """Rate limit must still enforce after the log file is deleted."""
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod = _isolated_otp_module(tmp)
        # Clear in-memory tracker to start fresh
        otp_mod._rate_tracker.clear()

        # Generate OTPs up to the limit
        for i in range(otp_mod.MAX_REQUESTS_PER_HOUR):
            otp_mod.generate_otp(f"attacker@example.com", "email")

        # Delete the log file (simulating attacker action)
        log_path = otp_mod.SENT_OTPS_LOG
        if os.path.exists(log_path):
            os.remove(log_path)
        assert not os.path.exists(log_path), "Log file should be deleted"

        # Next request should STILL be rate limited
        try:
            otp_mod.generate_otp("attacker@example.com", "email")
            assert False, (
                "generate_otp() should have raised ValueError for rate limit "
                "even after log file deletion"
            )
        except ValueError as e:
            assert "rate limit" in str(e).lower() or "Rate limit" in str(e)


def test_in_memory_tracker_ttl_eviction():
    """Entries older than 1 hour should be evicted from the in-memory tracker."""
    import otp as otp_mod

    otp_mod._rate_tracker.clear()
    key = "email:evict@example.com"

    # Insert timestamps older than 1 hour
    old_time = time.time() - 3700  # 1 hour + 100 seconds ago
    otp_mod._rate_tracker[key] = [old_time, old_time + 1, old_time + 2]

    # _count_recent_requests should NOT count these old entries
    with tempfile.TemporaryDirectory() as tmp:
        otp_mod.DATA_DIR = tmp
        otp_mod.SENT_OTPS_LOG = os.path.join(tmp, "sent_otps.log")
        count = otp_mod._count_recent_requests({}, "evict@example.com", "email")
        assert count == 0, (
            f"Expected 0 recent requests after TTL eviction, got {count}"
        )


def test_in_memory_tracker_counts_recent():
    """Recent requests in the in-memory tracker should be counted."""
    import otp as otp_mod

    otp_mod._rate_tracker.clear()
    key = "email:recent@example.com"

    # Insert recent timestamps
    now = time.time()
    otp_mod._rate_tracker[key] = [now - 60, now - 30, now - 10]

    with tempfile.TemporaryDirectory() as tmp:
        otp_mod.DATA_DIR = tmp
        otp_mod.SENT_OTPS_LOG = os.path.join(tmp, "sent_otps.log")
        count = otp_mod._count_recent_requests({}, "recent@example.com", "email")
        assert count >= 3, (
            f"Expected at least 3 recent requests, got {count}"
        )


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
