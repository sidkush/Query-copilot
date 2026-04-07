"""
Phase 2 verification tests — run with: python test_phase2.py
Tests written BEFORE implementation (TDD RED phase).
"""
import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))

errors = []

# ── Task 2.1: query_memory.py exists and imports ────────────────
def test_query_memory_import():
    try:
        from query_memory import QueryMemory
        qm = QueryMemory()
        assert hasattr(qm, 'store_insight'), "Missing store_insight"
        assert hasattr(qm, 'find_similar'), "Missing find_similar"
        assert hasattr(qm, 'is_fresh'), "Missing is_fresh"
        assert hasattr(qm, 'cleanup_stale'), "Missing cleanup_stale"
        print("  [PASS] query_memory imports and has required methods")
        return True
    except Exception as e:
        print(f"  [FAIL] query_memory: {e}")
        return False

# ── Task 2.1: anonymize_sql function exists ─────────────────────
def test_anonymize_sql():
    try:
        from query_memory import anonymize_sql
        result = anonymize_sql("SELECT * FROM users WHERE id = 42 AND name = 'John'")
        assert "42" not in result, "Literal 42 not anonymized"
        assert "John" not in result, "Literal 'John' not anonymized"
        assert "?" in result or "..." in result, "No placeholder found"
        print(f"  [PASS] anonymize_sql works: {result}")
        return True
    except Exception as e:
        print(f"  [FAIL] anonymize_sql: {e}")
        return False

# ── Task 2.2: MemoryTier implemented in waterfall_router ────────
def test_memory_tier():
    try:
        from waterfall_router import MemoryTier
        mt = MemoryTier()
        # Should no longer raise NotImplementedError (placeholder removed)
        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(mt.can_answer("test", None, "conn1"))
        loop.close()
        # Result should be False (no memory stored yet), but method should work
        assert result is False or result is True, "can_answer should return bool"
        print("  [PASS] MemoryTier.can_answer works (no longer placeholder)")
        return True
    except NotImplementedError:
        print("  [FAIL] MemoryTier still raises NotImplementedError (still placeholder)")
        return False
    except Exception as e:
        print(f"  [FAIL] MemoryTier: {e}")
        return False

# ── Task 2.4: ValidationGate schema drift detection ─────────────
def test_validation_gate():
    try:
        from waterfall_router import ValidationGate, TierResult
        vg = ValidationGate()
        # Matching hashes → pass
        tr = TierResult(hit=True, tier_name="memory", metadata={"schema_hash": "abc123"})
        assert vg.validate(tr, "abc123") == True, "Same hash should pass"
        # Mismatched hashes → fail
        assert vg.validate(tr, "xyz789") == False, "Different hash should fail"
        print("  [PASS] ValidationGate detects schema drift")
        return True
    except Exception as e:
        print(f"  [FAIL] ValidationGate: {e}")
        return False

# ── Invariant checks ────────────────────────────────────────────
def test_invariants():
    ok = True
    # Invariant-5: query_memory uses conn_id scoping
    try:
        code = open(os.path.join(os.path.dirname(__file__), 'query_memory.py')).read()
        if code.count('conn_id') >= 5:
            print("  [PASS] Invariant-5: query_memory scopes by conn_id")
        else:
            print(f"  [WARN] Invariant-5: conn_id appears {code.count('conn_id')} times (expected ≥5)")
    except FileNotFoundError:
        print("  [SKIP] Invariant-5: query_memory.py not yet created")
        ok = False

    # Invariant-2: waterfall_router has mask_dataframe reference
    try:
        code = open(os.path.join(os.path.dirname(__file__), 'waterfall_router.py')).read()
        if 'mask_dataframe' in code:
            print("  [PASS] Invariant-2: mask_dataframe referenced in waterfall_router")
        else:
            print("  [FAIL] Invariant-2: no mask_dataframe in waterfall_router")
            ok = False
    except FileNotFoundError:
        print("  [SKIP] waterfall_router.py not found")
        ok = False

    return ok


if __name__ == "__main__":
    print("\n=== Phase 2 Verification Tests ===\n")
    results = {
        "2.1 query_memory": test_query_memory_import(),
        "2.1b anonymize_sql": test_anonymize_sql(),
        "2.2 memory_tier": test_memory_tier(),
        "2.4 validation_gate": test_validation_gate(),
        "invariants": test_invariants(),
    }
    print(f"\n=== Results: {sum(results.values())}/{len(results)} passed ===")
    if not all(results.values()):
        print("FAILING tests (TDD RED — expected before implementation)")
        sys.exit(1)
    else:
        print("ALL PASS")
        sys.exit(0)
