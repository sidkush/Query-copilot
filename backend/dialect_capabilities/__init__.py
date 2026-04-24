"""Phase M-alt — per-engine capability manifests.

Manifests declare what each engine supports for ROUTING decisions
(Turbo vs Live, feature gating). They are NOT used to patch transpile —
sqlglot handles the transpile layer.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


class CapabilityUnknown(ValueError):
    """Raised when an engine has no manifest file."""


@dataclass(frozen=True)
class Manifest:
    engine: str
    supported_features: set
    turbo_safe: bool
    notes: str = ""


_MANIFEST_DIR = Path(__file__).parent


def load_manifest(engine: str) -> Manifest:
    engine_lc = engine.lower()
    path = _MANIFEST_DIR / f"{engine_lc}.json"
    if not path.exists():
        raise CapabilityUnknown(f"no manifest for engine {engine!r} at {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    return Manifest(
        engine=engine_lc,
        supported_features=set(data.get("supported_features", [])),
        turbo_safe=bool(data.get("turbo_safe", False)),
        notes=data.get("notes", ""),
    )
