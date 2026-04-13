# UFSD — Dashboard Version History Restore Deadlock

## Summary layer
approach=extract-no-lock-helper | confidence=10 | session=2026-04-12 | outcome=RESOLVED

## Detail layer

### Debug Session 2026-04-12

**Symptom reported:**
> "Dashboard is freezing when I try to restore a previous version. Upon
> refreshing the page, it never loads."

**Mechanism (root cause):**
`user_storage.restore_dashboard_version` acquired the module-level
`_lock` (a non-reentrant `threading.Lock()`) at line 1133 and, while still
inside that critical section, called the public `save_dashboard_version`
at line 1138 — which begins with `with _lock:` at line 1095. On the same
thread, a non-reentrant `Lock.acquire()` blocks forever, so the call hung
indefinitely. Because the FastAPI endpoint was declared `async def`, the
hang happened on the event-loop thread, freezing the entire uvicorn worker
and making every subsequent request (including the next page-refresh
`list_dashboards` call) also hang. This single mechanism explained BOTH
observable symptoms (freeze on restore AND refresh never loads) — no
second bug.

**Decisions:**
- H1 (nested non-reentrant lock) chosen as ROOT_CAUSE. Counterfactual
  check confirmed `threading.Lock` is non-reentrant via CPython docs;
  the `_auto_version_snapshot` helper at line 633 already established the
  "no-lock internal helper" pattern in the same file for exactly this
  situation, but was not applied to the restore path.
- H2 (async-def-over-sync-I/O amplifier) acknowledged as a secondary
  architectural smell but NOT fixed in this session — it only matters
  because H1 creates an infinite block; normal sync I/O under async def
  doesn't freeze the loop long enough to observe.
- Fix chosen: extract `_save_version_no_lock(email, dashboard_id, snapshot, label)`
  as a private helper, make the public `save_dashboard_version` a thin
  `with _lock:` wrapper around it, and have `restore_dashboard_version`
  call `_save_version_no_lock` directly. Matches the existing
  `_auto_version_snapshot` convention. Rejected alternative: switching
  `_lock` to `RLock` — would mask the bug, be slower on hot paths, and
  break the codebase convention.

**Fix summary:**
`backend/user_storage.py` — added `_save_version_no_lock` helper (~15 lines),
made `save_dashboard_version` a thin wrapper, changed
`restore_dashboard_version` line 1162 to call the no-lock helper. Added
docstrings explicitly warning that `save_dashboard_version` must NOT be
called from inside another `with _lock:` block.

**Test added:**
`backend/tests/test_bug_restore_version_deadlock.py` — 2 tests:
1. `test_restore_dashboard_version_does_not_deadlock` — direct repro with
   3s timeout wrapper, verifies restore returns promptly.
2. `test_refresh_after_restore_still_works` — verifies the "refresh never
   loads" cascade is also gone.

Both failed pre-fix (first one hung, pytest killed manually after ~100s);
both pass post-fix in 0.29s. Full regression suite: 117 passed, zero regressions.

**Assumption outcomes:**
- ASSUMPTION: `_lock` is `threading.Lock()` not `RLock` | VALIDATED: yes
  | IMPACT: confirms re-entry deadlocks
- ASSUMPTION: `restore_version` is `async def` | VALIDATED: yes
  | IMPACT: confirms single-hang-freezes-worker cascade
- ASSUMPTION: `save_dashboard_version` takes `_lock` internally | VALIDATED: yes
  | IMPACT: direct cause of re-entry
- ASSUMPTION: `_load_dashboards` does NOT take `_lock` | VALIDATED: yes
  | IMPACT: means the worker-wide freeze must come from the event loop
  being blocked, not from the refresh path taking the same lock
- ASSUMPTION: only one location has the nested-lock pattern | VALIDATED: yes
  | SOURCE: AST scan of all 34 `_lock`-holding functions — zero other
  sites found (confirmed independently by Skeptic sub-agent via its own AST walk)

**Unvalidated assumptions (risk items):** none

**Cascade paths verified:**
- `user_storage.py:1138` → FIXED (replaced with `_save_version_no_lock` call)
- AST scan across all 34 lock-holders in `user_storage.py` → 0 other instances
- Skeptic independent AST scan → 0 other instances (corroborated)

**Skeptic verdict:** SIGN OFF
- Code review confirmed the fix matches the described mechanism
- Direct test: 2 passed in 0.26s
- Full suite: 117 passed in 3.88s
- Nested-lock scan: zero residual instances
