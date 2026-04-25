# Known Issues

Tracked bugs not yet assigned to a plan. File new entries here; promote to a plan task when scheduled.

---

## Open

### BUG-001 — query_memory tmp-file race on Windows (WinError 183)
**Observed:** 2026-04-25  
**Conn:** 729f5e28  
**Error:** `[WinError 183] Cannot create a file when that file already exists: '...query_patterns\729f5e28_<rand>.json.tmp' -> '.data\query_patterns\729f5e28.json'`  
**Root cause:** `os.replace(tmp, dest)` fails on Windows when another thread holds `dest` open. The atomic-write pattern (`write tmp → replace`) works on POSIX (replace is atomic) but not Windows (replace requires no open handles on target).  
**Impact:** Query pattern writes silently dropped under concurrent load. Self-learning degrades. Non-fatal.  
**Fix sketch:** Retry `os.replace` up to 3× with 50ms jitter, or use `pathlib.Path.rename` inside a `try/except FileExistsError` loop.  
**Priority:** P3 — Windows dev-only until prod moves to Linux container.
