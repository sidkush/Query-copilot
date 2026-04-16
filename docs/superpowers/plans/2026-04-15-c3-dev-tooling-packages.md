# Sub-project C Phase C3 — Dev Tooling + Package Format

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the import/export pipeline for `.askdbviz` packages, the `?dev-viz=` dev mode for live-reloading custom chart types, and backend validation for package integrity.

**Architecture:** New backend module `askdbviz_package.py` handles ZIP extraction, manifest validation, SHA-256 hash verification, and bundle extraction. Two new endpoints: `POST /api/v1/chart-types/import` (upload ZIP) and `GET /api/v1/chart-types/export/{id}` (download ZIP). Frontend gains `?dev-viz=` query param handling that loads a remote bundle URL into `IframeChartHost` for live development. The `create-askdb-viz` npm scaffolding is documented but not shipped as a separate package in this phase.

**Tech Stack:** Python (zipfile, hashlib), FastAPI (file upload/download), React (dev mode detection).

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-c-design.md`](../specs/2026-04-15-chart-system-sub-project-c-design.md) §4, §6, §Phase C3.

---

## File Structure

### New backend files
```
backend/
  askdbviz_package.py                    # ZIP extraction, manifest validation, hash verification
  tests/
    test_askdbviz_package.py             # Package validation + round-trip tests
```

### Modified backend files
```
backend/
  routers/chart_customization_routes.py  # +import/export endpoints
```

### New frontend files
```
frontend/src/
  components/chartTypes/DevVizLoader.jsx # ?dev-viz= query param handler
```

### Modified frontend files
```
frontend/src/
  components/editor/EditorCanvas.jsx     # Mount DevVizLoader when ?dev-viz= present
```

---

## Task 1: Backend `askdbviz_package.py` — ZIP handling + validation

**Files:**
- Create: `backend/askdbviz_package.py`
- Create: `backend/tests/test_askdbviz_package.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_askdbviz_package.py
"""Tests for .askdbviz package validation and extraction."""
import io
import json
import hashlib
import zipfile
import pytest
from askdbviz_package import (
    validate_package,
    extract_package,
    build_package,
    PackageValidationError,
)


def _make_manifest(tier="spec", **overrides):
    m = {
        "$schema": "askdb/chart-type-manifest/v1",
        "id": "test:sample",
        "name": "Sample Chart",
        "version": "1.0.0",
        "tier": tier,
        "category": "Test",
        "capabilities": {"dataRoles": []},
    }
    if tier == "spec":
        m["specTemplate"] = {"$schema": "askdb/chart-spec/v1", "type": "cartesian", "mark": "bar"}
        m["parameters"] = [{"name": "x", "kind": "field"}]
    elif tier == "code":
        m["entryPoint"] = "./index.js"
    m.update(overrides)
    return m


