"""Integration-style test: profile the Phase-A fixture DB."""
import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

from data_coverage import CoverageProfiler, DataCoverageCard, ColumnRole


@pytest.fixture(scope="module")
def fixture_db(tmp_path_factory):
    from tests.fixtures.eval_seed import seed
    path = tmp_path_factory.mktemp("cov") / "eval.sqlite"
    seed(path)
    return path


def _connect(path):
    return sqlite3.connect(str(path))


def test_profile_january_trips_detects_23_months(fixture_db):
    profiler = CoverageProfiler(dialect="sqlite")
    card = profiler.profile_table(
        run_query=lambda sql: _connect(fixture_db).execute(sql).fetchall(),
        table_name="january_trips",
        columns=[
            {"name": "id", "type": "INTEGER"},
            {"name": "rider_type", "type": "TEXT"},
            {"name": "started_at", "type": "TEXT"},
            {"name": "duration_sec", "type": "INTEGER"},
        ],
    )
    assert isinstance(card, DataCoverageCard)
    assert card.table_name == "january_trips"
    assert card.row_count == 500
    assert card.date_columns == []


def test_profile_honours_date_name_heuristic(fixture_db):
    profiler = CoverageProfiler(dialect="sqlite")
    card = profiler.profile_table(
        run_query=lambda sql: _connect(fixture_db).execute(sql).fetchall(),
        table_name="january_trips",
        columns=[
            {"name": "id", "type": "INTEGER"},
            {"name": "rider_type", "type": "TEXT"},
            {"name": "started_at", "type": "TEXT"},
            {"name": "duration_sec", "type": "INTEGER"},
        ],
        treat_as_date=("started_at",),
    )
    assert len(card.date_columns) == 1
    dc = card.date_columns[0]
    assert dc.column == "started_at"
    assert dc.min_value.startswith("2023-12")
    assert dc.max_value.startswith("2025-10")
    assert dc.distinct_months == 23


def test_empty_table_profile_returns_zero_row_card(tmp_path):
    db = tmp_path / "empty.sqlite"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE t(a TEXT, b TEXT)")
    conn.commit()
    profiler = CoverageProfiler(dialect="sqlite")
    card = profiler.profile_table(
        run_query=lambda sql: sqlite3.connect(db).execute(sql).fetchall(),
        table_name="t",
        columns=[{"name": "a", "type": "TEXT"}, {"name": "b", "type": "TEXT"}],
    )
    assert card.row_count == 0
    assert all(cc.distinct_count == 0 for cc in card.categorical_columns)
    assert all(cc.sample_values == [] for cc in card.categorical_columns)
