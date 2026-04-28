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
    """Token cap is strict for FLEXIBLE hits (RAG, bundles, depends_on).
    Must-keep set (P1 + deterministic) can exceed cap when nothing flexible
    is left to evict — same contract as the original P1 protection. With
    no chroma_collection wired (no RAG hits), flexible_total is 0 and only
    must-keep contributes; cap is therefore ~must_keep_tokens (~5K-7K).
    Phase 1 Cap 4 (2026-04-28) generalized must-keep to include source=
    'deterministic' alongside P1.
    """
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None, max_total_tokens=5000)
    hits = router.resolve("anything", mock_connection, action_type="sql-generation")
    flexible_total = sum(
        h.tokens for h in hits
        if h.priority != 1 and h.source != "deterministic"
    )
    assert flexible_total <= 5000, (
        f"flexible hits must respect max_total_tokens=5000; got {flexible_total}"
    )


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


# ── Phase 1 Cap 4 (2026-04-28): must-keep cap protection ──────────────────


def test_deterministic_dialect_survives_bundle_cap_pressure(real_library):
    """Phase 1 Cap 4 regression: dialect-sqlite (P3 deterministic) MUST survive
    when bundles fire and fill the max_skills slots with P2-promoted hits.

    Pre-fix bug: 5 P1 always-on + 4 bundle skills (sql-calculation triggered
    by 'ratio') = 9 hits = max_skills cap hit BEFORE the P3 deterministic
    dialect made it into kept. dialect-sqlite was silently dropped.

    Post-fix: must-keep set (P1 + source='deterministic') is exempt from the
    count cap; one bundle skill yields its slot instead.
    """
    from skill_router import SkillRouter
    conn = MagicMock()
    conn.db_type = "sqlite"
    conn.engine = None  # no domain match needed
    router = SkillRouter(library=real_library, chroma_collection=None)
    # 'ratio' triggers the sql-calculation bundle (3 P2 promotions). The
    # bundle 'fires-when-existing' branch can also pull in skills via
    # depends_on. Either way, max_skills is exercised.
    hits = router.resolve(
        "what is the ratio of users who paid in EUR vs CZK?",
        conn, action_type="sql-generation",
    )
    names = [h.name for h in hits]
    assert "dialect-sqlite" in names, (
        f"deterministic dialect-sqlite must survive cap pressure; got {names!r}"
    )


def test_p1_always_on_all_present_under_cap_pressure(real_library):
    """Phase 1 Cap 4 regression: all 5 P1 always-on skills must be present
    even when bundles + deterministic + RAG would otherwise saturate slots.
    P1 must-keep takes precedence over flexible hits."""
    from skill_router import SkillRouter
    conn = MagicMock()
    conn.db_type = "sqlite"
    conn.engine = None
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve(
        "join the orders table to find sum of revenue per customer",
        conn, action_type="sql-generation",
    )
    names = {h.name for h in hits}
    p1_required = {
        "agent-identity-response-format",
        "caching-breakpoint-policy",
        "confirmation-thresholds",
        "security-rules",
        "skill-library-meta",
    }
    missing = p1_required - names
    assert not missing, f"P1 always-on missing: {missing}; got {names!r}"


def test_max_skills_cap_applies_to_flexible_only(real_library):
    """Phase 1 Cap 4 regression: count cap (max_skills) applies to flexible
    hits (RAG, bundles, depends_on); must-keep set can exceed it.

    With 5 P1 + 1 deterministic dialect + bundles, the result may exceed
    max_skills=9 — that's correct semantic. Total tokens still respects
    max_total_tokens.
    """
    from skill_router import SkillRouter
    conn = MagicMock()
    conn.db_type = "sqlite"
    conn.engine = None
    router = SkillRouter(library=real_library, chroma_collection=None, max_skills=9)
    hits = router.resolve(
        "build a dashboard with chart of total sum per category",
        conn, action_type="sql-generation",
    )
    must_keep_count = sum(1 for h in hits if h.priority == 1 or h.source == "deterministic")
    flexible_count = sum(1 for h in hits if h.priority != 1 and h.source != "deterministic")
    assert must_keep_count >= 5, (
        f"Expected >=5 must-keep (5 P1 + det); got {must_keep_count}"
    )
    assert flexible_count <= 9, (
        f"Flexible count must respect max_skills=9; got {flexible_count}"
    )
