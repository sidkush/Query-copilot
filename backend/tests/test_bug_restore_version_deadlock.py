"""
Test for Restore-Version Deadlock.

Bug report: "Dashboard version history is breaking my flow. Dashboard is
freezing when I try to restore a previous version. Upon refreshing the page,
it never loads."

Root cause (proposed): `user_storage.restore_dashboard_version` acquires the
module-level `_lock` (a non-reentrant `threading.Lock`) at line 1133, then
while still inside that critical section calls `save_dashboard_version`
at line 1138. `save_dashboard_version` also begins with `with _lock:` at
line 1095, which attempts to re-acquire the SAME non-reentrant lock on the
SAME thread — and blocks forever.

Because the FastAPI endpoint is `async def`, the blocking happens on the
event-loop thread. The entire uvicorn worker freezes, so every subsequent
request to that worker (including a page refresh that needs to load the
dashboard list) also hangs indefinitely. This matches the user's report of
"freezing when I restore" AND "refresh never loads" — one mechanism, two
observable symptoms.

This test exercises the exact code path and verifies `restore_dashboard_version`
returns in reasonable time. It uses a temporary storage root so it doesn't
touch any real user data.

Pre-fix: the call hangs forever; the timeout kills it and the test FAILS.
Post-fix: the call returns the restored dashboard promptly and the test PASSES.
"""

import os
import sys
import threading
import time
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _run_with_timeout(fn, timeout_s: float):
    """Run `fn` on a background thread and return (result, timed_out, exc).

    Cannot cancel the thread if it hangs — but we can detect the hang by
    observing that the thread is still alive after `timeout_s`. The daemon
    flag ensures the process can still exit cleanly even if the worker
    thread is wedged on the broken lock.
    """
    result_holder = {"value": None, "exc": None}

    def target():
        try:
            result_holder["value"] = fn()
        except BaseException as e:  # noqa: BLE001
            result_holder["exc"] = e

    t = threading.Thread(target=target, daemon=True)
    t.start()
    t.join(timeout=timeout_s)
    timed_out = t.is_alive()
    return result_holder["value"], timed_out, result_holder["exc"]


def _make_temp_storage(monkeypatch_root: Path):
    """Point user_storage at a clean temp directory for this test."""
    import user_storage

    # Reach into the backend instance and repoint its root.
    user_storage._backend.root = monkeypatch_root
    # Also update the module-level constant used by _user_dir — if it exists.
    # user_storage uses `_backend._resolve(...)` which reads `self.root`, so
    # retargeting the instance is sufficient.
    return user_storage


def test_restore_dashboard_version_does_not_deadlock(tmp_path):
    """restore_dashboard_version must return within 3 seconds — any hang
    means the non-reentrant lock is being re-entered on the same thread.

    This is the failing test for the deadlock bug. Pre-fix it will time out
    on the second lock.acquire() in save_dashboard_version.
    """
    user_storage = _make_temp_storage(tmp_path)

    email = "deadlock-test@example.com"

    # Create a dashboard so there's something to save a version of.
    dashboards = [
        {
            "id": "dash-1",
            "name": "Test Dashboard",
            "created_at": "2026-04-12T00:00:00Z",
            "updated_at": "2026-04-12T00:00:00Z",
            "tabs": [
                {
                    "id": "tab-1",
                    "name": "Overview",
                    "sections": [
                        {"id": "sec-1", "name": "Main", "tiles": [], "layout": []}
                    ],
                }
            ],
            "annotations": [],
        }
    ]
    # Write the dashboard directly via the backend to avoid touching locks.
    user_storage._backend.write_json(
        user_storage._dashboards_key(email), dashboards, atomic=True
    )

    # Seed a version to restore to. This call also exercises the lock path,
    # but NOT nested — it should succeed.
    snapshot = {
        "name": "Old Name",
        "tabs": [
            {
                "id": "tab-1",
                "name": "Old Tab",
                "sections": [{"id": "sec-1", "name": "Old Section", "tiles": [], "layout": []}],
            }
        ],
    }
    version = user_storage.save_dashboard_version(
        email, "dash-1", snapshot, label="seed"
    )
    assert version["id"], "seed version must have an id"

    # NOW the trap: restore this version. This path takes _lock at line 1133
    # and inside that block calls save_dashboard_version which tries to take
    # _lock again at line 1095. With a non-reentrant Lock this hangs forever.
    def do_restore():
        return user_storage.restore_dashboard_version(email, "dash-1", version["id"])

    t0 = time.monotonic()
    restored, timed_out, exc = _run_with_timeout(do_restore, timeout_s=3.0)
    elapsed = time.monotonic() - t0

    assert not timed_out, (
        f"restore_dashboard_version DEADLOCKED — did not return within 3s "
        f"(elapsed {elapsed:.2f}s). Likely cause: the function re-acquires "
        f"the non-reentrant _lock (threading.Lock) while still holding it. "
        f"Fix: use _lock.RLock, OR restructure so the inner save_dashboard_version "
        f"call happens outside the `with _lock:` block, OR inline the version-write "
        f"logic into restore_dashboard_version using a private no-lock helper."
    )
    assert exc is None, f"restore_dashboard_version raised: {exc!r}"
    assert restored is not None, "restored dashboard should not be None"
    assert restored["id"] == "dash-1"
    assert restored["name"] == "Old Name", (
        f"restored dashboard name should be 'Old Name' from the snapshot, "
        f"got {restored.get('name')!r}"
    )


def test_refresh_after_restore_still_works(tmp_path):
    """Regression guard: after a (successful) restore, the next call to
    list_dashboards / load the dashboard must also complete. If the
    _lock is still held by a frozen thread, this will hang too.

    This reproduces the user's second symptom: "upon refreshing the page,
    it never loads".
    """
    user_storage = _make_temp_storage(tmp_path)

    email = "refresh-test@example.com"
    dashboards = [
        {
            "id": "dash-2",
            "name": "Refresh Test",
            "created_at": "2026-04-12T00:00:00Z",
            "updated_at": "2026-04-12T00:00:00Z",
            "tabs": [{"id": "tab-1", "name": "t", "sections": []}],
            "annotations": [],
        }
    ]
    user_storage._backend.write_json(
        user_storage._dashboards_key(email), dashboards, atomic=True
    )

    snapshot = {"name": "Older", "tabs": []}
    version = user_storage.save_dashboard_version(
        email, "dash-2", snapshot, label="s"
    )

    def restore_then_list():
        r = user_storage.restore_dashboard_version(email, "dash-2", version["id"])
        # Simulate the page refresh fetching the dashboard list
        return r, user_storage.list_dashboards(email)

    _, timed_out, exc = _run_with_timeout(restore_then_list, timeout_s=5.0)
    assert not timed_out, (
        "restore followed by list_dashboards DEADLOCKED — the lock was "
        "never released, so the refresh call cannot acquire it either."
    )
    assert exc is None, f"unexpected exception: {exc!r}"
