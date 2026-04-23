"""Lightweight dataclass shared by SkillLibrary + SkillRouter.

Split from skill_library to avoid circular imports once SkillRouter
wants to import both SkillHit and SkillLibrary.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

SkillSource = Literal["always_on", "deterministic", "rag", "bundle", "memory_cache"]


@dataclass(frozen=True, slots=True)
class SkillHit:
    name: str
    priority: int          # 1, 2, or 3
    tokens: int            # encoded cl100k_base token count of content
    source: SkillSource
    content: str           # full body (no frontmatter)
    path: Path
    embedder_version: str = "hash-v1"  # H14: migration filtering tag
    depends_on: tuple[str, ...] = ()   # Phase G: declared skill-name dependencies
