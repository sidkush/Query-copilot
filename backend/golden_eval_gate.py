"""Golden-eval promotion gate.

Before promoting a correction to few-shot examples, run all seven trap
baselines in shadow. If any suite regresses beyond the threshold, block.

Caller supplies `runner(suite_name)` -> pass_rate (float 0..1).
Fail-closed: any runner exception -> block.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Dict, Optional


logger = logging.getLogger(__name__)


TRAP_SUITE_NAMES = (
    "trap_temporal_scope",
    "trap_coverage_grounding",
    "trap_name_inference",
    "trap_join_scale",
    "trap_intent_drop",
    "trap_sampling_trust",
    "trap_multi_tenant",
)


@dataclass(frozen=True)
class GateDecision:
    block: bool
    deltas_pct: Dict[str, float]
    worst_suite: str
    worst_delta_pct: float


class GoldenEvalGate:
    def __init__(self, *, threshold_pct: Optional[float] = None,
                 runner: Optional[Callable[[str], float]] = None,
                 baselines: Optional[Dict[str, float]] = None):
        if threshold_pct is None:
            try:
                from config import settings
                threshold_pct = float(settings.PROMOTION_GOLDEN_EVAL_THRESHOLD_PCT)
            except Exception:
                threshold_pct = 2.0
        self.threshold_pct = threshold_pct
        self.runner = runner
        self.baselines = baselines or {}

    def check(self) -> GateDecision:
        missing = [name for name in TRAP_SUITE_NAMES if name not in self.baselines]
        if missing:
            raise ValueError(f"missing baseline(s): {missing}")
        deltas: Dict[str, float] = {}
        worst_suite = TRAP_SUITE_NAMES[0]
        worst_delta = 0.0
        fail_closed = False
        for name in TRAP_SUITE_NAMES:
            try:
                shadow_rate = float(self.runner(name))
            except Exception as e:
                logger.error("golden_eval_gate: runner crash on %s: %s", name, e)
                fail_closed = True
                deltas[name] = 100.0
                worst_suite = name
                worst_delta = 100.0
                break
            baseline_rate = float(self.baselines[name])
            delta_pct = max(0.0, (baseline_rate - shadow_rate) * 100.0)
            deltas[name] = delta_pct
            if delta_pct > worst_delta:
                worst_delta = delta_pct
                worst_suite = name
        block = fail_closed or (worst_delta >= self.threshold_pct)
        return GateDecision(
            block=block,
            deltas_pct=deltas,
            worst_suite=worst_suite,
            worst_delta_pct=worst_delta,
        )
