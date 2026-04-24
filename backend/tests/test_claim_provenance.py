"""ClaimProvenance — bind numeric spans in synthesis to executed queries."""
import pytest
from claim_provenance import (
    ClaimProvenance, NumericSpan, extract_numeric_spans, match_claim,
)

def test_extract_numeric_spans_simple():
    text = "There are 42 rows and 3.14% growth."
    spans = extract_numeric_spans(text)
    assert len(spans) == 2
    assert spans[0].value == "42"
    assert spans[1].value == "3.14"

def test_extract_numeric_spans_with_percent():
    text = "Churn rose 60%."
    spans = extract_numeric_spans(text)
    assert len(spans) == 1
    assert spans[0].value == "60"
    assert spans[0].suffix == "%"

def test_extract_numeric_spans_ignores_year_like():
    text = "Data from 2024 shows 500 rows."
    spans = extract_numeric_spans(text)
    values = {s.value for s in spans}
    assert "500" in values
    assert "2024" not in values

def test_match_claim_finds_number_in_recent_rowset():
    rowsets = [{"query_id": "q1", "rows": [[1, "alice", 42], [2, "bob", 100]]}]
    result = match_claim(value="42", recent_rowsets=rowsets)
    assert result is not None
    assert result == "q1"

def test_match_claim_returns_none_when_not_found():
    rowsets = [{"query_id": "q1", "rows": [[1, 2, 3]]}]
    result = match_claim(value="999", recent_rowsets=rowsets)
    assert result is None

def test_bind_synthesis_inserts_unverified_marker():
    cp = ClaimProvenance(unverified_marker="[unverified]")
    recent = [{"query_id": "q1", "rows": [[42]]}]
    out = cp.bind("Found 42 rows and 999 anomalies.", recent_rowsets=recent)
    assert "42" in out
    assert "[unverified]" in out

def test_bind_preserves_clean_synthesis_when_all_match():
    cp = ClaimProvenance(unverified_marker="[unverified]")
    recent = [{"query_id": "q1", "rows": [[42], [100]]}]
    out = cp.bind("Counts: 42 and 100.", recent_rowsets=recent)
    assert "[unverified]" not in out
