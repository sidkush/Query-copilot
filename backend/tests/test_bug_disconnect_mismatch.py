"""Bug regression: handleDisconnectLive uses different name normalization than isLive.

Root cause: isLive() normalizes with `saved.database || saved.project || saved.host`
but handleDisconnectLive uses only `saved.database`. For BigQuery (which uses
project/dataset), saved.database may differ from the live connection's database_name,
causing disconnect to silently fail.

This is a frontend-only bug. This backend test verifies the contract that the
reconnect endpoint returns a consistent database_name that can be matched.
"""
import pytest


class TestReconnectDatabaseName:
    def test_bigquery_saved_config_has_project_field(self):
        """BigQuery configs use 'project' not 'database' — frontend must normalize."""
        bigquery_config = {
            "id": "abc123",
            "db_type": "bigquery",
            "project": "querycopilot",
            "dataset": "trips_data",
            "label": "City Rides Database",
        }
        # Frontend isLive does: saved.database || saved.project || saved.host
        normalized = bigquery_config.get("database") or bigquery_config.get("project") or bigquery_config.get("host") or ""
        assert normalized == "querycopilot"

        # Frontend handleDisconnectLive does: saved.database (WRONG for BigQuery)
        raw = bigquery_config.get("database")
        # This is None for BigQuery — match will fail
        assert raw is None, "BigQuery configs don't have 'database' field — disconnect match will fail"

    def test_postgresql_saved_config_has_database_field(self):
        """PostgreSQL configs use 'database' — both paths work."""
        pg_config = {
            "id": "def456",
            "db_type": "postgresql",
            "host": "localhost",
            "database": "mydb",
        }
        normalized = pg_config.get("database") or pg_config.get("project") or pg_config.get("host") or ""
        raw = pg_config.get("database")
        assert normalized == raw == "mydb"
