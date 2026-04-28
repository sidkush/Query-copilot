"""Opus model ID pre-flight — minimal API probe ($0.01-0.05 total).

Tests two candidate model strings against the live Anthropic API:
  1. claude-opus-4-7  (Sid's spec; SDK 0.86.0 literal does NOT include this)
  2. claude-opus-4-6  (SDK-literal-validated fallback)

For each: send a 5-token prompt, count return code.

Output: which model resolved (4-7, 4-6, or neither). Updates env file
with resolved model so smoke 10 can pick it up. Spend logged.
"""
from __future__ import annotations

import os
os.environ.setdefault("BENCHMARK_MODE", "true")
# 2026-04-27 (Phase 1 OR-coerce removal): retrieval flags must be set
# explicitly. BENCHMARK_MODE no longer auto-coerces hybrid/minilm. This
# script doesn't exercise QueryEngine but sets flags for consistency
# across the BIRD harness suite.
# 2026-04-28 (Phase 1 Capability 3): doc-enrichment OR-coerce also removed.
os.environ.setdefault("FEATURE_HYBRID_RETRIEVAL", "true")
os.environ.setdefault("FEATURE_MINILM_SCHEMA_COLLECTION", "true")
os.environ.setdefault("FEATURE_RETRIEVAL_DOC_ENRICHMENT", "true")

import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


def probe(model_id: str) -> tuple[bool, str, float]:
    """Try a tiny call. Return (success, error_message_or_response, cost_usd)."""
    from config import settings
    from anthropic_provider import AnthropicProvider
    provider = AnthropicProvider(
        api_key=settings.ANTHROPIC_API_KEY,
        default_model=model_id,
        fallback_model=model_id,
    )
    try:
        resp = provider.complete(
            model=model_id,
            system="Reply with one word.",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=10,
        )
        # Approximate cost — Opus 4.7 listed pricing: $15/M in, $75/M out.
        # ~30 input tokens, ~5 output tokens → ~$0.0008. Negligible.
        usage_in = getattr(resp, "input_tokens", 30) or 30
        usage_out = getattr(resp, "output_tokens", 5) or 5
        cost = (usage_in * 15 + usage_out * 75) / 1_000_000
        return True, str(resp.text)[:80], cost
    except Exception as exc:
        return False, f"{type(exc).__name__}: {str(exc)[:200]}", 0.0


def main() -> int:
    print(f"\n{'='*60}\n OPUS MODEL ID PRE-FLIGHT\n{'='*60}\n")

    candidates = ["claude-opus-4-7", "claude-opus-4-6"]
    resolved = None
    total_cost = 0.0

    for cand in candidates:
        print(f" Probing: {cand}...")
        ok, msg, cost = probe(cand)
        total_cost += cost
        if ok:
            print(f"   [OK] resolved (cost ~${cost:.4f}). Reply: {msg!r}")
            resolved = cand
            break
        else:
            print(f"   [FAIL] {msg}")

    print(f"\n {'='*40}")
    if resolved:
        print(f"  RESOLVED: {resolved}")
        print(f"  Pre-flight spend: ~${total_cost:.4f}")
        print(f" {'='*40}\n")
        # Write resolved model to a marker file
        marker = _BACKEND_DIR / ".opus_resolved_model"
        marker.write_text(resolved)
        print(f"  Wrote: {marker.name}")
        return 0
    else:
        print(f"  NEITHER MODEL RESOLVED.")
        print(f"  Likely BYOK tier issue — Opus access not enabled on this key.")
        print(f"  Recommendation: drop Opus escalation entirely; keep Routing V2 Sonnet-only.")
        print(f" {'='*40}\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
