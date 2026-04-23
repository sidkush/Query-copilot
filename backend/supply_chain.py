"""Phase H - H19: Supply chain helpers.

Boot-time checks that:
  * `requirements.lock` exists (`pip install --require-hashes` was the input).
  * Embedder weights loaded at runtime are `safetensors` only.

Runs at app startup via `main.py` lifespan. Off by `FEATURE_SUPPLY_CHAIN_HARDENING`.
"""
from __future__ import annotations

from pathlib import Path
from config import settings


# Unsafe weight suffixes - reject at load time.
_FORBIDDEN = frozenset({".bin", ".pt", ".unsafe1", ".unsafe2"})


def _forbidden_suffixes() -> frozenset[str]:
    return _FORBIDDEN


def _lock_path() -> Path:
    root = Path(__file__).resolve().parent.parent
    return root / settings.REQUIREMENTS_LOCK_PATH


def verify_lock_exists() -> None:
    """Raise RuntimeError if the hash-pinned lock file is missing."""
    p = _lock_path()
    if not p.is_file() or p.stat().st_size == 0:
        raise RuntimeError(
            f"requirements.lock missing or empty at {p}. "
            "Regenerate with `pip-compile --generate-hashes` (see requirements.txt header)."
        )


def verify_no_unsafe_weights(path: Path) -> None:
    """Raise ValueError if a weight file uses an unsafe serialization format."""
    if not settings.SAFETENSORS_ONLY:
        return
    if path.suffix.lower() in _FORBIDDEN:
        raise ValueError(
            f"safetensors only: refusing to load {path.name} (suffix {path.suffix})"
        )


def run_boot_checks() -> None:
    if not settings.FEATURE_SUPPLY_CHAIN_HARDENING:
        return
    verify_lock_exists()
