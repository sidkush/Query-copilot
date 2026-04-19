"""Tests for correction_queue.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


def test_enqueue_writes_json_file(tmp_path):
    from correction_queue import enqueue
    path = enqueue(
        user_hash="abc123",
        question="revenue by region",
        original_sql="SELECT ...",
        corrected_sql="SELECT ... WHERE NOT test_account",
        user_note="exclude tests",
        connection_id="conn-1",
        queue_root=tmp_path,
    )
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["question"] == "revenue by region"
    assert data["status"] == "pending_review"
    assert data["tier"] == "T1_explicit_edit"


def test_enqueue_never_imports_chroma(tmp_path):
    """Regression guard: correction queue module never imports chromadb."""
    import correction_queue, ast
    tree = ast.parse(Path(correction_queue.__file__).read_text(encoding="utf-8"))
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend(n.name for n in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
    chroma_refs = [i for i in imports if "chromadb" in i.lower()]
    assert not chroma_refs, f"correction_queue must not import chromadb, found: {chroma_refs}"


def test_list_pending(tmp_path):
    from correction_queue import enqueue, list_pending
    for i in range(3):
        enqueue(
            user_hash=f"u{i}", question=f"q{i}", original_sql="",
            corrected_sql="", user_note="", connection_id="c", queue_root=tmp_path,
        )
    pending = list_pending(queue_root=tmp_path)
    assert len(pending) == 3
