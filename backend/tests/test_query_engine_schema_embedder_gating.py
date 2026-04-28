"""Wave 3 — QueryEngine schema_collection embedder flag-gating regression tests.

Mirrors D1 FEATURE_MINILM_EMBEDDER pattern but for query_engine.schema_collection
(the retrieval path agent_engine._tool_find_relevant_tables queries against).
Production default uses hash-v1 (legacy collection name, byte-identical to
pre-Wave-3); explicit flag or BENCHMARK_MODE coerces MiniLM with versioned
collection naming.
"""
from unittest.mock import patch, MagicMock


def _fresh_qe(use_minilm=False, benchmark=False, minilm_init_should_fail=False):
    """Construct QueryEngine with controlled flags + mocked chromadb."""
    import query_engine as qe_module

    with patch.object(qe_module, "settings") as mock_s, \
         patch.object(qe_module.chromadb, "PersistentClient") as mock_client, \
         patch.object(qe_module, "SQLValidator") as mock_validator:
        mock_s.FEATURE_MINILM_SCHEMA_COLLECTION = use_minilm
        mock_s.BENCHMARK_MODE = benchmark
        # Phase C added FEATURE_HYBRID_RETRIEVAL — must be explicitly mocked
        # to False here, otherwise MagicMock auto-attribute returns truthy
        # and the hybrid cascade activates instead of the Phase A path
        # under test (same MagicMock-truthy hazard pattern from Wave 1).
        mock_s.FEATURE_HYBRID_RETRIEVAL = False
        # Phase C bundle (2026-04-27 council Theme 2) — same hazard pattern.
        mock_s.FEATURE_RETRIEVAL_DOC_ENRICHMENT = False
        mock_s.CHROMA_PERSIST_DIR = "/tmp/test_chroma_unused"
        mock_client.return_value = MagicMock()
        mock_validator.return_value = MagicMock()

        connector = MagicMock()
        connector.db_type.value = "sqlite"
        provider = MagicMock()
        provider.default_model = "test"
        provider.fallback_model = "test"

        if minilm_init_should_fail:
            with patch("query_memory._MiniLMEmbeddingFunction",
                       side_effect=RuntimeError("simulated MiniLM failure")):
                qe = qe_module.QueryEngine(db_connector=connector, namespace="t1", provider=provider)
        else:
            qe = qe_module.QueryEngine(db_connector=connector, namespace="t1", provider=provider)
        return qe, mock_client


def _find_collection_call(mock_client, name_prefix: str):
    """Return the get_or_create_collection call for the named collection."""
    for call in mock_client.return_value.get_or_create_collection.call_args_list:
        if call.kwargs.get("name", "").startswith(name_prefix):
            return call
    raise AssertionError(f"no collection call matched prefix {name_prefix!r}")


def test_schema_collection_uses_hash_when_flag_off():
    """Default: hash-v1 + legacy collection name. Pre-Wave-3 byte-identical."""
    from query_engine import _HashEmbeddingFunction
    qe, mock_client = _fresh_qe(use_minilm=False, benchmark=False)
    schema_call = _find_collection_call(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1", (
        f"hash mode must use legacy name; got {schema_call.kwargs['name']!r}"
    )
    assert isinstance(schema_call.kwargs["embedding_function"], _HashEmbeddingFunction)


def test_schema_collection_uses_minilm_when_flag_on():
    """FEATURE_MINILM_SCHEMA_COLLECTION=True: MiniLM + _minilm-v1 collection."""
    qe, mock_client = _fresh_qe(use_minilm=True, benchmark=False)
    schema_call = _find_collection_call(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1_minilm-v1", (
        f"MiniLM mode must use versioned name; got {schema_call.kwargs['name']!r}"
    )


def test_benchmark_mode_alone_no_longer_coerces_minilm():
    """Phase 1 OR-coerce removal (2026-04-27 → 2026-04-28): BENCHMARK_MODE=True
    alone does NOT activate MiniLM (Cap 1+2) NOR doc-enrichment (Cap 3). All
    flags must be set explicitly by the BIRD harness.

    Pre-removal contract: BM=True alone → _minilm-v1_hybrid-v1_docv2
    Post Cap 1+2 contract: BM=True alone → _docv2 (doc-enrichment retained)
    Post Cap 3 contract:   BM=True alone → schema_context_t1 (all stripped)

    BIRD harness scripts now set FEATURE_HYBRID_RETRIEVAL +
    FEATURE_MINILM_SCHEMA_COLLECTION + FEATURE_RETRIEVAL_DOC_ENRICHMENT
    explicitly via os.environ.
    """
    from query_engine import _HashEmbeddingFunction
    qe, mock_client = _fresh_qe(use_minilm=False, benchmark=True)
    schema_call = _find_collection_call(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1", (
        f"BM=True without explicit flags must produce legacy collection name; "
        f"got {schema_call.kwargs['name']!r}"
    )
    assert isinstance(schema_call.kwargs["embedding_function"], _HashEmbeddingFunction)


def test_minilm_init_failure_falls_back_to_hash_with_legacy_name():
    """Graceful degradation: MiniLM init fails -> hash-v1 + LEGACY collection name.

    Preserves existing user schema cache in degraded retrieval mode.
    """
    from query_engine import _HashEmbeddingFunction
    qe, mock_client = _fresh_qe(use_minilm=True, benchmark=False, minilm_init_should_fail=True)
    schema_call = _find_collection_call(mock_client, "schema_context_")
    assert schema_call.kwargs["name"] == "schema_context_t1", (
        f"fallback must use LEGACY name to preserve user data; got {schema_call.kwargs['name']!r}"
    )
    assert isinstance(schema_call.kwargs["embedding_function"], _HashEmbeddingFunction)
