from tests.trap_grader import must_not_regress_retrieval_budget


def test_accepts_when_on_mean_within_tolerance():
    off = {"mean_tokens": 1000.0}
    on = {"mean_tokens": 690.0}  # 31% reduction
    assert must_not_regress_retrieval_budget(off, on, target_pct=30.0) is None


def test_rejects_when_on_mean_too_high():
    off = {"mean_tokens": 1000.0}
    on = {"mean_tokens": 800.0}  # 20% reduction
    err = must_not_regress_retrieval_budget(off, on, target_pct=30.0)
    assert err is not None
    assert "20" in err or "30" in err


def test_rejects_when_on_mean_exceeds_off():
    off = {"mean_tokens": 1000.0}
    on = {"mean_tokens": 1100.0}
    assert must_not_regress_retrieval_budget(off, on, target_pct=30.0) is not None
