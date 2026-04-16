# Sub-project C Phase C4 — Community Gallery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the community gallery — a backend-hosted marketplace where users browse, install, rate, and submit custom chart types. Seed with example types.

**Architecture:** New `gallery_store.py` manages gallery index + packages in `.data/gallery/`. REST endpoints under `/api/v1/gallery/`. Frontend `ChartTypeGallery.jsx` page with card grid, search, filters, install flow. Gallery submission is upload + manual review. Signing deferred to later — v1 uses trust badges based on submission status.

**Tech Stack:** Python (JSON storage, file-based), FastAPI (REST), React (gallery UI).

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-c-design.md`](../specs/2026-04-15-chart-system-sub-project-c-design.md) §5, §Phase C4.

---

## File Structure

### New backend files
```
backend/
  gallery_store.py                       # Gallery index + package CRUD
  tests/
    test_gallery_store.py                # Gallery CRUD tests
```

### Modified backend files
```
backend/
  routers/chart_customization_routes.py  # +gallery endpoints
```

### New frontend files
```
frontend/src/
  components/chartTypes/ChartTypeGallery.jsx       # Gallery browse page
  components/chartTypes/ChartTypeGalleryCard.jsx    # Gallery card component
  components/chartTypes/ChartTypeDetail.jsx         # Detail modal/page
  pages/GalleryPage.jsx                             # Route wrapper
```

### Modified frontend files
```
frontend/src/
  App.jsx                               # +/gallery route
  api.js                                # +gallery API functions
```

---

## Task 1: Backend `gallery_store.py`

**Files:**
- Create: `backend/gallery_store.py`
- Create: `backend/tests/test_gallery_store.py`

- [ ] **Step 1: Write tests (8)**

1. `test_submit_and_list` — submit a type, list returns it
2. `test_get_by_id` — submit, get by id, verify fields
3. `test_list_with_category_filter` — submit 2 types in different categories, filter returns 1
4. `test_list_pagination` — submit 5 types, page_size=2, verify page 1 has 2, page 2 has 2, page 3 has 1
5. `test_rate_type` — rate a type, verify average updates
6. `test_download_package` — submit, download, verify bytes match
7. `test_install_count_increments` — install a type twice, verify count
8. `test_submit_rejects_invalid_package` — submit invalid ZIP, expect ValueError

Use `tmp_path` + `monkeypatch` to override storage root.

- [ ] **Step 2: Implement `gallery_store.py`**

```python
# backend/gallery_store.py
"""Gallery index + package storage for community chart types."""
import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

GALLERY_ROOT = Path(".data/gallery")
_lock = threading.Lock()


def _index_path() -> Path:
    return GALLERY_ROOT / "index.json"

def _package_dir(type_id: str, version: str) -> Path:
    safe_id = type_id.replace(":", "_").replace("/", "_")
    return GALLERY_ROOT / "packages" / safe_id / version

def _load_index() -> dict:
    path = _index_path()
    if not path.exists():
        return {"types": [], "updated_at": None}
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return {"types": [], "updated_at": None}

def _save_index(index: dict) -> None:
    GALLERY_ROOT.mkdir(parents=True, exist_ok=True)
    path = _index_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(index, indent=2, default=str), "utf-8")
    os.replace(str(tmp), str(path))


