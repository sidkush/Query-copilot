# Opus 4.7 Model ID Investigation (Free, No API Spend)

**Source**: post main_150_routing_v2 (2026-04-27). 122 Routing V2 escalations all returned HTTP 404 from Anthropic API on model string `claude-opus-4-7-1m-20260115`.

## Step 1 — Anthropic SDK version

```
$ python -c "import anthropic; print(anthropic.__version__)"
0.86.0
```

## Step 2 — SDK literal types for valid model strings

`anthropic.types.model.Model` (SDK 0.86.0) declares:

```python
Model: TypeAlias = Union[
    Literal[
        "claude-opus-4-6",                 # ← latest Opus
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
        "claude-haiku-4-5-20251001",
        "claude-opus-4-5",
        "claude-opus-4-5-20251101",
        "claude-sonnet-4-5",
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-1",
        "claude-opus-4-1-20250805",
        "claude-opus-4-0",
        "claude-opus-4-20250514",
        "claude-sonnet-4-0",
        "claude-sonnet-4-20250514",
        "claude-3-haiku-20240307",
    ],
    str,  # open-fallback — arbitrary strings type-check but may 404 at API call
]
```

## Findings

1. **`claude-opus-4-7-1m-20260115` is not a valid Anthropic model.** Confirmed by 404 cascade in main_150_routing_v2.
2. **`claude-opus-4-7` (bare) is NOT in SDK 0.86.0 literal types.** Latest Opus declared is `claude-opus-4-6`.
3. **The SDK literal accepts `str` as open-fallback** — arbitrary model names pass type-check but may 404 at API call time. SDK alone cannot prove validity.
4. **Two interpretations are possible without an API call**:
   - (a) SDK 0.86.0 predates Opus 4.7 launch; bare `claude-opus-4-7` may be valid against the live API even though SDK literal is stale.
   - (b) Opus 4.7 doesn't exist; system-prompt-documented ID is bleeding-edge metadata that hasn't shipped.

## Decisions encoded in code (2026-04-27)

- `MODEL_ROUTING_V2_HARD` default: `claude-opus-4-7` (Sid's spec). Smoke test will confirm.
- `MODEL_LADDER_RECOVERY` default: `claude-opus-4-7` (was the broken 1M variant). Same uncertain validity.
- `MODEL_ROUTING_V2_OPUS_ENABLED` default: `False` — gates Layer 2 + Layer 3 entirely. `BENCHMARK_MODE` does NOT auto-enable. Routing V2 stays Sonnet-primary-only until Opus ID resolved.
- Production: byte-identical to pre-Routing-V2 (FEATURE_MODEL_ROUTING_V2 default off; Haiku primary).

## Next step (gated on Sid signoff for ~$1.50 smoke test)

Run `scripts/run_bird_smoke10.py` with:
```
FEATURE_MODEL_ROUTING_V2=True
MODEL_ROUTING_V2_OPUS_ENABLED=True
MODEL_ROUTING_V2_HARD=claude-opus-4-7
```

Outcome interpretation:
- **All 10 questions complete with ≥1 successful Opus call (model="claude-opus-4-7" in api_call events)** → Opus 4.7 valid; ready for next main 150 with full Routing V2.
- **404 returned again** → fall back to `claude-opus-4-6` (SDK-literal-validated). Re-run smoke 10. If 4.6 succeeds, use it.
- **Both 404** → BYOK key has Opus tier disabled. Either upgrade key tier (Sid decision) OR drop Opus escalation entirely (keep Routing V2 Sonnet-only).

## What's already validated by Sonnet-only subset

Per main_150_routing_v2 result analysis: of 92 questions where Opus didn't fire (Sonnet primary clean), 58 passed = **63% on Sonnet-primary-only**. **+9pts vs Haiku-only baseline (54%)**, validating Sid's audit prediction that routing change is high leverage.

11 sql_logic conversions confirmed (qids 31, 195, 483, 518, 678, 829, 854, 1042, 1044, 1479, 1484) — Sonnet wrote correct SQL where Haiku had been failing. These are the targeted wins from Routing V2 Layer 1 alone.

## Status

- ✅ Investigation complete (free, no API spend)
- ✅ SDK literal evidence captured
- ✅ Config updated with SDK-validated fallback documented in code comments
- ✅ Both `MODEL_ROUTING_V2_HARD` and `MODEL_LADDER_RECOVERY` use `claude-opus-4-7` (consistent; both will resolve same way under smoke 10)
- ⏸ Smoke 10 verification pending Sid signoff (~$1.50)
- ⏸ Layer 2 + Layer 3 disabled until Opus ID resolves

## Cumulative spend

~$36 through main_150_routing_v2. Investigation step adds $0. Smoke 10 verification (when authorized) adds ~$1.50. Total budget: $39 cap.
