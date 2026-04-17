"""Dashboard migration — convert legacy tile configs to ChartSpec IR.

Sub-project A Phase 4b cutover helper. Reads a user's dashboards from
user_storage, walks every tile, generates an equivalent ChartSpec, and
writes the result back. Idempotent — tiles that already carry a
`chart_spec` key are skipped. Backs up the pre-migration snapshot to
`.data/user_data/{hash}/dashboards.backup.{timestamp}.json` so a
migration failure can be rolled back.

The conversion logic (legacy_to_chart_spec) is pure and unit-testable
independent of the user_storage layer. See tests/test_dashboard_migration.py.
"""
from __future__ import annotations

import copy
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# ─── legacy → ChartSpec converter ──────────────────────────────────────

# Legacy chartType values that map directly to a Vega-Lite mark.
_MARK_MAP: dict[str, str] = {
    "bar": "bar",
    "column": "bar",  # legacy synonym
    "line": "line",
    "area": "area",
    "scatter": "point",
    "point": "point",
    "pie": "arc",
    "donut": "arc",
    "heatmap": "rect",
    "histogram": "bar",
    "box": "boxplot",
    "boxplot": "boxplot",
    "gauge": "arc",
    "text": "text",
    "table": "text",
}

# Default semantic types inferred from dtype strings we see in the
# legacy tile payload. Anything unrecognized falls back to 'nominal'.
_DTYPE_TO_SEMANTIC: dict[str, str] = {
    "int": "quantitative",
    "int64": "quantitative",
    "float": "quantitative",
    "float64": "quantitative",
    "number": "quantitative",
    "decimal": "quantitative",
    "date": "temporal",
    "datetime": "temporal",
    "timestamp": "temporal",
    "time": "temporal",
    "bool": "nominal",
    "boolean": "nominal",
    "string": "nominal",
    "str": "nominal",
    "text": "nominal",
    "varchar": "nominal",
    "category": "nominal",
}


_FREEFORM_TILE_TYPES = {
    "worksheet", "text", "image", "webpage", "blank",
    "container-horz", "container-vert",
}

_MIN_PROPORTION = 1000  # must match frontend zoneTreeOps MIN_PROPORTION


def _is_floating_tile(tile: dict) -> bool:
    """True when tile carries x/y/w/h numeric coords like a legacy freeform widget."""
    return all(isinstance(tile.get(k), (int, float)) for k in ("x", "y", "w", "h"))


def _is_corrupt_tile(tile: dict) -> bool:
    """True when tile is unusable — not a dict, or missing id."""
    if not isinstance(tile, dict):
        return True
    if tile.get("id") in (None, ""):
        return True
    return False


def _resolve_tile_type(tile: dict) -> str:
    """Pick the zone type for a legacy tile."""
    raw = tile.get("type")
    if raw in _FREEFORM_TILE_TYPES:
        return raw
    if tile.get("chart_spec") or tile.get("chartSpec") or tile.get("sql"):
        return "worksheet"
    if tile.get("title") and not raw:
        return "worksheet"  # title-only (case c) — renderer handles null chart
    return "blank"  # unknown legacy type (case e)


