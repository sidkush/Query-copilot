"""Regression test: negative feedback routes through correction queue."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch


def test_negative_feedback_writes_to_queue(tmp_path, monkeypatch):
    """is_correct=False → queued file; no examples collection mutation."""
    import routers.query_routes as qr

    # Redirect queue root.
    monkeypatch.setattr(qr, "CORRECTION_QUEUE_ROOT", tmp_path)

    # Stub get_connection + QueryMemory to avoid DB setup.
    fake_entry = MagicMock()
    fake_entry.engine.record_feedback = MagicMock()
    fake_entry.conn_id = "conn-1"

    monkeypatch.setattr(qr, "get_connection", lambda conn_id, email: fake_entry)

    req = qr.FeedbackRequest(
        question="revenue by region",
        sql="SELECT SUM(amount) FROM orders",
        is_correct=False,
        conn_id="conn-1",
        corrected_sql="SELECT SUM(amount) FROM orders WHERE NOT is_test",
        note="exclude tests",
    )
    result = qr.record_feedback(req, user={"email": "test@example.com"})

    assert result["status"] == "queued"
    # Legacy negative path must not have been called.
    fake_entry.engine.record_feedback.assert_not_called()

    # A file must exist in queue_root under the user hash.
    files = list(tmp_path.rglob("*.json"))
    assert len(files) == 1
    record = json.loads(files[0].read_text())
    assert record["question"] == "revenue by region"
    assert record["corrected_sql"].startswith("SELECT SUM(amount)")
    assert record["tier"] == "T1_explicit_edit"
    assert record["status"] == "pending_review"


def test_positive_feedback_still_uses_legacy_path(tmp_path, monkeypatch):
    """is_correct=True unchanged — writes to examples via engine.record_feedback."""
    import routers.query_routes as qr
    monkeypatch.setattr(qr, "CORRECTION_QUEUE_ROOT", tmp_path)

    fake_entry = MagicMock()
    fake_entry.engine.record_feedback = MagicMock()
    fake_entry.conn_id = "conn-1"
    monkeypatch.setattr(qr, "get_connection", lambda conn_id, email: fake_entry)
    monkeypatch.setattr(qr, "QueryMemory", lambda: MagicMock(boost_confidence=MagicMock()))

    req = qr.FeedbackRequest(
        question="q", sql="SELECT 1", is_correct=True, conn_id="conn-1",
    )
    result = qr.record_feedback(req, user={"email": "x@y.com"})
    assert result["status"] == "ok"
    fake_entry.engine.record_feedback.assert_called_once_with("q", "SELECT 1", True)
