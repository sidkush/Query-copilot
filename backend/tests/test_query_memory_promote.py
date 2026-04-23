"""QueryMemory.promote_example — tenant-scoped few-shot write + daily quota."""
import pytest
from query_memory import QueryMemory, PromotionQuotaExceeded


@pytest.fixture
def memory(tmp_path, monkeypatch):
    monkeypatch.setenv("QUERYCOPILOT_CHROMA_DIR", str(tmp_path))
    return QueryMemory()


def test_promote_writes_under_tenant_namespace(memory):
    memory.promote_example(
        tenant_id="t1", conn_id="c1", user_id="u1",
        question="how many trips 2024",
        canonical_sql="SELECT COUNT(*) FROM trips WHERE EXTRACT(YEAR FROM started_at)=2024",
    )
    listing = memory.list_promotions(tenant_id="t1", conn_id="c1")
    assert any("trips 2024" in p["question"] for p in listing)


def test_promote_rejects_empty_required_fields(memory):
    with pytest.raises(ValueError):
        memory.promote_example(
            tenant_id="", conn_id="c1", user_id="u1",
            question="q", canonical_sql="SELECT 1",
        )


def test_promote_enforces_per_tenant_daily_quota(memory, monkeypatch):
    monkeypatch.setattr("config.settings.PROMOTIONS_PER_TENANT_PER_DAY", 2, raising=False)
    for i in range(2):
        memory.promote_example(
            tenant_id="t1", conn_id="c1", user_id="u1",
            question=f"q{i}", canonical_sql="SELECT 1",
        )
    with pytest.raises(PromotionQuotaExceeded):
        memory.promote_example(
            tenant_id="t1", conn_id="c1", user_id="u1",
            question="q3", canonical_sql="SELECT 1",
        )


def test_quota_isolated_per_tenant(memory, monkeypatch):
    monkeypatch.setattr("config.settings.PROMOTIONS_PER_TENANT_PER_DAY", 1, raising=False)
    memory.promote_example(
        tenant_id="t1", conn_id="c1", user_id="u1",
        question="q1", canonical_sql="SELECT 1",
    )
    memory.promote_example(
        tenant_id="t2", conn_id="c1", user_id="u1",
        question="q1", canonical_sql="SELECT 1",
    )


def test_delete_tenant_namespace_wipes_promotions(memory):
    memory.promote_example(
        tenant_id="t1", conn_id="c1", user_id="u1",
        question="q1", canonical_sql="SELECT 1",
    )
    removed = memory.delete_tenant_namespace(tenant_id="t1", conn_id="c1")
    assert removed >= 1
    listing = memory.list_promotions(tenant_id="t1", conn_id="c1")
    assert listing == []
