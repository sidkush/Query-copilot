"""
askdbviz_package.py — ZIP validation, extraction, and building for .askdbviz chart packages.

A .askdbviz package is a ZIP archive containing:
  - manifest.json  (always required)
  - <entryPoint>   (required for tier='code', e.g. index.js)
  - icon.svg       (optional)

Public API
----------
validate_package(zip_bytes) -> dict
extract_package(zip_bytes)  -> dict
build_package(manifest, bundle, icon) -> bytes

Raises PackageValidationError on any structural or integrity failure.
"""

import hashlib
import io
import json
import zipfile
from typing import Optional

__all__ = [
    "PackageValidationError",
    "validate_package",
    "extract_package",
    "build_package",
]

REQUIRED_FIELDS = {"id", "name", "version", "tier"}


class PackageValidationError(Exception):
    """Raised when a .askdbviz ZIP package fails validation."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _open_zip(zip_bytes: bytes) -> zipfile.ZipFile:
    """Open ZIP bytes; raise PackageValidationError if not a valid ZIP."""
    try:
        return zipfile.ZipFile(io.BytesIO(zip_bytes), "r")
    except zipfile.BadZipFile as exc:
        raise PackageValidationError(f"Not a valid ZIP archive: {exc}") from exc


def _read_manifest(zf: zipfile.ZipFile) -> dict:
    """Read and parse manifest.json from an open ZipFile."""
    names = zf.namelist()
    if "manifest.json" not in names:
        raise PackageValidationError("manifest.json not found in package")
    try:
        raw = zf.read("manifest.json")
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise PackageValidationError(f"manifest.json is not valid JSON: {exc}") from exc


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def validate_package(zip_bytes: bytes) -> dict:
    """
    Validate a .askdbviz ZIP package.

    Parameters
    ----------
    zip_bytes : bytes
        Raw bytes of the .askdbviz (ZIP) file.

    Returns
    -------
    dict
        {"valid": True, "manifest": <parsed manifest dict>}

    Raises
    ------
    PackageValidationError
        On any structural or integrity failure.
    """
    with _open_zip(zip_bytes) as zf:
        manifest = _read_manifest(zf)

        # Check required fields
        missing = REQUIRED_FIELDS - manifest.keys()
        if missing:
            raise PackageValidationError(
                f"manifest.json missing required fields: {sorted(missing)}"
            )

        tier = manifest["tier"]

        if tier == "code":
            entry_point = manifest.get("entryPoint")
            if not entry_point:
                raise PackageValidationError(
                    "manifest.json missing 'entryPoint' for tier='code'"
                )
            if entry_point not in zf.namelist():
                raise PackageValidationError(
                    f"entryPoint '{entry_point}' declared in manifest but not found in ZIP"
                )

            # Verify SHA-256 hash if declared
            declared_hash = manifest.get("sha256")
            if declared_hash:
                # Strip optional "sha256:" prefix
                expected = declared_hash.removeprefix("sha256:")
                bundle_bytes = zf.read(entry_point)
                actual = _sha256_hex(bundle_bytes)
                if actual != expected:
                    raise PackageValidationError(
                        f"SHA-256 mismatch for '{entry_point}': "
                        f"expected {expected}, got {actual}"
                    )

    return {"valid": True, "manifest": manifest}


def extract_package(zip_bytes: bytes) -> dict:
    """
    Extract contents of a .askdbviz ZIP package.

    Parameters
    ----------
    zip_bytes : bytes
        Raw bytes of the .askdbviz (ZIP) file.

    Returns
    -------
    dict
        {
            "manifest": <parsed manifest dict>,
            "bundle": <str (UTF-8 JS source)> | None,
        }
        bundle is None for non-code (e.g. tier='spec') packages.

    Raises
    ------
    PackageValidationError
        If the package is structurally invalid.
    """
    with _open_zip(zip_bytes) as zf:
        manifest = _read_manifest(zf)

        missing = REQUIRED_FIELDS - manifest.keys()
        if missing:
            raise PackageValidationError(
                f"manifest.json missing required fields: {sorted(missing)}"
            )

        bundle: Optional[str] = None
        if manifest.get("tier") == "code":
            entry_point = manifest.get("entryPoint")
            if entry_point and entry_point in zf.namelist():
                bundle = zf.read(entry_point).decode("utf-8")

    return {"manifest": manifest, "bundle": bundle}


def build_package(
    manifest: dict,
    bundle: Optional[str] = None,
    icon: Optional[bytes] = None,
) -> bytes:
    """
    Build a .askdbviz ZIP package from its components.

    For code packages (tier='code') with a bundle, the SHA-256 of the bundle
    is automatically computed and added to the manifest as ``sha256: "sha256:<hex>"``.
    The ``entryPoint`` key must already be set in *manifest* before calling this
    function; it determines the filename used inside the ZIP.

    Parameters
    ----------
    manifest : dict
        Package manifest.  Must satisfy the same required-field rules as
        validate_package.  Mutated in-place only to add/update ``sha256``
        for code bundles — callers that care should pass a copy.
    bundle : str | None
        JavaScript source for the entry-point file (code packages only).
    icon : bytes | None
        Raw SVG bytes; written as ``icon.svg`` if provided.

    Returns
    -------
    bytes
        Raw ZIP bytes suitable for storage or round-trip validation.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # For code packages with a bundle: compute hash and embed
        if bundle is not None:
            bundle_bytes = bundle.encode("utf-8")
            digest = _sha256_hex(bundle_bytes)
            manifest = {**manifest, "sha256": f"sha256:{digest}"}
            entry_point = manifest.get("entryPoint", "index.js")
            zf.writestr(entry_point, bundle_bytes)

        # Write manifest (after possible sha256 injection)
        zf.writestr("manifest.json", json.dumps(manifest, indent=2).encode("utf-8"))

        if icon is not None:
            zf.writestr("icon.svg", icon)

    return buf.getvalue()
