"""
waterfall_router.py — WaterfallRouter framework (strategy pattern).

Each tier exposes can_answer() and answer(); the router tries tiers in order
and returns the first hit.  Tiers that are not yet implemented (Phases 2–4)
are wired in as placeholders so the routing table is established now.

Phase map
---------
  Phase 1  (current)  — SchemaTier   : structural/metadata questions
  Phase 2  (future)   — MemoryTier   : recent-query answer cache
  Phase 3  (future)   — TurboTier    : pre-computed aggregate cache
  Phase 4  (future)   — LiveTier     : full LLM + SQL execution

Invariants
----------
  INVARIANT-2: Any tier that returns actual data rows MUST note that
  mask_dataframe() should be called by the caller.
  # INVARIANT-2: caller must run mask_dataframe() on any rows in result
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from audit_trail import log_tier_decision, log_memory_event
from query_memory import QueryMemory
from schema_intelligence import SchemaProfile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TierResult
# ---------------------------------------------------------------------------

@dataclass
class TierResult:
    """
    Unified result envelope returned by every tier and the router itself.

    Fields
    ------
    hit : bool
        True when the tier was able to produce an answer.
    tier_name : str
        Identifier of the tier that produced this result, or "none" when
        no tier matched.
    data : Optional[dict]
        Payload on a hit.  Keys:
          answer            – human-readable answer string
          confidence        – float 0.0–1.0
          source            – e.g. "schema_profile", "memory_cache", "live_sql"
          cache_age_seconds – seconds since data was cached (0 = live)
          columns           – list of column-name strings (may be empty)
          rows              – list of row dicts / lists
                              # INVARIANT-2: caller must run mask_dataframe()
                              #              on any rows in result
    metadata : dict
        Routing diagnostics.  Keys:
          tiers_checked – ordered list of tier names that were evaluated
          time_ms       – total routing wall-clock time in milliseconds
          schema_hash   – hash of the SchemaProfile at routing time
    """

    hit: bool
    tier_name: str
    data: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=lambda: {
        "tiers_checked": [],
        "time_ms": 0,
        "schema_hash": "",
    })
    cache_age_seconds: Optional[float] = None   # seconds since data was cached (None = unknown/live)
    is_stale: Optional[bool] = None             # True if cache_age exceeds staleness TTL


# ---------------------------------------------------------------------------
# BaseTier
# ---------------------------------------------------------------------------

class BaseTier(ABC):
    """Abstract base class for all waterfall tiers.

    Template Method pattern (P0 fix 2026-04-07):
    ``answer()`` is a concrete method that calls the abstract ``_answer()``
    then applies PII masking to any tabular data in the result.  Subclasses
    override ``_answer()`` only — never ``answer()``.

    This makes Invariant-2 structurally enforced: no tier can return unmasked
    data, even if a new tier is added without awareness of the masking contract.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Short identifier used in logging and TierResult.tier_name."""

    @abstractmethod
    async def can_answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> bool:
        """
        Return True if this tier is capable of answering *question* given the
        current *schema_profile* and *conn_id*.  Must not raise.
        """

    def __init_subclass__(cls, **kwargs):
        """Prevent subclasses from overriding answer() — enforce Template Method."""
        super().__init_subclass__(**kwargs)
        if "answer" in cls.__dict__:
            raise TypeError(
                f"{cls.__name__} must not override 'answer()' — "
                f"override '_answer()' instead. See BaseTier docstring."
            )

    async def answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> TierResult:
        """
        Template method — calls _answer() then masks any tabular data.

        DO NOT OVERRIDE in subclasses.  Override _answer() instead.
        Enforced at class-definition time by __init_subclass__.
        """
        result = await self._answer(question, schema_profile, conn_id)
        return self._apply_masking(result, conn_id=conn_id)

    @abstractmethod
    async def _answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> TierResult:
        """
        Produce a TierResult for *question*.  Called only after can_answer()
        returned True.  May raise NotImplementedError for placeholder tiers.

        Subclasses implement this instead of answer().
        """

    @staticmethod
    def _apply_masking(result: TierResult, conn_id: str = "") -> TierResult:
        """Apply PII masking to any tabular rows in the result (Invariant-2).

        Type-aware: only masks when result.data contains a 'rows' list with
        actual row data (list of dicts/lists).  Skips schema metadata (dicts
        without 'rows'), string answers, and empty row lists.

        P0 fix (2026-04-07 NEMESIS): On masking failure, returns
        TierResult(hit=False) instead of unmasked data.  This converts a
        silent PII leak into a safe miss that falls through to the next tier.

        Task 3.2 optimization: If this is a turbo-tier result whose twin was
        already PII-masked at write time (WRITE_TIME_MASKING=True), skip the
        redundant read-time masking pass.  Non-turbo tiers are ALWAYS masked
        regardless of this flag (Invariant-9).
        """
        # ── Write-time masking short-circuit (turbo only) ──────────────────
        if result.tier_name == "turbo":
            try:
                from config import settings as _settings
                if (
                    _settings.WRITE_TIME_MASKING
                    and result.metadata.get("masked_at_write")
                ):
                    logger.debug(
                        "Skipping read-time masking for turbo tier (write-time masking active)"
                    )
                    return result
            except Exception:
                pass  # Config unavailable — fall through to normal masking

        # Arrow path — mask RecordBatch directly
        try:
            from config import settings as _cfg
            if _cfg.ARROW_BRIDGE_ENABLED and result.data and "record_batch" in result.data and result.data["record_batch"] is not None:
                try:
                    from pii_masking import mask_record_batch
                    masked_batch = mask_record_batch(result.data["record_batch"], conn_id=conn_id)
                    result.data["record_batch"] = masked_batch
                    return result
                except Exception:
                    if not _cfg.ARROW_FALLBACK_TO_PANDAS:
                        return TierResult(hit=False, tier_name=result.tier_name,
                                          metadata={**result.metadata, "masking_error": True})
                    # Fall through to pandas path
        except Exception:
            pass  # Config unavailable — fall through to pandas path

        if not result.hit or not result.data:
            return result

        rows = result.data.get("rows")
        if not rows or not isinstance(rows, list) or len(rows) == 0:
            return result

        # rows contains actual data — mask via DataFrame conversion
        try:
            import pandas as pd
            from pii_masking import mask_dataframe

            columns = result.data.get("columns", [])
            # rows may be list of dicts or list of lists
            if isinstance(rows[0], dict):
                df = pd.DataFrame(rows)
            elif columns and len(rows[0]) == len(columns):
                df = pd.DataFrame(rows, columns=columns)
            elif columns:
                # Shape mismatch — use inferred columns to avoid ValueError
                df = pd.DataFrame(rows)
            else:
                # Can't mask without column names — return copy with empty rows
                # NEMESIS2 Op 6: don't mutate result.data in place (shared reference risk)
                safe_data = {**result.data, "rows": []}
                return TierResult(
                    hit=result.hit, tier_name=result.tier_name,
                    data=safe_data, metadata=dict(result.metadata),
                )

            masked_df = mask_dataframe(df, conn_id=conn_id if conn_id else None)
            result.data["rows"] = masked_df.to_dict("records")
            logger.debug("BaseTier._apply_masking: masked %d rows", len(rows))
        except Exception as exc:
            # P0 NEMESIS fix: masking failure is a SECURITY EVENT, not a benign warning.
            # Return a miss so the waterfall falls through instead of leaking PII.
            # NEMESIS2 fixes: deep-copy metadata (Op 8), use empty dict not None for data (Op 10).
            logger.error(
                "BaseTier._apply_masking FAILED — returning miss to prevent PII leak: %s",
                exc, exc_info=True,
            )
            return TierResult(
                hit=False,
                tier_name=result.tier_name,
                data={},  # NEMESIS2 Op 10: empty dict, not None — prevents .get() crashes
                metadata=dict(result.metadata),  # NEMESIS2 Op 8: copy to avoid shared-reference mutation
            )

        return result


# ---------------------------------------------------------------------------
# SchemaTier  (Phase 1 — structural / metadata questions)
# ---------------------------------------------------------------------------

# Patterns that indicate a structural question answerable from schema metadata.
_SCHEMA_PATTERNS: List[re.Pattern] = [
    re.compile(r"\bwhat\s+tables\b",               re.IGNORECASE),
    re.compile(r"\blist\s+tables\b",               re.IGNORECASE),
    re.compile(r"\bshow\s+tables\b",               re.IGNORECASE),
    re.compile(r"\ball\s+tables\b",                re.IGNORECASE),
    re.compile(r"\blist\s+columns\b",              re.IGNORECASE),
    re.compile(r"\bshow\s+columns\b",              re.IGNORECASE),
    re.compile(r"\bwhat\s+columns\b",              re.IGNORECASE),
    re.compile(r"\bcolumns\s+in\b",                re.IGNORECASE),
    re.compile(r"\bfields\s+in\b",                 re.IGNORECASE),
    re.compile(r"\bdescribe\s+table\b",            re.IGNORECASE),
    re.compile(r"\bdescribe\b.*\btable\b",         re.IGNORECASE),
    re.compile(r"\bshow\s+schema\b",               re.IGNORECASE),
    re.compile(r"\blist\s+schema\b",               re.IGNORECASE),
    re.compile(r"\bwhat\s+is\s+the\s+schema\b",   re.IGNORECASE),
    re.compile(r"\bschema\s+of\b",                 re.IGNORECASE),
    re.compile(r"\btable\s+structure\b",           re.IGNORECASE),
    re.compile(r"\bhow\s+many\s+rows\b",           re.IGNORECASE),
    re.compile(r"\brow\s+count\b",                 re.IGNORECASE),
    re.compile(r"\bsize\s+of\s+(the\s+)?(table|database|db)\b", re.IGNORECASE),
    re.compile(r"\bhow\s+big\s+is\b",              re.IGNORECASE),
    re.compile(r"\bprimary\s+key\b",               re.IGNORECASE),
    re.compile(r"\bforeign\s+key\b",               re.IGNORECASE),
    re.compile(r"\bindexes?\b",                    re.IGNORECASE),
    re.compile(r"\bdata\s+types?\b",               re.IGNORECASE),
]


def _match_schema_question(question: str) -> bool:
    """Return True if any structural-question pattern matches *question*."""
    return any(p.search(question) for p in _SCHEMA_PATTERNS)


def _format_schema_answer(schema_profile: SchemaProfile) -> str:
    """
    Build a natural-language summary of the schema from *schema_profile*.

    Returns a multi-line string suitable for direct display to the user.
    """
    if not schema_profile.tables:
        return "The schema profile contains no tables."

    lines: List[str] = []
    lines.append(
        f"This database contains {len(schema_profile.tables)} table(s):\n"
    )

    for tbl in sorted(schema_profile.tables, key=lambda t: t.name):
        # --- table header ---------------------------------------------------
        row_info = (
            f"{tbl.row_count_estimate:,} rows (estimated)"
            if tbl.row_count_estimate >= 0
            else "row count unknown"
        )
        lines.append(f"  {tbl.name}  [{row_info}]")

        # --- columns --------------------------------------------------------
        if tbl.columns:
            for col in tbl.columns:
                col_name = col.get("name", "<unnamed>")
                col_type = col.get("type", "unknown")
                nullable = col.get("nullable", True)
                pk_marker = " (PK)" if col_name in tbl.primary_keys else ""
                null_marker = "" if nullable else " NOT NULL"
                lines.append(f"      • {col_name}: {col_type}{null_marker}{pk_marker}")
        else:
            lines.append("      (no column information available)")

        # --- foreign keys ---------------------------------------------------
        if tbl.foreign_keys:
            for fk in tbl.foreign_keys:
                constrained = fk.get("constrained_columns", [])
                referred_table = fk.get("referred_table", "?")
                referred_cols = fk.get("referred_columns", [])
                lines.append(
                    f"      FK: {constrained} → {referred_table}({referred_cols})"
                )

        lines.append("")  # blank separator between tables

    return "\n".join(lines).rstrip()


class SchemaTier(BaseTier):
    """
    Phase 1 tier — answers structural questions directly from SchemaProfile
    metadata without issuing any queries to the connected database.
    """

    @property
    def name(self) -> str:
        return "schema"

    async def can_answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> bool:
        return _match_schema_question(question)

    async def _answer(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
    ) -> TierResult:
        logger.debug("SchemaTier._answer called for conn_id=%s", conn_id)

        answer_text = _format_schema_answer(schema_profile)

        # Build a lightweight columns list for the data envelope.
        table_names = [t.name for t in sorted(schema_profile.tables, key=lambda t: t.name)]

        return TierResult(
            hit=True,
            tier_name=self.name,
            data={
                "answer": answer_text,
                "confidence": 0.95,
                "source": "schema_profile",
                "cache_age_seconds": 0,
                "columns": table_names,
                # No actual data rows are returned by SchemaTier, so
                # INVARIANT-2 is satisfied (no mask_dataframe call needed).
                # INVARIANT-2: caller must run mask_dataframe() on any rows in result
                "rows": [],
            },
            # metadata is populated by WaterfallRouter before returning.
            metadata={
                "tiers_checked": [],
                "time_ms": 0,
                "schema_hash": schema_profile.schema_hash,
            },
        )


# ---------------------------------------------------------------------------
# MemoryTier  (Phase 2 placeholder)
# ---------------------------------------------------------------------------

class MemoryTier(BaseTier):
    """Tier 1: Answers from shared anonymized query memory (ChromaDB)."""

    def __init__(self):
        self._memory = QueryMemory()

    @property
    def name(self) -> str:
        return "memory"

    async def can_answer(self, question: str, schema_profile, conn_id: str) -> bool:
        if not conn_id:
            return False
        # P0 fix: do NOT store match on instance — causes cross-user data leakage
        # on the singleton router. answer() re-queries instead.
        match = self._memory.find_similar(conn_id, question)
        return bool(match and self._memory.is_fresh(match))

    async def _answer(self, question: str, schema_profile, conn_id: str) -> TierResult:
        # P0 fix: always re-query — never read from instance state.
        # The ~19ms cost of a second ChromaDB lookup is negligible compared to
        # the cross-user data leakage risk of caching on a shared singleton.
        match = self._memory.find_similar(conn_id, question)
        if not match:
            return TierResult(hit=False, tier_name="memory")

        from datetime import datetime, timezone
        stored_at = match.get("stored_at", "")
        cache_age = 0
        if stored_at:
            try:
                dt = datetime.fromisoformat(stored_at)
                cache_age = int((datetime.now(timezone.utc) - dt).total_seconds())
            except (ValueError, TypeError):
                pass

        # Log memory retrieval
        try:
            log_memory_event(conn_id, "retrieved", hashlib.sha256(question.encode()).hexdigest()[:12])
        except Exception:
            pass
        # INVARIANT-2: caller must run mask_dataframe() on any rows in result
        return TierResult(
            hit=True,
            tier_name="memory",
            data={
                "answer": match.get("summary", ""),
                "confidence": match.get("confidence", 0.5),
                "source": "query_memory",
                "cache_age_seconds": cache_age,
                "columns": match.get("columns", []),
                "rows": [],  # Memory stores summaries, not raw rows
            },
            metadata={
                "tiers_checked": ["memory"],
                "time_ms": 0,
                "schema_hash": match.get("schema_hash", ""),
            },
        )


# ---------------------------------------------------------------------------
# TurboTier  (Phase 3 — DuckDB local twin, opt-in Turbo Mode)
# ---------------------------------------------------------------------------

class TurboTier(BaseTier):
    """Tier 2a: Answers from DuckDB local twin (opt-in Turbo Mode)."""

    def __init__(self):
        from duckdb_twin import DuckDBTwin
        self._twin = DuckDBTwin()

    @property
    def name(self) -> str:
        return "turbo"

    async def can_answer(self, question: str, schema_profile, conn_id: str) -> bool:
        if not conn_id:
            return False
        # Check if twin exists for this connection
        if not self._twin.twin_exists(conn_id):
            return False
        # Check twin freshness via metadata
        info = self._twin.get_twin_info(conn_id)
        if not info or not info.get("exists"):
            return False
        return True

    async def _answer(self, question: str, schema_profile, conn_id: str) -> TierResult:
        # We need SQL to query the twin — use the schema to help generate it
        # For now, TurboTier answers when called explicitly from the waterfall
        # after SQL is already generated. The agent generates SQL, and if turbo
        # is available, we redirect the execution to the twin.
        #
        # This tier is special: it doesn't generate answers from questions directly.
        # Instead, it's used by the agent's run_sql tool as an execution backend.
        # The can_answer check here just confirms the twin is available.

        info = self._twin.get_twin_info(conn_id)
        cache_age = 0
        if info and info.get("last_sync"):
            try:
                from datetime import datetime, timezone
                sync_dt = datetime.fromisoformat(info["last_sync"])
                cache_age = int((datetime.now(timezone.utc) - sync_dt).total_seconds())
            except (ValueError, TypeError):
                pass

        # INVARIANT-2: caller must run mask_dataframe() on any rows in result.
        # masked_at_write is propagated into metadata so _apply_masking can
        # skip redundant read-time masking when write-time masking was active.
        return TierResult(
            hit=True,
            tier_name="turbo",
            data={
                "answer": f"Turbo Mode available. Twin has {len(info.get('tables', []))} tables, synced {cache_age}s ago.",
                "confidence": 0.9,
                "source": "duckdb_twin",
                "cache_age_seconds": cache_age,
                "columns": [],
                "rows": [],
                "record_batch": None,  # Arrow path — populated by execute_on_twin()
            },
            metadata={
                "tiers_checked": ["turbo"],
                "time_ms": 0,
                "schema_hash": info.get("schema_hash", "") if info else "",
                "masked_at_write": info.get("masked_at_write") if info else None,
            },
        )

    def execute_on_twin(self, conn_id: str, sql: str) -> Optional[dict]:
        """Execute SQL directly on the DuckDB twin. Returns {columns, rows, row_count, query_ms} or None."""
        try:
            return self._twin.query_twin(conn_id, sql)
        except Exception as e:
            logger.warning("TurboTier execute failed: %s", e)
            return None


# ---------------------------------------------------------------------------
# LiveTier  (Phase 4 — final fallback, always answers)
# ---------------------------------------------------------------------------

class LiveTier(BaseTier):
    """Tier 2b: Final fallback — executes queries directly on the live database.
    Supports query decomposition for parallel execution when possible.

    INVARIANT-2: caller must run mask_dataframe() on any rows in result.
    """

    def __init__(self):
        from query_decomposer import QueryDecomposer
        self._decomposer = QueryDecomposer()

    @property
    def name(self) -> str:
        return "live"

    async def can_answer(self, question: str, schema_profile, conn_id: str) -> bool:
        # LiveTier is the final fallback — always returns True
        return True

    async def _answer(self, question: str, schema_profile, conn_id: str) -> TierResult:
        # LiveTier signals availability — actual execution is handled by the agent's run_sql tool.
        # This tier exists to:
        # 1. Confirm the waterfall exhausted all faster tiers
        # 2. Provide decomposition hints if the query can be split
        # 3. (NEW) Try DataFusion local execution if a DuckDB twin exists

        import os
        from config import settings

        can_decompose = False
        decomposition_info = None

        # We don't have the SQL here (question is NL, not SQL), so we can't decompose yet.
        # Decomposition happens at execution time in the agent's run_sql tool.
        # This tier just signals "go to live DB".

        # --- DataFusion local execution path ---
        # When DataFusion is enabled and a DuckDB twin exists, attempt to
        # plan and execute the question as SQL locally (<100ms vs 3-10s agent).
        # The question *may* already be valid SQL forwarded from an upstream
        # tier or the agent; if not, plan_query() will return None harmlessly.
        if settings.DATAFUSION_ENABLED:
            try:
                from datafusion_engine import DataFusionEngine
                twin_path = os.path.join(settings.TURBO_TWIN_DIR, f"{conn_id}.duckdb")
                if os.path.exists(twin_path):
                    df_engine = DataFusionEngine()
                    df_engine.register_duckdb_twin(conn_id, twin_path)

                    # Treat question as potential SQL — plan_query returns None
                    # if it isn't valid SQL, so this is safe to try.
                    plan = df_engine.plan_query(question)
                    if plan and plan.is_optimizable:
                        result_batch = df_engine.execute_sql(question)
                        if result_batch is not None and result_batch.num_rows > 0:
                            return TierResult(
                                hit=True,
                                tier_name="datafusion",
                                data={
                                    "record_batch": result_batch,
                                    "columns": [f.name for f in result_batch.schema],
                                    "rows": None,
                                    "answer": "",
                                    "confidence": 0.85,
                                    "source": "datafusion_local",
                                },
                                metadata={
                                    "strategy": plan.strategy,
                                    "plan": plan.plan_str[:200],
                                },
                            )
            except Exception as e:
                logger.warning("DataFusion failed for %s, falling back: %s", conn_id, e)
                if not settings.DATAFUSION_FALLBACK_TO_DECOMPOSER:
                    raise

        # --- Default fallback: signal agent to execute on live DB ---
        return TierResult(
            hit=True,
            tier_name="live",
            data={
                "answer": "",  # No pre-computed answer — agent will generate and execute SQL
                "confidence": 1.0,
                "source": "live_database",
                "cache_age_seconds": 0,
                "columns": [],
                "rows": [],
            },
            metadata={
                "tiers_checked": ["live"],
                "time_ms": 0,
                "schema_hash": schema_profile.schema_hash if schema_profile else "",
                "decomposition_available": can_decompose,
            },
        )

    def check_decomposition(self, sql: str, schema_profile) -> dict:
        """Check if a SQL query can be decomposed for parallel execution.
        Called by the agent's run_sql tool before execution.
        Returns {can_decompose: bool, sub_queries: list[SubQuery] | None, reason: str}
        """
        try:
            if self._decomposer.can_decompose(sql, schema_profile):
                sub_queries = self._decomposer.decompose(sql, schema_profile)
                return {
                    "can_decompose": True,
                    "sub_queries": sub_queries,
                    "reason": f"Decomposed into {len(sub_queries)} parallel sub-queries",
                }
            return {"can_decompose": False, "sub_queries": None, "reason": "Query cannot be decomposed"}
        except Exception as e:
            logger.warning("Decomposition check failed: %s", e)
            return {"can_decompose": False, "sub_queries": None, "reason": f"Error: {e}"}


# ---------------------------------------------------------------------------
# ValidationGate
# ---------------------------------------------------------------------------

class ValidationGate:
    """
    Guards against serving a cached TierResult when the underlying schema
    has drifted since the result was produced.

    Usage
    -----
    gate = ValidationGate()
    if gate.validate(tier_result, current_schema_hash):
        return tier_result
    else:
        # schema has drifted — fall through to a lower/live tier
        ...
    """

    def validate(self, tier_result: TierResult, current_schema_hash: str) -> bool:
        """
        Return True if the tier result is still valid for the current schema.

        Compares *current_schema_hash* against the hash stored in
        ``tier_result.metadata["schema_hash"]``.  A missing or empty hash in
        metadata is treated as "unknown" and passes validation (to avoid
        blocking tiers that do not embed a hash, e.g. SchemaTier itself).

        Parameters
        ----------
        tier_result : TierResult
            The result to validate.
        current_schema_hash : str
            The live schema hash at the time of routing.

        Returns
        -------
        bool
            True  → schema unchanged; result is safe to serve.
            False → schema drift detected; result must not be served.
        """
        cached_hash: str = tier_result.metadata.get("schema_hash", "")

        if not cached_hash:
            # P1 fix: missing hash is suspicious for data-returning tiers.
            # SchemaTier (which reads live data) is safe to pass through.
            # Memory/Turbo tiers SHOULD have a hash — warn if missing.
            if tier_result.tier_name in ("memory", "turbo"):
                logger.warning(
                    "ValidationGate: no schema_hash in metadata for tier '%s'; "
                    "rejecting (data-returning tier should embed hash).",
                    tier_result.tier_name,
                )
                return False
            # Schema/Live tiers: pass through (they read live data)
            logger.debug(
                "ValidationGate: no schema_hash for tier '%s'; "
                "allowing (live-data tier).",
                tier_result.tier_name,
            )
            return True

        if cached_hash == current_schema_hash:
            logger.debug(
                "ValidationGate: schema hash OK for tier '%s' (hash=%s).",
                tier_result.tier_name, cached_hash,
            )
            return True

        logger.warning(
            "ValidationGate: schema drift detected for tier '%s' "
            "(cached=%s, current=%s).  Invalidating result.",
            tier_result.tier_name, cached_hash, current_schema_hash,
        )
        return False


# ---------------------------------------------------------------------------
# WaterfallRouter
# ---------------------------------------------------------------------------

class WaterfallRouter:
    """
    Tries each tier in order and returns the first hit that passes the
    ValidationGate.

    Construction
    ------------
    router = WaterfallRouter(tiers=[
        SchemaTier(),
        MemoryTier(),
        TurboTier(),
        LiveTier(),
    ])

    result = await router.route(question, schema_profile, conn_id)

    If no tier can answer the question a TierResult with hit=False and
    tier_name="none" is returned.

    Metadata
    --------
    Every returned TierResult.metadata contains:
      tiers_checked – ordered list of tier names that were evaluated
      time_ms       – total wall-clock routing time in milliseconds
      schema_hash   – the schema hash at routing time
    """

    def __init__(self, tiers: List[BaseTier]) -> None:
        if not tiers:
            raise ValueError("WaterfallRouter requires at least one tier.")
        self._tiers = tiers
        self._gate = ValidationGate()
        logger.info(
            "WaterfallRouter initialised with tiers: %s",
            [t.name for t in tiers],
        )

    async def route(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
    ) -> TierResult:
        """
        Route *question* through the tier waterfall.

        Parameters
        ----------
        question : str
            The user's natural-language question.
        schema_profile : SchemaProfile
            The enriched schema snapshot for the current connection.
        conn_id : str
            The connection identifier (used for logging / cache keying).

        Returns
        -------
        TierResult
            The first hit that passes the ValidationGate, or a miss result
            with tier_name="none" if no tier could answer.
        """
        start_ns = time.perf_counter_ns()
        tiers_checked: List[str] = []
        tier_timings: Dict[str, float] = {}  # G2/G4 instrumentation
        current_hash = schema_profile.schema_hash

        # P1a: timing budgets from config (NEMESIS fix: was hardcoded, duplicated)
        from config import settings
        CAN_ANSWER_BUDGET_MS = settings.WATERFALL_CAN_ANSWER_BUDGET_MS
        ANSWER_BUDGET_MS = settings.WATERFALL_ANSWER_BUDGET_MS

        logger.info(
            "WaterfallRouter.route: conn_id=%s question=%r schema_hash=%s",
            conn_id, question[:120], current_hash,
        )

        for tier in self._tiers:
            tier_start = time.perf_counter_ns()

            try:
                can = await tier.can_answer(question, schema_profile, conn_id)
            except Exception as exc:
                logger.error(
                    "WaterfallRouter: tier '%s' can_answer() raised: %s",
                    tier.name, exc, exc_info=True,
                )
                tiers_checked.append(tier.name)
                tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000
                continue

            can_ms = (time.perf_counter_ns() - tier_start) / 1_000_000
            tiers_checked.append(tier.name)

            if not can:
                tier_timings[tier.name] = can_ms
                continue

            # P1a: discard if can_answer took too long
            if can_ms > CAN_ANSWER_BUDGET_MS and tier.name not in ("live",):
                logger.warning(
                    "WaterfallRouter: tier '%s' can_answer() took %.1fms (budget=%dms); skipping.",
                    tier.name, can_ms, CAN_ANSWER_BUDGET_MS,
                )
                tier_timings[tier.name] = can_ms
                continue

            logger.info(
                "WaterfallRouter: tier '%s' accepted question; calling answer().",
                tier.name,
            )
            answer_start = time.perf_counter_ns()
            try:
                result = await tier.answer(question, schema_profile, conn_id)
            except NotImplementedError:
                logger.warning(
                    "WaterfallRouter: tier '%s' raised NotImplementedError; falling through.",
                    tier.name,
                )
                tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000
                continue
            except Exception as exc:
                # P1b: any error → fall through to next tier
                logger.warning(
                    "WaterfallRouter: tier '%s' answer() raised %s: %s; falling through.",
                    tier.name, type(exc).__name__, exc,
                )
                tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000
                continue

            answer_ms = (time.perf_counter_ns() - answer_start) / 1_000_000
            tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000

            # P1a: discard if answer took too long
            if answer_ms > ANSWER_BUDGET_MS and tier.name not in ("live",):
                logger.warning(
                    "WaterfallRouter: tier '%s' answer() took %.1fms (budget=%dms); discarding.",
                    tier.name, answer_ms, ANSWER_BUDGET_MS,
                )
                continue

            if not result.hit:
                continue

            if not self._gate.validate(result, current_hash):
                continue

            # P0 Template Method in BaseTier.answer() handles masking.
            # NEMESIS finding: removing redundant _apply_masking here
            # eliminates 2x memory + 2x CPU per hit (Ops 10, 11).

            elapsed_ms = (time.perf_counter_ns() - start_ns) // 1_000_000
            result.metadata["tiers_checked"] = tiers_checked
            result.metadata["time_ms"] = int(elapsed_ms)
            result.metadata["schema_hash"] = current_hash
            result.metadata["tier_timings"] = tier_timings
            result.metadata["additional_filters"] = additional_filters or []

            logger.info(
                "WaterfallRouter: hit on tier '%s' in %d ms (tiers_checked=%s).",
                tier.name, elapsed_ms, tiers_checked,
            )
            try:
                log_tier_decision(
                    conn_id=conn_id, email_hash="",
                    question_hash=hashlib.sha256(question.encode()).hexdigest()[:12],
                    tiers_checked=tiers_checked,
                    tier_hit=result.tier_name,
                    schema_hash=schema_profile.schema_hash if schema_profile else "",
                    cache_age_s=result.data.get("cache_age_seconds", 0) if result.data else 0,
                    reason="hit",
                )
            except Exception:
                pass
            return result

        elapsed_ms = (time.perf_counter_ns() - start_ns) // 1_000_000
        logger.info(
            "WaterfallRouter: no tier matched in %d ms (tiers_checked=%s).",
            elapsed_ms, tiers_checked,
        )
        try:
            log_tier_decision(
                conn_id=conn_id, email_hash="",
                question_hash=hashlib.sha256(question.encode()).hexdigest()[:12],
                tiers_checked=tiers_checked, tier_hit="none",
                schema_hash=schema_profile.schema_hash if schema_profile else "",
                cache_age_s=0, reason="miss",
            )
        except Exception:
            pass
        return TierResult(
            hit=False, tier_name="none", data=None,
            metadata={"tiers_checked": tiers_checked, "time_ms": int(elapsed_ms),
                       "schema_hash": current_hash, "tier_timings": tier_timings,
                       "additional_filters": additional_filters or []},
        )


# ---------------------------------------------------------------------------
# Default router factory
# ---------------------------------------------------------------------------

    def route_sync(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
    ) -> TierResult:
        """Synchronous wrapper for route() — safe to call from sync code without event loop conflicts."""
        import asyncio
        try:
            asyncio.get_running_loop()
            # Already inside an event loop (FastAPI) — run tiers synchronously
            # by calling the sync-safe internals directly
            return self._route_sync_impl(
                question, schema_profile, conn_id, additional_filters,
            )
        except RuntimeError:
            # No running loop — safe to create one
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(
                    self.route(question, schema_profile, conn_id, additional_filters),
                )
            finally:
                loop.close()

    def _route_sync_impl(
        self,
        question: str,
        schema_profile: SchemaProfile,
        conn_id: str,
        additional_filters: Optional[List[dict]] = None,
    ) -> TierResult:
        """Synchronous tier routing — no async, no event loop needed.

        P0 fix: replaced asyncio.run() (which crashes inside FastAPI's running
        event loop) with direct coroutine.__next__() invocation.  All tier
        methods (can_answer / answer) perform synchronous I/O internally
        (ChromaDB, DuckDB, regex) so the coroutines complete in a single step.

        2026-04-07 fixes applied:
        - P0: answer() is now a template method; _apply_masking runs inside BaseTier
        - P1a: Per-tier timing guards (configurable via WATERFALL_*_BUDGET_MS)
        - P1b: DuckDB/tier errors return hit=False (fall through to next tier)
        - G2: Hit/miss counters for instrumentation
        - G4: Per-tier timing logged to audit trail
        """
        start_ns = time.perf_counter_ns()
        tiers_checked: List[str] = []
        tier_timings: Dict[str, float] = {}  # G2/G4: per-tier timing instrumentation
        current_hash = schema_profile.schema_hash if schema_profile else ""

        # P1a: timing budgets from config (NEMESIS fix: was hardcoded, duplicated)
        from config import settings
        CAN_ANSWER_BUDGET_MS = settings.WATERFALL_CAN_ANSWER_BUDGET_MS
        ANSWER_BUDGET_MS = settings.WATERFALL_ANSWER_BUDGET_MS

        def _run_coro(coro):
            """Execute a trivially-awaitable coroutine synchronously."""
            try:
                result = coro.send(None)
            except StopIteration as e:
                return e.value
            else:
                # Coroutine yielded (truly async) — not expected for our tiers.
                coro.close()
                raise RuntimeError("Tier coroutine yielded; expected synchronous completion")

        for tier in self._tiers:
            tier_start = time.perf_counter_ns()

            # --- can_answer with timing guard (P1a) ---
            try:
                can = _run_coro(tier.can_answer(question, schema_profile, conn_id))
            except Exception as exc:
                logger.warning("Tier '%s' can_answer() raised: %s", tier.name, exc)
                tiers_checked.append(tier.name)
                tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000
                continue

            can_ms = (time.perf_counter_ns() - tier_start) / 1_000_000
            tiers_checked.append(tier.name)

            if not can:
                tier_timings[tier.name] = can_ms
                continue

            # P1a: discard if can_answer took too long (post-hoc guard)
            if can_ms > CAN_ANSWER_BUDGET_MS and tier.name not in ("live",):
                logger.warning(
                    "Tier '%s' can_answer() took %.1fms (budget=%dms); skipping.",
                    tier.name, can_ms, CAN_ANSWER_BUDGET_MS,
                )
                tier_timings[tier.name] = can_ms
                continue

            # --- answer with timing guard (P1a) and error fallthrough (P1b) ---
            answer_start = time.perf_counter_ns()
            try:
                result = _run_coro(tier.answer(question, schema_profile, conn_id))
            except NotImplementedError:
                logger.warning("Tier '%s' raised NotImplementedError; falling through.", tier.name)
                tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000
                continue
            except Exception as exc:
                # P1b: any tier error (including DuckDB) → fall through, don't surface error
                logger.warning(
                    "Tier '%s' answer() raised %s: %s; falling through to next tier.",
                    tier.name, type(exc).__name__, exc,
                )
                tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000
                continue

            answer_ms = (time.perf_counter_ns() - answer_start) / 1_000_000
            tier_timings[tier.name] = (time.perf_counter_ns() - tier_start) / 1_000_000

            # P1a: discard if answer took too long
            if answer_ms > ANSWER_BUDGET_MS and tier.name not in ("live",):
                logger.warning(
                    "Tier '%s' answer() took %.1fms (budget=%dms); discarding result.",
                    tier.name, answer_ms, ANSWER_BUDGET_MS,
                )
                continue

            if not result.hit:
                continue

            if not self._gate.validate(result, current_hash):
                continue

            # P0 Template Method in BaseTier.answer() handles masking.
            # NEMESIS finding: removing redundant _apply_masking here
            # eliminates 2x memory + 2x CPU per hit (Ops 10, 11).

            elapsed_ms = (time.perf_counter_ns() - start_ns) // 1_000_000
            result.metadata["tiers_checked"] = tiers_checked
            result.metadata["time_ms"] = int(elapsed_ms)
            result.metadata["schema_hash"] = current_hash
            result.metadata["tier_timings"] = tier_timings  # G2/G4 instrumentation
            result.metadata["additional_filters"] = additional_filters or []
            try:
                log_tier_decision(conn_id=conn_id, email_hash="",
                    question_hash=hashlib.sha256(question.encode()).hexdigest()[:12],
                    tiers_checked=tiers_checked, tier_hit=result.tier_name,
                    schema_hash=current_hash, cache_age_s=result.data.get("cache_age_seconds", 0) if result.data else 0,
                    reason="hit")
            except Exception:
                pass
            return result

        elapsed_ms = (time.perf_counter_ns() - start_ns) // 1_000_000
        try:
            log_tier_decision(conn_id=conn_id, email_hash="",
                question_hash=hashlib.sha256(question.encode()).hexdigest()[:12],
                tiers_checked=tiers_checked, tier_hit="none",
                schema_hash=current_hash, cache_age_s=0, reason="miss")
        except Exception:
            pass
        return TierResult(hit=False, tier_name="none", data=None,
            metadata={"tiers_checked": tiers_checked, "time_ms": int(elapsed_ms),
                       "schema_hash": current_hash, "tier_timings": tier_timings,
                       "additional_filters": additional_filters or []})

    # ── Progressive Dual-Response ─────────────────────────────────

    def route_dual(
        self,
        question: str,
        schema_profile,
        conn_id: str,
    ) -> tuple:
        """Returns (cached_result_or_None, live_callable).

        cached_result: TierResult from schema/memory/turbo if hit, else None.
        live_callable: callable returning TierResult from LiveTier, or None.

        Uses same coro.send(None) pattern as _route_sync_impl() for sync-safe
        stepping through trivially-awaitable tier coroutines.
        """
        from config import settings as _cfg

        if not _cfg.DUAL_RESPONSE_ENABLED:
            result = self.route_sync(question, schema_profile, conn_id)
            return (result, None)

        def _step_coro(coro):
            """Execute a trivially-awaitable coroutine synchronously."""
            try:
                coro.send(None)
            except StopIteration as stop:
                return stop.value
            raise RuntimeError("Tier coroutine suspended unexpectedly in route_dual")

        # Pass 1: check non-live tiers for a cached answer
        cached_result = None
        for tier in self._tiers:
            if tier.name == "live":
                continue
            try:
                # P1 NEMESIS fix: can_answer() is async — must step the coroutine
                if not _step_coro(tier.can_answer(question, schema_profile, conn_id)):
                    continue
                result = _step_coro(tier.answer(question, schema_profile, conn_id))
                if result.hit:
                    cached_result = result
                    break
            except Exception as exc:
                logger.debug("route_dual: tier %s error: %s", tier.name, exc)
                continue

        # T2 staleness gate: if cache is fresh and not always-correct mode, skip live
        if cached_result and not _cfg.DUAL_RESPONSE_ALWAYS_CORRECT:
            age = cached_result.cache_age_seconds
            if age is not None and age < _cfg.DUAL_RESPONSE_STALENESS_TTL_SECONDS:
                cached_result.is_stale = False
                return (cached_result, None)  # fresh — no live query needed
            else:
                cached_result.is_stale = True

        # Build live callable
        live_tier = next((t for t in self._tiers if t.name == "live"), None)

        def _run_live():
            if live_tier is None:
                return TierResult(hit=False, tier_name="live")
            try:
                return _step_coro(live_tier.answer(question, schema_profile, conn_id))
            except Exception as exc:
                logger.error("route_dual live tier failed: %s", exc)
                return TierResult(hit=False, tier_name="live",
                                  data={"error": str(exc)}, metadata=dict({}))

        return (cached_result, _run_live)


def build_default_router() -> WaterfallRouter:
    """
    Return a WaterfallRouter wired with the canonical Phase 1 tier order.

    Tier order (matches the Phase roadmap):
      1. SchemaTier  — structural metadata (live, Phase 1)
      2. MemoryTier  — recent-query cache  (placeholder, Phase 2)
      3. TurboTier   — aggregate cache     (placeholder, Phase 3)
      4. LiveTier    — LLM + SQL execution (placeholder, Phase 4)
    """
    return WaterfallRouter(tiers=[
        SchemaTier(),
        MemoryTier(),
        TurboTier(),
        LiveTier(),
    ])
