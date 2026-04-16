"""Tests for SchemaIntelligence.detect_schema_drift.

Three scenarios:
  1. test_no_drift_when_all_tables_exist   — linguistic refs all present in schema → stale=False
  2. test_drift_when_table_missing         — linguistic refs table not in schema → stale=True
  3. test_no_drift_when_no_linguistic_model — no linguistic model stored → stale=False

All tests use monkeypatch to:
  - redirect SchemaIntelligence's cache dir to tmp_path
  - stub semantic_layer.load_linguistic to avoid touching disk

"""
from __future__ import annotations

import json
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# Path setup — tests run from backend/tests/ but imports live in backend/
# ---------------------------------------------------------------------------
_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import schema_intelligence as si_module
from schema_intelligence import SchemaIntelligence, SchemaProfile, TableProfile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEST_CONN = "conn_drift_test"
_TEST_EMAIL = "drift@askdb.dev"


def _make_profile(tables: list[dict]) -> SchemaProfile:
    """Build a minimal SchemaProfile from a list of {name, columns} dicts."""
    table_profiles = [
        TableProfile(
            name=t["name"],
            row_count_estimate=-1,
            columns=[{"name": c, "type": "text"} for c in t.get("columns", [])],
            indexes=[],
            partitions=[],
            primary_keys=[],
            foreign_keys=[],
        )
        for t in tables
    ]
    return SchemaProfile(
        conn_id=_TEST_CONN,
        schema_hash="abc123",
        cached_at=datetime.now(tz=timezone.utc),
        tables=table_profiles,
    )


def _write_cache(cache_dir: Path, profile: SchemaProfile) -> None:
    """Serialize *profile* to the expected cache file path."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "conn_id": profile.conn_id,
        "schema_hash": profile.schema_hash,
        "cached_at": profile.cached_at.isoformat(),
        "tables": [
            {
                "name": t.name,
                "row_count_estimate": t.row_count_estimate,
                "columns": t.columns,
                "indexes": t.indexes,
                "partitions": t.partitions,
                "primary_keys": t.primary_keys,
                "foreign_keys": t.foreign_keys,
            }
            for t in profile.tables
        ],
    }
    path = cache_dir / f"{_TEST_CONN}.json"
    path.write_text(json.dumps(payload), encoding="utf-8")


def _make_linguistic(
    table_synonyms: dict | None = None,
    column_synonyms: dict | None = None,
) -> dict:
    return {
        "conn_id": _TEST_CONN,
        "version": 1,
        "aliases": {},
        "synonyms": {},
        "table_synonyms": table_synonyms or {},
        "column_synonyms": column_synonyms or {},
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def si(tmp_path, monkeypatch):
    """Return a SchemaIntelligence whose cache dir is redirected to tmp_path."""
    cache_dir = tmp_path / "schema_cache"
    cache_dir.mkdir()
    # Patch the settings so SchemaIntelligence uses our temp dir.
    monkeypatch.setattr(si_module.settings, "SCHEMA_CACHE_DIR", str(cache_dir))
    instance = SchemaIntelligence()
    return instance, cache_dir


# ---------------------------------------------------------------------------
# Test 1: no drift when all tables and columns are present in the schema
# ---------------------------------------------------------------------------


def test_no_drift_when_all_tables_exist(si):
    instance, cache_dir = si

    # Schema has: orders (total_amount, status), customers (email)
    profile = _make_profile([
        {"name": "orders", "columns": ["total_amount", "status"]},
        {"name": "customers", "columns": ["email"]},
    ])
    _write_cache(cache_dir, profile)

    linguistic = _make_linguistic(
        table_synonyms={"orders": ["purchases"], "customers": ["clients"]},
        column_synonyms={
            "orders.total_amount": ["order value"],
            "customers.email": ["contact email"],
        },
    )

    with patch("semantic_layer.load_linguistic", return_value=linguistic):
        result = instance.detect_schema_drift(_TEST_CONN, _TEST_EMAIL)

    assert result["stale"] is False
    assert result["missing_tables"] == []
    assert result["missing_columns"] == []


# ---------------------------------------------------------------------------
# Test 2: drift detected when linguistic model references a missing table
# ---------------------------------------------------------------------------


def test_drift_when_table_missing(si):
    instance, cache_dir = si

    # Schema only has: orders — "customers" is gone
    profile = _make_profile([
        {"name": "orders", "columns": ["total_amount"]},
    ])
    _write_cache(cache_dir, profile)

    linguistic = _make_linguistic(
        table_synonyms={
            "orders": ["purchases"],
            "customers": ["clients"],      # stale — customers no longer exists
        },
        column_synonyms={
            "orders.total_amount": ["order value"],
            "customers.email": ["contact email"],  # stale — customers gone
        },
    )

    with patch("semantic_layer.load_linguistic", return_value=linguistic):
        result = instance.detect_schema_drift(_TEST_CONN, _TEST_EMAIL)

    assert result["stale"] is True
    assert "customers" in result["missing_tables"]
    assert "customers.email" in result["missing_columns"]
    # orders should NOT appear in missing lists
    assert "orders" not in result["missing_tables"]
    assert "orders.total_amount" not in result["missing_columns"]


# ---------------------------------------------------------------------------
# Test 3: no drift when no linguistic model is stored
# ---------------------------------------------------------------------------


def test_no_drift_when_no_linguistic_model(si):
    instance, cache_dir = si

    profile = _make_profile([
        {"name": "orders", "columns": ["id", "total"]},
    ])
    _write_cache(cache_dir, profile)

    # load_linguistic returns None → no model → stale=False
    with patch("semantic_layer.load_linguistic", return_value=None):
        result = instance.detect_schema_drift(_TEST_CONN, _TEST_EMAIL)

    assert result["stale"] is False
    assert result["missing_tables"] == []
    assert result["missing_columns"] == []
