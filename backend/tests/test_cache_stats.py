"""Unit tests for cache_stats — tenant isolation, graceful degrade."""
from __future__ import annotations

from dataclasses import asdict
from unittest.mock import patch

import pytest

from cache_stats import CacheStatsReport, collect_for_tenant


def test_report_shape_has_all_five_sources():
    with patch("cache_stats._schema_cache_hit_rate", return_value=0.91), \
         patch("cache_stats._vizql_inproc_hit_rate", return_value=0.55), \
         patch("cache_stats._vizql_external_hit_rate", return_value=0.40), \
         patch("cache_stats._chroma_query_memory_hit_rate", return_value=0.33), \
         patch("cache_stats._turbo_twin_hit_rate", return_value=0.22), \
         patch("cache_stats._prompt_cache_hit_rate", return_value=0.75):
        r = collect_for_tenant("t-1")
    assert isinstance(r, CacheStatsReport)
    d = asdict(r)
    for key in ("schema", "vizql_in_process", "vizql_external", "chroma_query_memory", "turbo_twin", "prompt_cache"):
        assert key in d


def test_missing_source_degrades_to_none_not_raise():
    with patch("cache_stats._schema_cache_hit_rate", side_effect=FileNotFoundError), \
         patch("cache_stats._vizql_inproc_hit_rate", return_value=0.55), \
         patch("cache_stats._vizql_external_hit_rate", return_value=0.40), \
         patch("cache_stats._chroma_query_memory_hit_rate", return_value=0.33), \
         patch("cache_stats._turbo_twin_hit_rate", return_value=0.22), \
         patch("cache_stats._prompt_cache_hit_rate", return_value=0.75):
        r = collect_for_tenant("t-1")
    assert r.schema is None
    assert r.vizql_in_process == 0.55


def test_tenant_id_is_filter_not_suggestion():
    with patch("cache_stats._schema_cache_hit_rate", side_effect=lambda t: 0.9 if t == "t-1" else 0.1):
        with patch("cache_stats._vizql_inproc_hit_rate", return_value=0.0), \
             patch("cache_stats._vizql_external_hit_rate", return_value=0.0), \
             patch("cache_stats._chroma_query_memory_hit_rate", return_value=0.0), \
             patch("cache_stats._turbo_twin_hit_rate", return_value=0.0), \
             patch("cache_stats._prompt_cache_hit_rate", return_value=0.0):
            r1 = collect_for_tenant("t-1")
            r2 = collect_for_tenant("t-2")
    assert r1.schema == 0.9
    assert r2.schema == 0.1