def _make_zip(manifest, bundle_content=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        if bundle_content is not None:
            zf.writestr("index.js", bundle_content)
            # Add hash
            manifest["hash"] = "sha256:" + hashlib.sha256(bundle_content.encode()).hexdigest()
            zf.writestr("manifest.json", json.dumps(manifest))
    buf.seek(0)
    return buf.read()


class TestValidatePackage:
    def test_accepts_valid_spec_package(self):
        data = _make_zip(_make_manifest("spec"))
        result = validate_package(data)
        assert result["valid"]
        assert result["manifest"]["id"] == "test:sample"

    def test_accepts_valid_code_package(self):
        manifest = _make_manifest("code")
        data = _make_zip(manifest, "console.log('hello');")
        result = validate_package(data)
        assert result["valid"]

    def test_rejects_missing_manifest(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("readme.txt", "no manifest here")
        buf.seek(0)
        with pytest.raises(PackageValidationError, match="manifest.json"):
            validate_package(buf.read())

    def test_rejects_invalid_manifest_json(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", "not json{{{")
        buf.seek(0)
        with pytest.raises(PackageValidationError, match="JSON"):
            validate_package(buf.read())

    def test_rejects_missing_required_fields(self):
        manifest = {"id": "test:x"}  # missing name, version, tier
        data = _make_zip(manifest)
        with pytest.raises(PackageValidationError, match="name"):
            validate_package(data)

    def test_rejects_code_package_without_bundle(self):
        manifest = _make_manifest("code")
        data = _make_zip(manifest, bundle_content=None)
        with pytest.raises(PackageValidationError, match="index.js"):
            validate_package(data)

    def test_rejects_hash_mismatch(self):
        manifest = _make_manifest("code", hash="sha256:0000000000000000")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("index.js", "console.log('tampered');")
        buf.seek(0)
        with pytest.raises(PackageValidationError, match="hash"):
            validate_package(buf.read())


class TestExtractPackage:
    def test_extracts_manifest_and_bundle(self):
        manifest = _make_manifest("code")
        data = _make_zip(manifest, "var x = 1;")
        result = extract_package(data)
        assert result["manifest"]["id"] == "test:sample"
        assert result["bundle"] == "var x = 1;"

    def test_extracts_spec_package_without_bundle(self):
        data = _make_zip(_make_manifest("spec"))
        result = extract_package(data)
        assert result["manifest"]["tier"] == "spec"
        assert result["bundle"] is None


class TestBuildPackage:
    def test_round_trips_spec_package(self):
        manifest = _make_manifest("spec")
        zip_bytes = build_package(manifest)
        result = validate_package(zip_bytes)
        assert result["valid"]
        assert result["manifest"]["id"] == "test:sample"

    def test_round_trips_code_package(self):
        manifest = _make_manifest("code")
        bundle = "console.log('chart');"
        zip_bytes = build_package(manifest, bundle=bundle)
        extracted = extract_package(zip_bytes)
        assert extracted["bundle"] == bundle
```

- [ ] **Step 2: Implement `askdbviz_package.py`**

```python
# backend/askdbviz_package.py
"""
askdbviz_package.py — .askdbviz ZIP package handling.

Validates, extracts, and builds .askdbviz packages for user-authored
chart types. Each package is a ZIP containing:
  - manifest.json (required)
  - index.js (required for tier: code)
  - icon.svg, preview.png, README.md (optional)
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import zipfile
from typing import Any, Optional

logger = logging.getLogger(__name__)


class PackageValidationError(Exception):
    pass


REQUIRED_MANIFEST_FIELDS = {"id", "name", "version", "tier"}


def validate_package(zip_bytes: bytes) -> dict[str, Any]:
    """Validate a .askdbviz ZIP package.

    Returns {"valid": True, "manifest": dict} on success.
    Raises PackageValidationError on failure.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes), "r")
    except zipfile.BadZipFile:
        raise PackageValidationError("Not a valid ZIP file")

    if "manifest.json" not in zf.namelist():
        raise PackageValidationError("Package missing manifest.json")

    try:
        manifest = json.loads(zf.read("manifest.json"))
    except (json.JSONDecodeError, ValueError) as exc:
        raise PackageValidationError(f"manifest.json is not valid JSON: {exc}")

    if not isinstance(manifest, dict):
        raise PackageValidationError("manifest.json must be a JSON object")

    for field in REQUIRED_MANIFEST_FIELDS:
        if not manifest.get(field):
            raise PackageValidationError(f"manifest.json missing required field: {field}")

    tier = manifest.get("tier")

    if tier == "code":
        entry = manifest.get("entryPoint", "./index.js").lstrip("./")
        if entry not in zf.namelist():
            raise PackageValidationError(
                f"Code package declares entryPoint '{entry}' but index.js not found in ZIP"
            )
        # Verify hash if present
        declared_hash = manifest.get("hash", "")
        if declared_hash and declared_hash.startswith("sha256:"):
            bundle_bytes = zf.read(entry)
            actual = "sha256:" + hashlib.sha256(bundle_bytes).hexdigest()
            if actual != declared_hash:
                raise PackageValidationError(
                    f"Bundle hash mismatch: declared {declared_hash[:30]}... vs actual {actual[:30]}..."
                )

    zf.close()
    return {"valid": True, "manifest": manifest}


def extract_package(zip_bytes: bytes) -> dict[str, Any]:
    """Extract manifest + bundle from a validated .askdbviz package."""
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes), "r")
    manifest = json.loads(zf.read("manifest.json"))

    bundle = None
    if manifest.get("tier") == "code":
        entry = manifest.get("entryPoint", "./index.js").lstrip("./")
        if entry in zf.namelist():
            bundle = zf.read(entry).decode("utf-8", errors="replace")

    zf.close()
    return {"manifest": manifest, "bundle": bundle}


def build_package(
    manifest: dict[str, Any],
    bundle: Optional[str] = None,
    icon: Optional[bytes] = None,
) -> bytes:
    """Build a .askdbviz ZIP package from manifest + optional bundle."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add hash for code bundles
        if bundle and manifest.get("tier") == "code":
            manifest = {**manifest}
            manifest["hash"] = "sha256:" + hashlib.sha256(bundle.encode()).hexdigest()

        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

        if bundle:
            entry = manifest.get("entryPoint", "./index.js").lstrip("./")
            zf.writestr(entry, bundle)

        if icon:
            zf.writestr("icon.svg", icon)

    buf.seek(0)
    return buf.read()
```

- [ ] **Step 3: Run tests — expect 10 passed**

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1" && git add backend/askdbviz_package.py backend/tests/test_askdbviz_package.py && git commit -m "feat(c3): askdbviz_package.py — ZIP validation, extraction, building for .askdbviz chart type packages"
```

---

## Task 2: Import/Export REST endpoints

**Files:**
- Modify: `backend/routers/chart_customization_routes.py`

- [ ] **Step 1: Add import endpoint**

```python
from fastapi import UploadFile, File
from fastapi.responses import Response as RawResponse

@router.post("/chart-types/import")
async def import_chart_type(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Import a .askdbviz package — validate, extract, register."""
    email = _require_email(user)
    from askdbviz_package import validate_package, extract_package, PackageValidationError

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=413, detail="Package too large (max 10MB)")

    try:
        validate_package(content)
    except PackageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    extracted = extract_package(content)
    manifest = extracted["manifest"]

    # Build chart type entry from manifest
    chart_type = {
        "id": manifest["id"],
        "name": manifest["name"],
        "description": manifest.get("description", ""),
        "category": manifest.get("category", "Imported"),
        "schemaVersion": 1,
        "tier": manifest.get("tier", "spec"),
        "version": manifest.get("version", "1.0.0"),
    }
    if manifest.get("tier") == "spec":
        chart_type["parameters"] = manifest.get("parameters", [])
        chart_type["specTemplate"] = manifest.get("specTemplate", {})
    elif manifest.get("tier") == "code":
        chart_type["bundle"] = extracted.get("bundle", "")
        chart_type["capabilities"] = manifest.get("capabilities", {})

    saved = save_chart_type(email, chart_type)
    return {"chart_type": saved, "manifest": manifest}
```

- [ ] **Step 2: Add export endpoint**

```python
@router.get("/chart-types/export/{type_id}")
async def export_chart_type(type_id: str, user: dict = Depends(get_current_user)):
    """Export an installed chart type as .askdbviz package."""
    email = _require_email(user)
    from askdbviz_package import build_package

    types = list_chart_types(email)
    chart_type = next((t for t in types if t.get("id") == type_id), None)
    if not chart_type:
        raise HTTPException(status_code=404, detail=f"Chart type '{type_id}' not found")

    manifest = {
        "$schema": "askdb/chart-type-manifest/v1",
        "id": chart_type["id"],
        "name": chart_type.get("name", ""),
        "description": chart_type.get("description", ""),
        "version": chart_type.get("version", "1.0.0"),
        "category": chart_type.get("category", "Custom"),
        "tier": chart_type.get("tier", "spec"),
        "capabilities": chart_type.get("capabilities", {}),
    }
    bundle = None
    if chart_type.get("tier") == "spec":
        manifest["specTemplate"] = chart_type.get("specTemplate", {})
        manifest["parameters"] = chart_type.get("parameters", [])
    elif chart_type.get("tier") == "code":
        manifest["entryPoint"] = "./index.js"
        bundle = chart_type.get("bundle")

    zip_bytes = build_package(manifest, bundle=bundle)
    safe_name = type_id.replace(":", "-").replace("/", "-")
    return RawResponse(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.askdbviz"'},
    )
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add backend/routers/chart_customization_routes.py && git commit -m "feat(c3): import/export endpoints for .askdbviz packages"
```

---

## Task 3: Frontend `DevVizLoader` — `?dev-viz=` query param handler

**Files:**
- Create: `frontend/src/components/chartTypes/DevVizLoader.jsx`
- Modify: `frontend/src/components/editor/EditorCanvas.jsx`

- [ ] **Step 1: Create `DevVizLoader.jsx`**

Reads the `?dev-viz=<url>` query param, fetches the bundle from that URL, and renders `<IframeChartHost>` with the fetched bundle. Shows a yellow "Dev Viz" badge.

```jsx
import { useState, useEffect } from 'react';
import IframeChartHost from './IframeChartHost';

/**
 * DevVizLoader — loads a chart type bundle from a dev server URL.
 *
 * Activated when ?dev-viz=http://localhost:PORT is present in the URL.
 * Fetches the bundle, re-fetches on WebSocket "reload" messages from
 * the dev server (hot reload).
 */
export default function DevVizLoader({ devUrl, data, viewport, theme }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!devUrl) return;

    let cancelled = false;

    async function loadBundle() {
      setLoading(true);
      try {
        const resp = await fetch(devUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        if (!cancelled) {
          setBundle(text);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBundle();

    // Hot reload: listen for WebSocket notification from dev server
    let ws = null;
    try {
      const wsUrl = devUrl.replace(/^http/, 'ws').replace(/\/[^/]*$/, '/ws');
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        if (e.data === 'reload') loadBundle();
      };
      ws.onerror = () => {}; // Dev server may not support WS — silently ignore
    } catch {
      // WebSocket not available — no hot reload, manual refresh only
    }

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [devUrl]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading dev viz from {devUrl}...
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="dev-viz-error" style={{
        padding: 24, textAlign: 'center', color: '#f59e0b', fontSize: 13,
        border: '1px dashed #f59e0b', borderRadius: 8, margin: 16,
      }}>
        Dev Viz Error: {error}
        <br />
        <code style={{ fontSize: 11 }}>{devUrl}</code>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Dev badge */}
      <div style={{
        position: 'absolute', top: 6, left: 6, zIndex: 50,
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        background: '#f59e0b', color: '#000',
      }}>
        DEV VIZ
      </div>
      <IframeChartHost
        bundle={bundle}
        data={data}
        viewport={viewport}
        theme={theme}
        config={{}}
        renderTimeout={10000}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire into EditorCanvas**

In `EditorCanvas.jsx`, add detection for `?dev-viz=` query param. At the top of the component:

```javascript
import DevVizLoader from '../chartTypes/DevVizLoader';

// Check for dev-viz query param
const devVizUrl = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('dev-viz')
  : null;
```

If `devVizUrl` is present, short-circuit the entire renderer dispatch and render `<DevVizLoader>` instead:

```jsx
if (devVizUrl) {
  return (
    <div style={{ ...canvasStyle, position: 'relative' }}>
      <DevVizLoader devUrl={devVizUrl} data={resultSet} viewport={viewport} theme={theme} />
    </div>
  );
}
```

Place this check early in the render function, before the spec routing logic.

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/chartTypes/DevVizLoader.jsx frontend/src/components/editor/EditorCanvas.jsx && git commit -m "feat(c3): DevVizLoader — ?dev-viz= query param for live-reloading custom chart development"
```

---

## Task 4: API wiring for import/export

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add import/export API functions**

```javascript
importChartType: (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE}/chart-types/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: formData,
  }).then(r => r.json());
},
exportChartType: (typeId) => {
  return fetch(`${API_BASE}/chart-types/export/${encodeURIComponent(typeId)}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  }).then(r => r.blob());
},
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/api.js && git commit -m "feat(c3): import/export API functions for .askdbviz packages"
```

---

## Task 5: Phase C3 checkpoint

- [ ] **Step 1: Run package tests**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/test_askdbviz_package.py -v 2>&1 | tail -15
```

- [ ] **Step 2: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 3: Tag**

```bash
cd "QueryCopilot V1" && git tag c3-dev-tooling
```
