"""Phase 1 Capability 4 — SKILL_LIBRARY_ENABLED default flip regression tests
(landed 2026-04-28).

Three guards:
  1. Default True assertion — decoupled from .env state.
  2. SkillLibrary loads from askdb-skills/ with expected count.
  3. SKILL_SHADOW_MODE_ENABLED defaults True (shadow mode active on flip).
"""
from pathlib import Path


def test_skill_library_default_True():
    """Phase 1 (2026-04-28) flip: SKILL_LIBRARY_ENABLED must default True.
    Asserts on Pydantic field metadata, decoupled from .env state."""
    from config import Settings
    field = Settings.model_fields["SKILL_LIBRARY_ENABLED"]
    assert field.default is True, (
        "SKILL_LIBRARY_ENABLED must default True post Phase 1 Cap 4 flip"
    )


def test_skill_library_loads_from_askdb_skills():
    """SkillLibrary instantiates cleanly from the committed askdb-skills/
    directory. Guards against directory deletion or path misconfiguration."""
    from skill_library import SkillLibrary
    root = Path(__file__).resolve().parent.parent.parent / "askdb-skills"
    assert root.is_dir(), f"askdb-skills/ must exist at {root}"
    lib = SkillLibrary(root=root)
    assert len(lib._by_name) > 0, "SkillLibrary must load at least one skill"
    assert len(lib._by_name) >= 40, (
        f"Expected >=40 skills from askdb-skills/, got {len(lib._by_name)}. "
        "If skills were removed intentionally, update this floor."
    )


def test_shadow_mode_default_True():
    """SKILL_SHADOW_MODE_ENABLED must default True — confirms shadow mode is
    active post-flip, logging diffs to .data/audit/shadow_diff.jsonl without
    affecting user-visible agent output."""
    from config import Settings
    field = Settings.model_fields["SKILL_SHADOW_MODE_ENABLED"]
    assert field.default is True, (
        "SKILL_SHADOW_MODE_ENABLED must default True (shadow mode active on Cap 4 flip)"
    )
