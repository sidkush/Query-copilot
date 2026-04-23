"""Pinned receipts — survive session-memory compaction."""
from datetime import datetime, timezone

from pinned_receipts import PinnedReceiptStore, Receipt


def _r(text="confirmed 30-day churn"):
    return Receipt(
        kind="intent_echo_accept",
        text=text,
        created_at=datetime.now(timezone.utc),
        session_id="sess-1",
    )


def test_pin_and_read(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("sess-1", _r())
    receipts = store.read("sess-1")
    assert len(receipts) == 1
    assert "30-day churn" in receipts[0].text


def test_read_empty_when_no_receipts(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    assert store.read("missing") == []


def test_pin_multiple_preserves_order(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("s", _r("first"))
    store.pin("s", _r("second"))
    receipts = store.read("s")
    assert [r.text for r in receipts] == ["first", "second"]


def test_prune_by_session(tmp_path):
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("keep", _r())
    store.pin("drop", _r())
    store.prune("drop")
    assert store.read("drop") == []
    assert len(store.read("keep")) == 1


def test_atomic_write_survives_partial_crash(tmp_path):
    """Writing a corrupted file must not destroy existing receipts."""
    store = PinnedReceiptStore(root=tmp_path)
    store.pin("s", _r("pre-crash"))
    (tmp_path / ".s_corrupt_.tmp").write_text("garbage")
    receipts = store.read("s")
    assert len(receipts) == 1
