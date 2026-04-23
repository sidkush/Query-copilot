import tempfile
from pathlib import Path
from skill_library import SkillLibrary


_SKILL_WITH_DEPS = """---
name: child
priority: 2
depends_on:
  - parent-a
  - parent-b
---

child body
"""

_SKILL_NO_DEPS = """---
name: parent-a
priority: 2
---

parent body
"""


def test_skill_library_reads_depends_on():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "child.md").write_text(_SKILL_WITH_DEPS, encoding="utf-8")
        (root / "parent-a.md").write_text(_SKILL_NO_DEPS, encoding="utf-8")
        lib = SkillLibrary(root)

        child = lib.get("child")
        parent = lib.get("parent-a")

        assert child.depends_on == ("parent-a", "parent-b")
        assert parent.depends_on == ()


def test_skill_library_missing_depends_on_key_is_empty_tuple():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "only.md").write_text(_SKILL_NO_DEPS, encoding="utf-8")
        lib = SkillLibrary(root)
        assert lib.get("parent-a").depends_on == ()


def test_skill_library_malformed_depends_on_logs_and_empties(caplog):
    malformed = """---
name: bad
priority: 3
depends_on: not-a-list
---

body
"""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "bad.md").write_text(malformed, encoding="utf-8")
        with caplog.at_level("WARNING"):
            lib = SkillLibrary(root)
        assert lib.get("bad").depends_on == ()
        assert any("malformed depends_on" in r.message for r in caplog.records)
