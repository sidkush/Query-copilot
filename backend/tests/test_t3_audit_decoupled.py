"""T3 — audit ledger append decoupled from claim provenance, runs in finally.

Structural / source-level checks. The full integration is exercised by
existing audit-ledger tests; here we just lock in that the wiring lives
in the generator-cleanup path and the audit append is not nested inside
the FEATURE_CLAIM_PROVENANCE branch.
"""
import pathlib

_AE_PATH = pathlib.Path(__file__).resolve().parent.parent / "agent_engine.py"


def _read_src() -> str:
    return _AE_PATH.read_text(encoding="utf-8")


def test_audit_append_chained_present():
    src = _read_src()
    assert "append_chained" in src, \
        "agent_engine must call AuditLedger.append_chained for chained writes"


def test_audit_append_in_finally_block():
    """The append_chained call must live in a `finally:` cleanup block,
    not in the main generator body — so a mid-run exception still emits."""
    src = _read_src()
    # Locate the append_chained call(s) and walk back to find the nearest
    # control keyword. The first one we hit must be `finally`.
    lines = src.split("\n")
    found_in_finally = False
    for i, line in enumerate(lines):
        if "append_chained" not in line:
            continue
        # Walk back, skipping comment-only lines.
        for j in range(i - 1, max(0, i - 80), -1):
            stripped = lines[j].strip()
            if not stripped or stripped.startswith("#"):
                continue
            # Looking for the nearest control flow keyword that opens a block.
            if stripped.startswith("finally:"):
                found_in_finally = True
                break
            if stripped.startswith(("try:", "except", "else:", "elif", "if ", "for ", "while ", "with ")):
                # Found a different opener first → not in finally
                break
            # Skip body statements
            continue
        if found_in_finally:
            break
    assert found_in_finally, (
        "append_chained() must be called from a finally: block so the audit "
        "ledger writes even when the generator exits via exception."
    )


def test_audit_decoupled_from_claim_provenance_check():
    """The audit ledger append must NOT be nested strictly inside the
    FEATURE_CLAIM_PROVENANCE conditional. It should run when
    FEATURE_AUDIT_LEDGER is True regardless of provenance state."""
    src = _read_src()
    # Heuristic: find every `append_chained(` in the source that lives in
    # the run() finally area, and verify the immediately enclosing `if`
    # condition references FEATURE_AUDIT_LEDGER (not FEATURE_CLAIM_PROVENANCE).
    lines = src.split("\n")
    decoupled = False
    for i, line in enumerate(lines):
        if "append_chained" not in line:
            continue
        for j in range(i - 1, max(0, i - 80), -1):
            stripped = lines[j].strip()
            if stripped.startswith("if ") and "FEATURE_AUDIT_LEDGER" in stripped \
                    and "FEATURE_CLAIM_PROVENANCE" not in stripped:
                decoupled = True
                break
            # If we hit FEATURE_CLAIM_PROVENANCE first, NOT decoupled.
            if stripped.startswith("if ") and "FEATURE_CLAIM_PROVENANCE" in stripped:
                break
        if decoupled:
            break
    assert decoupled, (
        "append_chained() must be guarded by `if settings.FEATURE_AUDIT_LEDGER` "
        "alone — not nested inside FEATURE_CLAIM_PROVENANCE."
    )
