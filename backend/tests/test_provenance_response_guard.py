"""Guard: should_apply_provenance skips bind() for non-result responses."""
import pytest
from claim_provenance import should_apply_provenance, ClaimProvenance


@pytest.mark.parametrize("resp_type", ["abort", "clarification", "schema_mismatch_dialog"])
def test_no_provenance_on_non_result_response(resp_type):
    assert should_apply_provenance(resp_type, has_numeric_claims=True) is False


@pytest.mark.parametrize("resp_type", ["synthesis", "waterfall_result", "dual_response"])
def test_provenance_on_synthesis_with_numbers(resp_type):
    assert should_apply_provenance(resp_type, has_numeric_claims=True) is True


def test_no_provenance_when_no_numeric_claims():
    assert should_apply_provenance("synthesis", has_numeric_claims=False) is False


def test_abort_text_passes_through_bind_unchanged():
    """Abort message has no numbers — bind() returns it clean regardless, but
    the guard means bind() never even runs (saves unnecessary work)."""
    cp = ClaimProvenance()
    text = "Aborted: schema has no individual rider identifier."
    result = cp.bind(text, recent_rowsets=[])
    assert "[unverified]" not in result
    assert result.strip() == text


def test_clarification_with_number_not_marked_unverified_via_guard():
    """If the guard is applied, a clarification with a bare number is NOT marked.
    Simulates: should_apply_provenance returns False → bind() skipped."""
    resp_type = "clarification"
    text = "There are 3 options: member, casual, or unknown rider type."
    has_nums = True
    assert should_apply_provenance(resp_type, has_nums) is False
    # Confirming that bind() alone WOULD mark this (to prove guard is needed)
    cp = ClaimProvenance()
    bound = cp.bind(text, recent_rowsets=[])
    assert "[unverified]" in bound  # bind() marks it — guard prevents this call
