"""SkillRouter past-query-memory contributions must stay <= 30% of token weight."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock


def test_memory_hits_capped_at_30_percent():
    from skill_library import SkillLibrary
    from skill_router import SkillRouter
    from skill_hit import SkillHit

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib, chroma_collection=None, max_total_tokens=10000)

    # Base hits: sum 7000 tokens.
    base = [SkillHit(name="b1", priority=1, tokens=7000, source="always_on", content="x", path=Path("/b.md"))]
    # Candidate memory hits: 5 × 800 = 4000 tokens.
    mem = [
        SkillHit(name=f"m{i}", priority=3, tokens=800, source="rag", content=f"m{i}", path=Path(f"/m{i}.md"))
        for i in range(5)
    ]

    final = router.add_memory_hits(base, mem, weight_cap=0.3)
    memory_tokens = sum(h.tokens for h in final if h.source == "memory_cache")
    total_tokens = sum(h.tokens for h in final)
    # weight_cap=0.3: memory share <= 30% of total.
    share = memory_tokens / max(total_tokens, 1)
    assert share <= 0.30 + 1e-6, f"memory share {share:.3f} exceeds 0.30 cap"


def test_memory_hits_tagged_memory_cache_source():
    """add_memory_hits must re-tag accepted hits as source='memory_cache'."""
    from skill_library import SkillLibrary
    from skill_router import SkillRouter
    from skill_hit import SkillHit

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib)
    base = [SkillHit(name="b", priority=1, tokens=100, source="always_on", content="x", path=Path("/b.md"))]
    mem = [SkillHit(name="m1", priority=3, tokens=30, source="rag", content="y", path=Path("/m1.md"))]
    out = router.add_memory_hits(base, mem, weight_cap=0.3)
    memory_hits = [h for h in out if h.source == "memory_cache"]
    assert len(memory_hits) == 1
    assert memory_hits[0].name == "m1"


def test_memory_hits_zero_when_base_empty():
    """If base is empty, no memory gets through (0 × weight_cap / (1-weight_cap) = 0)."""
    from skill_library import SkillLibrary
    from skill_router import SkillRouter
    from skill_hit import SkillHit

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib)
    mem = [SkillHit(name="m", priority=3, tokens=50, source="rag", content="", path=Path("/m.md"))]
    out = router.add_memory_hits([], mem, weight_cap=0.3)
    memory_hits = [h for h in out if h.source == "memory_cache"]
    assert len(memory_hits) == 0


def test_memory_hits_weight_cap_one_allows_all():
    """weight_cap=1.0 disables the cap."""
    from skill_library import SkillLibrary
    from skill_router import SkillRouter
    from skill_hit import SkillHit

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib)
    mem = [SkillHit(name=f"m{i}", priority=3, tokens=100, source="rag", content="x", path=Path(f"/m{i}.md")) for i in range(3)]
    out = router.add_memory_hits([], mem, weight_cap=1.0)
    memory_hits = [h for h in out if h.source == "memory_cache"]
    assert len(memory_hits) == 3
