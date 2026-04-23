"""Phase H — H24: Audit log tamper detection.

On rotation (or explicit `seal()`), write sibling `.sha256` file.
On boot, `verify_chain()` reads log + sidecar; mismatch -> MONITORING_SILENT telemetry.
"""
from __future__ import annotations

import hashlib
from pathlib import Path


class SizeAnomaly(ValueError):
    """Log file is 0 bytes or absurdly large (> 5 x rotate threshold)."""


_ROTATE_MB = 50
_MAX_MB = _ROTATE_MB * 5


def _digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def seal(log: Path) -> None:
    sz = log.stat().st_size
    if sz == 0 or sz > _MAX_MB * 1024 * 1024:
        raise SizeAnomaly(f"audit log size {sz} bytes at {log}")
    sidecar = log.with_suffix(log.suffix + ".sha256")
    sidecar.write_text(_digest(log))


def verify_chain(log: Path) -> bool:
    sidecar = log.with_suffix(log.suffix + ".sha256")
    if not sidecar.exists():
        return True   # first-run, nothing to verify yet
    expected = sidecar.read_text().strip()
    return _digest(log) == expected
