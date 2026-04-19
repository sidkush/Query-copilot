"""Structure validator for askdb-skills/ markdown files.

Enforces the Skill File Authoring Contract defined in
docs/superpowers/plans/2026-04-19-skill-library-content-foundation.md.
"""
from __future__ import annotations

import re
from pathlib import Path

import frontmatter
import pytest
import tiktoken

SKILLS_ROOT = Path(__file__).resolve().parents[2] / "askdb-skills"
REQUIRED_KEYS = {"name", "description", "priority", "tokens_budget", "applies_to"}
FORBIDDEN_SUBSTRINGS = ("TODO", "TBD", "FIXME", "<fill", "lorem ipsum")
ENCODER = tiktoken.get_encoding("cl100k_base")

# Files exempt from frontmatter (index/manifest docs)
EXEMPT = {"MASTER_INDEX.md"}


def _iter_skill_files():
    for path in SKILLS_ROOT.rglob("*.md"):
        if path.name in EXEMPT:
            continue
        yield path


@pytest.fixture(scope="module")
def skill_files():
    return list(_iter_skill_files())


def test_skills_root_exists():
    assert SKILLS_ROOT.is_dir(), f"askdb-skills root not found at {SKILLS_ROOT}"


@pytest.mark.parametrize(
    "path",
    list(_iter_skill_files()),
    ids=lambda p: str(p.relative_to(SKILLS_ROOT)),
)
def test_skill_file_structure(path: Path):
    post = frontmatter.load(path)
    meta = post.metadata

    missing = REQUIRED_KEYS - set(meta.keys())
    assert not missing, f"{path.name}: missing frontmatter keys {missing}"

    expected_name = path.stem
    assert meta["name"] == expected_name, (
        f"{path.name}: frontmatter name={meta['name']!r} != stem {expected_name!r}"
    )

    desc = str(meta["description"])
    assert 20 <= len(desc) <= 160, (
        f"{path.name}: description length {len(desc)} out of [20,160]"
    )

    assert meta["priority"] in (1, 2, 3), f"{path.name}: priority must be 1|2|3"

    tb = int(meta["tokens_budget"])
    assert 300 <= tb <= 2500, f"{path.name}: tokens_budget {tb} out of [300,2500]"

    body = post.content
    actual_tokens = len(ENCODER.encode(body))
    low, high = int(tb * 0.75), int(tb * 1.25)
    assert low <= actual_tokens <= high, (
        f"{path.name}: actual tokens {actual_tokens} outside budget window "
        f"[{low},{high}] for tokens_budget={tb}"
    )

    assert re.search(r"^## Examples\s*$", body, re.MULTILINE), (
        f"{path.name}: missing '## Examples' section"
    )

    example_count = len(re.findall(r"(?m)^\*\*Input:\*\*|^### Example \d", body))
    assert example_count >= 3, (
        f"{path.name}: only {example_count} examples, need >= 3"
    )

    for bad in FORBIDDEN_SUBSTRINGS:
        assert bad not in body, f"{path.name}: forbidden substring {bad!r} present"


def test_master_index_lists_all_skills():
    """MASTER_INDEX.md must reference every skill file by path."""
    index_path = SKILLS_ROOT / "MASTER_INDEX.md"
    text = index_path.read_text(encoding="utf-8")
    missing = []
    for path in _iter_skill_files():
        rel = path.relative_to(SKILLS_ROOT).as_posix()
        slug = path.name
        if slug not in text and rel not in text:
            missing.append(rel)
    assert not missing, f"MASTER_INDEX missing entries: {missing}"
