"""Deterministic mock of the Anthropic provider for golden eval.

Why not use the real API?
- Determinism: trap oracle compares exact SQL strings; LLM sampling breaks this.
- Cost: 120+ traps × N PR runs = BYOK burn.
- Isolation: eval should not depend on Anthropic uptime.

Honest limitation: this mock DOES NOT exercise agent tool-loop, retry, or
validator branches. Shadow-eval in Task 12 runs 20-question subset against
REAL Anthropic to catch mock/reality divergence.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class MockAnthropicProvider:
    """Keyed by exact NL question string. For fuzzy use, normalize upstream."""
    responses: dict[str, str]
    version: str = "mock-v1"
    call_count: int = field(default=0, init=False)

    def generate_sql(self, nl_question: str) -> str:
        self.call_count += 1
        key = nl_question.strip().lower()
        if key not in self.responses:
            raise KeyError(f"no canned response for: {nl_question!r}")
        return self.responses[key]