def submit_type(manifest: dict, zip_bytes: bytes, author_email: str) -> dict:
    """Submit a chart type to the gallery. Returns the gallery entry."""
    from askdbviz_package import validate_package, PackageValidationError
    try:
        validate_package(zip_bytes)
    except PackageValidationError as exc:
        raise ValueError(f"Invalid package: {exc}")

    type_id = manifest.get("id", "")
    version = manifest.get("version", "1.0.0")

    entry = {
        "id": type_id,
        "name": manifest.get("name", ""),
        "description": manifest.get("description", ""),
        "version": version,
        "category": manifest.get("category", "Community"),
        "tier": manifest.get("tier", "spec"),
        "author": author_email,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending_review",
        "installs": 0,
        "rating_sum": 0,
        "rating_count": 0,
        "rating_avg": 0.0,
        "tags": manifest.get("tags", []),
    }

    with _lock:
        # Save package bytes
        pkg_dir = _package_dir(type_id, version)
        pkg_dir.mkdir(parents=True, exist_ok=True)
        (pkg_dir / "package.askdbviz").write_bytes(zip_bytes)

        # Update index
        index = _load_index()
        # Replace existing entry with same id, or append
        index["types"] = [t for t in index["types"] if t.get("id") != type_id]
        index["types"].append(entry)
        index["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_index(index)

    return entry


def list_types(
    page: int = 1,
    page_size: int = 20,
    category: Optional[str] = None,
    tier: Optional[str] = None,
    sort: str = "recent",
) -> dict:
    """List gallery types with filters + pagination."""
    index = _load_index()
    types = index.get("types", [])

    if category:
        types = [t for t in types if t.get("category") == category]
    if tier:
        types = [t for t in types if t.get("tier") == tier]

    if sort == "popular":
        types.sort(key=lambda t: t.get("installs", 0), reverse=True)
    elif sort == "top_rated":
        types.sort(key=lambda t: t.get("rating_avg", 0), reverse=True)
    else:
        types.sort(key=lambda t: t.get("submitted_at", ""), reverse=True)

    total = len(types)
    start = (page - 1) * page_size
    page_types = types[start:start + page_size]

    return {
        "types": page_types,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size else 1,
    }


def get_type(type_id: str) -> Optional[dict]:
    """Get a single gallery type by ID."""
    index = _load_index()
    for t in index.get("types", []):
        if t.get("id") == type_id:
            return t
    return None


def download_package(type_id: str, version: Optional[str] = None) -> Optional[bytes]:
    """Download the .askdbviz package bytes."""
    if not version:
        entry = get_type(type_id)
        if not entry:
            return None
        version = entry.get("version", "1.0.0")
    pkg_path = _package_dir(type_id, version) / "package.askdbviz"
    if not pkg_path.exists():
        return None
    return pkg_path.read_bytes()


def rate_type(type_id: str, stars: int) -> Optional[dict]:
    """Rate a gallery type (1-5 stars). Returns updated entry."""
    if not 1 <= stars <= 5:
        raise ValueError("Rating must be 1-5")
    with _lock:
        index = _load_index()
        for t in index.get("types", []):
            if t.get("id") == type_id:
                t["rating_sum"] = t.get("rating_sum", 0) + stars
                t["rating_count"] = t.get("rating_count", 0) + 1
                t["rating_avg"] = round(t["rating_sum"] / t["rating_count"], 2)
                _save_index(index)
                return t
    return None


def increment_installs(type_id: str) -> None:
    """Increment install count for a gallery type."""
    with _lock:
        index = _load_index()
        for t in index.get("types", []):
            if t.get("id") == type_id:
                t["installs"] = t.get("installs", 0) + 1
                _save_index(index)
                return
```

- [ ] **Step 3: Run tests — expect 8 passed**

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1" && git add backend/gallery_store.py backend/tests/test_gallery_store.py && git commit -m "feat(c4): gallery_store.py — community gallery index + package storage with pagination, rating, install tracking"
```

---

## Task 2: Gallery REST endpoints

**Files:**
- Modify: `backend/routers/chart_customization_routes.py`

- [ ] **Step 1: Add 5 gallery endpoints**

```python
# Gallery endpoints
@router.get("/gallery/types")
async def list_gallery_types(page: int = 1, page_size: int = 20,
                              category: str = None, tier: str = None,
                              sort: str = "recent"):
    from gallery_store import list_types
    return list_types(page=page, page_size=page_size, category=category, tier=tier, sort=sort)

@router.get("/gallery/types/{type_id}")
async def get_gallery_type(type_id: str):
    from gallery_store import get_type
    entry = get_type(type_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    return entry

@router.post("/gallery/submit")
async def submit_to_gallery(file: UploadFile = File(...),
                             user: dict = Depends(get_current_user)):
    email = _require_email(user)
    from gallery_store import submit_type
    from askdbviz_package import extract_package
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Package too large")
    try:
        extracted = extract_package(content)
        entry = submit_type(extracted["manifest"], content, email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"entry": entry}

@router.get("/gallery/types/{type_id}/download")
async def download_gallery_type(type_id: str):
    from gallery_store import download_package
    data = download_package(type_id)
    if not data:
        raise HTTPException(status_code=404, detail="Package not found")
    safe = type_id.replace(":", "-").replace("/", "-")
    return RawResponse(content=data, media_type="application/zip",
                       headers={"Content-Disposition": f'attachment; filename="{safe}.askdbviz"'})

@router.post("/gallery/types/{type_id}/rate")
async def rate_gallery_type(type_id: str, body: dict,
                             user: dict = Depends(get_current_user)):
    from gallery_store import rate_type
    stars = body.get("stars")
    if not isinstance(stars, int) or not 1 <= stars <= 5:
        raise HTTPException(status_code=400, detail="stars must be 1-5")
    entry = rate_type(type_id, stars)
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    return entry
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add backend/routers/chart_customization_routes.py && git commit -m "feat(c4): gallery REST endpoints — browse, detail, submit, download, rate"
```

---

## Task 3: Frontend gallery UI + route

**Files:**
- Create: `frontend/src/components/chartTypes/ChartTypeGallery.jsx`
- Create: `frontend/src/components/chartTypes/ChartTypeGalleryCard.jsx`
- Create: `frontend/src/pages/GalleryPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add gallery API functions to `api.js`**

```javascript
listGalleryTypes: (params = {}) => api.get(`/gallery/types?${new URLSearchParams(params)}`),
getGalleryType: (id) => api.get(`/gallery/types/${encodeURIComponent(id)}`),
downloadGalleryType: (id) => fetch(`${API_BASE}/gallery/types/${encodeURIComponent(id)}/download`, {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
}).then(r => r.blob()),
submitToGallery: (file) => {
  const fd = new FormData(); fd.append('file', file);
  return fetch(`${API_BASE}/gallery/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: fd,
  }).then(r => r.json());
},
rateGalleryType: (id, stars) => api.post(`/gallery/types/${encodeURIComponent(id)}/rate`, { stars }),
installFromGallery: async (id) => {
  // Download package from gallery, then import it
  const blob = await fetch(`${API_BASE}/gallery/types/${encodeURIComponent(id)}/download`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  }).then(r => r.blob());
  const fd = new FormData(); fd.append('file', blob, `${id}.askdbviz`);
  return fetch(`${API_BASE}/chart-types/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: fd,
  }).then(r => r.json());
},
```

- [ ] **Step 2: Create `ChartTypeGalleryCard.jsx`**

Card component: icon placeholder, name, author, category badge, install count, star rating, trust badge, Install button.

- [ ] **Step 3: Create `ChartTypeGallery.jsx`**

Gallery browse page: search input, category filter chips (All, Financial, Flow, Custom, etc.), tier filter (All/Spec/Code), sort dropdown (Recent/Popular/Top Rated), paginated card grid using `ChartTypeGalleryCard`.

Fetches from `api.listGalleryTypes({page, category, tier, sort})`.

Install button calls `api.installFromGallery(id)` → shows success toast → increments install count optimistically.

- [ ] **Step 4: Create `GalleryPage.jsx` + add route**

```jsx
import ChartTypeGallery from '../components/chartTypes/ChartTypeGallery';
export default function GalleryPage() {
  return <ChartTypeGallery />;
}
```

Add `/gallery` route in `App.jsx` (lazy import, protected with AppLayout).

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/chartTypes/ChartTypeGallery.jsx frontend/src/components/chartTypes/ChartTypeGalleryCard.jsx frontend/src/pages/GalleryPage.jsx frontend/src/App.jsx frontend/src/api.js && git commit -m "feat(c4): community gallery UI — browse, search, filter, install, rate + /gallery route"
```

---

## Task 4: Phase C4 checkpoint

- [ ] **Step 1: Run gallery store tests**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/test_gallery_store.py -v 2>&1 | tail -15
```

- [ ] **Step 2: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 3: Tag**

```bash
cd "QueryCopilot V1" && git tag c4-gallery
```
