import numpy as np
import pytest
from backend.embeddings.embedder_registry import get_embedder, list_versions


def test_registry_lists_known_versions():
    versions = list_versions()
    assert "hash-v1" in versions
    assert "minilm-l6-v2" in versions


def test_get_embedder_returns_callable_with_declared_dim():
    embedder = get_embedder("hash-v1")
    vec = embedder.encode("hello world")
    assert isinstance(vec, np.ndarray)
    assert vec.shape == (embedder.dim,)


def test_unknown_version_raises():
    with pytest.raises(KeyError, match="unknown embedder"):
        get_embedder("nonexistent")
