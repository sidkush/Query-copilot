#!/usr/bin/env python
"""Invariant verification for Progressive Dual-Response feature (Task M5).

Checks all 5 invariants from UFSD-2026-04-07-data-acceleration.md.
Run: python test_dual_response_invariants.py
"""
import sys
import re

passed = 0
total = 0


def check(name, condition, detail=""):
    global passed, total
    total += 1
    status = "PASS" if condition else "FAIL"
    suffix = f" -- {detail}" if detail else ""
    print(f"  [{status}] {name}{suffix}")
    if condition:
        passed += 1
    return condition


# ---------- Invariant-1: Read-only enforcement ----------
from sql_validator import SQLValidator
v = SQLValidator()
# validate() returns (is_valid: bool, cleaned_sql: str, error: str|None)
check("Inv-1a: DROP blocked", not v.validate("DROP TABLE users")[0])
check("Inv-1b: DELETE blocked", not v.validate("DELETE FROM users")[0])
check("Inv-1c: UPDATE blocked", not v.validate("UPDATE users SET x=1")[0])

# ---------- Invariant-2: PII masking via BaseTier._apply_masking ----------
from waterfall_router import BaseTier, TierResult
check("Inv-2a: _apply_masking exists", hasattr(BaseTier, "_apply_masking"))
check("Inv-2b: _apply_masking is staticmethod",
      isinstance(BaseTier.__dict__.get("_apply_masking"), staticmethod))

# Test masking actually works on a TierResult with PII-like data
try:
    import pandas as pd
    from pii_masking import mask_dataframe
    r = TierResult(hit=True, tier_name="test",
                   data={"rows": [{"ssn": "123-45-6789", "name": "Alice"}],
                         "columns": ["ssn", "name"]})
    masked = BaseTier._apply_masking(r, conn_id="test")
    ssn_val = str(masked.data.get("rows", [{}])[0].get("ssn", ""))
    check("Inv-2c: SSN masked in _apply_masking output",
          "123-45-6789" not in ssn_val, f"got: {ssn_val}")
except Exception as exc:
    check("Inv-2c: SSN masked in _apply_masking output", False, str(exc))

# ---------- Invariant-7: SSE backward compatibility ----------
try:
    with open("../frontend/src/components/agent/AgentStepFeed.jsx", "r", encoding="utf-8") as f:
        jsx_src = f.read()
    original_types = ["user_query", "thinking", "tool_call", "result",
                      "tier_routing", "progress", "tier_hit", "error"]
    missing = [t for t in original_types if f'step.type === "{t}"' not in jsx_src]
    check("Inv-7a: All 8 original step types present", len(missing) == 0,
          f"missing: {missing}" if missing else "all present")
    # New types are additive
    check("Inv-7b: cached_result renderer added",
          'step.type === "cached_result"' in jsx_src)
    check("Inv-7c: live_correction renderer added",
          'step.type === "live_correction"' in jsx_src)
except Exception as exc:
    check("Inv-7: SSE backward compat", False, str(exc))

# ---------- Invariant-8: __init_subclass__ blocks answer() override ----------
try:
    class _BadTier(BaseTier):
        async def answer(self, q, s, c): pass
        async def _answer(self, q, s, c): pass
        def can_answer(self, q, s, c): return False
        @property
        def name(self): return "bad"
    check("Inv-8: answer() override blocked", False, "BadTier created without TypeError")
except TypeError:
    check("Inv-8: answer() override blocked", True, "TypeError raised correctly")

# ---------- Invariant-9: route_dual failure guard ----------
with open("agent_engine.py", "r", encoding="utf-8") as f:
    engine_src = f.read()
has_route_dual = "route_dual" in engine_src
has_except = "except Exception" in engine_src and "route_dual" in engine_src
check("Inv-9a: route_dual called in agent_engine", has_route_dual)
# Check the try/except guard pattern
guard_pattern = re.search(
    r"try:.*?route_dual.*?except\s+Exception",
    engine_src, re.DOTALL
)
check("Inv-9b: route_dual wrapped in try/except", guard_pattern is not None)

# ---------- Config flags independent (FM-1) ----------
from config import settings
check("FM-1a: DUAL_RESPONSE_ENABLED independent", hasattr(settings, "DUAL_RESPONSE_ENABLED"))
check("FM-1b: WRITE_TIME_MASKING independent", hasattr(settings, "WRITE_TIME_MASKING"))
check("FM-1c: BEHAVIOR_WARMING_ENABLED independent", hasattr(settings, "BEHAVIOR_WARMING_ENABLED"))

# ---------- Summary ----------
print(f"\n{'='*50}")
print(f"Invariant checks: {passed}/{total} passed")
if passed < total:
    print("SOME CHECKS FAILED — review above")
    sys.exit(1)
else:
    print("ALL INVARIANTS HOLD")
    sys.exit(0)
