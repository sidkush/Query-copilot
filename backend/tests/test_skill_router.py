"""Tests for SkillRouter."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def real_library():
    from skill_library import SkillLibrary
    return SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")


@pytest.fixture
def mock_connection():
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={
        "customers": {"columns": [{"name": "id"}, {"name": "name"}]},
        "orders": {"columns": [{"name": "id"}, {"name": "amount"}, {"name": "customer_id"}]},
        "deals": {"columns": [{"name": "id"}, {"name": "stage"}, {"name": "amount"}]},
        "opportunities": {"columns": [{"name": "id"}, {"name": "stage"}]},
        "accounts": {"columns": [{"name": "id"}, {"name": "name"}]},
    })
    return conn


def test_router_always_on_only_when_rag_disabled(real_library, mock_connection):
    from skill_router import SkillRouter

    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("unused question", mock_connection, action_type="sql-generation")

    names = [h.name for h in hits]
    assert "security-rules" in names
    assert "agent-identity-response-format" in names
    assert "confirmation-thresholds" in names


def test_router_injects_deterministic_dialect(real_library, mock_connection):
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("show me deals", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    assert "dialect-snowflake-postgres-duckdb" in names


def test_router_injects_deterministic_domain(real_library, mock_connection):
    """Schema with 'orders' + 'customers' matches behavior_engine's ecommerce
    patterns, which maps to the product-finance-marketing-ecommerce skill."""
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("deals by stage", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    assert "domain-product-finance-marketing-ecommerce" in names


def test_router_enforces_token_cap(real_library, mock_connection):
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None, max_total_tokens=5000)
    hits = router.resolve("anything", mock_connection, action_type="sql-generation")
    total = sum(h.tokens for h in hits)
    assert total <= 5000


def test_router_priority_1_never_dropped_by_cap(real_library, mock_connection):
    """Even at aggressive caps, Priority-1 skills stay."""
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None, max_total_tokens=4500)
    hits = router.resolve("anything", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    assert "security-rules" in names


def test_router_dedup_by_name(real_library, mock_connection):
    """If a skill appears via deterministic AND RAG, keep only one."""
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("tell me about security rules", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    assert len(names) == len(set(names))
