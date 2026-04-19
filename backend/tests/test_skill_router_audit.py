"""Tests that SkillRouter writes an audit record per resolve() call."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock


def test_router_writes_audit_line(tmp_path):
    from skill_library import SkillLibrary
    from skill_router import SkillRouter

    audit = tmp_path / "skill_retrieval.jsonl"
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib, chroma_collection=None, audit_path=audit)

    conn = MagicMock(db_type="postgresql", engine=MagicMock())
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})

    router.resolve("test question", conn, action_type="sql-generation")
    assert audit.exists()

    lines = audit.read_text().strip().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert set(rec.keys()) >= {"question_hash", "retrieved", "latency_ms", "total_tokens"}
    assert isinstance(rec["retrieved"], list)
    assert rec["latency_ms"] >= 0
    assert rec["total_tokens"] > 0


def test_router_audit_appends_multiple_turns(tmp_path):
    from skill_library import SkillLibrary
    from skill_router import SkillRouter

    audit = tmp_path / "retrieval.jsonl"
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib, chroma_collection=None, audit_path=audit)

    conn = MagicMock(db_type="postgresql", engine=MagicMock())
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})

    router.resolve("q1", conn)
    router.resolve("q2", conn)
    router.resolve("q3", conn)

    lines = audit.read_text().strip().splitlines()
    assert len(lines) == 3
