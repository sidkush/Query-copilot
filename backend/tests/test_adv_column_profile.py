"""Tests for column profiling — used by the chart recommender to pick
chart types based on result-set shape."""
import pandas as pd
import pytest

from schema_intelligence import profile_columns


def test_profile_simple_dataframe():
    df = pd.DataFrame({
        'region': ['North', 'South', 'East', 'West'],
        'revenue': [100.5, 200.0, 150.25, 175.75],
    })
    profiles = profile_columns(df)

    assert len(profiles) == 2

    region = next(p for p in profiles if p['name'] == 'region')
    assert region['role'] == 'dimension'
    assert region['semantic_type'] == 'nominal'
    assert region['cardinality'] == 4
    assert region['null_pct'] == 0.0

    revenue = next(p for p in profiles if p['name'] == 'revenue')
    assert revenue['role'] == 'measure'
    assert revenue['semantic_type'] == 'quantitative'


def test_profile_temporal_column():
    df = pd.DataFrame({
        'date': pd.to_datetime(['2026-01-01', '2026-01-02', '2026-01-03']),
        'value': [1, 2, 3],
    })
    profiles = profile_columns(df)
    date = next(p for p in profiles if p['name'] == 'date')
    assert date['semantic_type'] == 'temporal'
    assert date['role'] == 'dimension'


def test_profile_handles_nulls():
    df = pd.DataFrame({
        'name': ['a', None, 'c', None, 'e'],
    })
    profiles = profile_columns(df)
    name = profiles[0]
    assert name['null_pct'] == 0.4


def test_profile_high_cardinality_string_is_dimension():
    df = pd.DataFrame({
        'customer': [f'cust_{i}' for i in range(1000)],
        'amount': list(range(1000)),
    })
    profiles = profile_columns(df)
    customer = next(p for p in profiles if p['name'] == 'customer')
    assert customer['cardinality'] == 1000
    assert customer['role'] == 'dimension'


def test_profile_includes_sample_values():
    df = pd.DataFrame({
        'category': ['A', 'B', 'C', 'D', 'E'],
    })
    profiles = profile_columns(df)
    cat = profiles[0]
    assert len(cat['sample_values']) > 0
    assert len(cat['sample_values']) <= 5


def test_profile_columns_returns_jsonable_dict():
    """Smoke test: profile output is JSON-serializable (dicts with
    primitive values + lists), which is required for the query response
    payload to be sent over HTTP."""
    import json
    df = pd.DataFrame({
        'product': ['A', 'B', 'C'],
        'sales': [100, 200, 150],
    })
    profile = profile_columns(df)
    # Should serialize without error
    serialized = json.dumps(profile)
    # Round-trip to confirm
    roundtrip = json.loads(serialized)
    assert roundtrip == profile
