"""Skill router.

Composes a skill-set per turn via three-stage process:
1. Always-on (Priority 1) — unconditional.
2. Deterministic — dialect (from connection.db_type) +
   domain (from behavior_engine.detect_domain).
3. Dynamic RAG — top-k from `skills_v1` ChromaDB collection.

Enforces token cap (default 20K) and max-files cap (9). Drops
Priority-3 first, then Priority-2. Never drops Priority-1.

Deduplicates by skill name so a file retrieved by both deterministic
and RAG appears only once.
"""
from __future__ import annotations

import json
import logging
import time
from hashlib import sha256
from pathlib import Path
from typing import Any, Optional

from skill_hit import SkillHit
from skill_library import SkillLibrary

logger = logging.getLogger(__name__)

DEFAULT_MAX_TOTAL_TOKENS = 20000
DEFAULT_MAX_SKILLS = 9
DEFAULT_K = 3

# Mapping from connection.db_type values to skill-library file stems.
_DIALECT_MAP = {
    "postgresql": "dialect-snowflake-postgres-duckdb",
    "postgres": "dialect-snowflake-postgres-duckdb",
    "supabase": "dialect-snowflake-postgres-duckdb",
    "snowflake": "dialect-snowflake-postgres-duckdb",
    "duckdb": "dialect-snowflake-postgres-duckdb",
    "bigquery": "dialect-bigquery",
    "mysql": "dialect-mysql-sqlserver-redshift-databricks",
    "mariadb": "dialect-mysql-sqlserver-redshift-databricks",
    "mssql": "dialect-mysql-sqlserver-redshift-databricks",
    "redshift": "dialect-mysql-sqlserver-redshift-databricks",
    "databricks": "dialect-mysql-sqlserver-redshift-databricks",
}

# Maps behavior_engine.detect_domain() outputs to skill-library file stems.
# detect_domain returns: healthcare | finance | ecommerce | marketing | hr |
# education | logistics | general. We collapse near-synonyms onto the 4
# askdb-skills domain files.
_DOMAIN_MAP = {
    "finance": "domain-product-finance-marketing-ecommerce",
    "ecommerce": "domain-product-finance-marketing-ecommerce",
    "marketing": "domain-product-finance-marketing-ecommerce",
    "hr": "domain-hr-operations",
    "logistics": "domain-hr-operations",
    # "healthcare" + "education" + "general" → no mapping (use generic rules).
}


