"""
Cache Stats aggregator — Phase I.

Reads hit-rate counters from the five cache tiers and returns a per-tenant
report. Never aggregates across tenants (Ring 6 invariant).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CacheStatsReport:
    tenant_id: str
    schema: Optional[float]
    vizql_in_process: Optional[float]
    vizql_external: Optional[float]
    chroma_query_memory: Optional[float]
    turbo_twin: Optional[float]
    prompt_cache: Optional[float]


def _schema_cache_hit_rate(tenant_id: str) -> float:
    path = Path(".data/schema_cache") / f"{tenant_id}.stats.json"
    data = json.loads(path.read_text())
    hits, total = data.get("hits", 0), data.get("total", 0)
    return (hits / total) if total else 0.0


def _vizql_inproc_hit_rate(tenant_id: str) -> float:
    from waterfall_router import vizcache_stats_for_tenant
    return vizcache_stats_for_tenant(tenant_id, tier="in_process")


def _vizql_external_hit_rate(tenant_id: str) -> float:
    from waterfall_router import vizcache_stats_for_tenant
    return vizcache_stats_for_tenant(tenant_id, tier="external")


def _chroma_query_memory_hit_rate(tenant_id: str) -> float:
    from query_memory import QueryMemory
    qm = QueryMemory()
    return qm.tenant_hit_rate(tenant_id)


def _turbo_twin_hit_rate(tenant_id: str) -> float:
    from duckdb_twin import turbo_tenant_hit_rate
    return turbo_tenant_hit_rate(tenant_id)


def _prompt_cache_hit_rate(tenant_id: str) -> float:
    from anthropic_provider import prompt_cache_hit_rate_for_tenant
    return prompt_cache_hit_rate_for_tenant(tenant_id)


def _safe(fn, tenant_id: str) -> Optional[float]:
    try:
        return fn(tenant_id)
    except Exception as exc:
        fn_name = getattr(fn, "__name__", repr(fn))
        logger.info("cache_stats source missing tenant=%s fn=%s: %s", tenant_id, fn_name, exc)
        return None


def collect_for_tenant(tenant_id: str) -> CacheStatsReport:
    return CacheStatsReport(
        tenant_id=tenant_id,
        schema=_safe(_schema_cache_hit_rate, tenant_id),
        vizql_in_process=_safe(_vizql_inproc_hit_rate, tenant_id),
        vizql_external=_safe(_vizql_external_hit_rate, tenant_id),
        chroma_query_memory=_safe(_chroma_query_memory_hit_rate, tenant_id),
        turbo_twin=_safe(_turbo_twin_hit_rate, tenant_id),
        prompt_cache=_safe(_prompt_cache_hit_rate, tenant_id),
    )
