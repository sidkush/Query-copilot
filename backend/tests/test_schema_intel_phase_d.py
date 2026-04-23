"""Schema profile extensions — tz_aware_columns + soft_delete_columns."""
import sqlite3

import pytest


@pytest.fixture
def sqlite_with_tz_col(tmp_path):
    db = tmp_path / "schema_test.sqlite"
    conn = sqlite3.connect(str(db))
    conn.execute("""
        CREATE TABLE events(
            id INTEGER PRIMARY KEY,
            occurred_at TIMESTAMPTZ NOT NULL,
            deleted_at DATETIME NULL
        )
    """)
    conn.commit()
    conn.close()
    return db


def test_schema_profile_detects_tz_aware(sqlite_with_tz_col):
    from schema_intelligence import SchemaIntelligence
    si = SchemaIntelligence()
    profile = si.profile_sqlite(str(sqlite_with_tz_col))
    tbl = next(t for t in profile.tables if t.name == "events")
    assert "occurred_at" in tbl.tz_aware_columns


def test_schema_profile_detects_soft_delete(sqlite_with_tz_col):
    from schema_intelligence import SchemaIntelligence
    si = SchemaIntelligence()
    profile = si.profile_sqlite(str(sqlite_with_tz_col))
    tbl = next(t for t in profile.tables if t.name == "events")
    assert tbl.soft_delete_columns == ["deleted_at"] or "deleted_at" in tbl.soft_delete_columns
