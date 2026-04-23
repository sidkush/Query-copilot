from pathlib import Path

from skill_hit import SkillHit
from skill_bundles import (
    BUNDLES, resolve_bundles, Bundle,
)


def _hit(name: str, pri: int = 3) -> SkillHit:
    return SkillHit(
        name=name, priority=pri, tokens=50, source="rag",
        content=name, path=Path(f"/tmp/{name}.md"),
    )


def test_dashboard_bundle_fires_on_trigger_keyword():
    library = {n: _hit(n) for n in [
        "dashboard-build-protocol",
        "multi-step-planning",
        "session-memory-protocol",
    ]}
    question = "Build me a dashboard showing Q1 sales"
    existing: list[SkillHit] = []

    added = resolve_bundles(question, existing, library)

    names = {h.name for h in added}
    assert {"dashboard-build-protocol", "multi-step-planning", "session-memory-protocol"}.issubset(names)
    assert all(h.source == "bundle" for h in added)


def test_bundle_fires_on_co_retrieval():
    library = {n: _hit(n) for n in [
        "calculation-patterns", "aggregation-rules", "null-handling",
    ]}
    existing = [_hit("aggregation-rules")]
    added = resolve_bundles("what's the average?", existing, library)
    names = {h.name for h in added}
    assert "calculation-patterns" in names
    assert "null-handling" in names


def test_bundle_does_not_duplicate_existing_hits():
    library = {n: _hit(n) for n in ["dashboard-build-protocol", "multi-step-planning", "session-memory-protocol"]}
    existing = [_hit("multi-step-planning")]
    added = resolve_bundles("build a dashboard", existing, library)
    assert not any(h.name == "multi-step-planning" for h in added)


def test_bundle_respects_priority_ceiling():
    library = {
        "a": _hit("a", pri=3),
        "b": _hit("b", pri=3),
    }
    b = Bundle(name="t", skills=("a", "b"), trigger_keywords=("foo",), priority_ceiling=2)
    added = resolve_bundles("foo", [], library, bundles=(b,))
    assert {h.priority for h in added} == {2}


def test_empty_question_matches_no_bundle_by_keyword():
    library = {n: _hit(n) for n in ["dashboard-build-protocol", "multi-step-planning", "session-memory-protocol"]}
    added = resolve_bundles("", [], library)
    assert added == []


def test_bundle_skips_missing_members():
    library = {"multi-step-planning": _hit("multi-step-planning")}
    b = Bundle(name="dashboard", skills=("dashboard-build-protocol", "multi-step-planning"), trigger_keywords=("dashboard",))
    added = resolve_bundles("dashboard", [], library, bundles=(b,))
    assert [h.name for h in added] == ["multi-step-planning"]


def test_bundles_registry_is_nonempty_and_well_formed():
    assert len(BUNDLES) >= 2
    for b in BUNDLES:
        assert b.name
        assert b.skills
        assert all(isinstance(k, str) for k in b.trigger_keywords)
