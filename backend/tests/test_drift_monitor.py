"""Drift monitor tests."""
from __future__ import annotations


def test_kl_divergence_identical():
    from drift_monitor import kl_divergence
    assert abs(kl_divergence({"a": 0.5, "b": 0.5}, {"a": 0.5, "b": 0.5})) < 1e-6


def test_kl_divergence_high_when_distributions_diverge():
    from drift_monitor import kl_divergence
    v = kl_divergence({"a": 0.9, "b": 0.1}, {"a": 0.1, "b": 0.9})
    assert v > 0.5


def test_action_distribution_from_audit_lines(tmp_path):
    from drift_monitor import distribution_from_audit
    path = tmp_path / "audit.jsonl"
    path.write_text("\n".join([
        '{"tables":["orders"],"join_depth":1,"chart_type":"line","tokens":1000}',
        '{"tables":["orders","customers"],"join_depth":2,"chart_type":"bar","tokens":1500}',
        '{"tables":["orders"],"join_depth":1,"chart_type":"line","tokens":1200}',
    ]))
    dist = distribution_from_audit(path, key="chart_type")
    assert abs(dist["line"] - 2 / 3) < 1e-6
    assert abs(dist["bar"] - 1 / 3) < 1e-6


def test_check_drift_no_alerts_when_missing_audits(tmp_path):
    from drift_monitor import check_drift
    result = check_drift(
        today_audit=tmp_path / "today.jsonl",
        baseline_audit=tmp_path / "baseline.jsonl",
        threshold=0.3,
    )
    assert result == {"alerts": []}
