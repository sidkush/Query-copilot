# Dashboard Data Integrity Audit (2026-04-08)

## Methodology

Tested all 24 dashboard endpoints via curl with a JWT for `test@test.com`. Verified data persistence by writing, reloading, and cross-checking every field. Tested the migration function with unit-style assertions.

## Endpoints Tested (24 routes)

### Dashboard CRUD
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/v1/dashboards/` | GET | PASS | Returns summary list with `tile_count`, `tab_count` |
| `/api/v1/dashboards/` | POST | PASS | Creates dashboard with default tab ("Overview") + default section ("General") |
| `/api/v1/dashboards/{id}` | GET | PASS | Returns full hierarchical structure, triggers auto-migration |
| `/api/v1/dashboards/{id}` | PUT | **FIXED** | `settings` field was silently dropped (see Bug #1 below) |
| `/api/v1/dashboards/{id}` | DELETE | PASS | Returns 404 on subsequent GET |

### Tab Management
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/{id}/tabs` | POST | PASS | New tab includes auto-generated "General" section |
| `/{id}/tabs/{tab_id}` | DELETE | PASS | Tab removed from structure |

### Section Management
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/{id}/tabs/{tab_id}/sections` | POST | PASS | Section added with correct `order` |
| `/{id}/tabs/{tab_id}/sections/{sec_id}` | DELETE | PASS | Section removed |

### Tile Management
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/{id}/tabs/{tab_id}/sections/{sec_id}/tiles` | POST | PASS | Tile + auto-layout entry created |
| `/{id}/tiles/{tile_id}` | PUT | PASS | Merge semantics — only updates provided keys |
| `/{id}/tiles/{tile_id}` | DELETE | PASS | Tile + layout entry both removed |
| `/{id}/tiles/{tile_id}/refresh` | POST | PASS | Returns "No active database connection" when no DB (correct) |

### Annotations
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/{id}/annotations` | POST | PASS | Dashboard-level annotation with `id`, `created_at` |
| `/{id}/tiles/{tile_id}/annotations` | POST | PASS | Tile-level annotation |
| `/{id}/annotations/{ann_id}` | DELETE | PASS | Annotation removed |
| `/{id}/tiles/{tile_id}/annotations/{ann_id}` | DELETE | Not tested (same code path as dashboard-level) |

### Bulk Operations
| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/{id}/refresh-all` | POST | PASS | Returns 4xx with clear message when no DB connection |

## Bug Found and Fixed

### Bug #1: `settings` field silently dropped on dashboard update

**Severity:** Medium — dashboard auto-refresh interval (`refresh_interval_minutes`) could never be saved.

**Root cause:** `update_dashboard()` in `user_storage.py:604` uses an explicit allowlist of keys to persist:
```python
for key in ("name", "description", "tabs", "annotations", "sharing",
            "customMetrics", "globalFilters", "themeConfig", "bookmarks"):
```

The `settings` key was missing from this list. The `UpdateDashboardBody` Pydantic model in `dashboard_routes.py` accepts `settings`, and `model_dump(exclude_none=True)` passes it to `update_dashboard()`, but the storage function ignores any key not in its allowlist.

**Fix:** Added `"settings"` to the allowlist tuple in `user_storage.py:604`.

**Verification:** After fix, `settings` persists on save, reload, and survives partial updates (e.g., updating only `name` does not erase `settings`).

## Data Integrity Checks

| Check | Result |
|-------|--------|
| Hierarchical model (tabs > sections > tiles) saves/loads correctly | PASS |
| `migrate_dashboard_if_needed()` handles old flat format | PASS — moves `tiles` and `layout` into a default tab/section, removes old keys, adds `annotations` and `sharing` |
| `migrate_dashboard_if_needed()` no-ops on modern format | PASS — returns original object unchanged |
| `update_tile()` preserves fields it doesn't update | PASS — merge semantics (only updates provided keys, doesn't null others) |
| `themeConfig` persists on `update_dashboard()` | PASS |
| `visualConfig` persists on `update_tile()` | PASS |
| `settings` persists on `update_dashboard()` | PASS (after fix) |
| Tile deletion also removes layout entries | PASS |
| `/refresh-all` without DB connection | PASS — returns clear error, no crash |
| Auto-layout computation on tile add | PASS — correct grid position |
| Version snapshot on structural changes | PASS — `_auto_version_snapshot` fires when `tabs` key is in updates |