def _normalize_child_proportion(value, fallback: int) -> int:
    """Clamp a proportion value to >= _MIN_PROPORTION. Non-numeric falls back."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = fallback
    return max(_MIN_PROPORTION, n)


def _safe_int(value, default: int) -> int:
    """Coerce value to int, returning `default` on None / non-numeric input."""
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


@dataclass
class MigrationStats:
    tiles_total: int = 0
    tiles_migrated: int = 0
    tiles_skipped_existing: int = 0
    tiles_skipped_unconvertible: int = 0
    errors: list[str] = field(default_factory=list)


def _infer_semantic_type(dtype: str | None, role_hint: str | None = None) -> str:
    if role_hint == "measure":
        return "quantitative"
    if not dtype:
        return "nominal"
    return _DTYPE_TO_SEMANTIC.get(str(dtype).lower(), "nominal")


def legacy_to_chart_spec(tile: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a single legacy tile dict to a ChartSpec dict.

    Returns None when the tile can't be meaningfully converted (e.g.
    tile has no chartType, no columns, or is a raw-SQL preview with
    no visualization intent).
    """
    chart_type = (tile.get("chartType") or tile.get("chart_type") or "").lower()
    if not chart_type:
        return None

    mark = _MARK_MAP.get(chart_type)
    if not mark:
        # Unknown legacy type — default to bar so the tile still
        # renders. A more surgical version could skip, but losing
        # tiles silently is worse than a default visualization.
        mark = "bar"

    columns: list[Any] = tile.get("columns") or []
    if not columns:
        return None

    # Normalize columns — legacy stores either strings or {name,dtype}
    # objects. Collect (name, dtype) tuples.
    norm_cols: list[tuple[str, str | None]] = []
    for c in columns:
        if isinstance(c, str):
            norm_cols.append((c, None))
        elif isinstance(c, dict):
            name = c.get("name") or c.get("field")
            if name:
                norm_cols.append((str(name), c.get("dtype") or c.get("type")))
    if not norm_cols:
        return None

    selected_measure = tile.get("selectedMeasure") or tile.get("selected_measure")

    # Pick X and Y columns:
    #   X: first column (assumed dimension)
    #   Y: selectedMeasure, else first column whose dtype looks numeric,
    #      else the second column.
    x_col = norm_cols[0]
    y_col: tuple[str, str | None] | None = None
    if selected_measure:
        y_col = next((c for c in norm_cols if c[0] == selected_measure), None)
    if y_col is None:
        for c in norm_cols[1:]:
            if _infer_semantic_type(c[1]) == "quantitative":
                y_col = c
                break
    if y_col is None and len(norm_cols) >= 2:
        y_col = norm_cols[1]
    if y_col is None:
        # Single-column chart — rare but not impossible (e.g. histogram
        # over one numeric column). Fall back to x + count aggregate.
        y_col = (x_col[0], "int")

    encoding: dict[str, Any] = {
        "x": {
            "field": x_col[0],
            "type": _infer_semantic_type(x_col[1], "dimension"),
        },
        "y": {
            "field": y_col[0],
            "type": _infer_semantic_type(y_col[1], "measure"),
            "aggregate": "sum",
        },
    }

    # If there are multiple active measures, add the remaining ones as
    # a color encoding via Vega-Lite's fold-based multi-series idiom.
    # For Phase 4b we take the simpler path: color by the first
    # non-X/Y nominal column if present.
    if len(norm_cols) > 2:
        extra = next(
            (
                c
                for c in norm_cols[2:]
                if _infer_semantic_type(c[1]) in ("nominal", "ordinal")
            ),
            None,
        )
        if extra:
            encoding["color"] = {"field": extra[0], "type": "nominal"}

    spec: dict[str, Any] = {
        "$schema": "askdb/chart-spec/v1",
        "type": "cartesian",
        "mark": mark,
        "encoding": encoding,
    }
    if tile.get("title"):
        spec["title"] = tile["title"]
    if tile.get("subtitle"):
        spec["description"] = tile["subtitle"]
    if tile.get("palette"):
        spec.setdefault("config", {})["palette"] = tile["palette"]

    return spec


# ─── dashboard walker ──────────────────────────────────────────────────


def migrate_dashboard(dashboard: dict[str, Any]) -> MigrationStats:
    """Walk a dashboard (tabs > sections > tiles) and attach chart_spec
    to every legacy tile in-place. Returns migration stats.
    """
    stats = MigrationStats()
    tabs = dashboard.get("tabs") or []
    for tab in tabs:
        for section in tab.get("sections", []) or []:
            for tile in section.get("tiles", []) or []:
                stats.tiles_total += 1
                if tile.get("chart_spec"):
                    stats.tiles_skipped_existing += 1
                    continue
                try:
                    spec = legacy_to_chart_spec(tile)
                except Exception as e:
                    stats.errors.append(
                        f"tile {tile.get('id', '?')}: {type(e).__name__}: {e}"
                    )
                    stats.tiles_skipped_unconvertible += 1
                    continue
                if spec is None:
                    stats.tiles_skipped_unconvertible += 1
                    continue
                tile["chart_spec"] = spec
                stats.tiles_migrated += 1
    return stats


# ─── user-level entry point ────────────────────────────────────────────


def backup_dashboards(user_email: str) -> Path | None:
    """Copy the user's dashboards.json to a timestamped backup.

    Returns the backup path on success, None when no dashboards file
    exists (new users) or storage backend doesn't expose a file path.
    """
    try:
        from user_storage import _user_dir  # private but stable
    except ImportError:
        return None
    user_dir = _user_dir(user_email)
    src = user_dir / "dashboards.json"
    if not src.exists():
        return None
    ts = int(time.time())
    dst = user_dir / f"dashboards.backup.{ts}.json"
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    logger.info("dashboard_migration: backed up %s -> %s", src, dst)
    return dst


