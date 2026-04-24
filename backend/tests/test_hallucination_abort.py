"""HallucinationAbort: known-error whitelist + SafeText guard."""
import pytest

from hallucination_abort import (
    enumerate_backend_error_phrases,
    SafeText,
)


def test_enumerate_returns_nonempty_list():
    phrases = enumerate_backend_error_phrases()
    assert isinstance(phrases, list)
    assert len(phrases) >= 3
    # Each phrase should be a non-empty lowercase string.
    for p in phrases:
        assert isinstance(p, str) and p == p.lower() and p.strip()


def test_safetext_allows_clean_output():
    st = SafeText(known_error_phrases=["database connection refused", "read-only violation"])
    out = st.sanitize("Here is the result: 42 rows returned.")
    assert out == "Here is the result: 42 rows returned."


def test_safetext_blocks_confabulated_db_error():
    st = SafeText(known_error_phrases=["database connection refused", "read-only violation"])
    # Not in whitelist.
    out = st.sanitize("I'm experiencing database connectivity issues.")
    assert out is None


def test_safetext_allows_known_error_phrase_verbatim():
    st = SafeText(known_error_phrases=["database connection refused"])
    out = st.sanitize("Got: database connection refused.")
    assert out is not None


def test_safetext_case_insensitive_match():
    st = SafeText(known_error_phrases=["database connection refused"])
    out = st.sanitize("Database Connection Refused at port 5432.")
    assert out is not None
