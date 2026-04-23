"""TenantFortress — composite key builders + tenant_id resolver."""
import pytest

from tenant_fortress import (
    chroma_namespace, session_key, turbo_twin_path,
    schema_cache_path, resolve_tenant_id, TenantKeyError,
)


def test_chroma_namespace_format():
    ns = chroma_namespace(tenant_id="t1", conn_id="c1", user_id="u1", collection="query_memory")
    assert ns == "tenant:t1/conn:c1/user:u1/coll:query_memory"


def test_session_key_format():
    k = session_key(tenant_id="t1", conn_id="c1", user_id="u1", session_id="s1")
    assert k == "t1:c1:u1:s1"


def test_turbo_twin_path_isolates_per_tenant(tmp_path):
    p = turbo_twin_path(root=tmp_path, tenant_id="t1", conn_id="c1")
    assert "t1" in str(p)
    assert "c1" in str(p)
    assert p.name.endswith(".duckdb")


def test_schema_cache_path_isolates_per_tenant(tmp_path):
    p = schema_cache_path(root=tmp_path, tenant_id="t1", conn_id="c1")
    assert "t1" in str(p)
    assert p.suffix == ".json"


def test_missing_tenant_id_raises():
    with pytest.raises(TenantKeyError):
        chroma_namespace(tenant_id="", conn_id="c1", user_id="u1", collection="x")


def test_resolve_tenant_id_returns_existing():
    profile = {"tenant_id": "existing-uuid-123"}
    assert resolve_tenant_id(profile) == "existing-uuid-123"


def test_resolve_tenant_id_creates_when_missing():
    profile = {}
    tid = resolve_tenant_id(profile)
    assert tid
    assert profile["tenant_id"] == tid
    assert resolve_tenant_id(profile) == tid


def test_tenant_id_is_uuid_like():
    import re
    tid = resolve_tenant_id({})
    assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", tid)


def test_load_profile_mints_tenant_id_when_missing(tmp_path, monkeypatch):
    """Reading a legacy profile (no tenant_id) mints one and persists it."""
    import json
    from user_storage import load_profile_with_tenant
    user_dir = tmp_path / "abc1234"
    user_dir.mkdir()
    profile_path = user_dir / "profile.json"
    profile_path.write_text(json.dumps({"email": "u@t", "plan": "free"}))
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path))

    profile = load_profile_with_tenant(profile_path)
    assert "tenant_id" in profile
    # Re-read: same tenant_id.
    profile2 = load_profile_with_tenant(profile_path)
    assert profile2["tenant_id"] == profile["tenant_id"]


def test_skill_library_per_tenant_encoder_returns_distinct_instances():
    from skill_library import get_encoder
    e1 = get_encoder("tenant-1")
    e2 = get_encoder("tenant-2")
    assert e1 is not e2
    # Same tenant → same instance (cached).
    assert get_encoder("tenant-1") is e1
