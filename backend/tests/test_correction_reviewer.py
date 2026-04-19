"""Tests for correction_reviewer."""
from __future__ import annotations


def test_classify_safe_dedup():
    from correction_reviewer import classify
    rec = {
        "question": "revenue by region",
        "original_sql": "SELECT SUM(amount) FROM orders GROUP BY region",
        "corrected_sql": "SELECT SUM(amount) FROM orders WHERE NOT test GROUP BY region",
    }
    assert classify(rec) == "safe_dedup"


def test_classify_schema_change():
    from correction_reviewer import classify
    rec = {
        "question": "...",
        "original_sql": "SELECT * FROM orders",
        "corrected_sql": "SELECT * FROM invoices",
    }
    assert classify(rec) == "schema_change"


def test_review_batch_promotes_after_majority(tmp_path, monkeypatch):
    from correction_queue import enqueue
    from correction_reviewer import review_batch
    import correction_reviewer

    for i in range(3):
        enqueue(
            user_hash=f"u{i}", question="revenue",
            original_sql="SELECT * FROM orders",
            corrected_sql="SELECT * FROM orders WHERE NOT is_test",
            user_note="", connection_id="same-conn", queue_root=tmp_path,
        )
    promoted = []
    monkeypatch.setattr(correction_reviewer, "promote_to_examples", lambda rec: promoted.append(rec))
    result = review_batch(queue_root=tmp_path, golden_eval_ok=lambda _: True)
    assert result.get("safe_dedup", 0) >= 1
    assert len(promoted) == 1


def test_review_batch_rejects_when_golden_eval_fails(tmp_path, monkeypatch):
    from correction_queue import enqueue
    from correction_reviewer import review_batch
    import correction_reviewer

    for i in range(3):
        enqueue(
            user_hash=f"u{i}", question="revenue",
            original_sql="SELECT * FROM orders",
            corrected_sql="SELECT * FROM orders WHERE NOT is_test",
            user_note="", connection_id="same-conn", queue_root=tmp_path,
        )
    promoted = []
    monkeypatch.setattr(correction_reviewer, "promote_to_examples", lambda rec: promoted.append(rec))
    result = review_batch(queue_root=tmp_path, golden_eval_ok=lambda _: False)
    assert len(promoted) == 0
