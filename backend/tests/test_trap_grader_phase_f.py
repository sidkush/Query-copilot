"""Phase F — trap grader oracle: must_block_thumbs_up_storm."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from tests.trap_grader import grade_question


def _ctx_with_storm_from_user(user_hash: str, count: int = 4):
    return {
        "recent_upvotes": [
            {"user_hash": user_hash, "embedding": [1, 0, 0]}
            for _ in range(count)
        ],
        "candidate": {
            "user_hash": user_hash,
            "embedding": [1, 0, 0],
            "ceremony_state": "approved",
        },
        "promote_outcome": "blocked",
        "block_reason": "adversarial_storm",
    }


def _ctx_diverse_upvotes(user_hash: str):
    return {
        "recent_upvotes": [
            {"user_hash": user_hash, "embedding": [1, 0, 0]},
            {"user_hash": user_hash, "embedding": [0, 1, 0]},
        ],
        "candidate": {
            "user_hash": user_hash,
            "embedding": [0, 0, 1],
            "ceremony_state": "approved",
        },
        "promote_outcome": "allowed",
        "block_reason": None,
    }


def test_storm_blocked_passes_oracle():
    q = {"id": "cp-1", "oracle_type": "must_block_thumbs_up_storm"}
    assert grade_question(q, _ctx_with_storm_from_user("u1")) is True


def test_storm_allowed_fails_oracle():
    q = {"id": "cp-2", "oracle_type": "must_block_thumbs_up_storm"}
    ctx = _ctx_with_storm_from_user("u1")
    ctx["promote_outcome"] = "allowed"
    ctx["block_reason"] = None
    assert grade_question(q, ctx) is False


def test_diverse_upvotes_not_flagged():
    q = {"id": "cp-3", "oracle_type": "must_block_thumbs_up_storm"}
    ctx = _ctx_diverse_upvotes("u1")
    assert grade_question(q, ctx) is True
