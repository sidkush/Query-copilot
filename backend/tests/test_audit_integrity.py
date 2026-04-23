from pathlib import Path
import pytest
from audit_integrity import seal, verify_chain, SizeAnomaly


def test_seal_writes_sidecar_sha256(tmp_path):
    log = tmp_path / "audit.jsonl"
    log.write_text('{"a":1}\n{"b":2}\n')
    seal(log)
    sidecar = log.with_suffix(log.suffix + ".sha256")
    assert sidecar.exists()
    text = sidecar.read_text().strip()
    assert len(text) == 64   # hex-sha256


def test_verify_chain_passes_on_untampered(tmp_path):
    log = tmp_path / "audit.jsonl"
    log.write_text('{"a":1}\n')
    seal(log)
    assert verify_chain(log) is True


def test_verify_chain_fails_on_tamper(tmp_path):
    log = tmp_path / "audit.jsonl"
    log.write_text('{"a":1}\n')
    seal(log)
    log.write_text('{"a":1}\n{"evil":"injected"}\n')
    assert verify_chain(log) is False


def test_size_anomaly_zero_bytes(tmp_path):
    log = tmp_path / "audit.jsonl"
    log.write_bytes(b"")
    with pytest.raises(SizeAnomaly):
        seal(log)
