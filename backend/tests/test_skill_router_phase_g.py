from pathlib import Path
from unittest.mock import MagicMock
import pytest

from skill_hit import SkillHit
from skill_library import SkillLibrary
from skill_router import SkillRouter


class _FakeChroma:
    def __init__(self, names: list[str]):
        self.last_query: str | None = None
        self._names = names
    def query(self, *, query_texts, n_results):
        self.last_query = query_texts[0]
        return {"metadatas": [[{"name": n} for n in self._names]]}


class _FakeConn:
    db_type = "postgres"
    engine = None


def _mk_library(tmp_path: Path) -> SkillLibrary:
    (tmp_path / "calculation-patterns.md").write_text(
        "---\nname: calculation-patterns\npriority: 2\ndepends_on:\n  - aggregation-rules\n  - null-handling\n---\nbody",
        encoding="utf-8",
    )
    (tmp_path / "aggregation-rules.md").write_text(
        "---\nname: aggregation-rules\npriority: 2\n---\nbody",
        encoding="utf-8",
    )
    (tmp_path / "null-handling.md").write_text(
        "---\nname: null-handling\npriority: 2\n---\nbody",
        encoding="utf-8",
    )
    return SkillLibrary(tmp_path)


def test_depends_on_closure_pulls_missing_deps(tmp_path: Path):
    lib = _mk_library(tmp_path)
    chroma = _FakeChroma(["calculation-patterns"])
    router = SkillRouter(lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1)
    hits = router.resolve("sum of amount", _FakeConn())
    names = {h.name for h in hits}
    assert {"calculation-patterns", "aggregation-rules", "null-handling"}.issubset(names)


def test_bundle_pulls_co_retrieved_siblings(tmp_path: Path):
    lib = _mk_library(tmp_path)
    chroma = _FakeChroma(["aggregation-rules"])
    router = SkillRouter(lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1)
    hits = router.resolve("sum of amount", _FakeConn())
    names = {h.name for h in hits}
    assert {"aggregation-rules", "calculation-patterns", "null-handling"}.issubset(names)


def test_query_expansion_injected_into_chroma(tmp_path: Path):
    lib = _mk_library(tmp_path)
    chroma = _FakeChroma(["aggregation-rules"])
    fake_qe = MagicMock()
    fake_qe.expand.return_value = "sum of amount\nSYNONYM total revenue"
    router = SkillRouter(
        lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1,
        query_expansion=fake_qe, tenant_id_getter=lambda conn: "t1",
    )
    router.resolve("sum of amount", _FakeConn())
    assert "SYNONYM" in chroma.last_query


def test_cycle_in_closure_fails_open(tmp_path: Path, caplog):
    (tmp_path / "a.md").write_text(
        "---\nname: a\npriority: 2\ndepends_on:\n  - b\n---\nbody",
        encoding="utf-8",
    )
    (tmp_path / "b.md").write_text(
        "---\nname: b\npriority: 2\ndepends_on:\n  - a\n---\nbody",
        encoding="utf-8",
    )
    lib = SkillLibrary(tmp_path)
    chroma = _FakeChroma(["a"])
    router = SkillRouter(lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1)
    with caplog.at_level("WARNING"):
        hits = router.resolve("unrelated question", _FakeConn())
    assert any(h.name == "a" for h in hits)
    assert any("cycle" in r.message.lower() for r in caplog.records)
