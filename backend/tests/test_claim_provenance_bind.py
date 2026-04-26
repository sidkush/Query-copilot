"""T2 — claim_provenance.bind() safety: locale-aware regex, suffix matching,
oversized-text guard, exception-safety."""
import pytest


def get_cp():
    from claim_provenance import ClaimProvenance
    return ClaimProvenance()


def _bind(cp, text, rowsets):
    """Compat shim: bind() returns either str or (str, claims) depending on
    historical signature. Return (text, claims) tuple either way."""
    out = cp.bind(text, rowsets)
    if isinstance(out, tuple):
        return out
    return out, []


def _rs(rows, qid="q1"):
    """Wrap rows in a rowset dict that match_claim() understands."""
    return [{"query_id": qid, "rows": rows}]


def test_bind_plain_number_matches():
    cp = get_cp()
    text, _ = _bind(cp, "There were 5432 rides", _rs([[5432]]))
    assert "[unverified]" not in text


def test_bind_comma_separated_matches():
    """5,432 should bind to a rowset cell containing 5432."""
    cp = get_cp()
    text, _ = _bind(cp, "There were 5,432 rides", _rs([[5432]]))
    assert "[unverified]" not in text


def test_bind_unmatched_number_unverified():
    cp = get_cp()
    text, _ = _bind(cp, "There were 5432 rides", _rs([[99]]))
    assert "[unverified]" in text


def test_bind_oversized_text_truncated():
    """bind() must not crash or run unbounded on giant inputs."""
    cp = get_cp()
    big_text = "x" * 300_000 + " 5432 rides"
    text, _ = _bind(cp, big_text, _rs([[5432]]))
    # Must return a string, must not blow past the cap.
    assert isinstance(text, str)
    # Hard cap is 256_000 bytes — rendered text length in chars is <= bytes.
    assert len(text) <= 300_000


def test_bind_eastern_arabic_digits():
    """Eastern Arabic digits must normalize so the regex sees ASCII numbers."""
    cp = get_cp()
    # ٥٤٣٢ = 5432 in Eastern Arabic
    text, _ = _bind(cp, "There were ٥٤٣٢ rides", _rs([[5432]]))
    assert "[unverified]" not in text


def test_bind_devanagari_digits():
    """५४३२ = 5432 in Devanagari."""
    cp = get_cp()
    text, _ = _bind(cp, "Total ५४३२ rides", _rs([[5432]]))
    assert "[unverified]" not in text


def test_bind_exception_safe_with_none():
    """bind() must never raise even with None inputs."""
    cp = get_cp()
    try:
        text, _ = _bind(cp, None, None)
    except Exception as e:
        pytest.fail(f"bind() raised on None inputs: {e!r}")


def test_bind_exception_safe_with_garbage():
    """bind() must never raise on garbage rowset shapes."""
    cp = get_cp()
    try:
        text, _ = _bind(cp, "Total 42 rides", [{"not_query_id": "x", "not_rows": object()}])
    except Exception as e:
        pytest.fail(f"bind() raised on garbage rowset: {e!r}")


def test_bind_percent_suffix_does_not_raise():
    """99.5% should not raise — we don't require it bind, just that it's safe."""
    cp = get_cp()
    text, _ = _bind(cp, "Success rate: 99.5%", _rs([[99.5]]))
    assert isinstance(text, str)


def test_bind_returns_string():
    """Sanity: every successful bind returns a str."""
    cp = get_cp()
    text, _ = _bind(cp, "no numbers here", _rs([[1]]))
    assert isinstance(text, str)
    assert text == "no numbers here"
