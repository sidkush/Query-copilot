"""Golden eval harness tests."""
from __future__ import annotations

from pathlib import Path


def test_eval_loads_20_pairs():
    from eval.run_golden_eval import load_eval_set
    path = Path(__file__).resolve().parents[1] / "eval" / "golden_nl_sql.jsonl"
    pairs = load_eval_set(path)
    assert len(pairs) >= 20


def test_score_pattern_match():
    from eval.run_golden_eval import score_pattern
    ok = score_pattern("SELECT SUM(amount) FROM orders", r"SUM\(.*amount.*\)")
    assert ok is True
    bad = score_pattern("SELECT count(*) FROM orders", r"SUM\(.*amount.*\)")
    assert bad is False


def test_eval_regression_check():
    from eval.run_golden_eval import is_regression
    assert is_regression(baseline_pass_rate=1.0, shadow_pass_rate=1.0, threshold=0.02) is False
    assert is_regression(baseline_pass_rate=1.0, shadow_pass_rate=0.95, threshold=0.02) is True
    assert is_regression(baseline_pass_rate=0.90, shadow_pass_rate=0.89, threshold=0.02) is False
