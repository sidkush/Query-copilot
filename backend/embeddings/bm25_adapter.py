"""BM25 hybrid channel. Used alongside vector search.

H14: ensemble cap of 40% per method globally (BM25 + vector + rerank each).
"""
from __future__ import annotations
import re
from typing import Sequence

from rank_bm25 import BM25Okapi


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9_]+", text.lower())


class BM25Adapter:
    def __init__(self, corpus: Sequence[str]) -> None:
        self._corpus_tokens = [_tokenize(d) for d in corpus]
        self._bm25 = BM25Okapi(self._corpus_tokens)

    def score(self, query: str) -> list[float]:
        return list(self._bm25.get_scores(_tokenize(query)))
