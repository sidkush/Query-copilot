from pathlib import Path
from skill_hit import SkillHit


def test_skill_hit_default_depends_on_empty():
    h = SkillHit(
        name="x", priority=1, tokens=10, source="always_on",
        content="body", path=Path("/tmp/x.md"),
    )
    assert h.depends_on == ()


def test_skill_hit_accepts_depends_on_tuple():
    h = SkillHit(
        name="x", priority=1, tokens=10, source="always_on",
        content="body", path=Path("/tmp/x.md"),
        depends_on=("a", "b"),
    )
    assert h.depends_on == ("a", "b")
