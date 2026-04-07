"""
QueryMemory — Anonymized SQL intent storage for self-learning network effect.

Stores anonymized SQL patterns (not raw data) so that repeated questions
can be answered instantly from memory rather than re-generating SQL each time.

Invariants:
  - Invariant-5: Separate ChromaDB collection per conn_id.
  - Invariant-2: result_summary passed in is ALREADY PII-masked (caller's
    responsibility). This module NEVER stores raw data rows.
"""

import hashlib
import json
import logging
import math
import os
import re
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import chromadb

from config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Embedding function (mirrors query_engine.py — no extra deps required)
# ---------------------------------------------------------------------------

class _HashEmbeddingFunction(chromadb.EmbeddingFunction):
    """Pure-Python character n-gram embedding — no onnxruntime or torch needed.
    Produces 384-dim vectors consistent with query_engine.py collections."""

    DIM = 384

    def __call__(self, input):  # noqa: A002  (chromadb API name)
        result = []
        for text in input:
            text = text.lower()
            vec = [0.0] * self.DIM
            for word in text.split():
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                vec[h % self.DIM] += 2.0
            for i in range(len(text) - 2):
                gram = text[i : i + 3]
                h = int(hashlib.md5(gram.encode()).hexdigest(), 16)
                vec[h % self.DIM] += 1.0
            norm = math.sqrt(sum(x * x for x in vec)) or 1.0
            result.append([x / norm for x in vec])
        return result


# ---------------------------------------------------------------------------
# Top-level helper — importable as `from query_memory import anonymize_sql`
# ---------------------------------------------------------------------------

