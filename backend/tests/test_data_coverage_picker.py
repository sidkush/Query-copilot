"""Column picker: given a TableProfile's columns list, return up-to-N
date columns + up-to-M categorical columns, skip PII."""
from data_coverage import pick_coverage_columns, ColumnRole


def test_picker_selects_date_columns():
    cols = [
        {"name": "id", "type": "INTEGER"},
        {"name": "started_at", "type": "TIMESTAMP"},
        {"name": "created_at", "type": "DATETIME"},
        {"name": "rider_type", "type": "TEXT"},
    ]
    selection = pick_coverage_columns(cols, max_date=2, max_categorical=3)
    date_cols = [c for c, role in selection if role is ColumnRole.DATE]
    cat_cols  = [c for c, role in selection if role is ColumnRole.CATEGORICAL]
    assert "started_at" in date_cols
    assert "created_at" in date_cols
    assert "rider_type" in cat_cols
    assert "id" not in [c for c, _ in selection]   # integer PK not categorical


def test_picker_skips_pii_email():
    cols = [
        {"name": "email", "type": "TEXT"},
        {"name": "rider_type", "type": "TEXT"},
    ]
    selection = pick_coverage_columns(cols)
    picked = [c for c, _ in selection]
    assert "email" not in picked
    assert "rider_type" in picked


def test_picker_respects_max_counts():
    cols = [{"name": f"d{i}", "type": "DATE"} for i in range(5)] + \
           [{"name": f"c{i}", "type": "VARCHAR"} for i in range(5)]
    selection = pick_coverage_columns(cols, max_date=2, max_categorical=3)
    assert len([1 for _, r in selection if r is ColumnRole.DATE]) == 2
    assert len([1 for _, r in selection if r is ColumnRole.CATEGORICAL]) == 3


def test_picker_returns_empty_when_no_candidates():
    cols = [{"name": "blob", "type": "BLOB"}, {"name": "id", "type": "BIGINT"}]
    selection = pick_coverage_columns(cols)
    assert selection == []
