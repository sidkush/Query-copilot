"""Residual-risk #6 — thumbs-up storm detection."""
from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Deque, Iterable, Optional


class StormDetected(RuntimeError):
    """Raised when an incoming upvote triggers a storm state."""


def cosine(a: Iterable[float], b: Iterable[float]) -> float:
    a_list = list(a)
    b_list = list(b)
    if not a_list or not b_list or len(a_list) != len(b_list):
        return 0.0
    dot = sum(x * y for x, y in zip(a_list, b_list))
    na = math.sqrt(sum(x * x for x in a_list))
    nb = math.sqrt(sum(y * y for y in b_list))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class _Upvote:
    ts: datetime
    embedding: tuple


class AdversarialSimilarity:
    def __init__(self, cosine_threshold: Optional[float] = None,
                 window_hours: Optional[int] = None,
                 max_upvotes: Optional[int] = None):
        if cosine_threshold is None:
            try:
                from config import settings
                cosine_threshold = float(settings.ADVERSARIAL_SIMILARITY_COSINE_THRESHOLD)
            except Exception:
                cosine_threshold = 0.92
        if window_hours is None:
            try:
                from config import settings
                window_hours = int(settings.ADVERSARIAL_SIMILARITY_WINDOW_HOURS)
            except Exception:
                window_hours = 1
        if max_upvotes is None:
            try:
                from config import settings
                max_upvotes = int(settings.ADVERSARIAL_SIMILARITY_MAX_UPVOTES)
            except Exception:
                max_upvotes = 3
        self.cosine_threshold = cosine_threshold
        self.window = timedelta(hours=window_hours)
        self.max_upvotes = max_upvotes
        self._by_user: dict[str, Deque[_Upvote]] = defaultdict(deque)

    def _wall_now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _prune(self, user_hash: str) -> None:
        """Prune expired records using wall-clock time."""
        now = self._wall_now()
        dq = self._by_user[user_hash]
        cutoff = now - self.window
        while dq and dq[0].ts < cutoff:
            dq.popleft()

    def _count_similar(self, user_hash: str, embedding: Iterable[float]) -> int:
        self._prune(user_hash)
        dq = self._by_user[user_hash]
        emb_t = tuple(embedding)
        return sum(1 for up in dq if cosine(up.embedding, emb_t) >= self.cosine_threshold)

    def is_storm(self, *, user_hash: str, embedding: Iterable[float], ts: datetime) -> bool:
        return self._count_similar(user_hash, embedding) >= self.max_upvotes

    def record(self, *, user_hash: str, embedding: Iterable[float], ts: datetime) -> None:
        similar = self._count_similar(user_hash, embedding)
        if similar >= self.max_upvotes:
            raise StormDetected(
                f"{user_hash}: {similar} similar upvotes in {self.window.total_seconds() / 3600:.1f}h"
            )
        self._by_user[user_hash].append(_Upvote(ts=ts, embedding=tuple(embedding)))
