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
