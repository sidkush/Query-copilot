"""
gallery_store.py — Community gallery backend storage for .askdbviz chart packages.

Index: .data/gallery/index.json  →  {"types": [...], "updated_at": "..."}
Packages: .data/gallery/packages/{safe_id}/{version}/package.askdbviz

All writes are atomic (write-then-rename). A module-level threading.Lock
serialises concurrent mutations.  Tests monkeypatch GALLERY_ROOT to a
tmp_path so production data is never touched.
"""

import json
import logging
import math
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from askdbviz_package import PackageValidationError, validate_package

logger = logging.getLogger(__name__)

# ── Module-level root — monkeypatched by tests ────────────────────────────────
GALLERY_ROOT: Path = Path(__file__).resolve().parent / ".data" / "gallery"

_lock = threading.Lock()

# ── Internal helpers ──────────────────────────────────────────────────────────

def _index_path() -> Path:
    return GALLERY_ROOT / "index.json"


def _package_dir(safe_id: str, version: str) -> Path:
    return GALLERY_ROOT / "packages" / safe_id / version


def _package_path(safe_id: str, version: str) -> Path:
    return _package_dir(safe_id, version) / "package.askdbviz"


def _safe_id(raw_id: str) -> str:
    """Convert 'namespace:name' or any string to a filesystem-safe directory name."""
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", raw_id)


def _atomic_write_json(path: Path, data: dict) -> None:
    """Write *data* as JSON to *path* via write-then-rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def _atomic_write_bytes(path: Path, data: bytes) -> None:
    """Write *data* as raw bytes to *path* via write-then-rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def _load_index() -> dict:
    """Load index.json, returning empty structure if absent or corrupt."""
    p = _index_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("gallery index corrupt; starting fresh")
    return {"types": [], "updated_at": _now()}


def _save_index(index: dict) -> None:
    index["updated_at"] = _now()
    _atomic_write_json(_index_path(), index)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Public API ────────────────────────────────────────────────────────────────

def submit_type(manifest: dict, zip_bytes: bytes, author_email: str) -> dict:
    """
    Validate and store a new chart-type package.

    Parameters
    ----------
    manifest : dict
        Caller-supplied manifest dict (used for gallery metadata).
    zip_bytes : bytes
        Raw .askdbviz ZIP bytes.
    author_email : str
        Email address of the submitting user.

    Returns
    -------
    dict
        The new gallery entry (same shape as index entries).

    Raises
    ------
    ValueError
        If the package fails validation.
    """
    try:
        result = validate_package(zip_bytes)
    except PackageValidationError as exc:
        raise ValueError(str(exc)) from exc

    validated_manifest: dict = result["manifest"]
    type_id: str = validated_manifest["id"]
    version: str = validated_manifest.get("version", "1.0.0")
    safe = _safe_id(type_id)

    with _lock:
        # Persist the ZIP
        pkg_path = _package_path(safe, version)
        _atomic_write_bytes(pkg_path, zip_bytes)

        # Build gallery entry
        entry = {
            "id": type_id,
            "name": validated_manifest.get("name", type_id),
            "description": validated_manifest.get("description", ""),
            "version": version,
            "category": validated_manifest.get("category", ""),
            "tier": validated_manifest.get("tier", "spec"),
            "author": author_email,
            "submitted_at": _now(),
            "status": "pending_review",
            "installs": 0,
            "rating_sum": 0,
            "rating_count": 0,
            "rating_avg": 0.0,
            "tags": validated_manifest.get("tags", []),
        }

        index = _load_index()
        # Replace if same id already present (re-submission / new version)
        index["types"] = [t for t in index["types"] if t["id"] != type_id]
        index["types"].append(entry)
        _save_index(index)

    return entry


def list_types(
    page: int = 1,
    page_size: int = 20,
    category: Optional[str] = None,
    tier: Optional[str] = None,
    sort: str = "recent",
) -> dict:
    """
    Return a paginated, filtered, sorted listing of gallery entries.

    Parameters
    ----------
    page : int
        1-based page number.
    page_size : int
        Number of entries per page.
    category : str | None
        Filter by category string (exact match).
    tier : str | None
        Filter by tier string (exact match).
    sort : str
        'recent'    → submitted_at descending
        'popular'   → installs descending
        'top_rated' → rating_avg descending

    Returns
    -------
    dict
        {"types": [...], "total": int, "page": int,
         "page_size": int, "total_pages": int}
    """
    with _lock:
        index = _load_index()

    items: list = index["types"]

    # Filter
    if category is not None:
        items = [t for t in items if t.get("category") == category]
    if tier is not None:
        items = [t for t in items if t.get("tier") == tier]

    # Sort
    if sort == "popular":
        items = sorted(items, key=lambda t: t.get("installs", 0), reverse=True)
    elif sort == "top_rated":
        items = sorted(items, key=lambda t: t.get("rating_avg", 0.0), reverse=True)
    else:  # "recent" default
        items = sorted(items, key=lambda t: t.get("submitted_at", ""), reverse=True)

    total = len(items)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1

    # Paginate (clamp page into valid range)
    page = max(1, min(page, total_pages))
    start = (page - 1) * page_size
    page_items = items[start : start + page_size]

    return {
        "types": page_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def get_type(type_id: str) -> Optional[dict]:
    """
    Return a single gallery entry by ID, or None if not found.
    """
    with _lock:
        index = _load_index()
    for entry in index["types"]:
        if entry["id"] == type_id:
            return entry
    return None


def download_package(type_id: str, version: Optional[str] = None) -> Optional[bytes]:
    """
    Return the raw ZIP bytes for a package, or None if not found.

    If *version* is None, the version stored in the index entry is used.
    """
    entry = get_type(type_id)
    if entry is None:
        return None

    v = version or entry.get("version", "1.0.0")
    safe = _safe_id(type_id)
    pkg_path = _package_path(safe, v)

    if not pkg_path.exists():
        return None
    return pkg_path.read_bytes()


def rate_type(type_id: str, stars: int) -> Optional[dict]:
    """
    Add a star rating (1–5) to a gallery entry and update the running average.

    Parameters
    ----------
    type_id : str
        Target gallery entry ID.
    stars : int
        1 to 5 inclusive.

    Returns
    -------
    dict | None
        Updated entry, or None if *type_id* not found.

    Raises
    ------
    ValueError
        If *stars* is outside the range [1, 5].
    """
    if stars < 1 or stars > 5:
        raise ValueError(f"stars must be between 1 and 5, got {stars!r}")

    with _lock:
        index = _load_index()
        for entry in index["types"]:
            if entry["id"] == type_id:
                entry["rating_sum"] = entry.get("rating_sum", 0) + stars
                entry["rating_count"] = entry.get("rating_count", 0) + 1
                entry["rating_avg"] = round(
                    entry["rating_sum"] / entry["rating_count"], 4
                )
                _save_index(index)
                return dict(entry)
    return None


def increment_installs(type_id: str) -> None:
    """
    Atomically increment the install counter for *type_id*.
    Silently ignores unknown IDs.
    """
    with _lock:
        index = _load_index()
        for entry in index["types"]:
            if entry["id"] == type_id:
                entry["installs"] = entry.get("installs", 0) + 1
                _save_index(index)
                return
