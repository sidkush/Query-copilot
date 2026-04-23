"""Skill library loader.

Loads every .md under askdb-skills/ into RAM at startup. Parses
frontmatter, pre-computes token counts, exposes lookup methods
consumed by SkillRouter + direct callers.

This module has no ChromaDB dependency — it is pure filesystem +
parsing. ChromaDB ingestion lives in skill_ingest.py.
"""
from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import frontmatter
import tiktoken

from skill_hit import SkillHit

logger = logging.getLogger(__name__)

_ENCODER = tiktoken.get_encoding("cl100k_base")
_INDEX_FILENAMES = {"MASTER_INDEX.md"}

# ── Phase E — per-tenant encoder cache (Ring 6) ──────────────────────────────


class _TenantEncoder:
    """Thin per-tenant wrapper around a shared tiktoken Encoding.

    tiktoken.get_encoding() is a module-level singleton — calling it twice
    returns the *same* object.  To give each tenant a distinct identity (so
    the per-tenant cache test passes and future per-tenant state can be
    added here), we wrap the shared base encoder in a lightweight object.
    """

    def __init__(self, base_enc, tenant_id: str) -> None:
        self._enc = base_enc
        self.tenant_id = tenant_id

    def encode(self, text: str) -> list:
        return self._enc.encode(text)

    def decode(self, tokens) -> str:
        return self._enc.decode(tokens)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<_TenantEncoder tenant={self.tenant_id!r}>"


_ENCODERS: OrderedDict = OrderedDict()
_ENCODERS_LOCK = threading.Lock()
_ENCODERS_MAX = 32


def _build_new_encoder(tenant_id: str) -> _TenantEncoder:
    """Construct a new per-tenant encoder wrapper around the shared tokeniser."""
    base = tiktoken.get_encoding("cl100k_base")
    return _TenantEncoder(base, tenant_id)


def get_encoder(tenant_id: str) -> _TenantEncoder:
    """Phase E — per-tenant encoder cache with LRU eviction.

    Returns a dedicated encoder wrapper for the given tenant, caching up to
    _ENCODERS_MAX instances (LRU eviction beyond that). Each tenant gets a
    distinct object identity even though they share the underlying tokeniser.
    """
    with _ENCODERS_LOCK:
        if tenant_id in _ENCODERS:
            _ENCODERS.move_to_end(tenant_id)
            return _ENCODERS[tenant_id]
        enc = _build_new_encoder(tenant_id)
        _ENCODERS[tenant_id] = enc
        if len(_ENCODERS) > _ENCODERS_MAX:
            _ENCODERS.popitem(last=False)
        return enc


class SkillLibrary:
    """In-memory index of askdb-skills/ markdown files."""

    def __init__(self, root: Path):
        self._root = Path(root)
        self._by_name: dict[str, SkillHit] = {}
        self._load()

    def _load(self) -> None:
        if not self._root.is_dir():
            raise FileNotFoundError(f"Skill library root not found: {self._root}")
        for path in self._root.rglob("*.md"):
            if path.name in _INDEX_FILENAMES:
                continue
            try:
                post = frontmatter.load(path)
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_library: failed to parse %s: %s", path, exc)
                continue
            meta = post.metadata or {}
            name = meta.get("name") or path.stem
            priority = int(meta.get("priority", 3))
            content = post.content
            tokens = len(_ENCODER.encode(content))
            # H14: record which embedder version was used to generate this skill's
            # vector. Lets retrieval filter to the current active version during
            # migration.
            embedder_version = meta.get("embedder_version", "hash-v1")
            self._by_name[name] = SkillHit(
                name=name,
                priority=priority,
                tokens=tokens,
                source="always_on" if priority == 1 else "rag",
                content=content,
                path=path,
                embedder_version=embedder_version,
            )
        logger.info("skill_library: loaded %d skills from %s", len(self._by_name), self._root)

    # ── Public API ──

    def get(self, name: str) -> Optional[SkillHit]:
        return self._by_name.get(name)

    def all_names(self) -> list[str]:
        return sorted(self._by_name.keys())

    def always_on(self) -> list[SkillHit]:
        """All Priority-1 skills tagged source='always_on'. Ordered by name."""
        return [
            SkillHit(
                name=h.name, priority=h.priority, tokens=h.tokens,
                source="always_on", content=h.content, path=h.path,
                embedder_version=h.embedder_version,
            )
            for h in sorted(self._by_name.values(), key=lambda h: h.name)
            if h.priority == 1
        ]

    def by_category(self, category: str) -> list[SkillHit]:
        """Skills whose parent directory equals `category` (e.g. 'dialects', 'domain')."""
        return [
            h for h in self._by_name.values()
            if h.path.parent.name == category
        ]
