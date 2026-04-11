"""
Test for Bug 1.1: is_verified() lockless read race condition.

The bug: is_verified() reads pending_verifications.json without acquiring
_lock, while mark_verified() and clear_verification() hold _lock during
their read-modify-write. This creates a TOCTOU race where is_verified()
can read stale data mid-write.

The fix: is_verified() and check_verification_status() must acquire _lock.

This test verifies that is_verified() acquires _lock by checking that
a concurrent clear_verification() cannot interleave with is_verified().
"""

import json
import os
import sys
import threading
import tempfile
import time

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_is_verified_acquires_lock():
    """is_verified() must hold _lock to prevent reading mid-write data."""
    import auth

    # Use a temp file so we don't clobber real data
    tmpdir = tempfile.mkdtemp()
    original_file = auth.PENDING_VERIFICATIONS_FILE
    auth.PENDING_VERIFICATIONS_FILE = os.path.join(tmpdir, "pending_verifications.json")

    try:
        # Pre-populate: mark test@example.com as verified
        auth.mark_verified("test@example.com", "email")
        assert auth.is_verified("test@example.com", "email") is True

        # Now test: if is_verified acquires _lock properly, it cannot
        # interleave with a concurrent operation that holds _lock.
        # We simulate this by holding _lock in a thread and verifying
        # that is_verified() blocks until the lock is released.

        lock_held = threading.Event()
        is_verified_started = threading.Event()
        is_verified_result = [None]
        is_verified_blocked = [False]

        def hold_lock():
            with auth._lock:
                lock_held.set()
                # Hold the lock for 0.5s — if is_verified acquires _lock,
                # it will block until we release
                time.sleep(0.5)

        def call_is_verified():
            lock_held.wait()  # Wait until lock is held
            time.sleep(0.05)  # Small delay to ensure we try while lock is held
            start = time.monotonic()
            is_verified_started.set()
            result = auth.is_verified("test@example.com", "email")
            elapsed = time.monotonic() - start
            is_verified_result[0] = result
            # If is_verified properly acquires the lock, it should have
            # waited ~0.4-0.5s for the lock to be released
            is_verified_blocked[0] = elapsed >= 0.3

        t1 = threading.Thread(target=hold_lock)
        t2 = threading.Thread(target=call_is_verified)

        t1.start()
        t2.start()
        t1.join(timeout=3)
        t2.join(timeout=3)

        assert is_verified_result[0] is True, "is_verified should return True"
        assert is_verified_blocked[0] is True, (
            "is_verified() did NOT block on _lock — it reads without acquiring "
            "the lock, which is the bug. It should acquire _lock to prevent "
            "reading stale data during concurrent writes."
        )
    finally:
        # Cleanup
        auth.PENDING_VERIFICATIONS_FILE = original_file
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_check_verification_status_acquires_lock():
    """check_verification_status() calls is_verified() which must hold _lock."""
    import auth

    tmpdir = tempfile.mkdtemp()
    original_file = auth.PENDING_VERIFICATIONS_FILE
    auth.PENDING_VERIFICATIONS_FILE = os.path.join(tmpdir, "pending_verifications.json")

    try:
        auth.mark_verified("test2@example.com", "email")

        lock_held = threading.Event()
        result_holder = [None]
        was_blocked = [False]

        def hold_lock():
            with auth._lock:
                lock_held.set()
                time.sleep(0.5)

        def call_check():
            lock_held.wait()
            time.sleep(0.05)
            start = time.monotonic()
            result = auth.check_verification_status("test2@example.com")
            elapsed = time.monotonic() - start
            result_holder[0] = result
            was_blocked[0] = elapsed >= 0.3

        t1 = threading.Thread(target=hold_lock)
        t2 = threading.Thread(target=call_check)
        t1.start()
        t2.start()
        t1.join(timeout=3)
        t2.join(timeout=3)

        assert result_holder[0]["email_verified"] is True
        assert was_blocked[0] is True, (
            "check_verification_status() did NOT block on _lock — "
            "is_verified() reads without the lock."
        )
    finally:
        auth.PENDING_VERIFICATIONS_FILE = original_file
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
