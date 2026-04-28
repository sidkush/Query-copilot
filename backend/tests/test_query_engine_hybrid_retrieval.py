"""Phase C — QueryEngine hybrid retrieval (BM25+MiniLM+RRF) regression tests.

Mirrors D1/Wave 3 flag-gating pattern. Cascading fallback hierarchy:
  hybrid → minilm-only → hash-v1
Each tier has its own collection name suffix to prevent vector-space mixing.
"""
import sys
from unittest.mock import patch, MagicMock


def _fresh_qe(use_hybrid=False, use_minilm=False, benchmark=False,
              hybrid_init_should_fail=False, enrich_docs=False):
    """Construct QueryEngine with controlled flags + mocked chromadb."""
    import query_engine as qe_module

    with patch.object(qe_module, "settings") as mock_s, \
         patch.object(qe_module.chromadb, "PersistentClient") as mock_client, \
         patch.object(qe_module, "SQLValidator") as mock_validator:
        mock_s.FEATURE_HYBRID_RETRIEVAL = use_hybrid
        mock_s.FEATURE_MINILM_SCHEMA_COLLECTION = use_minilm
        mock_s.BENCHMARK_MODE = benchmark
        # Phase C bundle Theme 2 (2026-04-27 council): explicit mock to defeat
        # MagicMock-truthy hazard. Doc-enrichment changes collection-name
        # suffix, must be controlled per test.
        mock_s.FEATURE_RETRIEVAL_DOC_ENRICHMENT = enrich_docs
        mock_s.CHROMA_PERSIST_DIR = "/tmp/test_chroma_unused"
        mock_client.return_value = MagicMock()
        mock_validator.return_value = MagicMock()

        connector = MagicMock()
        connector.db_type.value = "sqlite"
        provider = MagicMock()
        provider.default_model = "test"
        provider.fallback_model = "test"

        if hybrid_init_should_fail:
            # Simulate rank_bm25 ImportError. Patch sys.modules to None
            # so `from rank_bm25 import BM25Okapi` raises ImportError.
            real_rank_bm25 = sys.modules.get("rank_bm25")
            sys.modules["rank_bm25"] = None
            try:
                qe = qe_module.QueryEngine(db_connector=connector, namespace="t1", provider=provider)
            finally:
                if real_rank_bm25 is not None:
                    sys.modules["rank_bm25"] = real_rank_bm25
                else:
                    sys.modules.pop("rank_bm25", None)
        else:
            qe = qe_module.QueryEngine(db_connector=connector, namespace="t1", provider=provider)
        return qe, mock_client


def _find_collection(mock_client, prefix):
    for call in mock_client.return_value.get_or_create_collection.call_args_list:
        if call.kwargs.get("name", "").startswith(prefix):
            return call
    raise AssertionError(f"no collection call matched prefix {prefix!r}")


def test_hybrid_off_uses_legacy_collection_name():
    """Default (all flags off): hash-v1 + legacy collection name. Pre-Phase-C byte-identical."""
    from query_engine import _HashEmbeddingFunction
    qe, mock_client = _fresh_qe(use_hybrid=False, use_minilm=False, benchmark=False)
    schema_call = _find_collection(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1"
    assert isinstance(schema_call.kwargs["embedding_function"], _HashEmbeddingFunction)
    assert qe._hybrid_enabled is False


def test_hybrid_on_uses_hybrid_v1_collection_name():
    """FEATURE_HYBRID_RETRIEVAL=True: MiniLM-EF + _minilm-v1_hybrid-v1 suffix."""
    qe, mock_client = _fresh_qe(use_hybrid=True, use_minilm=False, benchmark=False)
    schema_call = _find_collection(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1_minilm-v1_hybrid-v1"
    assert qe._hybrid_enabled is True


def test_benchmark_mode_coerces_hybrid_on():
    """BENCHMARK_MODE=True activates hybrid + doc-enrichment even when
    explicit feature flags are False. Suffix gains '_docv2' from Theme 2
    coercion (Phase C bundle 2026-04-27)."""
    qe, mock_client = _fresh_qe(use_hybrid=False, use_minilm=False, benchmark=True)
    schema_call = _find_collection(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1_minilm-v1_hybrid-v1_docv2"
    assert qe._hybrid_enabled is True
    assert qe._doc_enriched is True


def test_doc_enrichment_flag_alone_appends_docv2():
    """FEATURE_RETRIEVAL_DOC_ENRICHMENT=True without hybrid still appends
    _docv2 suffix to legacy hash-v1 collection. Confirms enrichment gating
    is independent of hybrid (so a future prod-only flip stays clean)."""
    from query_engine import _HashEmbeddingFunction
    qe, mock_client = _fresh_qe(use_hybrid=False, use_minilm=False, benchmark=False,
                                 enrich_docs=True)
    schema_call = _find_collection(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1_docv2", (
        f"enrichment-only must append _docv2 to legacy name; got "
        f"{schema_call.kwargs['name']!r}"
    )
    assert isinstance(schema_call.kwargs["embedding_function"], _HashEmbeddingFunction)
    assert qe._doc_enriched is True
    assert qe._hybrid_enabled is False


def test_bm25_init_failure_falls_back_to_minilm_only_not_hash():
    """rank_bm25 unavailable: cascade to MiniLM-only (NOT all the way to hash).

    Critical invariant: hybrid failure must preserve the MiniLM gain from
    Phase A; should NOT regress to pre-Wave-3 hash-v1 retrieval.
    """
    qe, mock_client = _fresh_qe(use_hybrid=True, use_minilm=False, benchmark=False,
                                 hybrid_init_should_fail=True)
    schema_call = _find_collection(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1_minilm-v1", (
        f"BM25 init failure must cascade to MiniLM-only with _minilm-v1 suffix; "
        f"got {schema_call.kwargs['name']!r}"
    )
    assert qe._hybrid_enabled is False
