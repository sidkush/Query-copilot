"""Tests for Typed-Seeking-Spring Phase 2 backend orchestrator.

Covers:
  1. SQL compiler produces deterministic, parameterised output for KPI slot.
  2. SQL compiler produces GROUP BY + ORDER BY DESC for table slot.
  3. SQL compiler produces time-bucketed output for chart slot (monthly).
  4. SQLValidator accepts every compiler output (smoke test).
  5. ``preset_autogen.fill_slot`` returns a TileBinding-shaped dict
     when the LLM is mocked out.
  6. ``preset_autogen.run_autogen`` with mocked LLM + mocked engine fills
     all 4 themed presets and writes them to the dashboard JSON.

Deterministic SQL is a hard contract — the waterfall validator rejects
anything non-canonical, so the compiler must always emit the same SQL
for the same input.
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest

# Ensure backend module path is importable when tests are run from repo root
_BACKEND = os.path.join(os.path.dirname(__file__), os.pardir)
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))


# ────────────────────────────────────────────────────────────────────
# Test data — a representative BigQuery schema profile
# ────────────────────────────────────────────────────────────────────

SCHEMA_PROFILE = {
    "columns": [
        {"name": "revenue", "dtype": "float", "role": "measure",
         "semantic_type": "quantitative", "cardinality": 5000, "null_pct": 0.0,
         "sample_values": [100.5, 200.0]},
        {"name": "mrr", "dtype": "float", "role": "measure",
         "semantic_type": "quantitative", "cardinality": 3000, "null_pct": 0.01,
         "sample_values": [200.0, 300.0]},
        {"name": "account_name", "dtype": "string", "role": "dimension",
         "semantic_type": "nominal", "cardinality": 120, "null_pct": 0.0,
         "sample_values": ["Acme", "Beta"]},
        {"name": "event_date", "dtype": "date", "role": "dimension",
         "semantic_type": "temporal", "cardinality": 365, "null_pct": 0.0,
         "sample_values": ["2026-04-01"]},
        {"name": "segment", "dtype": "string", "role": "dimension",
         "semantic_type": "nominal", "cardinality": 4, "null_pct": 0.0,
         "sample_values": ["enterprise", "mid-market"]},
    ],
}

TABLE_REF = "askdb-demo.marketing.facts"


# ────────────────────────────────────────────────────────────────────
# 1. KPI compiler — deterministic SUM(revenue) → bigquery SQL
# ────────────────────────────────────────────────────────────────────

def test_kpi_compiler_sum_revenue_deterministic():
    """KPI slot compiles to `SELECT SUM(revenue) AS value FROM table LIMIT 1`."""
    from preset_sql_compiler import compile_kpi_sql

    binding = {"measure": {"column": "revenue", "agg": "SUM"}}
    sql1, params1 = compile_kpi_sql(binding, SCHEMA_PROFILE, TABLE_REF)
    sql2, params2 = compile_kpi_sql(binding, SCHEMA_PROFILE, TABLE_REF)

    # Deterministic: same input → same output
    assert sql1 == sql2
    assert params1 == params2

    # BigQuery backtick-quoted column + table
    assert "SUM(`revenue`)" in sql1
    assert "`askdb-demo`.`marketing`.`facts`" in sql1 or \
           "`askdb-demo.marketing.facts`" in sql1
    assert "AS value" in sql1
    # KPI is scalar — always LIMIT 1
    assert "LIMIT 1" in sql1
    # No filter → no params
    assert params1 == {}


def test_kpi_compiler_with_filter_emits_parameter():
    """KPI with `filter` emits a `@param_0`-style parameterised WHERE."""
    from preset_sql_compiler import compile_kpi_sql

    binding = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "filter": {"column": "segment", "op": "eq", "value": "enterprise"},
    }
    sql, params = compile_kpi_sql(binding, SCHEMA_PROFILE, TABLE_REF)

    assert "`segment`" in sql
    assert "@param_0" in sql
    assert params == {"param_0": "enterprise"}
    # Filter MUST live in a WHERE clause
    assert "WHERE" in sql


# ────────────────────────────────────────────────────────────────────
# 2. Table compiler — GROUP BY + ORDER BY DESC + LIMIT
# ────────────────────────────────────────────────────────────────────

def test_table_compiler_group_by_dimension_order_desc():
    """Table slot compiles to GROUP BY dimension ORDER BY value DESC LIMIT n."""
    from preset_sql_compiler import compile_table_sql

    binding = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "dimension": "account_name",
    }
    sql, params = compile_table_sql(binding, SCHEMA_PROFILE, TABLE_REF, rank_limit=5)

    assert "`account_name`" in sql
    assert "SUM(`revenue`)" in sql
    assert "GROUP BY" in sql
    assert "ORDER BY" in sql
    # Explicit DESC ordering — required by the table slot contract
    assert "DESC" in sql
    assert "LIMIT 5" in sql
    assert params == {}


# ────────────────────────────────────────────────────────────────────
# 3. Chart compiler — DATE_TRUNC time bucket + GROUP BY bucket
# ────────────────────────────────────────────────────────────────────

def test_chart_compiler_month_bucket_bigquery():
    """Chart slot with timeGrain=month compiles to DATE_TRUNC(date, MONTH)."""
    from preset_sql_compiler import compile_chart_sql

    binding = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "primary_date": "event_date",
    }
    sql, params = compile_chart_sql(
        binding, SCHEMA_PROFILE, TABLE_REF, time_grain="month", row_limit=5000,
    )

    # BigQuery date truncation syntax (unquoted MONTH keyword)
    assert "DATE_TRUNC" in sql
    assert "`event_date`" in sql
    assert "MONTH" in sql
    assert "AS bucket" in sql
    assert "GROUP BY" in sql
    assert "ORDER BY" in sql
    assert "LIMIT 5000" in sql


def test_chart_compiler_with_series_dimension_adds_second_group_by():
    """Chart with `dimension` adds series column + GROUP BY bucket, series."""
    from preset_sql_compiler import compile_chart_sql

    binding = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "primary_date": "event_date",
        "dimension": "segment",
    }
    sql, params = compile_chart_sql(
        binding, SCHEMA_PROFILE, TABLE_REF, time_grain="month", row_limit=5000,
    )

    assert "`segment`" in sql
    assert "AS series" in sql


# ────────────────────────────────────────────────────────────────────
# 4. Smoke — every compiler output must pass SQLValidator(bigquery)
# ────────────────────────────────────────────────────────────────────

def test_sql_validator_accepts_every_compiler_output():
    """Every SQL string the compiler produces passes the 6-layer validator."""
    from preset_sql_compiler import (
        compile_kpi_sql, compile_table_sql, compile_chart_sql,
    )
    from sql_validator import SQLValidator

    v = SQLValidator(dialect="bigquery")

    kpi_binding = {"measure": {"column": "revenue", "agg": "SUM"}}
    kpi_binding_filtered = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "filter": {"column": "segment", "op": "eq", "value": "enterprise"},
    }
    table_binding = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "dimension": "account_name",
    }
    chart_binding = {
        "measure": {"column": "revenue", "agg": "SUM"},
        "primary_date": "event_date",
        "dimension": "segment",
    }

    kpi_sql, _ = compile_kpi_sql(kpi_binding, SCHEMA_PROFILE, TABLE_REF)
    kpi_filter_sql, _ = compile_kpi_sql(kpi_binding_filtered, SCHEMA_PROFILE, TABLE_REF)
    table_sql, _ = compile_table_sql(table_binding, SCHEMA_PROFILE, TABLE_REF)
    chart_sql, _ = compile_chart_sql(chart_binding, SCHEMA_PROFILE, TABLE_REF)

    for label, sql in [
        ("kpi", kpi_sql), ("kpi_filter", kpi_filter_sql),
        ("table", table_sql), ("chart", chart_sql),
    ]:
        # For validator, replace parameter placeholders with literal values
        # so sqlglot can parse (real engine substitutes server-side).
        probe = sql.replace("@param_0", "'enterprise'")
        ok, _cleaned, err = v.validate(probe)
        assert ok, f"{label} SQL failed validation: {err}\nSQL: {probe}"


# ────────────────────────────────────────────────────────────────────
# 5. fill_slot with mocked LLM returns a TileBinding-shaped dict
# ────────────────────────────────────────────────────────────────────

class _FakeProvider:
    """Mocks AnthropicProvider.complete_with_tools — returns a canned
    tool_use block picking the first numeric column for the slot."""

    provider_name = "fake"
    default_model = "fake-haiku"
    fallback_model = "fake-sonnet"

    def __init__(self, tool_input=None):
        self._tool_input = tool_input or {
            "column": "revenue", "agg": "SUM",
        }

    def complete_with_tools(self, *, model, system, messages, tools, max_tokens, **kwargs):
        from model_provider import ContentBlock, ProviderToolResponse
        return ProviderToolResponse(
            content_blocks=[ContentBlock(
                type="tool_use",
                tool_name=tools[0]["name"] if tools else "pick_slot_binding",
                tool_input=self._tool_input,
                tool_use_id="toolu_test_" + uuid.uuid4().hex[:8],
            )],
            stop_reason="tool_use",
            usage={"input_tokens": 10, "output_tokens": 10},
        )

    # For narrative-slot composition (text completion) a second hook:
    def complete(self, *, model, system, messages, max_tokens, **kwargs):
        from model_provider import ProviderResponse
        return ProviderResponse(
            text="Revenue is up across enterprise accounts this quarter.",
            usage={"input_tokens": 10, "output_tokens": 10},
            stop_reason="end_turn",
        )


class _FakeEngine:
    """Mocks QueryEngine — execute_sql returns a DataFrame with one row."""

    class _Result:
        def __init__(self, df, rowcount):
            self.data = df
            self.row_count = rowcount
            self.error = None
            self.columns = list(df.columns) if df is not None else []

    def __init__(self):
        self.last_sql = None

    def execute_sql(self, sql, question=""):
        import pandas as pd
        self.last_sql = sql
        df = pd.DataFrame({"value": [2_470_000.0]})
        return self._Result(df, 1)


class _FakeConnector:
    class _DBT:
        value = "bigquery"
    db_type = _DBT()


class _FakeEntry:
    def __init__(self):
        self.connector = _FakeConnector()
        self.engine = _FakeEngine()
        self.db_type = "bigquery"


def test_fill_slot_with_mocked_llm_returns_tile_binding():
    """fill_slot returns a dict matching TileBinding (slotId, kind, measure...)."""
    import preset_autogen

    slot = {
        "id": "bp.kpi-0",
        "kind": "kpi",
        "label": "KPI 1 (MRR)",
        "hint": "Monthly recurring revenue — SUM of primary revenue metric.",
    }
    binding = preset_autogen.fill_slot(
        slot=slot,
        preset_id="board-pack",
        schema_profile=SCHEMA_PROFILE,
        semantic_tags={
            "revenueMetric": {"column": "revenue", "agg": "SUM"},
            "primaryDate": "event_date",
            "timeGrain": "month",
        },
        entry=_FakeEntry(),
        table_ref=TABLE_REF,
        provider=_FakeProvider(),
    )
    assert binding["slotId"] == "bp.kpi-0"
    assert binding["kind"] == "kpi"
    assert binding["measure"]["column"] == "revenue"
    assert binding["measure"]["agg"] == "SUM"
    # Execution path ran — tile carries a tileId + the compiled SQL
    assert "tileId" in binding
    assert binding.get("value") == 2_470_000.0 or binding.get("unresolved") is False


# ────────────────────────────────────────────────────────────────────
# 6. run_autogen fills all 4 themed presets end-to-end
# ────────────────────────────────────────────────────────────────────

def test_run_autogen_fills_all_four_themed_presets(tmp_path, monkeypatch):
    """run_autogen persists bindings for every slot in each of the 4 presets."""
    # Redirect user_storage data dir so the test doesn't touch real files
    monkeypatch.setenv("ASKDB_DATA_DIR", str(tmp_path))
    # user_storage resolves .data at import time; patch its module-level path
    import importlib
    import user_storage
    importlib.reload(user_storage)
    # Some builds keep data root in user_storage._DATA_DIR — override if present
    if hasattr(user_storage, "_DATA_DIR"):
        monkeypatch.setattr(user_storage, "_DATA_DIR", tmp_path)

    # Create a user + dashboard
    email = "preset_autogen_test@askdb.dev"
    # user_storage.create_dashboard expects the users file layout; seed minimal.
    # We directly use the internal helpers — the dashboards file is what the
    # orchestrator reads/writes.
    dashboard = user_storage.create_dashboard(email, "Autogen Test")
    dashboard_id = dashboard["id"]

    import preset_autogen
    # Monkeypatch the provider + connection resolver
    monkeypatch.setattr(preset_autogen, "get_provider", lambda email: _FakeProvider())
    monkeypatch.setattr(preset_autogen, "resolve_connection_entry",
                        lambda email, conn_id: (_FakeEntry(), "askdb-demo.marketing.facts"))

    events = list(preset_autogen.run_autogen(
        email=email,
        dashboard_id=dashboard_id,
        conn_id="fake-conn",
        semantic_tags={
            "revenueMetric": {"column": "revenue", "agg": "SUM"},
            "primaryDate": "event_date",
            "primaryDimension": "segment",
            "entityName": "account_name",
            "timeGrain": "month",
        },
        preset_ids=None,           # default = all 4 themed
        skip_pinned=True,
    ))

    # SSE-shaped events: one plan, one or more tool_result, one complete
    types = [e["type"] for e in events]
    assert "plan" in types
    assert "complete" in types
    assert types[0] == "plan"
    assert types[-1] == "complete"
    # At least one tool_result per preset
    tool_result_count = sum(1 for t in types if t == "tool_result")
    assert tool_result_count >= 4

    # Reload the dashboard and verify every preset has at least one binding
    d = user_storage.load_dashboard(email, dashboard_id)
    assert d is not None
    bindings = d.get("presetBindings") or {}
    for pid in ("board-pack", "operator-console", "signal", "editorial-brief"):
        assert pid in bindings, f"no bindings for preset {pid}"
        assert len(bindings[pid]) >= 1, f"no slot bindings under {pid}"
    # bindingAutogenState is set to complete
    assert d.get("bindingAutogenState") == "complete"
