import json
import time
from pathlib import Path

import frontmatter
import pytest

from skill_archival import archive_dormant_skills, ArchivalResult


def _write_skill(root: Path, subdir: str, name: str, priority: int = 2):
    d = root / subdir
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{name}.md"
    path.write_text(
        f"---\nname: {name}\npriority: {priority}\n---\n\nbody\n",
        encoding="utf-8",
    )
    return path


def _write_audit(audit_file: Path, entries: list[dict]):
    audit_file.parent.mkdir(parents=True, exist_ok=True)
    with audit_file.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")


def test_dormant_skill_moved_to_archive(tmp_path: Path):
    skills = tmp_path / "askdb-skills"
    _write_skill(skills, "core", "dormant-one", priority=2)
    _write_skill(skills, "core", "active-one", priority=2)
    audit = tmp_path / ".data" / "skill_audit" / "retrievals.jsonl"
    _write_audit(audit, [
        {"retrieved": ["active-one"], "ts": time.time()},
        {"retrieved": ["active-one"], "ts": time.time()},
    ])

    result = archive_dormant_skills(
        skills_root=skills,
        audit_log=audit,
        archive_root=tmp_path / "askdb-skills" / "archive",
        dormancy_days=30,
        min_retrievals=1,
    )

    assert isinstance(result, ArchivalResult)
    assert result.moved == ["dormant-one"]
    assert result.skipped_priority_1 == []
    assert not (skills / "core" / "dormant-one.md").exists()
    archived = tmp_path / "askdb-skills" / "archive" / "core" / "dormant-one.md"
    assert archived.exists()
    post = frontmatter.load(archived)
    assert "archived_at" in post.metadata


def test_priority_1_skill_is_immune(tmp_path: Path):
    skills = tmp_path / "askdb-skills"
    _write_skill(skills, "core", "always-on-skill", priority=1)
    audit = tmp_path / ".data" / "skill_audit" / "retrievals.jsonl"
    _write_audit(audit, [])

    result = archive_dormant_skills(
        skills_root=skills,
        audit_log=audit,
        archive_root=tmp_path / "askdb-skills" / "archive",
        dormancy_days=30,
        min_retrievals=1,
    )
    assert "always-on-skill" in result.skipped_priority_1
    assert result.moved == []
    assert (skills / "core" / "always-on-skill.md").exists()


def test_missing_audit_log_returns_empty_with_warning(tmp_path: Path, caplog):
    skills = tmp_path / "askdb-skills"
    _write_skill(skills, "core", "whatever", priority=2)
    audit = tmp_path / "nonexistent.jsonl"
    with caplog.at_level("WARNING"):
        result = archive_dormant_skills(
            skills_root=skills, audit_log=audit,
            archive_root=tmp_path / "archive",
            dormancy_days=30, min_retrievals=1,
        )
    assert result.moved == []
    assert any("audit log missing" in r.message for r in caplog.records)


def test_dry_run_does_not_move(tmp_path: Path):
    skills = tmp_path / "askdb-skills"
    path = _write_skill(skills, "core", "dormant", priority=2)
    audit = tmp_path / "audit.jsonl"
    _write_audit(audit, [])
    result = archive_dormant_skills(
        skills_root=skills, audit_log=audit,
        archive_root=tmp_path / "askdb-skills" / "archive",
        dormancy_days=30, min_retrievals=1, dry_run=True,
    )
    assert result.moved == ["dormant"]
    assert path.exists()
