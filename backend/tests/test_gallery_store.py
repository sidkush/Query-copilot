"""
tests/test_gallery_store.py — pytest suite for gallery_store.py

Uses tmp_path + monkeypatch.setattr to redirect GALLERY_ROOT so production
data is never touched.  Builds valid .askdbviz packages via build_package from
askdbviz_package.
"""

import pytest
import sys
import os

# Ensure backend/ is importable when pytest is invoked from the repo root
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from pathlib import Path

from askdbviz_package import build_package
import gallery_store


# ── Fixture helpers ───────────────────────────────────────────────────────────

def _make_manifest(
    type_id: str = "test:chart_a",
    name: str = "Chart A",
    version: str = "1.0.0",
    tier: str = "spec",
    category: str = "bar",
    tags: list = None,
) -> dict:
    return {
        "id": type_id,
        "name": name,
        "version": version,
        "tier": tier,
        "category": category,
        "description": f"Description for {name}",
        "tags": tags or [],
    }


def _valid_zip(manifest: dict) -> bytes:
    """Build a valid .askdbviz ZIP from a manifest dict."""
    return build_package(dict(manifest))  # pass copy; build_package may mutate


@pytest.fixture(autouse=True)
def _patch_gallery_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Redirect gallery_store.GALLERY_ROOT to an isolated tmp dir per test."""
    monkeypatch.setattr(gallery_store, "GALLERY_ROOT", tmp_path / "gallery")


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestGalleryStore:

    # 1. submit_and_list round-trip
    def test_submit_and_list(self):
        manifest = _make_manifest(type_id="test:bar_chart", name="Bar Chart")
        zip_bytes = _valid_zip(manifest)

        entry = gallery_store.submit_type(manifest, zip_bytes, author_email="alice@example.com")

        assert entry["id"] == "test:bar_chart"
        assert entry["name"] == "Bar Chart"
        assert entry["status"] == "pending_review"
        assert entry["installs"] == 0
        assert entry["rating_avg"] == 0.0

        result = gallery_store.list_types()
        assert result["total"] == 1
        assert result["types"][0]["id"] == "test:bar_chart"

    # 2. get_by_id
    def test_get_by_id(self):
        manifest = _make_manifest(type_id="test:line_chart", name="Line Chart")
        gallery_store.submit_type(manifest, _valid_zip(manifest), author_email="bob@example.com")

        entry = gallery_store.get_type("test:line_chart")
        assert entry is not None
        assert entry["name"] == "Line Chart"

        missing = gallery_store.get_type("no:such_type")
        assert missing is None

    # 3. list_with_category_filter
    def test_list_with_category_filter(self):
        m_bar = _make_manifest(type_id="test:bar", category="bar")
        m_pie = _make_manifest(type_id="test:pie", category="pie")
        gallery_store.submit_type(m_bar, _valid_zip(m_bar), "alice@example.com")
        gallery_store.submit_type(m_pie, _valid_zip(m_pie), "alice@example.com")

        bars = gallery_store.list_types(category="bar")
        assert bars["total"] == 1
        assert bars["types"][0]["id"] == "test:bar"

        pies = gallery_store.list_types(category="pie")
        assert pies["total"] == 1
        assert pies["types"][0]["id"] == "test:pie"

        all_types = gallery_store.list_types()
        assert all_types["total"] == 2

    # 4. list_pagination — 5 types, page_size=2
    def test_list_pagination(self):
        for i in range(5):
            m = _make_manifest(type_id=f"test:type_{i}", name=f"Type {i}")
            gallery_store.submit_type(m, _valid_zip(m), "alice@example.com")

        page1 = gallery_store.list_types(page=1, page_size=2)
        assert len(page1["types"]) == 2
        assert page1["total"] == 5
        assert page1["total_pages"] == 3
        assert page1["page"] == 1

        page2 = gallery_store.list_types(page=2, page_size=2)
        assert len(page2["types"]) == 2
        assert page2["page"] == 2

        page3 = gallery_store.list_types(page=3, page_size=2)
        assert len(page3["types"]) == 1
        assert page3["page"] == 3

        # Confirm no overlap between pages
        ids_p1 = {t["id"] for t in page1["types"]}
        ids_p2 = {t["id"] for t in page2["types"]}
        ids_p3 = {t["id"] for t in page3["types"]}
        assert not ids_p1 & ids_p2
        assert not ids_p2 & ids_p3
        assert len(ids_p1 | ids_p2 | ids_p3) == 5

    # 5. rate_type updates average
    def test_rate_type_updates_average(self):
        manifest = _make_manifest(type_id="test:rated")
        gallery_store.submit_type(manifest, _valid_zip(manifest), "alice@example.com")

        after_first = gallery_store.rate_type("test:rated", stars=4)
        assert after_first["rating_count"] == 1
        assert after_first["rating_sum"] == 4
        assert after_first["rating_avg"] == 4.0

        after_second = gallery_store.rate_type("test:rated", stars=2)
        assert after_second["rating_count"] == 2
        assert after_second["rating_sum"] == 6
        assert abs(after_second["rating_avg"] - 3.0) < 1e-6

        # Persisted in index
        entry = gallery_store.get_type("test:rated")
        assert entry["rating_count"] == 2
        assert abs(entry["rating_avg"] - 3.0) < 1e-6

    # 6. download_package returns bytes
    def test_download_package_returns_bytes(self):
        manifest = _make_manifest(type_id="test:download_me", version="2.0.0")
        zip_bytes = _valid_zip(manifest)
        gallery_store.submit_type(manifest, zip_bytes, "alice@example.com")

        downloaded = gallery_store.download_package("test:download_me")
        assert downloaded is not None
        assert isinstance(downloaded, bytes)
        assert len(downloaded) > 0

        # Unknown id returns None
        assert gallery_store.download_package("no:such_type") is None

    # 7. increment_installs
    def test_increment_installs(self):
        manifest = _make_manifest(type_id="test:popular")
        gallery_store.submit_type(manifest, _valid_zip(manifest), "alice@example.com")

        gallery_store.increment_installs("test:popular")
        gallery_store.increment_installs("test:popular")
        gallery_store.increment_installs("test:popular")

        entry = gallery_store.get_type("test:popular")
        assert entry["installs"] == 3

        # Non-existent id is silently ignored
        gallery_store.increment_installs("no:such_type")  # should not raise

    # 8. submit_rejects_invalid_package -> ValueError
    def test_submit_rejects_invalid_package(self):
        bad_bytes = b"this is definitely not a zip file"
        manifest = _make_manifest(type_id="test:bad_pkg")

        with pytest.raises(ValueError, match="(?i)(zip|archive|valid)"):
            gallery_store.submit_type(manifest, bad_bytes, "alice@example.com")

        # Gallery should remain empty
        result = gallery_store.list_types()
        assert result["total"] == 0

    # Bonus: rate_type rejects out-of-range stars
    def test_rate_type_rejects_invalid_stars(self):
        manifest = _make_manifest(type_id="test:star_guard")
        gallery_store.submit_type(manifest, _valid_zip(manifest), "alice@example.com")

        with pytest.raises(ValueError, match="stars must be between"):
            gallery_store.rate_type("test:star_guard", stars=0)

        with pytest.raises(ValueError, match="stars must be between"):
            gallery_store.rate_type("test:star_guard", stars=6)

    # Bonus: rate_type returns None for unknown id
    def test_rate_type_returns_none_for_unknown_id(self):
        result = gallery_store.rate_type("no:such_type", stars=3)
        assert result is None