# Order matters: date/timestamp literals first (more specific), then strings,
# then numbers.
_DATE_PATTERN = re.compile(
    r"""
    (?:TIMESTAMP\s*)?                    # optional TIMESTAMP prefix
    (?:                                  # date / datetime string forms
        '[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[T\s][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?'
      | "[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[T\s][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?"
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

_STRING_PATTERN = re.compile(
    r"""
    (?:
        '(?:[^'\\]|\\.)*'    # single-quoted string (handles escaped quotes)
      | "(?:[^"\\]|\\.)*"    # double-quoted string
    )
    """,
    re.VERBOSE,
)

_NUMBER_PATTERN = re.compile(
    r"""
    (?<![.\w])               # not preceded by word char or dot (avoid col names)
    -?                       # optional sign
    (?:
        \d+\.\d+             # float
      | \d+                  # integer
    )
    (?![.\w])                # not followed by word char or dot
    """,
    re.VERBOSE,
)


def anonymize_sql(sql: str) -> str:
    """Replace all literal values (strings, numbers, dates) with '?'.

    Preserves table names, column names, SQL keywords, and operators.

    Examples
    --------
    >>> anonymize_sql("SELECT name FROM users WHERE id = 42 AND city = 'NYC'")
    "SELECT name FROM users WHERE id = ? AND city = ?"
    >>> anonymize_sql("SELECT * FROM orders WHERE created_at > '2024-01-01'")
    "SELECT * FROM orders WHERE created_at > ?"
    """
    # Step 1 — replace date/timestamp literals
    result = _DATE_PATTERN.sub("?", sql)
    # Step 2 — replace remaining string literals
    result = _STRING_PATTERN.sub("?", result)
    # Step 3 — replace numeric literals
    result = _NUMBER_PATTERN.sub("?", result)
    # Collapse any doubled placeholders that may result from overlap
    result = re.sub(r"\?\s*\?", "?", result)
    return result


# ---------------------------------------------------------------------------
# Query pattern tracker (Task 4.1)
# ---------------------------------------------------------------------------

_QUERY_PATTERNS_DIR = Path(".data/query_patterns")


def record_query_pattern(conn_id: str, table_names: list, question_hash: str) -> None:
    """Increment per-table frequency counters for *conn_id*.

    Counters are stored atomically in .data/query_patterns/{conn_id}.json.

    Structure::

        {
            "table_name": {"count": N, "last_seen": "<ISO-UTC>"}
        }

    Atomic write (Invariant-6): data is written to a temp file in the same
    directory, then os.rename'd over the target so no partial file is ever
    visible to concurrent readers.
    """
    patterns_dir = _QUERY_PATTERNS_DIR
    try:
        patterns_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.error("record_query_pattern: could not create patterns dir %s — %s", patterns_dir, exc)
        return

    target_path = patterns_dir / f"{conn_id}.json"
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    # Load existing data (if any)
    data: dict = {}
    if target_path.exists():
        try:
            with target_path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            logger.warning(
                "record_query_pattern: could not read existing patterns for conn=%s — %s",
                conn_id, exc,
            )
            data = {}

    # Increment counters for each table
    for table in table_names:
        if not table:
            continue
        entry = data.get(table, {"count": 0, "last_seen": now_iso})
        entry["count"] = entry.get("count", 0) + 1
        entry["last_seen"] = now_iso
        data[table] = entry

    # Atomic write: temp file → os.rename (Invariant-6)
    try:
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(patterns_dir), prefix=f"{conn_id}_", suffix=".json.tmp"
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
        except Exception:
            os.unlink(tmp_path)
            raise
        os.rename(tmp_path, str(target_path))
        logger.debug(
            "record_query_pattern: updated patterns for conn=%s (%d tables tracked)",
            conn_id, len(data),
        )
    except Exception as exc:
        logger.error(
            "record_query_pattern: atomic write failed for conn=%s — %s", conn_id, exc
        )


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class QueryInsight:
    """Anonymized record of a question → SQL intent pair."""

    conn_id: str
    question: str           # Original user question
    sql_intent: str         # Anonymized SQL pattern (no literals)
    result_summary: str     # Brief NL summary — MUST be PII-masked before storage
    columns: list           # Column names from result set
    row_count: int
    confidence: float       # 0–1; starts at 0.5, boosted by positive feedback
    stored_at: datetime
    schema_hash: str        # Schema hash at time of storage (drift detection)


# ---------------------------------------------------------------------------
# QueryMemory
# ---------------------------------------------------------------------------

class QueryMemory:
    """Anonymized query intent store backed by ChromaDB.

    One ChromaDB collection per conn_id (Invariant-5).
    Raw data is never stored — only anonymized SQL patterns and PII-masked
    summaries (Invariant-2).
    """

    def __init__(self) -> None:
        try:
            self._chroma = chromadb.PersistentClient(
                path=settings.CHROMA_PERSIST_DIR,
            )
            self._ef = _HashEmbeddingFunction()
            logger.info("QueryMemory: ChromaDB client initialised at %s", settings.CHROMA_PERSIST_DIR)
        except Exception:
            logger.exception("QueryMemory: failed to initialise ChromaDB client")
            self._chroma = None
            self._ef = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_collection(self, conn_id: str):
        """Return (or create) the ChromaDB collection for *conn_id*."""
        if self._chroma is None:
            raise RuntimeError("ChromaDB client not available")
        name = f"{settings.QUERY_MEMORY_COLLECTION_PREFIX}{conn_id}"
        return self._chroma.get_or_create_collection(
            name=name,
            metadata={"description": f"Query memory for connection {conn_id}"},
            embedding_function=self._ef,
        )

    @staticmethod
    def _doc_id(conn_id: str, sql_intent: str) -> str:
        """Stable, deterministic document ID — SHA256(conn_id + sql_intent)[:16]."""
        raw = (conn_id + sql_intent).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:16]

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(tz=timezone.utc).isoformat()

    @staticmethod
    def _parse_dt(iso: str) -> datetime:
        try:
            return datetime.fromisoformat(iso)
        except Exception:
            # Fallback for naive ISO strings stored before timezone support
            return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def store_insight(
        self,
        conn_id: str,
        question: str,
        sql: str,
        result_summary: str,
        columns: list,
        row_count: int,
        schema_hash: str,
    ) -> Optional[str]:
        """Anonymize *sql* and upsert an insight into the conn_id collection.

        Returns the document ID on success, None on failure.

        IMPORTANT: *result_summary* and *columns* must be PII-masked by the
        caller before passing to this method (Invariant-2).
        """
        try:
            sql_intent = anonymize_sql(sql)
            # P1 fix: mask sensitive column names in the anonymized SQL intent
            # to prevent leaking schema structure (ssn, salary, etc.) into
            # shared ChromaDB memory.
            try:
                from pii_masking import SENSITIVE_COLUMN_PATTERNS
                for col_name in SENSITIVE_COLUMN_PATTERNS:
                    # Case-insensitive word-boundary replacement in the intent
                    sql_intent = re.sub(
                        r'\b' + re.escape(col_name) + r'\b',
                        '[MASKED]',
                        sql_intent,
                        flags=re.IGNORECASE,
                    )
            except ImportError:
                pass  # pii_masking not available — degrade gracefully
            doc_id = self._doc_id(conn_id, sql_intent)
            now_iso = self._now_iso()

            metadata = {
                "conn_id": conn_id,
                "question": question,
                "sql_intent": sql_intent,
                "result_summary": result_summary,
                "columns": ",".join(str(c) for c in columns),  # ChromaDB metadata is flat
                "row_count": row_count,
                "confidence": 0.5,
                "stored_at": now_iso,
                "schema_hash": schema_hash,
            }

            collection = self._get_collection(conn_id)

            # Check if doc already exists so we can preserve its confidence
            try:
                existing = collection.get(ids=[doc_id], include=["metadatas"])
                if existing and existing.get("metadatas"):
                    prev_meta = existing["metadatas"][0]
                    # Preserve accumulated confidence; only refresh timestamp
                    metadata["confidence"] = prev_meta.get("confidence", 0.5)
                    metadata["stored_at"] = now_iso  # bump to now
            except Exception:
                pass  # First insertion — use defaults

            collection.upsert(
                ids=[doc_id],
                documents=[question],
                metadatas=[metadata],
            )
            logger.debug("QueryMemory.store_insight: upserted doc %s for conn=%s", doc_id, conn_id)
            return doc_id

        except Exception:
            logger.exception("QueryMemory.store_insight failed for conn=%s", conn_id)
            return None

    def find_similar(
        self,
        conn_id: str,
        question: str,
        threshold: float = 0.75,
    ) -> Optional[dict]:
        """Search for a similar previously-stored question.

        ChromaDB returns L2 distances; lower values mean closer matches.
        The *threshold* is treated as a maximum distance (not a similarity
        score) — tune it for the 384-dim hash embedding space.

        Returns a dict with keys:
            intent, summary, columns, row_count, confidence, stored_at,
            schema_hash
        or None if no match within *threshold*.
        """
        try:
            collection = self._get_collection(conn_id)
            results = collection.query(
                query_texts=[question],
                n_results=3,
                include=["metadatas", "distances"],
            )

            if not results or not results.get("metadatas"):
                return None

            metadatas = results["metadatas"][0]  # list of dicts for query[0]
            distances = results["distances"][0]  # list of floats

            best_meta = None
            best_dist = float("inf")

            for meta, dist in zip(metadatas, distances):
                if dist < best_dist:
                    best_dist = dist
                    best_meta = meta

            if best_meta is None or best_dist > threshold:
                logger.debug(
                    "QueryMemory.find_similar: no match within threshold %.3f (best=%.3f) for conn=%s",
                    threshold,
                    best_dist,
                    conn_id,
                )
                return None

            columns_raw = best_meta.get("columns", "")
            columns = [c for c in columns_raw.split(",") if c] if columns_raw else []

            logger.debug(
                "QueryMemory.find_similar: matched doc (dist=%.3f) for conn=%s", best_dist, conn_id
            )
            return {
                "intent": best_meta.get("sql_intent", ""),
                "summary": best_meta.get("result_summary", ""),
                "columns": columns,
                "row_count": best_meta.get("row_count", 0),
                "confidence": best_meta.get("confidence", 0.5),
                "stored_at": best_meta.get("stored_at", ""),
                "schema_hash": best_meta.get("schema_hash", ""),
            }

        except Exception:
            logger.exception("QueryMemory.find_similar failed for conn=%s", conn_id)
            return None

    def is_fresh(self, insight: dict, max_age_hours: int = None) -> bool:
        """Return True if *insight* was stored within the configured TTL.

        Uses ``settings.QUERY_MEMORY_TTL_HOURS`` when *max_age_hours* is None.
        """
        ttl = max_age_hours if max_age_hours is not None else settings.QUERY_MEMORY_TTL_HOURS
        stored_at_raw = insight.get("stored_at", "")
        if not stored_at_raw:
            return False
        try:
            stored_at = self._parse_dt(stored_at_raw)
            # Ensure both datetimes are timezone-aware for comparison
            now = datetime.now(tz=timezone.utc)
            if stored_at.tzinfo is None:
                stored_at = stored_at.replace(tzinfo=timezone.utc)
            age_hours = (now - stored_at).total_seconds() / 3600.0
            return age_hours <= ttl
        except Exception:
            logger.warning("QueryMemory.is_fresh: could not parse stored_at=%r", stored_at_raw)
            return False

    def boost_confidence(self, conn_id: str, question: str) -> bool:
        """Increase the confidence of the best-matching insight by 0.1 (capped at 1.0).

        Returns True if a matching insight was found and updated.
        """
        try:
            collection = self._get_collection(conn_id)
            results = collection.query(
                query_texts=[question],
                n_results=1,
                include=["metadatas", "documents"],
            )

            if not results or not results.get("ids") or not results["ids"][0]:
                logger.debug("QueryMemory.boost_confidence: no insight found for conn=%s", conn_id)
                return False

            doc_id = results["ids"][0][0]
            meta = results["metadatas"][0][0]
            document = results["documents"][0][0]

            new_confidence = min(1.0, float(meta.get("confidence", 0.5)) + 0.1)
            meta["confidence"] = new_confidence

            collection.update(
                ids=[doc_id],
                documents=[document],
                metadatas=[meta],
            )
            logger.debug(
                "QueryMemory.boost_confidence: doc %s confidence -> %.2f for conn=%s",
                doc_id,
                new_confidence,
                conn_id,
            )
            return True

        except Exception:
            logger.exception("QueryMemory.boost_confidence failed for conn=%s", conn_id)
            return False

    def cleanup_stale(self, conn_id: str) -> int:
        """Delete all insights older than ``settings.QUERY_MEMORY_TTL_HOURS``.

        Returns the number of documents deleted.
        """
        try:
            collection = self._get_collection(conn_id)
            # Fetch all documents with stored_at metadata
            all_docs = collection.get(include=["metadatas"])
            if not all_docs or not all_docs.get("ids"):
                return 0

            ids_to_delete = []
            now = datetime.now(tz=timezone.utc)
            ttl_hours = settings.QUERY_MEMORY_TTL_HOURS

            for doc_id, meta in zip(all_docs["ids"], all_docs["metadatas"]):
                stored_at_raw = meta.get("stored_at", "")
                if not stored_at_raw:
                    ids_to_delete.append(doc_id)
                    continue
                try:
                    stored_at = self._parse_dt(stored_at_raw)
                    if stored_at.tzinfo is None:
                        stored_at = stored_at.replace(tzinfo=timezone.utc)
                    age_hours = (now - stored_at).total_seconds() / 3600.0
                    if age_hours > ttl_hours:
                        ids_to_delete.append(doc_id)
                except Exception:
                    logger.warning(
                        "QueryMemory.cleanup_stale: skipping malformed stored_at for doc %s", doc_id
                    )

            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
                logger.info(
                    "QueryMemory.cleanup_stale: deleted %d stale insights for conn=%s",
                    len(ids_to_delete),
                    conn_id,
                )
            return len(ids_to_delete)

        except Exception:
            logger.exception("QueryMemory.cleanup_stale failed for conn=%s", conn_id)
            return 0

    def get_stats(self, conn_id: str) -> dict:
        """Return aggregate statistics for a connection's memory store.

        Returns a dict with keys:
            total_insights (int), avg_confidence (float),
            oldest (str | None), newest (str | None)
        """
        empty = {"total_insights": 0, "avg_confidence": 0.0, "oldest": None, "newest": None}
        try:
            collection = self._get_collection(conn_id)
            all_docs = collection.get(include=["metadatas"])
            if not all_docs or not all_docs.get("ids"):
                return empty

            metadatas = all_docs["metadatas"]
            total = len(metadatas)
            if total == 0:
                return empty

            confidences = []
            timestamps = []

            for meta in metadatas:
                conf = meta.get("confidence")
                if conf is not None:
                    try:
                        confidences.append(float(conf))
                    except (TypeError, ValueError):
                        pass

                stored_at_raw = meta.get("stored_at", "")
                if stored_at_raw:
                    try:
                        dt = self._parse_dt(stored_at_raw)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        timestamps.append(dt)
                    except Exception:
                        pass

            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            oldest = min(timestamps).isoformat() if timestamps else None
            newest = max(timestamps).isoformat() if timestamps else None

            return {
                "total_insights": total,
                "avg_confidence": round(avg_confidence, 4),
                "oldest": oldest,
                "newest": newest,
            }

        except Exception:
            logger.exception("QueryMemory.get_stats failed for conn=%s", conn_id)
            return empty
