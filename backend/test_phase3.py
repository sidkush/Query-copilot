"""
Phase 3 verification tests — run with: python test_phase3.py
"""
import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))

# ── Task 3.1: duckdb_twin.py ────────────────────────────────────
def test_duckdb_twin_import():
    try:
        from duckdb_twin import DuckDBTwin
        dt = DuckDBTwin()
        assert hasattr(dt, 'create_twin'), "Missing create_twin"
        assert hasattr(dt, 'query_twin'), "Missing query_twin"
        assert hasattr(dt, 'get_twin_info'), "Missing get_twin_info"
        assert hasattr(dt, 'refresh_twin'), "Missing refresh_twin"
        assert hasattr(dt, 'delete_twin'), "Missing delete_twin"
        print("  [PASS] duckdb_twin imports and has required methods")
        return True
    except Exception as e:
        print(f"  [FAIL] duckdb_twin: {e}")
        return False

# ── Task 3.3: TurboTier no longer placeholder ───────────────────
def test_turbo_tier():
    try:
        from waterfall_router import TurboTier
        tt = TurboTier()
        import asyncio
        loop = asyncio.new_event_loop()
        # Should return False (no twin exists), not raise NotImplementedError
        result = loop.run_until_complete(tt.can_answer("test", None, "conn1"))
        loop.close()
        assert result is False or result is True, "can_answer should return bool"
        print("  [PASS] TurboTier.can_answer works (no longer placeholder)")
        return True
    except NotImplementedError:
        print("  [FAIL] TurboTier still raises NotImplementedError")
        return False
    except Exception as e:
        print(f"  [FAIL] TurboTier: {e}")
        return False

# ── Task 3.4: audit_trail.py ────────────────────────────────────
def test_audit_trail_import():
    try:
        from audit_trail import log_tier_decision, log_turbo_event, log_memory_event
        print("  [PASS] audit_trail imports and has required functions")
        return True
    except Exception as e:
        print(f"  [FAIL] audit_trail: {e}")
        return False

# ── Task 3.4: audit trail writes to file ────────────────────────
def test_audit_trail_writes():
    try:
        from audit_trail import log_tier_decision
        import tempfile, json
        log_tier_decision('test_conn', 'eh', 'qh', ['schema', 'memory'], 'memory', 'hash1', 120, 'hit')
        audit_path = os.path.join(os.path.dirname(__file__), '.data', 'audit', 'query_decisions.jsonl')
        if os.path.exists(audit_path):
            with open(audit_path) as f:
                lines = f.readlines()
            if lines:
                entry = json.loads(lines[-1])
                assert entry.get('conn_id') == 'test_conn', "conn_id mismatch"
                print("  [PASS] audit_trail writes JSONL entries")
                return True
        print("  [FAIL] audit file not created or empty")
        return False
    except Exception as e:
        print(f"  [FAIL] audit_trail write: {e}")
        return False

# ── Invariant checks ────────────────────────────────────────────
def test_invariants():
    ok = True
    # Invariant-1: no DML targeting SOURCE database in duckdb_twin
    # Note: DROP/CREATE on the LOCAL DuckDB twin file is allowed — only mutations to the source DB are forbidden
    try:
        code = open(os.path.join(os.path.dirname(__file__), 'duckdb_twin.py')).read()
        # Check for source-DB mutations (UPDATE/DELETE/ALTER/TRUNCATE) — DROP is allowed for local twin tables
        source_dml = re.findall(r'(?i)\b(UPDATE\s+\w|DELETE\s+FROM|ALTER\s+TABLE|TRUNCATE)\b', code)
        if source_dml:
            print(f"  [FAIL] Invariant-1: source DB DML in duckdb_twin.py: {source_dml}")
            ok = False
        else:
            print("  [PASS] Invariant-1: no source DB DML in duckdb_twin.py (local DROP/CREATE allowed)")
    except FileNotFoundError:
        print("  [SKIP] duckdb_twin.py not yet created")
        ok = False

    # Invariant-6: audit_trail uses atomic/append writes
    try:
        code = open(os.path.join(os.path.dirname(__file__), 'audit_trail.py')).read()
        if 'flush' in code or 'append' in code.lower() or '"a"' in code:
            print("  [PASS] Invariant-6: audit_trail uses append/flush pattern")
        else:
            print("  [WARN] Invariant-6: no flush/append pattern detected in audit_trail")
    except FileNotFoundError:
        print("  [SKIP] audit_trail.py not yet created")
        ok = False

    return ok


if __name__ == "__main__":
    print("\n=== Phase 3 Verification Tests ===\n")
    results = {
        "3.1 duckdb_twin": test_duckdb_twin_import(),
        "3.3 turbo_tier": test_turbo_tier(),
        "3.4a audit_trail_import": test_audit_trail_import(),
        "3.4b audit_trail_writes": test_audit_trail_writes(),
        "invariants": test_invariants(),
    }
    print(f"\n=== Results: {sum(results.values())}/{len(results)} passed ===")
    if not all(results.values()):
        print("FAILING tests (TDD RED — expected before implementation)")
        sys.exit(1)
    else:
        print("ALL PASS")
        sys.exit(0)
