"""Phase G exit criterion: >= RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT
token reduction against pinned corpus."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from skill_library import SkillLibrary
from skill_router import SkillRouter


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = REPO_ROOT / "askdb-skills"
CORPUS = REPO_ROOT / ".data" / "retrieval_budget_corpus.jsonl"
BASELINE = REPO_ROOT / ".data" / "retrieval_budget_baseline.json"


class _DeterministicChroma:
    """Tiny n-gram-hash top-k over the library. No external ChromaDB."""

    def __init__(self, library: SkillLibrary, k: int = 3):
        # Try to import HashV1Embedder; fall back to TF-IDF char ngrams
        try:
            from embeddings.embedder_registry import HashV1Embedder
            self._emb = HashV1Embedder()
            names = library.all_names()
            self._names = names
            docs = [library.get(n).content for n in names]
            self._vecs = np.stack([self._emb.encode(d) for d in docs])
        except Exception:
            # Fallback: bag-of-chars hashing
            names = library.all_names()
            self._names = names
            docs = [library.get(n).content for n in names]
            self._vecs = np.stack([self._hash_vec(d) for d in docs])
            self._emb = None
        self._k = k

    def _hash_vec(self, text: str, dim: int = 256) -> np.ndarray:
        v = np.zeros(dim, dtype=np.float32)
        for w in text.lower().split():
            v[hash(w) % dim] += 1.0
        n = np.linalg.norm(v)
        return v / n if n > 0 else v

    def query(self, *, query_texts: list[str], n_results: int):
        if self._emb is not None:
            q = self._emb.encode(query_texts[0])
        else:
            q = self._hash_vec(query_texts[0])
        sims = self._vecs @ q
        k = min(n_results or self._k, len(self._names))
        top = np.argsort(-sims)[:k]
        return {"metadatas": [[{"name": self._names[i]} for i in top]]}


class _Conn:
    db_type = "postgres"
    engine = None


def _load_corpus() -> list[dict[str, Any]]:
    return [json.loads(l) for l in CORPUS.read_text(encoding="utf-8").splitlines() if l.strip()]


def _measure(hygiene_on: bool) -> list[int]:
    from config import settings
    object.__setattr__(settings, "FEATURE_RETRIEVAL_HYGIENE", hygiene_on)
    object.__setattr__(settings, "FEATURE_QUERY_EXPANSION", hygiene_on)
    object.__setattr__(settings, "FEATURE_SKILL_BUNDLES", hygiene_on)
    object.__setattr__(settings, "FEATURE_DEPENDS_ON_RESOLVER", hygiene_on)

    lib = SkillLibrary(SKILLS_ROOT)
    chroma = _DeterministicChroma(lib, k=3)
    router = SkillRouter(
        lib, chroma_collection=chroma,
        max_skills=9, max_total_tokens=20000, k=3,
        query_expansion=None,
        tenant_id_getter=lambda c: "t1",
    )
    totals: list[int] = []
    for row in _load_corpus():
        hits = router.resolve(row["question"], _Conn())
        totals.append(sum(h.tokens for h in hits))
    return totals


def test_no_per_query_cap_overflow():
    totals = _measure(hygiene_on=True)
    assert all(t <= 20000 for t in totals), f"cap overflow: {max(totals)}"
    assert len(totals) == 50


def test_retrieval_budget_reduction_meets_target():
    assert BASELINE.exists(), "baseline missing - run tools/record_retrieval_baseline.py first (Task 11)"
    from config import settings
    target = float(settings.RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT)

    on_totals = _measure(hygiene_on=True)
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    off_mean = float(baseline["mean_tokens"])
    on_mean = float(np.mean(on_totals))
    reduction_pct = (off_mean - on_mean) / off_mean * 100.0

    assert reduction_pct >= target, (
        f"Phase G target MISSED: reduction {reduction_pct:.1f}% < target {target}% "
        f"(off={off_mean:.1f}, on={on_mean:.1f})"
    )
