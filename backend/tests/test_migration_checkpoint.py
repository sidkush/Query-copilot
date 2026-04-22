import json
from pathlib import Path
import pytest
from backend.embeddings.migration import (
    load_checkpoint,
    write_checkpoint,
    next_batch,
    CheckpointState,
)


def test_checkpoint_round_trip(tmp_path):
    path = tmp_path / "ckpt.json"
    state = CheckpointState(
        collection_from="skills_v1_hash",
        collection_to="skills_v1_minilm",
        last_committed_doc_id="doc-42",
        total_committed=42,
    )
    write_checkpoint(path, state)
    loaded = load_checkpoint(path)
    assert loaded == state


def test_load_missing_checkpoint_returns_none(tmp_path):
    assert load_checkpoint(tmp_path / "missing.json") is None


def test_next_batch_resumes_after_last_committed():
    # Simulated pool of doc ids.
    pool = [f"doc-{i:03d}" for i in range(100)]
    batch = next_batch(pool, last_committed="doc-041", batch_size=5)
    assert batch == ["doc-042", "doc-043", "doc-044", "doc-045", "doc-046"]


def test_next_batch_fresh_start_returns_head():
    pool = [f"doc-{i:03d}" for i in range(100)]
    batch = next_batch(pool, last_committed=None, batch_size=3)
    assert batch == ["doc-000", "doc-001", "doc-002"]
