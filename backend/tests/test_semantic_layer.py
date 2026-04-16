"""Tests for semantic_layer — per-connection CRUD for linguistic model,
color map, and semantic model (Sub-project D, D0 Task 3).

Uses tmp_path and monkeypatch to redirect the storage root so tests
never touch real .data/ on disk.
"""
from __future__ import annotations

import hashlib
import json
import sys
import os
from pathlib import Path
from unittest.mock import patch

import pytest

# Ensure backend/ is importable when running from the tests/ subdirectory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import semantic_layer
from semantic_layer import (
    delete_linguistic,
    hydrate,
    load_color_map,
    load_linguistic,
    load_semantic_model,
    migrate_from_chart_customizations,
    save_color_map,
    save_linguistic,
    save_semantic_model,
    _semantic_dir,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


TEST_EMAIL = "semantic-test@askdb.dev"
TEST_CONN = "conn_abc123"


@pytest.fixture(autouse=True)
def patch_data_root(tmp_path, monkeypatch):
    """Redirect semantic_layer's DATA_ROOT to a temp directory for every test."""
    fake_root = tmp_path / "user_data"
    fake_root.mkdir()
    monkeypatch.setattr(semantic_layer, "DATA_ROOT", fake_root)
    return fake_root


# ── Helpers ─────────────────────────────────────────────────────────────────


def _sha_prefix(email: str) -> str:
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:16]


def _linguistic_payload(conn_id: str = TEST_CONN) -> dict:
    return {
        "conn_id": conn_id,
        "version": 1,
        "aliases": {"revenue": "total_revenue"},
        "synonyms": {},
    }


def _color_map_payload(conn_id: str = TEST_CONN) -> dict:
    return {
        "conn_id": conn_id,
        "version": 1,
        "mappings": {"category_a": "#ff0000"},
    }


def _semantic_model_payload() -> dict:
    return {
        "id": "org:retail",
        "name": "Retail",
        "conn_id": TEST_CONN,
        "dimensions": [],
        "measures": [],
    }


# ── Test: save + load round-trips ───────────────────────────────────────────


def test_save_and_load_linguistic():
    payload = _linguistic_payload()
    saved = save_linguistic(TEST_EMAIL, TEST_CONN, payload)
    assert saved == payload

    loaded = load_linguistic(TEST_EMAIL, TEST_CONN)
    assert loaded is not None
    assert loaded["conn_id"] == TEST_CONN
    assert loaded["aliases"] == {"revenue": "total_revenue"}


def test_save_and_load_color_map():
    payload = _color_map_payload()
    saved = save_color_map(TEST_EMAIL, TEST_CONN, payload)
    assert saved == payload

    loaded = load_color_map(TEST_EMAIL, TEST_CONN)
    assert loaded is not None
    assert loaded["mappings"] == {"category_a": "#ff0000"}


def test_save_and_load_semantic_model():
    payload = _semantic_model_payload()
    saved = save_semantic_model(TEST_EMAIL, TEST_CONN, payload)
    assert saved == payload

    loaded = load_semantic_model(TEST_EMAIL, TEST_CONN)
    assert loaded is not None
    assert loaded["id"] == "org:retail"
    assert loaded["name"] == "Retail"


# ── Test: load returns None when no file ────────────────────────────────────


def test_load_returns_none_when_no_file():
    assert load_linguistic(TEST_EMAIL, TEST_CONN) is None
    assert load_color_map(TEST_EMAIL, TEST_CONN) is None
    assert load_semantic_model(TEST_EMAIL, TEST_CONN) is None


# ── Test: hydrate ────────────────────────────────────────────────────────────


def test_hydrate_returns_all_three():
    save_linguistic(TEST_EMAIL, TEST_CONN, _linguistic_payload())
    save_color_map(TEST_EMAIL, TEST_CONN, _color_map_payload())
    save_semantic_model(TEST_EMAIL, TEST_CONN, _semantic_model_payload())

    result = hydrate(TEST_EMAIL, TEST_CONN)
    assert set(result.keys()) == {"linguistic", "color_map", "model"}
    assert result["linguistic"] is not None
    assert result["color_map"] is not None
    assert result["model"] is not None
    assert result["linguistic"]["conn_id"] == TEST_CONN
    assert result["model"]["id"] == "org:retail"


def test_hydrate_returns_none_for_missing():
    result = hydrate(TEST_EMAIL, TEST_CONN)
    assert result == {"linguistic": None, "color_map": None, "model": None}


# ── Test: delete ─────────────────────────────────────────────────────────────


