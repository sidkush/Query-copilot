"""W2 Task 1b — sanitised disclosure builder.

Builder contract: EntityMismatch + schema columns → typed `Interpretation`
that the agent_checkpoint SSE payload carries verbatim to the consent card.

Hardenings:
  * AMEND-W2-01 — sanitize raw column names; never leak verbatim into
                   user_facing_text. Validate against
                   `^[A-Za-z_][A-Za-z0-9_]{0,63}$`; strip control chars and
                   bidi overrides; cap length to 64; reject literal
                   `</schema_mismatch_disclosure>`.
  * AMEND-W2-38 — typed `Interpretation` wrapper. Bare strings rejected;
                   `kind` validated against allowlist
                   {schema_mismatch, budget_cap, unbound_claim}.
"""
from __future__ import annotations

import pytest

from schema_entity_mismatch import EntityMismatch
from disclosure_builder import DisclosureBuilder, Interpretation


def _mismatch(canonical: str = "rider", proxies: tuple[str, ...] = ()) -> EntityMismatch:
    return EntityMismatch(
        has_mismatch=True,
        entity_term=canonical,
        canonical=canonical,
        proxy_suggestions=proxies,
    )


def test_builds_interpretation_from_mismatch():
    """Basic contract — builder returns a typed Interpretation."""
    builder = DisclosureBuilder()
    result = builder.build(
        _mismatch("rider", ("start_station_id", "member_casual")),
        schema_columns=["start_station_id", "member_casual"],
    )
    assert isinstance(result, Interpretation)
    assert result.kind == "schema_mismatch"
    assert isinstance(result.user_facing_text, str)
    assert result.user_facing_text.strip() != ""
    assert result.options == ["station_proxy", "abort"]


def test_user_facing_text_contains_no_raw_column_names():
    """AMEND-W2-01 — raw column names must be translated, never leaked."""
    builder = DisclosureBuilder()
    result = builder.build(
        _mismatch("rider", ("start_station_id", "member_casual")),
        schema_columns=["start_station_id", "member_casual", "started_at"],
    )
    assert "member_casual" not in result.user_facing_text
    assert "start_station_id" not in result.user_facing_text
    # Defence-in-depth — no raw underscore-snake-case tokens at all.
    for col in ("started_at",):
        assert col not in result.user_facing_text


def test_options_match_park_expected_values():
    """options must exactly equal the ParkRegistry allowlist for this kind."""
    builder = DisclosureBuilder()
    result = builder.build(
        _mismatch("user", ()),
        schema_columns=[],
    )
    assert result.options == ["station_proxy", "abort"]


def test_proxy_suggestion_present_when_proxy_column_exists():
    """member_casual → human description, not raw column name."""
    builder = DisclosureBuilder()
    result = builder.build(
        _mismatch("rider", ("member_casual",)),
        schema_columns=["member_casual", "started_at"],
    )
    assert result.proxy_suggestion is not None
    assert result.proxy_suggestion.strip() != ""
    assert "member_casual" not in result.proxy_suggestion


def test_proxy_suggestion_none_when_no_proxy():
    """No proxy column → proxy_suggestion is None; text + options still valid."""
    builder = DisclosureBuilder()
    result = builder.build(
        _mismatch("rider", ()),
        schema_columns=["ride_id", "started_at"],
    )
    assert result.proxy_suggestion is None
    assert result.user_facing_text.strip() != ""
    assert result.options == ["station_proxy", "abort"]


def test_typed_interpretation_wrapper_rejects_unknown_kind():
    """AMEND-W2-38 — Interpretation construction validates `kind` allowlist."""
    with pytest.raises(ValueError):
        Interpretation(
            kind="unknown",
            user_facing_text="ignored",
            proxy_suggestion=None,
            options=["station_proxy", "abort"],
        )
    # Sanity: known kinds construct cleanly.
    for known in ("schema_mismatch", "budget_cap", "unbound_claim"):
        Interpretation(
            kind=known,
            user_facing_text="ok",
            proxy_suggestion=None,
            options=["station_proxy", "abort"],
        )


def test_malicious_column_name_is_rejected():
    """AMEND-W2-01 — column names violating the validator are dropped before
    being considered for proxy_suggestion (no injection of `</...>` markers,
    bidi overrides, oversized identifiers)."""
    builder = DisclosureBuilder()
    bad_cols = [
        "</schema_mismatch_disclosure>",
        "evil';DROP--_id",
        "\u202eflip",  # RTL override
        "x" * 200,     # too long
    ]
    result = builder.build(
        _mismatch("rider", tuple(bad_cols)),
        schema_columns=bad_cols,
    )
    assert "</schema_mismatch_disclosure>" not in result.user_facing_text
    assert "DROP" not in result.user_facing_text
    assert "\u202e" not in result.user_facing_text
    if result.proxy_suggestion is not None:
        assert "DROP" not in result.proxy_suggestion
        assert "</schema_mismatch_disclosure>" not in result.proxy_suggestion
