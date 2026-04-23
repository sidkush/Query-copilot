"""Phase G - NL query expansion for ChromaDB retrieval.

Before embedding the user question into `skills_v1`, ask Haiku for a
tiny synonym/paraphrase bundle so queries like "last month's top
products" match skills that talk about "recent best-sellers". The
expansion is concatenated with the original question and fed to the
embedder - we never REPLACE the user's text.

Fail-open: any LLM error returns the original question. Per-tenant
in-process TTL cache keeps this <= 1 LLM call per question per hour.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _format_prompt(question: str) -> str:
    return (
        "You expand short natural-language database questions into "
        "3-6 comma-separated synonyms plus one paraphrase. Return only "
        "the expansion (no commentary, no quotes). Target word budget: "
        "under 40 words.\n\n"
        f"Question: {question}"
    )


_SYSTEM = (
    "You rewrite user database questions for semantic search. "
    "Never answer the question. Output only synonyms and paraphrases."
)


class QueryExpansion:
    def __init__(
        self,
        provider: Any,
        *,
        max_tokens: int = 200,
        ttl_s: int = 3600,
        model: str = "claude-haiku-4-5-20251001",
    ) -> None:
        self._provider = provider
        self._max_tokens = max_tokens
        self._ttl_s = ttl_s
        self._model = model
        self._cache: dict[tuple[str, str], tuple[float, str]] = {}
        self._lock = threading.Lock()

    def expand(self, question: str, *, tenant_id: str) -> str:
        if not question:
            return ""
        key = (tenant_id, hashlib.sha256(question.encode("utf-8")).hexdigest())
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(key)
        if cached is not None:
            ts, val = cached
            if now - ts < self._ttl_s:
                return val

        try:
            resp = self._provider.complete(
                model=self._model,
                system=_SYSTEM,
                messages=[{"role": "user", "content": _format_prompt(question)}],
                max_tokens=self._max_tokens,
            )
            expansion = (resp.text or "").strip()
            out = f"{question}\n{expansion}" if expansion else question
        except Exception as exc:  # noqa: BLE001 - fail-open is the feature
            logger.warning("query_expansion: expansion failed, using raw question: %s", exc)
            out = question

        with self._lock:
            self._cache[key] = (now, out)
        return out