def test_delete_linguistic():
    save_linguistic(TEST_EMAIL, TEST_CONN, _linguistic_payload())
    assert load_linguistic(TEST_EMAIL, TEST_CONN) is not None

    removed = delete_linguistic(TEST_EMAIL, TEST_CONN)
    assert removed is True
    assert load_linguistic(TEST_EMAIL, TEST_CONN) is None


def test_delete_linguistic_returns_false_when_missing():
    removed = delete_linguistic(TEST_EMAIL, TEST_CONN)
    assert removed is False


# ── Test: per-connection isolation ───────────────────────────────────────────


def test_per_connection_isolation():
    save_linguistic(TEST_EMAIL, "conn_a", {**_linguistic_payload("conn_a")})
    assert load_linguistic(TEST_EMAIL, "conn_b") is None


# ── Test: storage path structure ─────────────────────────────────────────────


def test_storage_path_structure(tmp_path):
    prefix = _sha_prefix(TEST_EMAIL)
    d = _semantic_dir(TEST_EMAIL, TEST_CONN)
    # Must contain the sha prefix and conn_id somewhere in the path
    assert prefix in str(d)
    assert TEST_CONN in str(d)


# ── Test: validation — rejects invalid input ─────────────────────────────────


def test_rejects_invalid_linguistic_missing_version():
    bad = {"conn_id": TEST_CONN}  # no version
    with pytest.raises(ValueError, match="version"):
        save_linguistic(TEST_EMAIL, TEST_CONN, bad)


def test_rejects_invalid_linguistic_wrong_version():
    bad = {"conn_id": TEST_CONN, "version": 2}
    with pytest.raises(ValueError, match="version"):
        save_linguistic(TEST_EMAIL, TEST_CONN, bad)


def test_rejects_invalid_linguistic_missing_conn_id():
    bad = {"version": 1, "conn_id": ""}  # empty conn_id
    with pytest.raises(ValueError, match="conn_id"):
        save_linguistic(TEST_EMAIL, TEST_CONN, bad)


def test_rejects_invalid_color_map_missing_conn_id():
    bad = {"version": 1}  # no conn_id key at all
    with pytest.raises(ValueError, match="conn_id"):
        save_color_map(TEST_EMAIL, TEST_CONN, bad)


def test_rejects_invalid_color_map_wrong_version():
    bad = {"conn_id": TEST_CONN, "version": 99}
    with pytest.raises(ValueError, match="version"):
        save_color_map(TEST_EMAIL, TEST_CONN, bad)


def test_rejects_invalid_semantic_model_missing_id():
    bad = {"name": "Retail"}  # no id
    with pytest.raises(ValueError, match="id"):
        save_semantic_model(TEST_EMAIL, TEST_CONN, bad)


def test_rejects_invalid_semantic_model_missing_name():
    bad = {"id": "org:retail"}  # no name
    with pytest.raises(ValueError, match="name"):
        save_semantic_model(TEST_EMAIL, TEST_CONN, bad)


# ── Test: atomic write leaves no .tmp files ──────────────────────────────────


def test_atomic_write_creates_no_tmp_files():
    save_linguistic(TEST_EMAIL, TEST_CONN, _linguistic_payload())
    save_color_map(TEST_EMAIL, TEST_CONN, _color_map_payload())
    save_semantic_model(TEST_EMAIL, TEST_CONN, _semantic_model_payload())

    sem_dir = _semantic_dir(TEST_EMAIL, TEST_CONN)
    tmp_files = list(sem_dir.glob("*.tmp"))
    assert tmp_files == [], f"Unexpected .tmp files left behind: {tmp_files}"


# ── Test: migration from chart_customizations ────────────────────────────────


def test_migrate_from_chart_customizations():
    """Migration finds model by id in old chart_customization data and writes
    it as model.json in the new per-connection path."""
    old_model = {
        "id": "org:retail",
        "name": "Retail",
        "version": 1,
        "dimensions": [],
        "measures": [],
        "metrics": [],
    }
    old_data = {
        "chart_types": [],
        "semantic_models": [old_model],
    }

    with patch("chart_customization._load_raw", return_value=old_data):
        migrated = migrate_from_chart_customizations(TEST_EMAIL, TEST_CONN, "org:retail")

    assert migrated is True
    loaded = load_semantic_model(TEST_EMAIL, TEST_CONN)
    assert loaded is not None
    assert loaded["id"] == "org:retail"
    assert loaded["name"] == "Retail"


def test_migrate_returns_false_when_model_not_found():
    old_data = {"chart_types": [], "semantic_models": []}
    with patch("chart_customization._load_raw", return_value=old_data):
        migrated = migrate_from_chart_customizations(TEST_EMAIL, TEST_CONN, "org:missing")
    assert migrated is False
