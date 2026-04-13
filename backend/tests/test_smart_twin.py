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
