"""Right-to-erasure cascade across ChromaDB + Turbo + audit + queue + ledger."""
import json
from pathlib import Path
import pytest
from user_storage import delete_tenant_data


def _seed_turbo_twin(root: Path, tenant_id: str, conn_id: str) -> Path:
    tdir = root / tenant_id
    tdir.mkdir(parents=True, exist_ok=True)
    p = tdir / f"{conn_id}.duckdb"
    p.write_bytes(b"fake duckdb bytes")
    return p


def _seed_audit_line(root: Path, tenant_id: str):
    audit = root / "audit"
    audit.mkdir(parents=True, exist_ok=True)
    (audit / "query_decisions.jsonl").write_text(
        json.dumps({"tenant_id": tenant_id, "decision": "live"}) + "\n",
        encoding="utf-8",
    )


def test_delete_cascade_removes_twin(tmp_path):
    twin = _seed_turbo_twin(tmp_path / "turbo_twins", "t1", "c1")
    _seed_audit_line(tmp_path, "t1")
    report = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert not twin.exists()
    assert report["twin_removed"] >= 1


def test_delete_cascade_appends_erasure_marker(tmp_path):
    report = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    audit_file = tmp_path / "audit" / "query_decisions.jsonl"
    assert audit_file.exists()
    lines = audit_file.read_text(encoding="utf-8").strip().splitlines()
    markers = [json.loads(l) for l in lines if '"erasure"' in l]
    assert any(m.get("tenant_id") == "t1" for m in markers)


def test_delete_cascade_is_idempotent(tmp_path):
    _seed_turbo_twin(tmp_path / "turbo_twins", "t1", "c1")
    r1 = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    r2 = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert r1["twin_removed"] >= 1
    assert r2["twin_removed"] == 0


def test_delete_cascade_isolates_other_tenants(tmp_path):
    t1_twin = _seed_turbo_twin(tmp_path / "turbo_twins", "t1", "c1")
    t2_twin = _seed_turbo_twin(tmp_path / "turbo_twins", "t2", "c1")
    delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert not t1_twin.exists()
    assert t2_twin.exists()


def test_delete_cascade_empty_tenant_succeeds(tmp_path):
    report = delete_tenant_data(tenant_id="t1", data_root=tmp_path)
    assert report["twin_removed"] == 0
    assert report["marker_written"] is True
