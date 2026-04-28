"""Phase L — PlanCache.

ChromaDB-backed plan retrieval via NL embedding cosine similarity. On lookup,
embeds the NL, queries the tenant+conn-scoped collection, and returns the best
match if cosine similarity is at or above the configured threshold. On store,
writes the serialized `AnalyticalPlan` (as JSON) into metadata alongside the
NL embedding so future lookups can short-circuit the Sonnet planner call.

Hardening (S1, 2026-04-24 adversarial):
- Composite deterministic doc_id `sha256(tenant|conn|nl_norm)` — overwrites
  replace instead of spawning duplicates; tenant cannot collide with another
  tenant's NL hash.
- `tenant_id` non-empty invariant enforced at store + lookup (raise ValueError).
- `schema_hash` kwarg — if provided at store, written to metadata; if provided
  at lookup, mismatch evicts (DDL invalidates plans).
- `created_at` TTL enforced on read using `PLAN_CACHE_TTL_HOURS` from config.
"""
from __future__ import annotations

import hashlib
import json
import time
import unicodedata
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CachedPlan:
    plan: object  # AnalyticalPlan
    similarity: float
    cached_id: str


def _normalize_nl(nl: str) -> str:
    return unicodedata.normalize("NFKC", nl or "").strip().lower()


def _compose_doc_id(tenant_id: str, conn_id: str, nl: str) -> str:
    key = f"{tenant_id}|{conn_id}|{_normalize_nl(nl)}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def compose_plan_cache_collection_name(tenant_id, conn_id) -> str:
    """ChromaDB collection name for the plan cache.

    Composite tenant+conn key for defense-in-depth. PlanCache already enforces
    tenant isolation at doc_id (sha256(tenant|conn|nl)) + where-filter
    (where={"tenant_id": ...}); this adds the same isolation at the Chroma
    collection layer so a conn_id collision cannot mix tenants.

    Format: plan_cache_<16-hex tenant>_<32-hex conn> (60 chars total).
    Pre-Wave-2 collections (43 chars: plan_cache_<32-hex conn>) become orphans
    — never queried by new code. See scripts/purge_legacy_plan_cache.py for
    opt-in cleanup.
    """
    tenant_id_str = str(tenant_id) if tenant_id else "default"
    conn_id_str = str(conn_id) if conn_id else "default"
    tenant_safe = hashlib.sha256(tenant_id_str.encode("utf-8")).hexdigest()[:16]
    conn_id_safe = hashlib.sha256(conn_id_str.encode("utf-8")).hexdigest()[:32]
    return f"plan_cache_{tenant_safe}_{conn_id_safe}"


def _ttl_hours() -> int:
    try:
        from config import settings
        return int(getattr(settings, "PLAN_CACHE_TTL_HOURS", 168))
    except Exception:
        return 168


class PlanCache:
    def __init__(self, chroma, embedder, cosine_threshold: float = 0.85):
        self._chroma = chroma
        self._embedder = embedder
        self._threshold = cosine_threshold

    def lookup(
        self,
        tenant_id: str,
        conn_id: str,
        nl: str,
        schema_hash: Optional[str] = None,
    ) -> Optional[CachedPlan]:
        if not tenant_id:
            raise ValueError("tenant_id must be non-empty")
        try:
            vec = self._embedder.encode(nl)
        except Exception:
            return None
        try:
            if hasattr(vec, "tolist"):
                vec = vec.tolist()
            result = self._chroma.query(
                query_embeddings=[vec],
                n_results=1,
                where={"tenant_id": tenant_id, "conn_id": conn_id},
            )
        except Exception:
            return None
        ids = (result.get("ids") or [[]])[0]
        dists = (result.get("distances") or [[]])[0]
        metas = (result.get("metadatas") or [[]])[0]
        if not ids:
            return None
        similarity = 1.0 - dists[0]
        if similarity < self._threshold:
            return None
        meta = metas[0] or {}

        created_at = meta.get("created_at")
        if created_at is not None:
            age_hours = (time.time() - float(created_at)) / 3600.0
            if age_hours > _ttl_hours():
                return None

        if schema_hash is not None and meta.get("schema_hash") != schema_hash:
            return None

        plan_json = meta.get("plan_json")
        if not plan_json:
            return None
        from analytical_planner import AnalyticalPlan
        try:
            data = json.loads(plan_json) if isinstance(plan_json, str) else plan_json
            plan = AnalyticalPlan.from_dict(data)
        except Exception:
            return None
        return CachedPlan(plan=plan, similarity=similarity, cached_id=ids[0])

    def store(
        self,
        tenant_id: str,
        conn_id: str,
        nl: str,
        plan,
        schema_hash: Optional[str] = None,
    ) -> None:
        if not tenant_id:
            raise ValueError("tenant_id must be non-empty")
        try:
            vec = self._embedder.encode(nl)
        except Exception:
            return
        if hasattr(vec, "tolist"):
            vec = vec.tolist()
        doc_id = _compose_doc_id(tenant_id, conn_id, nl)
        try:
            if hasattr(plan, "to_dict"):
                plan_json = json.dumps(plan.to_dict())
            else:
                import dataclasses
                plan_json = json.dumps(dataclasses.asdict(plan))
        except Exception:
            return
        meta = {
            "tenant_id": tenant_id,
            "conn_id": conn_id,
            "plan_json": plan_json,
            "created_at": time.time(),
        }
        if schema_hash is not None:
            meta["schema_hash"] = schema_hash
        try:
            self._chroma.add(
                ids=[doc_id],
                embeddings=[vec],
                documents=[nl],
                metadatas=[meta],
            )
        except Exception:
            pass
