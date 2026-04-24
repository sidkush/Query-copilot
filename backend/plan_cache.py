"""Phase L — PlanCache.

ChromaDB-backed plan retrieval via NL embedding cosine similarity. On lookup,
embeds the NL, queries the tenant+conn-scoped collection, and returns the best
match if cosine similarity is at or above the configured threshold. On store,
writes the serialized `AnalyticalPlan` (as JSON) into metadata alongside the
NL embedding so future lookups can short-circuit the Sonnet planner call.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CachedPlan:
    plan: object  # AnalyticalPlan
    similarity: float
    cached_id: str


class PlanCache:
    def __init__(self, chroma, embedder, cosine_threshold: float = 0.85):
        self._chroma = chroma
        self._embedder = embedder
        self._threshold = cosine_threshold

    def lookup(self, tenant_id: str, conn_id: str, nl: str) -> Optional[CachedPlan]:
        try:
            vec = self._embedder.encode(nl)
        except Exception:
            return None
        try:
            # Coerce numpy → list so mocks and the real ChromaDB client agree.
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
        # ChromaDB cosine distance = 1 - similarity
        similarity = 1.0 - dists[0]
        if similarity < self._threshold:
            return None
        plan_json = metas[0].get("plan_json")
        if not plan_json:
            return None
        from analytical_planner import AnalyticalPlan
        try:
            data = json.loads(plan_json) if isinstance(plan_json, str) else plan_json
            plan = AnalyticalPlan.from_dict(data)
        except Exception:
            return None
        return CachedPlan(plan=plan, similarity=similarity, cached_id=ids[0])

    def store(self, tenant_id: str, conn_id: str, nl: str, plan) -> None:
        try:
            vec = self._embedder.encode(nl)
        except Exception:
            return
        if hasattr(vec, "tolist"):
            vec = vec.tolist()
        doc_id = str(uuid.uuid4())
        # Serialize plan — analytical_planner.AnalyticalPlan defines to_dict().
        try:
            if hasattr(plan, "to_dict"):
                plan_json = json.dumps(plan.to_dict())
            else:
                import dataclasses
                plan_json = json.dumps(dataclasses.asdict(plan))
        except Exception:
            return
        try:
            self._chroma.add(
                ids=[doc_id],
                embeddings=[vec],
                documents=[nl],
                metadatas=[{
                    "tenant_id": tenant_id,
                    "conn_id": conn_id,
                    "plan_json": plan_json,
                }],
            )
        except Exception:
            pass
