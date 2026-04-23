"""AdversarialSimilarity — thumbs-up storm detection."""
from datetime import datetime, timezone, timedelta
import pytest
from adversarial_similarity import (
    AdversarialSimilarity, StormDetected, cosine,
)


def _now():
    return datetime.now(timezone.utc)


def test_cosine_identical_is_one():
    v = [0.1, 0.2, 0.3]
    assert abs(cosine(v, v) - 1.0) < 1e-9


def test_cosine_orthogonal_is_zero():
    assert abs(cosine([1, 0], [0, 1])) < 1e-9


def test_first_upvote_never_storm():
    det = AdversarialSimilarity(cosine_threshold=0.9, window_hours=1, max_upvotes=3)
    det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())


def test_three_identical_upvotes_from_same_user_trip():
    det = AdversarialSimilarity(cosine_threshold=0.9, window_hours=1, max_upvotes=3)
    for _ in range(3):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    with pytest.raises(StormDetected):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())


def test_diverse_upvotes_do_not_trip():
    det = AdversarialSimilarity(cosine_threshold=0.95, window_hours=1, max_upvotes=3)
    det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    det.record(user_hash="u1", embedding=[0, 1, 0], ts=_now())
    det.record(user_hash="u1", embedding=[0, 0, 1], ts=_now())
    det.record(user_hash="u1", embedding=[1, 1, 0], ts=_now())


def test_window_expires_old_upvotes():
    det = AdversarialSimilarity(cosine_threshold=0.9, window_hours=1, max_upvotes=3)
    old = _now() - timedelta(hours=2)
    for _ in range(5):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=old)
    det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())


def test_different_users_isolated():
    det = AdversarialSimilarity(cosine_threshold=0.9, window_hours=1, max_upvotes=3)
    for _ in range(3):
        det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
    det.record(user_hash="u2", embedding=[1, 0, 0], ts=_now())


def test_is_storm_readonly_check():
    det = AdversarialSimilarity(cosine_threshold=0.9, window_hours=1, max_upvotes=3)
    for i in range(4):
        try:
            det.record(user_hash="u1", embedding=[1, 0, 0], ts=_now())
        except StormDetected:
            pass
    assert det.is_storm(user_hash="u1", embedding=[1, 0, 0], ts=_now()) is True
    assert det.is_storm(user_hash="u2", embedding=[1, 0, 0], ts=_now()) is False
