"""
Phase 4 verification tests — run with: python test_phase4.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

# ── Task 4.1: query_decomposer.py ───────────────────────────────
def test_decomposer_import():
    try:
        from query_decomposer import QueryDecomposer
        qd = QueryDecomposer()
        assert hasattr(qd, 'can_decompose'), "Missing can_decompose"
        assert hasattr(qd, 'decompose'), "Missing decompose"
        assert hasattr(qd, 'merge_results'), "Missing merge_results"
        print("  [PASS] query_decomposer imports and has required methods")
        return True
    except Exception as e:
        print(f"  [FAIL] query_decomposer: {e}")
        return False

# ── Task 4.2: LiveTier no longer placeholder ────────────────────
def test_live_tier():
    try:
        from waterfall_router import LiveTier
        lt = LiveTier()
        import asyncio
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(lt.can_answer("test", None, "conn1"))
        loop.close()
        # LiveTier should always return True (it's the final fallback)
        assert result is True, f"LiveTier.can_answer should return True, got {result}"
        print("  [PASS] LiveTier.can_answer returns True (final fallback)")
        return True
    except NotImplementedError:
        print("  [FAIL] LiveTier still raises NotImplementedError")
        return False
    except Exception as e:
        print(f"  [FAIL] LiveTier: {e}")
        return False

# ── Task 4.4: estimate_query_time exists ─────────────────────────
def test_estimate_query_time():
    try:
        from schema_intelligence import SchemaIntelligence
        si = SchemaIntelligence()
        assert hasattr(si, 'estimate_query_time'), "Missing estimate_query_time"
        print("  [PASS] estimate_query_time method exists")
        return True
    except Exception as e:
        print(f"  [FAIL] estimate_query_time: {e}")
        return False

# ── Task 4.5: integration test file exists ──────────────────────
def test_integration_test_exists():
    path = os.path.join(os.path.dirname(__file__), 'test_waterfall.py')
    if os.path.exists(path):
        print("  [PASS] test_waterfall.py exists")
        return True
    else:
        print("  [FAIL] test_waterfall.py not found")
        return False

# ── Full waterfall import chain ─────────────────────────────────
def test_full_import_chain():
    try:
        from schema_intelligence import SchemaIntelligence
        from query_memory import QueryMemory
        from duckdb_twin import DuckDBTwin
        from waterfall_router import WaterfallRouter, build_default_router
        from audit_trail import log_tier_decision
        from config import settings

        wr = build_default_router()
        tier_names = [t.name for t in wr._tiers]
        assert tier_names == ["schema", "memory", "turbo", "live"], f"Unexpected tier order: {tier_names}"
        print(f"  [PASS] Full import chain works. Tiers: {tier_names}")
        return True
    except Exception as e:
        print(f"  [FAIL] Import chain: {e}")
        return False


if __name__ == "__main__":
    print("\n=== Phase 4 Verification Tests ===\n")
    results = {
        "4.1 query_decomposer": test_decomposer_import(),
        "4.2 live_tier": test_live_tier(),
        "4.4 estimate_query_time": test_estimate_query_time(),
        "4.5 integration_test": test_integration_test_exists(),
        "full_import_chain": test_full_import_chain(),
    }
    print(f"\n=== Results: {sum(results.values())}/{len(results)} passed ===")
    if not all(results.values()):
        print("FAILING tests (TDD RED — expected before implementation)")
        sys.exit(1)
    else:
        print("ALL PASS")
        sys.exit(0)
