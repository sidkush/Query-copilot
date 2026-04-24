"""S3 adversarial hardening — claim_provenance must NFKC-normalize,
scope match_claim to allowed rowset ids only, and cap spans per synthesis."""
import pytest
from claim_provenance import (
    ClaimProvenance, extract_numeric_spans, match_claim,
)


def test_extract_spans_normalizes_fullwidth_digits():
    """Fullwidth '４２' should be matched like '42' after NFKC normalization."""
    text = "Rows: ４２ total."
    spans = extract_numeric_spans(text)
    values = {s.value for s in spans}
    assert "42" in values, f"fullwidth digits not normalized: {values}"


def test_match_claim_scoped_to_allowed_query_ids():
    rowsets = [
        {"query_id": "q_mine", "rows": [[1], [2]]},
        {"query_id": "q_other_tenant", "rows": [[999]]},
    ]
    # value 999 exists only in q_other_tenant; restrict to q_mine => must be None
    result = match_claim(value="999", recent_rowsets=rowsets, allowed_query_ids={"q_mine"})
    assert result is None


def test_match_claim_allowed_ids_default_is_unrestricted():
    """Back-compat: no allowed_query_ids => all rowsets considered."""
    rowsets = [{"query_id": "q1", "rows": [[42]]}]
    assert match_claim(value="42", recent_rowsets=rowsets) == "q1"


def test_bind_caps_spans_per_synthesis():
    """Adversarial: 500 numeric spans should all render [unverified] because
    CLAIM_PROVENANCE_MAX_SPANS_PER_SYNTH defaults to 50; remainder can never
    match. No matcher storm."""
    cp = ClaimProvenance(unverified_marker="[unverified]", max_spans=10)
    numbers = " ".join(str(i) for i in range(1, 101))  # 100 numbers
    recent = [{"query_id": "q1", "rows": [[i] for i in range(1, 101)]}]
    out = cp.bind(f"List: {numbers}", recent_rowsets=recent)
    # Only first 10 get matcher attempts; the rest must be flagged unverified
    unverified_count = out.count("[unverified]")
    assert unverified_count >= 90, f"expected >=90 unverified, got {unverified_count}"
