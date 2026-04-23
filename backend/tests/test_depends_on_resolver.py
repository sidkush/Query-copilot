import pytest
from pathlib import Path

from skill_hit import SkillHit
from depends_on_resolver import DependsOnResolver, DependsOnCycleError


def _hit(name: str, deps: tuple[str, ...] = (), pri: int = 2) -> SkillHit:
    return SkillHit(
        name=name, priority=pri, tokens=10, source="rag",
        content="", path=Path(f"/tmp/{name}.md"),
        depends_on=deps,
    )


def test_topo_sort_linear_chain():
    hits = {
        "a": _hit("a"),
        "b": _hit("b", ("a",)),
        "c": _hit("c", ("b",)),
    }
    r = DependsOnResolver(hits)
    assert r.topo_sort() == ["a", "b", "c"]


def test_closure_includes_transitive_deps():
    hits = {
        "a": _hit("a"),
        "b": _hit("b", ("a",)),
        "c": _hit("c", ("b",)),
        "d": _hit("d"),
    }
    r = DependsOnResolver(hits)
    assert r.closure(["c"]) == ["a", "b", "c"]
    assert r.closure(["c", "d"]) == ["a", "b", "c", "d"]


def test_closure_deterministic_lexicographic():
    hits = {
        "root": _hit("root"),
        "z": _hit("z", ("root",)),
        "a": _hit("a", ("root",)),
    }
    r = DependsOnResolver(hits)
    assert r.closure(["z", "a"]) == ["root", "a", "z"]


def test_cycle_detection_raises():
    hits = {
        "a": _hit("a", ("b",)),
        "b": _hit("b", ("a",)),
    }
    r = DependsOnResolver(hits)
    with pytest.raises(DependsOnCycleError) as exc:
        r.topo_sort()
    assert "cycle" in str(exc.value).lower()


def test_self_cycle_detected():
    hits = {"x": _hit("x", ("x",))}
    r = DependsOnResolver(hits)
    with pytest.raises(DependsOnCycleError):
        r.topo_sort()


def test_missing_dep_raises_valueerror():
    hits = {"b": _hit("b", ("does-not-exist",))}
    r = DependsOnResolver(hits)
    with pytest.raises(ValueError) as exc:
        r.topo_sort()
    assert "does-not-exist" in str(exc.value)


def test_closure_missing_target_raises():
    hits = {"a": _hit("a")}
    r = DependsOnResolver(hits)
    with pytest.raises(KeyError):
        r.closure(["ghost"])