class SkillRouter:
    def __init__(
        self,
        library: SkillLibrary,
        chroma_collection: Any = None,
        max_total_tokens: int = DEFAULT_MAX_TOTAL_TOKENS,
        max_skills: int = DEFAULT_MAX_SKILLS,
        k: int = DEFAULT_K,
        audit_path: Optional[Path] = None,
    ):
        self.library = library
        self.collection = chroma_collection
        self.max_total_tokens = max_total_tokens
        self.max_skills = max_skills
        self.k = k
        self.audit_path = audit_path

    def resolve(
        self,
        question: str,
        connection_entry: Any,
        action_type: str = "sql-generation",
    ) -> list[SkillHit]:
        start = time.perf_counter()
        seen: set[str] = set()
        hits: list[SkillHit] = []

        # Stage 1: always-on
        for h in self.library.always_on():
            if h.name not in seen:
                hits.append(h)
                seen.add(h.name)

        # Stage 2: deterministic dialect
        dialect_name = self._dialect_for(connection_entry)
        if dialect_name:
            dh = self.library.get(dialect_name)
            if dh and dh.name not in seen:
                hits.append(SkillHit(
                    name=dh.name, priority=dh.priority, tokens=dh.tokens,
                    source="deterministic", content=dh.content, path=dh.path,
                ))
                seen.add(dh.name)

        # Stage 2: deterministic domain
        domain_name = self._domain_for(connection_entry)
        if domain_name:
            dom = self.library.get(domain_name)
            if dom and dom.name not in seen:
                hits.append(SkillHit(
                    name=dom.name, priority=dom.priority, tokens=dom.tokens,
                    source="deterministic", content=dom.content, path=dom.path,
                ))
                seen.add(dom.name)

        # Stage 3: RAG (only if we have a collection wired)
        if self.collection is not None:
            try:
                results = self.collection.query(query_texts=[question], n_results=self.k)
                for meta in (results.get("metadatas", [[]])[0] or []):
                    sk_name = meta.get("name") if isinstance(meta, dict) else None
                    if sk_name and sk_name not in seen:
                        sk = self.library.get(sk_name)
                        if sk:
                            hits.append(SkillHit(
                                name=sk.name, priority=sk.priority, tokens=sk.tokens,
                                source="rag", content=sk.content, path=sk.path,
                            ))
                            seen.add(sk.name)
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_router: RAG failed, continuing without: %s", exc)

        kept = self._enforce_caps(hits)

        # Audit logging (Plan 3 P7T16)
        if self.audit_path is not None:
            try:
                self.audit_path.parent.mkdir(parents=True, exist_ok=True)
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                rec = {
                    "question_hash": sha256(question.encode("utf-8")).hexdigest()[:12],
                    "retrieved": [h.name for h in kept],
                    "latency_ms": elapsed_ms,
                    "total_tokens": sum(h.tokens for h in kept),
                }
                with self.audit_path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(rec) + "\n")
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_router: audit write failed: %s", exc)

        return kept

    # ── Helpers ──

    def _dialect_for(self, conn: Any) -> Optional[str]:
        db_type = (getattr(conn, "db_type", "") or "").lower()
        return _DIALECT_MAP.get(db_type)

    def _domain_for(self, conn: Any) -> Optional[str]:
        try:
            from behavior_engine import detect_domain  # noqa: WPS433
        except ImportError:
            return None
        try:
            schema_info = conn.engine.db.get_schema_info() if getattr(conn, "engine", None) else {}
        except Exception:  # noqa: BLE001
            return None
        domain = detect_domain(schema_info)
        if not domain or domain == "general":
            return None
        return _DOMAIN_MAP.get(domain)

    def add_memory_hits(
        self,
        base_hits: list,
        memory_hits: list,
        weight_cap: float = 0.3,
    ) -> list:
        """Plan 4 T7: merge past-query-memory evidence with a hard weight cap.

        Prevents echo-chamber per learn-from-corrections.md §Cap retrieval
        echo: memory-sourced hits contribute at most `weight_cap` share of
        total token weight. Re-tags accepted hits as source='memory_cache'
        for audit clarity.
        """
        base_tokens = sum(h.tokens for h in base_hits)
        if weight_cap >= 1.0:
            max_memory = sum(h.tokens for h in memory_hits)
        else:
            # memory_tokens <= weight_cap * (base_tokens + memory_tokens)
            # → memory_tokens <= base_tokens * weight_cap / (1 - weight_cap)
            max_memory = int(base_tokens * weight_cap / max(1e-9, 1.0 - weight_cap))

        kept: list = list(base_hits)
        spent = 0
        for h in sorted(memory_hits, key=lambda m: m.tokens):
            if spent + h.tokens > max_memory:
                continue
            kept.append(SkillHit(
                name=h.name, priority=h.priority, tokens=h.tokens,
                source="memory_cache", content=h.content, path=h.path,
            ))
            spent += h.tokens
        return kept

    def _enforce_caps(self, hits: list[SkillHit]) -> list[SkillHit]:
        hits.sort(key=lambda h: (h.priority, h.name))
        kept: list[SkillHit] = []
        total = 0
        for h in hits:
            if len(kept) >= self.max_skills:
                break
            if total + h.tokens > self.max_total_tokens:
                if h.priority == 1:
                    # Never drop P1; make room by popping lowest-priority already-kept.
                    while kept and total + h.tokens > self.max_total_tokens:
                        victim = None
                        for idx in range(len(kept) - 1, -1, -1):
                            if kept[idx].priority >= 3:
                                victim = idx
                                break
                        if victim is None:
                            for idx in range(len(kept) - 1, -1, -1):
                                if kept[idx].priority == 2:
                                    victim = idx
                                    break
                        if victim is None:
                            break
                        removed = kept.pop(victim)
                        total -= removed.tokens
                else:
                    continue
            kept.append(h)
            total += h.tokens
        return kept
