"""
Phase 1 verification tests — run with: python test_phase1.py
Tests are written BEFORE implementation (TDD RED phase).
"""
import sys
import os

# Ensure backend is on path
sys.path.insert(0, os.path.dirname(__file__))

errors = []

# ── Task 1.1: schema_intelligence.py exists and imports ──────────
def test_schema_intelligence_import():
    try:
        from schema_intelligence import SchemaIntelligence, SchemaProfile
        si = SchemaIntelligence()
        assert hasattr(si, 'profile_connection'), "Missing profile_connection method"
        assert hasattr(si, 'get_profile'), "Missing get_profile method"
        assert hasattr(si, 'invalidate'), "Missing invalidate method"
        assert hasattr(si, 'schema_hash'), "Missing schema_hash method"
        assert hasattr(si, 'is_stale'), "Missing is_stale method"
        print("  [PASS] schema_intelligence imports and has required methods")
        return True
    except Exception as e:
        print(f"  [FAIL] schema_intelligence: {e}")
        return False

# ── Task 1.2: config settings exist ────────────────────────────
def test_config_settings():
    try:
        from config import settings
        attrs = [
            'SCHEMA_CACHE_MAX_AGE_MINUTES', 'SCHEMA_CACHE_DIR',
            'QUERY_MEMORY_ENABLED', 'QUERY_MEMORY_COLLECTION_PREFIX',
            'QUERY_MEMORY_TTL_HOURS', 'TURBO_MODE_ENABLED',
            'TURBO_TWIN_DIR', 'TURBO_TWIN_MAX_SIZE_MB',
            'TURBO_TWIN_SAMPLE_PERCENT', 'TURBO_TWIN_REFRESH_HOURS',
            'DECOMPOSITION_ENABLED', 'DECOMPOSITION_MIN_ROWS',
            'STREAMING_PROGRESS_INTERVAL_MS',
        ]
        for attr in attrs:
            assert hasattr(settings, attr), f"Missing setting: {attr}"
        print("  [PASS] all query intelligence config settings exist")
        return True
    except Exception as e:
        print(f"  [FAIL] config settings: {e}")
        return False

# ── Task 1.4: waterfall_router.py exists and imports ────────────
def test_waterfall_router_import():
    try:
        from waterfall_router import WaterfallRouter, BaseTier, SchemaTier, TierResult
        wr = WaterfallRouter([SchemaTier()])
        assert hasattr(wr, 'route'), "Missing route method"
        assert hasattr(wr, '_tiers') or hasattr(wr, 'tiers'), "Missing tiers attribute"
        print("  [PASS] waterfall_router imports and has required structure")
        return True
    except Exception as e:
        print(f"  [FAIL] waterfall_router: {e}")
        return False

# ── Task 1.8: schema staleness validation ───────────────────────
def test_schema_staleness():
    try:
        from schema_intelligence import SchemaIntelligence
        si = SchemaIntelligence()
        assert hasattr(si, 'validate_freshness'), "Missing validate_freshness method"
        print("  [PASS] schema staleness validation method exists")
        return True
    except Exception as e:
        print(f"  [FAIL] schema staleness: {e}")
        return False

# ── Invariant checks ────────────────────────────────────────────
def test_invariants():
    ok = True
    # Invariant-1: no DML in schema_intelligence
    try:
        code = open(os.path.join(os.path.dirname(__file__), 'schema_intelligence.py')).read()
        import re
        dml = re.findall(r'(?i)\b(UPDATE|DELETE\s+FROM|DROP|ALTER|TRUNCATE)\b', code)
        if dml:
            print(f"  [FAIL] Invariant-1: DML found in schema_intelligence.py: {dml}")
            ok = False
        else:
            print("  [PASS] Invariant-1: no DML in schema_intelligence.py")
    except FileNotFoundError:
        print("  [SKIP] Invariant-1: schema_intelligence.py not yet created")
        ok = False

    # Invariant-7: waterfall_router uses only additive SSE types
    try:
        code = open(os.path.join(os.path.dirname(__file__), 'waterfall_router.py')).read()
        if 'mask_dataframe' in code or 'mask_pii' in code:
            print("  [PASS] Invariant-2: PII masking referenced in waterfall_router")
        else:
            print("  [WARN] Invariant-2: no mask_dataframe reference found in waterfall_router.py")
    except FileNotFoundError:
        print("  [SKIP] Invariant-2: waterfall_router.py not yet created")
        ok = False

    return ok


if __name__ == "__main__":
    print("\n=== Phase 1 Verification Tests ===\n")
    results = {
        "1.1 schema_intelligence": test_schema_intelligence_import(),
        "1.2 config_settings": test_config_settings(),
        "1.4 waterfall_router": test_waterfall_router_import(),
        "1.8 schema_staleness": test_schema_staleness(),
        "invariants": test_invariants(),
    }
    print(f"\n=== Results: {sum(results.values())}/{len(results)} passed ===")
    if not all(results.values()):
        print("FAILING tests (TDD RED — expected before implementation)")
        sys.exit(1)
    else:
        print("ALL PASS")
        sys.exit(0)
