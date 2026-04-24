# Adversarial Review — Phase M-alt (sqlglot Dialect Bridge)

**Date:** 2026-06-18  
**Verdict: PASS** — all P0/P1 fixed, rebreak clean, P2–P4 documented  
**Coverage:** 7/7 clusters SOLID after fixes

---

## Triage Table

| Priority | Operative | Severity | Blast Radius | Finding | Reproduce | Fixed |
|---|---|---|---|---|---|---|
| P0 | Phantom Injector + Architect Void + Alchemist (5 analysts) | critical | LATERAL | `load_manifest` had no engine-name validation — `engine="../etc/passwd"` could traverse to arbitrary file | `load_manifest("../etc/passwd")` → path resolved outside `_MANIFEST_DIR` | ✅ commit `933edae` → allowlist regex + `is_relative_to` guard |
| P0 | Ghost in Auth + Sigil Wraith + Regression Phantom (3 analysts) | critical | SYSTEMIC | `_check_must_route_capability` interpolated `engine`/`feature` directly into regex without `re.escape` — regex metachar injection via oracle JSON | oracle `{"engine": ".*", "feature": ".*"}` → pattern matches any string, always passes | ✅ commit `0705d0c` → `re.escape(engine)`, `re.escape(feature)` |
| P1 | Null Epoch + Seraphex + Paradox | high | LATERAL | `out == sql` in `_transpile_for_live_tier` fires `transpile_failure` alert when transpile succeeds but output is identical (e.g. `SELECT 1` bigquery→postgres) — false-positive alert storm | `_transpile_for_live_tier("SELECT 1", "bigquery", "postgres", "t1")` → `out == sql` True → alert fires | ✅ commit `0705d0c` → `transpile_checked()` returns `(str, bool)` failed flag |
| P1 | Professor Overflow | high | CONTAINED | `sqlglot.transpile(...)[0]` raises `IndexError` on empty-result (comment-only input, e.g. `"--"`) — unhandled exception escapes to query path | `transpile("--", source="bigquery", target="duckdb")` → `results = []` → `[][0]` → IndexError | ✅ commit `0705d0c` → `results[0] if results else sql` |
| P2 | Ouroboros | medium | CONTAINED | Marker check in `_check_must_transpile_clean` uses substring not anchor — marker embedded in SQL body passes grader | Oracle with `targets=["duckdb"]` + SQL body containing `/* transpile_ok: bigquery->duckdb=true */` passes even if it's just a comment in the generated SQL | Documented — markers are tester-controlled comments, not attacker-controlled. Low real risk. |
| P3 | Lethe | low | CONTAINED | `dialect_capabilities` manifests have no schema validation — misspelled `"turbo_safe"` key silently defaults to `False` | `{"turbo_saffe": true}` loads without error | Documented — manifests are static files committed to repo, not runtime input. |
| P4 | Voltgrieve | low | CONTAINED | No rate limiting on manifest loads — theoretically callable in a tight loop from trusted internal code | Tight loop calling `load_manifest("bigquery")` 1M times | Backlog — manifests cached by caller (waterfall_router reads once per routing decision). |

---

## Clean Operatives (confirmed SOLID)

Baron Von CSRF, Phantom Interval, Vector Lace, Tantalus, Sisyphus, Malvareth, Meridian, Lethe (P4 only)

---

## Unanimous Weaknesses

None after fixes. No class of issue reached ≥15/20 analysts.

---

## Strong Attack Signal

**Path traversal** (5 analysts, Cluster I + VI) — structural; resolved with allowlist + `is_relative_to`.  
**Regex injection** (3 analysts, Cluster I + VII) — resolved with `re.escape`.

---

## Rebreak Results

- Path traversal (3 analysts re-dispatched): CLEAN — `load_manifest("../x")` → `CapabilityUnknown: invalid engine name`
- Regex injection (3 analysts re-dispatched): CLEAN — `re.escape` prevents pattern from matching arbitrary strings  
- `out == sql` (3 analysts re-dispatched): CLEAN — `transpile_checked` returns `failed=False` for identity transpile

---

## UFSD Record

```
## UFSD adversarial-testing 2026-06-18
Verdict: PASS | Coverage: 7/7 clusters SOLID
Contradictions: None (no PROVISIONAL findings)
Detail:
  P0-1 path traversal: load_manifest("../etc/passwd") → fixed with _SAFE_ENGINE_RE + is_relative_to (commit 933edae)
  P0-2 regex injection: re.escape missing on engine/feature oracle fields → fixed (commit 0705d0c)
  P1-1 false-positive alert: out==sql ambiguity → fixed with transpile_checked bool (commit 0705d0c)
  P1-2 IndexError: sqlglot empty result list → fixed with results[0] if results else sql (commit 0705d0c)
```
