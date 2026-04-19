"""Skill library loader.

Loads every .md under askdb-skills/ into RAM at startup. Parses
frontmatter, pre-computes token counts, exposes lookup methods
consumed by SkillRouter + direct callers.

This module has no ChromaDB dependency — it is pure filesystem +
parsing. ChromaDB ingestion lives in skill_ingest.py.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import frontmatter
import tiktoken

from skill_hit import SkillHit

logger = logging.getLogger(__name__)

_ENCODER = tiktoken.get_encoding("cl100k_base")
_INDEX_FILENAMES = {"MASTER_INDEX.md"}


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
            self._by_name[name] = SkillHit(
                name=name,
                priority=priority,
                tokens=tokens,
                source="always_on" if priority == 1 else "rag",
                content=content,
                path=path,
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
