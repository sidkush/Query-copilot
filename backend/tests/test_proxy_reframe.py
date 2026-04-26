"""T11-revised — domain reframe in `_build_proxy_framing_note`.

When the user's question contains a domain term (churn, retention,
abandonment, ...) and Gate C resolves with `station_proxy`, the
framing note must append a REFRAMING line explaining that the term
in this analysis means `<proxy_phrase> <term>` (e.g. station-level
abandonment, not per-rider abandonment) so the model labels output
accordingly.
"""

import pytest
from unittest.mock import MagicMock


def make_engine():
    """Minimal stub of AgentEngine for testing proxy reframe."""
    from agent_engine import AgentEngine
    engine = AgentEngine.__new__(AgentEngine)
    # stub required attrs
    engine.connection_entry = MagicMock()
    engine.connection_entry.schema_profile = None
    return engine


def test_no_reframe_when_no_domain_term():
    engine = make_engine()
    result = engine._build_proxy_framing_note(
        choice="station_proxy",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="station_id",
        question="how many rides per rider?",
    )
    assert result is not None
    assert "REFRAMING" not in result


def test_reframe_when_churn_term():
    engine = make_engine()
    result = engine._build_proxy_framing_note(
        choice="station_proxy",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="station_id",
        question="rider churn last 30 days",
    )
    assert result is not None
    assert "REFRAMING" in result
    assert "churn" in result.lower()


def test_reframe_homoglyph_resilience():
    """Unicode lookalike for 'churn' — should be normalized and NOT match."""
    # Homoglyph 'ｃｈｕｒｎ' (fullwidth) normalizes to 'churn' after NFKC
    engine = make_engine()
    result = engine._build_proxy_framing_note(
        choice="station_proxy",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="station_id",
        question="ｃｈｕｒｎ rate",
    )
    # After NFKC normalization fullwidth → ASCII → matches
    assert result is not None
    assert "REFRAMING" in result


def test_no_reframe_when_wrong_choice():
    engine = make_engine()
    result = engine._build_proxy_framing_note(
        choice="ask_user",
        kind="schema_entity_mismatch",
        canonical="rider",
        proxy_suggestion="station_id",
        question="rider churn last 30 days",
    )
    assert result is None