def migrate_user_dashboards(user_email: str, dashboard_id: str | None = None) -> dict[str, Any]:
    """Migrate all dashboards for a user. If dashboard_id is given,
    only that dashboard is touched. Returns a summary dict for the
    HTTP layer to return to the caller.
    """
    from user_storage import _load_dashboards, _save_dashboards  # lazy to avoid import cycles

    dashboards = _load_dashboards(user_email) or []
    if not dashboards:
        return {
            "status": "no_dashboards",
            "migrated": 0,
            "skipped_existing": 0,
            "skipped_unconvertible": 0,
            "errors": [],
            "backup_path": None,
        }

    backup_path = backup_dashboards(user_email)
    working = copy.deepcopy(dashboards)

    totals = MigrationStats()
    matched_any = False
    for dash in working:
        if dashboard_id and dash.get("id") != dashboard_id:
            continue
        matched_any = True
        stats = migrate_dashboard(dash)
        totals.tiles_total += stats.tiles_total
        totals.tiles_migrated += stats.tiles_migrated
        totals.tiles_skipped_existing += stats.tiles_skipped_existing
        totals.tiles_skipped_unconvertible += stats.tiles_skipped_unconvertible
        totals.errors.extend(stats.errors)

    if dashboard_id and not matched_any:
        return {
            "status": "dashboard_not_found",
            "dashboard_id": dashboard_id,
            "backup_path": str(backup_path) if backup_path else None,
        }

    _save_dashboards(user_email, working)

    return {
        "status": "ok",
        "tiles_total": totals.tiles_total,
        "migrated": totals.tiles_migrated,
        "skipped_existing": totals.tiles_skipped_existing,
        "skipped_unconvertible": totals.tiles_skipped_unconvertible,
        "errors": totals.errors,
        "backup_path": str(backup_path) if backup_path else None,
    }


def legacy_to_freeform_schema(legacy: dict) -> dict:
    """
    Convert a legacy dashboard (flat tile list OR sections/tiles tree) to the
    Analyst Pro freeform schema (schemaVersion='askdb/dashboard/v1').

    Edge cases handled (see Plan 4e):
      (a) zero w/h proportion clamped to _MIN_PROPORTION
      (b) x/y/w/h tiles routed to floatingLayer
      (c) title-only tiles become worksheet with displayName = title
      (d) corrupt tiles (non-dict or missing id) skipped with warning
      (e) unknown type -> blank with displayName = title or type
      (f) displayName / locked preserved verbatim
      (g) actions preserved
      (h) sets, parameters preserved (graceful when absent)
    """
    dashboard_id = legacy.get("id", "unknown")
    name = legacy.get("name", "Untitled")

    if "sections" in legacy and isinstance(legacy["sections"], list):
        tiled_root = _sections_to_vert_root(legacy["sections"])
        all_tiles = [t for s in legacy["sections"] for t in s.get("tiles", [])]
        floating_layer: list = []
    else:
        raw_tiles = legacy.get("tiles", []) or []
        tiled_tiles: list[dict] = []
        floating_tiles: list[dict] = []
        for i, t in enumerate(raw_tiles):
            if _is_corrupt_tile(t):
                logger.warning(
                    "legacy_to_freeform_schema: skipping corrupt tile at index %d: %r", i, t,
                )
                continue
            if _is_floating_tile(t):
                floating_tiles.append(t)
            else:
                tiled_tiles.append(t)
        tiled_root = _flat_tiles_to_vert_root(tiled_tiles)
        floating_layer = _tiles_to_floating_layer(floating_tiles)
        all_tiles = tiled_tiles + floating_tiles

    worksheets = [
        {
            "id": str(t.get("id", f"t{i}")),
            "chartSpec": t.get("chart_spec") or t.get("chartSpec"),
            "sql": t.get("sql"),
            "displayName": t.get("displayName") or t.get("title"),
        }
        for i, t in enumerate(all_tiles)
    ]

    existing_actions = legacy.get("actions") if isinstance(legacy.get("actions"), list) else []
    existing_sets = legacy.get("sets") if isinstance(legacy.get("sets"), list) else []
    existing_parameters = legacy.get("parameters") if isinstance(legacy.get("parameters"), list) else []

    return {
        "schemaVersion": "askdb/dashboard/v1",
        "id": str(dashboard_id),
        "name": name,
        "archetype": "analyst-pro",
        "size": {"mode": "automatic"},
        "tiledRoot": tiled_root,
        "floatingLayer": floating_layer,
        "worksheets": worksheets,
        "parameters": existing_parameters,
        "sets": existing_sets,
        "actions": existing_actions,
        "globalStyle": {},
    }


