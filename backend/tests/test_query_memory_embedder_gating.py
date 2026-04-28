"""D1 (Wave 2) — QueryMemory embedder flag-gating regression tests.

Mirrors the Wave 2 BENCHMARK_MODE pattern: production default uses hash-v1
(legacy collection name, byte-identical to pre-D1), explicit flag or
BENCHMARK_MODE coerces MiniLM on with versioned collection naming.

Tests use mocked chromadb client to avoid disk I/O. All tests assert BOTH:
  - which embedder class self._ef is (hash vs MiniLM)
  - which collection name _get_collection() composes (legacy vs _minilm-v1)
"""
from unittest.mock import patch, MagicMock


def _fresh_qm(use_minilm=False, benchmark=False, minilm_init_should_fail=False):
    """Construct QueryMemory with controlled flags + mocked chromadb."""
    import query_memory as qm_module

    with patch.object(qm_module, "settings") as mock_s, \
         patch.object(qm_module.chromadb, "PersistentClient") as mock_client:
        mock_s.FEATURE_MINILM_EMBEDDER = use_minilm
        mock_s.BENCHMARK_MODE = benchmark
        mock_s.CHROMA_PERSIST_DIR = "/tmp/test_chroma_unused"
        mock_s.QUERY_MEMORY_COLLECTION_PREFIX = "query_memory_"
        mock_client.return_value = MagicMock()

        if minilm_init_should_fail:
            with patch.object(
                qm_module, "_MiniLMEmbeddingFunction",
                side_effect=RuntimeError("simulated MiniLM failure"),
            ):
                return qm_module.QueryMemory()
        return qm_module.QueryMemory()


def test_flag_off_uses_hash_with_legacy_collection_name():
    """Default: hash-v1 embedder + legacy collection name. Pre-D1 byte-identical."""
    from query_memory import _HashEmbeddingFunction
    qm = _fresh_qm(use_minilm=False, benchmark=False)
    assert isinstance(qm._ef, _HashEmbeddingFunction)
    assert qm._embedder_version is None
    qm._get_collection("conn-A")
    name = qm._chroma.get_or_create_collection.call_args.kwargs["name"]
    assert name == "query_memory_conn-A", (
        f"hash mode must use legacy collection name (no suffix); got {name!r}"
    )


def test_flag_on_uses_minilm_with_versioned_collection_name():
    """FEATURE_MINILM_EMBEDDER=True: MiniLM embedder + _minilm-v1 collection."""
    from query_memory import _MiniLMEmbeddingFunction
    qm = _fresh_qm(use_minilm=True, benchmark=False)
    assert isinstance(qm._ef, _MiniLMEmbeddingFunction)
    assert qm._embedder_version == "minilm-v1"
    qm._get_collection("conn-A")
    name = qm._chroma.get_or_create_collection.call_args.kwargs["name"]
    assert name == "query_memory_conn-A_minilm-v1", (
        f"MiniLM mode must use versioned collection name; got {name!r}"
    )


def test_benchmark_mode_coerces_minilm_on():
    """BENCHMARK_MODE=True activates MiniLM even when FEATURE_MINILM_EMBEDDER=False.

    Mirrors the Wave 2 BENCHMARK_MODE coercion pattern at
    _attach_ring8_components and _maybe_emit_plan — eval runs always exercise
    the upgraded path without flipping production defaults.
    """
    from query_memory import _MiniLMEmbeddingFunction
    qm = _fresh_qm(use_minilm=False, benchmark=True)
    assert isinstance(qm._ef, _MiniLMEmbeddingFunction)
    assert qm._embedder_version == "minilm-v1"
    qm._get_collection("conn-A")
    name = qm._chroma.get_or_create_collection.call_args.kwargs["name"]
    assert name == "query_memory_conn-A_minilm-v1"


def test_minilm_init_failure_falls_back_to_hash_with_legacy_name():
    """Graceful degradation: MiniLM init fails -> hash-v1 + LEGACY collection name.

    Critical invariant: fallback MUST use legacy collection name so existing
    user query memory survives a MiniLM init failure. Using a versioned name
    on fallback would orphan the user's history twice (once on the failed
    MiniLM path, again on the fallback hash path).
    """
    from query_memory import _HashEmbeddingFunction
    qm = _fresh_qm(use_minilm=True, benchmark=False, minilm_init_should_fail=True)
    assert isinstance(qm._ef, _HashEmbeddingFunction)
    assert qm._embedder_version is None
    qm._get_collection("conn-A")
    name = qm._chroma.get_or_create_collection.call_args.kwargs["name"]
    assert name == "query_memory_conn-A", (
        f"fallback must use LEGACY name to preserve user data; got {name!r}"
    )
