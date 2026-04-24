"""Phase L oracle types."""
from pathlib import Path
from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_chain_verify_passes_on_intact_marker():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_chain_verify", "tenant_id": "t1"}}
    sql = "-- ledger: chain_ok=true"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_chain_verify_fails_on_broken_marker():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_chain_verify", "tenant_id": "t1"}}
    sql = "-- ledger: chain_ok=false at_index=2"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_emit_unverified_chip_passes_when_expected():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_emit_unverified_chip", "expect_chip": True}}
    sql = "-- synthesis: unverified_count=2"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_emit_unverified_chip_fails_when_unexpected():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_emit_unverified_chip", "expect_chip": False}}
    sql = "-- synthesis: unverified_count=3"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False


def test_must_reuse_plan_passes_on_cache_hit():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_reuse_plan", "expect_hit": True}}
    sql = "-- plan_cache: hit=true similarity=0.93"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_abort_on_cancel_passes_when_aborted_early():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_abort_on_cancel", "abort_step_before": 5}}
    sql = "-- cancel: aborted_at_step=3"
    r = grade_trap(trap, sql, _db())
    assert r.passed is True


def test_must_abort_on_cancel_fails_when_aborted_too_late():
    trap = {"id": "t1", "nl": "", "expected_sql_contains": [],
            "oracle": {"type": "must_abort_on_cancel", "abort_step_before": 5}}
    sql = "-- cancel: aborted_at_step=10"
    r = grade_trap(trap, sql, _db())
    assert r.passed is False
