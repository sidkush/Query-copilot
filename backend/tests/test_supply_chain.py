from pathlib import Path
import pytest
from supply_chain import verify_lock_exists, verify_no_unsafe_weights, _forbidden_suffixes


def test_verify_lock_exists_passes_when_file_present(tmp_path, monkeypatch):
    lock = tmp_path / "requirements.lock"
    lock.write_text("fastapi==0.115.6 --hash=sha256:...")
    monkeypatch.setattr("supply_chain._lock_path", lambda: lock)
    verify_lock_exists()  # no raise


def test_verify_lock_exists_raises_when_absent(tmp_path, monkeypatch):
    monkeypatch.setattr("supply_chain._lock_path", lambda: tmp_path / "missing.lock")
    with pytest.raises(RuntimeError, match="requirements.lock"):
        verify_lock_exists()


def test_safetensors_only_accepts_safetensors(tmp_path):
    good = tmp_path / "model.safetensors"
    good.write_bytes(b"stub")
    verify_no_unsafe_weights(good)  # no raise


@pytest.mark.parametrize("suffix", [".bin", ".pt", ".unsafe1", ".unsafe2"])
def test_safetensors_only_rejects_unsafe(tmp_path, suffix):
    bad = tmp_path / f"model{suffix}"
    bad.write_bytes(b"stub")
    with pytest.raises(ValueError, match="safetensors only"):
        verify_no_unsafe_weights(bad)


def test_forbidden_suffixes_exhaustive():
    assert {".bin", ".pt"} <= _forbidden_suffixes()
