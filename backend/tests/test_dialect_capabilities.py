"""Capability manifest loader + per-engine JSON validation."""
import pytest

from dialect_capabilities import load_manifest, Manifest, CapabilityUnknown


def test_bigquery_manifest_loads():
    m = load_manifest("bigquery")
    assert isinstance(m, Manifest)
    assert m.engine == "bigquery"
    assert "qualify_clause" in m.supported_features


def test_duckdb_manifest_loads():
    m = load_manifest("duckdb")
    assert m.engine == "duckdb"
    assert "qualify_clause" in m.supported_features   # DuckDB does support QUALIFY


def test_postgresql_manifest_loads():
    m = load_manifest("postgresql")
    assert m.engine == "postgresql"
    # Postgres does NOT support QUALIFY (as of 16).
    assert "qualify_clause" not in m.supported_features


def test_unknown_engine_raises():
    with pytest.raises(CapabilityUnknown):
        load_manifest("not_an_engine")


def test_manifest_case_insensitive_engine_lookup():
    m = load_manifest("BigQuery")
    assert m.engine == "bigquery"


def test_all_eight_engines_parse():
    for eng in ["bigquery", "postgresql", "duckdb", "snowflake", "redshift", "mysql", "mssql", "clickhouse"]:
        m = load_manifest(eng)
        assert m.engine == eng
        assert isinstance(m.supported_features, set)
        assert isinstance(m.turbo_safe, bool)