def _flat_tiles_to_vert_root(tiles: list) -> dict:
    children = []
    count = len(tiles)
    if count:
        base_h = 100000 // count
        drift = 100000 - (base_h * count)
        for i, t in enumerate(tiles):
            raw_h = t.get("h")
            fallback = base_h + (drift if i == count - 1 else 0)
            h = _normalize_child_proportion(raw_h, fallback)
            ztype = _resolve_tile_type(t)
            tid = str(t.get("id", f"t{i}"))
            child: dict = {
                "id": tid,
                "type": ztype,
                "w": 100000,
                "h": h,
            }
            if ztype == "worksheet":
                child["worksheetRef"] = tid
            if t.get("displayName") or t.get("title"):
                child["displayName"] = t.get("displayName") or t.get("title")
            if t.get("locked") is True:
                child["locked"] = True
            children.append(child)
        # Re-normalize after clamping to MIN_PROPORTION.
        sum_h = sum(c["h"] for c in children)
        if sum_h != 100000 and children:
            drift = 100000 - sum_h
            if children[-1]["h"] + drift >= _MIN_PROPORTION:
                children[-1]["h"] += drift
            # else: accept drift — renderer rescales proportionally.
    return {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": children,
    }


def _tiles_to_floating_layer(tiles: list) -> list:
    """Convert legacy tiles carrying x/y/w/h into freeform floating zones."""
    floating = []
    for i, t in enumerate(tiles):
        tid = str(t.get("id", f"f{i}"))
        ztype = _resolve_tile_type(t)
        display = t.get("displayName") or t.get("title")
        w_px = max(100, _safe_int(t.get("w"), 320))
        h_px = max(100, _safe_int(t.get("h"), 200))
        zone: dict = {
            "id": tid,
            "type": ztype,
            "w": 0,
            "h": 0,
            "floating": True,
            "x": _safe_int(t.get("x"), 0),
            "y": _safe_int(t.get("y"), 0),
            "pxW": w_px,
            "pxH": h_px,
            "zIndex": _safe_int(t.get("zIndex"), i + 1),
        }
        if ztype == "worksheet":
            zone["worksheetRef"] = tid
        if display:
            zone["displayName"] = display
        if t.get("locked") is True:
            zone["locked"] = True
        floating.append(zone)
    return floating


def _sections_to_vert_root(sections: list) -> dict:
    vert_children = []
    section_count = len([s for s in sections if s.get("tiles")])
    if section_count == 0:
        return {
            "id": "root",
            "type": "container-vert",
            "w": 100000,
            "h": 100000,
            "children": [],
        }
    base_h = 100000 // section_count
    drift = 100000 - (base_h * section_count)
    section_idx = 0
    for s in sections:
        tiles = s.get("tiles", []) or []
        if not tiles:
            continue
        h = base_h + (drift if section_idx == section_count - 1 else 0)
        horz_children = _flat_tiles_to_horz_children(tiles)
        vert_children.append({
            "id": str(s.get("id", f"s{section_idx}")),
            "type": "container-horz",
            "w": 100000,
            "h": h,
            "children": horz_children,
        })
        section_idx += 1
    return {
        "id": "root",
        "type": "container-vert",
        "w": 100000,
        "h": 100000,
        "children": vert_children,
    }


def _flat_tiles_to_horz_children(tiles: list) -> list:
    count = len(tiles)
    if count == 0:
        return []
    base_w = 100000 // count
    drift = 100000 - (base_w * count)
    children = []
    for i, t in enumerate(tiles):
        w = base_w + (drift if i == count - 1 else 0)
        children.append({
            "id": str(t.get("id", f"t{i}")),
            "type": "worksheet",
            "w": w,
            "h": 100000,
            "worksheetRef": str(t.get("id", f"t{i}")),
        })
    return children
