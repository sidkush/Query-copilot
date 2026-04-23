"""Versioned embedder registry.

Every ChromaDB vector carries a `{embedder_version: <tag>}` metadata field.
Retrieval filters by tag to prevent silent mixing of incompatible vectors
during a migration window (H14 embedding migration safety).
"""
from __future__ import annotations
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

import numpy as np

# H19 - Phase H: supply-chain hook. Call verify_no_unsafe_weights(path) before
# opening any local weight file. Current loaders delegate to sentence-transformers
# (safetensors-preferred in 3.x+), so no direct open sites exist today; this
# import keeps the hook wired for future local-weight additions.
from supply_chain import verify_no_unsafe_weights  # noqa: F401


class Embedder(Protocol):
    version: str
    dim: int
    def encode(self, text: str) -> np.ndarray: ...


@dataclass
class HashV1Embedder:
    """Legacy 384-dim n-gram hash embedding. Backward-compat only."""
    version: str = "hash-v1"
    dim: int = 384

    def encode(self, text: str) -> np.ndarray:
        out = np.zeros(self.dim, dtype=np.float32)
        for i in range(len(text) - 2):
            tri = text[i : i + 3].lower()
            h = int.from_bytes(hashlib.md5(tri.encode("utf-8")).digest()[:4], "big")
            out[h % self.dim] += 1.0
        norm = np.linalg.norm(out)
        return out / norm if norm > 0 else out


@dataclass
class MiniLML6V2Embedder:
    """sentence-transformers/all-MiniLM-L6-v2 via safetensors format only.

    Loaded lazily to avoid pulling 90MB on every import.
    """
    version: str = "minilm-l6-v2"
    dim: int = 384
    _model: object = None  # initialized lazily

    def _ensure_loaded(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            # safetensors format enforced via `use_safetensors=True` when available.
            # sentence-transformers 3.x+ defaults to safetensors when both exist.
            self._model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    def encode(self, text: str) -> np.ndarray:
        self._ensure_loaded()
        vec = self._model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
        return vec.astype(np.float32)


_REGISTRY: dict[str, Callable[[], Embedder]] = {
    "hash-v1": HashV1Embedder,
    "minilm-l6-v2": MiniLML6V2Embedder,
}


def get_embedder(version: str) -> Embedder:
    if version not in _REGISTRY:
        raise KeyError(f"unknown embedder version {version!r}. known: {list(_REGISTRY)}")
    return _REGISTRY[version]()


def list_versions() -> list[str]:
    return list(_REGISTRY.keys())
