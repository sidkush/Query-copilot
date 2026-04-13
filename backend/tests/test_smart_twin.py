"""Tests for smart twin sampling strategy."""
import pytest
from unittest.mock import MagicMock


class TestSmartTwinSampling:
    def test_should_full_copy_small_table(self):
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()
        schema_profile = MagicMock()
        table_profile = MagicMock()
        table_profile.name = "countries"
        table_profile.row_count_estimate = 240
        schema_profile.tables = [table_profile]
        assert twin._should_full_copy("countries", schema_profile) is True

    def test_should_not_full_copy_large_table(self):
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()
        schema_profile = MagicMock()
        table_profile = MagicMock()
        table_profile.name = "orders"
        table_profile.row_count_estimate = 1_200_000
        schema_profile.tables = [table_profile]
        assert twin._should_full_copy("orders", schema_profile) is False

    def test_should_not_full_copy_no_profile(self):
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()
        assert twin._should_full_copy("anything", None) is False

    def test_build_aggregate_sqls_with_date_and_numeric(self):
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()
        columns = [
            {"name": "id", "type": "INTEGER"},
            {"name": "total", "type": "DOUBLE"},
            {"name": "created_at", "type": "TIMESTAMP"},
            {"name": "category", "type": "VARCHAR"},
        ]
        agg_sqls = twin._build_aggregate_sqls("orders", columns)
        assert len(agg_sqls) > 0
        daily = [s for s in agg_sqls if "daily" in s["name"]]
        assert len(daily) == 1
        assert "DATE_TRUNC" in daily[0]["sql"]
        assert "id_count" in daily[0]["sql"]
        assert "total_sum" in daily[0]["sql"]

    def test_build_aggregate_sqls_no_date_column(self):
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()
        columns = [
            {"name": "id", "type": "INTEGER"},
            {"name": "name", "type": "VARCHAR"},
        ]
        agg_sqls = twin._build_aggregate_sqls("users", columns)
        assert agg_sqls == []
