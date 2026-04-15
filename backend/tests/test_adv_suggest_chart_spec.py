"""Tests for the agent's suggest_chart tool — verifies it emits
valid ChartSpec JSON conforming to the v1 schema."""
import json
import pytest


def test_suggest_chart_returns_chart_spec_with_schema_field():
    """The tool must return a dict with $schema = 'askdb/chart-spec/v1'."""
    from agent_engine import AgentEngine

    # Build a minimal column profile + sample rows
    columns = [
        {'name': 'region', 'semantic_type': 'nominal', 'role': 'dimension',
         'cardinality': 4, 'null_pct': 0.0, 'sample_values': ['N', 'S', 'E', 'W'],
         'dtype': 'string'},
        {'name': 'revenue', 'semantic_type': 'quantitative', 'role': 'measure',
         'cardinality': 1000, 'null_pct': 0.0, 'sample_values': [100, 200, 150],
         'dtype': 'float'},
    ]
    sample_rows = [
        {'region': 'North', 'revenue': 100},
        {'region': 'South', 'revenue': 200},
    ]

    # Call the tool — implementation detail of how it's invoked depends
    # on AgentEngine API. The contract: result is a dict-like ChartSpec.
    engine = AgentEngine.__new__(AgentEngine)  # bypass init for unit test
    spec = engine._tool_suggest_chart_spec(columns=columns, sample_rows=sample_rows)

    if isinstance(spec, str):
        spec = json.loads(spec)

    assert spec['$schema'] == 'askdb/chart-spec/v1'
    assert spec['type'] in {'cartesian', 'map', 'geo-overlay', 'creative'}


def test_suggest_chart_picks_bar_for_nominal_dim_plus_measure():
    from agent_engine import AgentEngine
    columns = [
        {'name': 'product', 'semantic_type': 'nominal', 'role': 'dimension',
         'cardinality': 5, 'null_pct': 0.0, 'sample_values': ['A','B','C','D','E'],
         'dtype': 'string'},
        {'name': 'sales', 'semantic_type': 'quantitative', 'role': 'measure',
         'cardinality': 100, 'null_pct': 0.0, 'sample_values': [1, 2, 3], 'dtype': 'int'},
    ]
    engine = AgentEngine.__new__(AgentEngine)
    spec = engine._tool_suggest_chart_spec(columns=columns, sample_rows=[])
    if isinstance(spec, str):
        spec = json.loads(spec)
    assert spec['mark'] == 'bar' or (
        isinstance(spec.get('mark'), dict) and spec['mark'].get('type') == 'bar'
    )


def test_suggest_chart_picks_line_for_temporal_plus_measure():
    from agent_engine import AgentEngine
    columns = [
        {'name': 'date', 'semantic_type': 'temporal', 'role': 'dimension',
         'cardinality': 365, 'null_pct': 0.0, 'sample_values': ['2026-01-01'],
         'dtype': 'date'},
        {'name': 'price', 'semantic_type': 'quantitative', 'role': 'measure',
         'cardinality': 365, 'null_pct': 0.0, 'sample_values': [100], 'dtype': 'float'},
    ]
    engine = AgentEngine.__new__(AgentEngine)
    spec = engine._tool_suggest_chart_spec(columns=columns, sample_rows=[])
    if isinstance(spec, str):
        spec = json.loads(spec)
    assert spec['mark'] == 'line' or (
        isinstance(spec.get('mark'), dict) and spec['mark'].get('type') == 'line'
    )
