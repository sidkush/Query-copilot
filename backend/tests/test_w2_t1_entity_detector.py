"""W2 Task 1a — Ring 4 Gate C EntityDetector.

Detector contract: NL question + schema columns → EntityMismatch | None.
Hardened per AMEND-W2-07 (NFKC + word-boundary), AMEND-W2-11 (tightened suffix
match), AMEND-W2-32 (CANONICAL_ENTITIES + extended id-suffix set), AMEND-W2-35
(view/alias resolver).
"""
from __future__ import annotations

import pytest

from schema_entity_mismatch import (
    CANONICAL_ENTITIES,
    EntityDetector,
    EntityMismatch,
)


class MockViewResolver:
    """Test stub for AMEND-W2-35 view → base-table column resolution."""

    def __init__(self, mapping: dict[str, list[str]]) -> None:
        self._mapping = mapping

    def __call__(self, table_name: str) -> list[str] | None:
        return self._mapping.get(table_name)


def test_rider_term_no_id_column_triggers_mismatch():
    detector = EntityDetector(canonical_map=CANONICAL_ENTITIES)
    schema_cols = ["ride_id", "start_station_id", "member_casual", "started_at"]
    result = detector.detect(
        nl="Why are casual riders churning faster from certain stations?",
        schema_columns=schema_cols,
    )
    assert result is not None
    assert isinstance(result, EntityMismatch)
    assert result.has_mismatch is True
    assert result.entity_term == "riders"
    assert result.canonical == "rider"


def test_user_type_breakdown_no_mismatch_when_proxy_exists():
    """'user type' is adjectival — entity term followed by 'type' is not a
    person-entity reference. No detection → no mismatch."""
    detector = EntityDetector(canonical_map=CANONICAL_ENTITIES)
    schema_cols = ["ride_id", "member_casual", "started_at"]
    result = detector.detect(
        nl="show me user type breakdown",
        schema_columns=schema_cols,
    )
    assert result is None


def test_username_substring_does_not_trigger():
    """Word-boundary match must not fire on 'user' inside 'username'."""
    detector = EntityDetector(canonical_map=CANONICAL_ENTITIES)
    schema_cols = ["ride_id", "started_at"]
    result = detector.detect(
        nl="filter by username",
        schema_columns=schema_cols,
    )
    assert result is None


def test_cyrillic_rider_normalized_triggers_mismatch():
    """NFKC + confusable-fold catches Cyrillic homoglyphs."""
    detector = EntityDetector(canonical_map=CANONICAL_ENTITIES)
    schema_cols = ["ride_id", "started_at"]
    result = detector.detect(
        nl="why are casual r\u0456ders churning?",
        schema_columns=schema_cols,
    )
    assert result is not None
    assert result.has_mismatch is True


def test_subscriber_uuid_satisfies_subscriber_entity():
    """AMEND-W2-32: extended suffix set covers _uuid."""
    detector = EntityDetector(canonical_map=CANONICAL_ENTITIES)
    schema_cols = ["subscriber_uuid", "plan_type", "started_at"]
    result = detector.detect(
        nl="which subscribers are churning?",
        schema_columns=schema_cols,
    )
    assert result is None


def test_view_alias_resolves_to_base_table_columns():
    """AMEND-W2-35: view → base table column resolution.

    View `active_riders` is backed by `users(user_id, status)`. NL asks about
    riders. The view's base table satisfies the entity via user_id (rider is
    canonicalized through the view's underlying user reference)."""
    detector = EntityDetector(
        canonical_map=CANONICAL_ENTITIES,
        view_resolver=MockViewResolver({"active_riders": ["user_id", "status"]}),
    )
    schema_cols = ["active_riders"]
    result = detector.detect(
        nl="show me active riders",
        schema_columns=schema_cols,
    )
    assert result is None
