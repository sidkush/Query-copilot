"""Semantic Registry — versioned metric definitions (H12)."""
from datetime import datetime, timezone

import pytest

from semantic_registry import SemanticRegistry, Definition, NotFound


def _dt(y, m=1, d=1):
    return datetime(y, m, d, tzinfo=timezone.utc)


def test_register_then_lookup_current_definition(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    reg.register("conn-1", Definition(
        name="churn",
        definition="no activity within 30 days",
        valid_from=_dt(2024, 1, 1),
        valid_until=None,
        owner="analytics",
    ))
    d = reg.lookup("conn-1", "churn", at=_dt(2025, 6, 1))
    assert "30 days" in d.definition


def test_two_versions_coexist(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    reg.register("conn-1", Definition(
        name="revenue", definition="gross",
        valid_from=_dt(2023, 1, 1), valid_until=_dt(2024, 12, 31),
        owner="finance",
    ))
    reg.register("conn-1", Definition(
        name="revenue", definition="net",
        valid_from=_dt(2025, 1, 1), valid_until=None,
        owner="finance",
    ))
    assert reg.lookup("conn-1", "revenue", at=_dt(2024, 6, 1)).definition == "gross"
    assert reg.lookup("conn-1", "revenue", at=_dt(2025, 6, 1)).definition == "net"


def test_lookup_raises_when_name_missing(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    with pytest.raises(NotFound):
        reg.lookup("conn-1", "unknown", at=_dt(2025, 1, 1))


def test_lookup_between_versions_returns_closest_valid(tmp_path):
    reg = SemanticRegistry(root=tmp_path)
    reg.register("conn-1", Definition(
        name="foo", definition="old",
        valid_from=_dt(2023, 1, 1), valid_until=_dt(2023, 12, 31),
        owner="x",
    ))
    with pytest.raises(NotFound):
        reg.lookup("conn-1", "foo", at=_dt(2024, 6, 1))
