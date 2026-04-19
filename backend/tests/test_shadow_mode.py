"""ShadowRunner logs diff between legacy and block-path prompt assemblies."""
from __future__ import annotations

import json


def test_shadow_logs_diff_record(tmp_path):
    from shadow_mode import ShadowRunner

    runner = ShadowRunner(audit_path=tmp_path / "shadow_diff.jsonl")
    runner.log(
        session_id="abc",
        question_hash="deadbeef",
        legacy_text="You are AskDB.",
        block_texts=["You are AskDB.", "dialect hints here"],
    )
    path = tmp_path / "shadow_diff.jsonl"
    assert path.exists()
    rec = json.loads(path.read_text().strip().splitlines()[0])
    assert rec["session_id"] == "abc"
    assert rec["question_hash"] == "deadbeef"
    assert rec["legacy_len"] > 0
    assert rec["blocks_len"] > rec["legacy_len"]
    assert "legacy_sha" in rec
    assert "blocks_sha" in rec


def test_shadow_no_diff_when_flag_off(tmp_path):
    """When block-path collapses to single uncached block, content equals
    legacy — diff record should indicate equal sha."""
    from shadow_mode import ShadowRunner
    runner = ShadowRunner(audit_path=tmp_path / "shadow.jsonl")
    runner.log(
        session_id="abc",
        question_hash="d",
        legacy_text="You are AskDB.",
        block_texts=["You are AskDB."],
    )
    rec = json.loads((tmp_path / "shadow.jsonl").read_text().strip())
    assert rec["legacy_sha"] == rec["blocks_sha"]


def test_shadow_retrieved_skills_tracked(tmp_path):
    """retrieved_skills list round-trips in the audit record."""
    from shadow_mode import ShadowRunner
    runner = ShadowRunner(audit_path=tmp_path / "s.jsonl")
    runner.log(
        session_id="s1",
        question_hash="q1",
        legacy_text="x",
        block_texts=["x", "y"],
        retrieved_skills=["security-rules", "dialect-bigquery"],
    )
    rec = json.loads((tmp_path / "s.jsonl").read_text().strip())
    assert rec["retrieved_skills"] == ["security-rules", "dialect-bigquery"]


def test_shadow_never_raises_on_unwritable_path(tmp_path):
    """Audit path inside a read-only directory — must log warning + continue."""
    from shadow_mode import ShadowRunner
    # Make the directory path itself a file so parent.mkdir will collide.
    bad_root = tmp_path / "not_a_dir"
    bad_root.write_text("file content")
    runner = ShadowRunner(audit_path=bad_root / "sub" / "audit.jsonl")
    runner.log(
        session_id="s", question_hash="q", legacy_text="x", block_texts=["x"],
    )
    # No exception = pass.
