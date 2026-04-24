import pytest
from ab_dedup import record_bucket, is_duplicate_bucket, _SEEN

def _clear():
    _SEEN.clear()

def test_first_bucket_is_not_duplicate():
    _clear()
    assert is_duplicate_bucket(user_id="u1", experiment="exp1", variant="A") is False

def test_same_variant_twice_is_duplicate():
    _clear()
    record_bucket(user_id="u2", experiment="exp1", variant="A")
    assert is_duplicate_bucket(user_id="u2", experiment="exp1", variant="A") is True

def test_different_variant_not_duplicate_until_recorded():
    _clear()
    record_bucket(user_id="u3", experiment="exp1", variant="A")
    assert is_duplicate_bucket(user_id="u3", experiment="exp1", variant="B") is False
