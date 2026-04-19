"""Tests for skill_ingest.py."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest


def test_ingest_prefix_is_contextual():
    """Each ingested document starts with '[Category: <cat>] <name>: '."""
    from skill_ingest import build_contextual_prefix

    prefix = build_contextual_prefix(
        category="sql",
        name="join-intelligence",
        description="Join types, fan-out, many-to-many rules",
    )
    assert prefix.startswith("[Category: sql]")
    assert "join-intelligence" in prefix
    assert "Join types" in prefix


def test_ingest_writes_all_skills_to_collection():
    """ingest_library() upserts one doc per skill."""
    from skill_ingest import ingest_library
    from skill_library import SkillLibrary

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    fake_collection = MagicMock()
    fake_collection.upsert = MagicMock()

    fake_client = MagicMock()
    fake_client.get_or_create_collection.return_value = fake_collection

    ingest_library(lib, chroma_client=fake_client, collection_name="skills_v1_test")

    fake_client.get_or_create_collection.assert_called_once_with(name="skills_v1_test")
    total_docs = sum(len(call.kwargs["documents"]) for call in fake_collection.upsert.call_args_list)
    assert total_docs == len(lib.all_names())


def test_ingest_is_skipped_when_mtimes_older_than_stamp(tmp_path):
    """If last-ingest stamp is newer than any skill mtime, skip re-ingest."""
    from skill_ingest import should_reingest

    stamp_file = tmp_path / "last_ingest.txt"
    stamp_file.write_text("9999999999")
    root = Path(__file__).resolve().parents[2] / "askdb-skills"
    assert should_reingest(root, stamp_file) is False

    stamp_file.write_text("")
    assert should_reingest(root, stamp_file) is True
