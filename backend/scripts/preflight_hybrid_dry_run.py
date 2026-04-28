"""Phase C pre-flight dry-run.

Build QueryEngine against superhero.sqlite under BENCHMARK_MODE,
seed schema_collection, run hybrid_query directly with qid 781 question,
print BM25 + MiniLM + RRF top-10 + eyeball check on top-3 fused.

Cost: ~$0 (no Anthropic calls — direct retrieval only). Wall: ~10-30s
(MiniLM warmup dominated; BM25 + RRF are sub-millisecond).

Usage:
    cd backend
    python -u scripts/preflight_hybrid_dry_run.py
"""
from __future__ import annotations

import os
os.environ["BENCHMARK_MODE"] = "true"

import sys as _sys
try:
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass

from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_BACKEND_DIR) not in _sys.path:
    _sys.path.insert(0, str(_BACKEND_DIR))

DB_PATH = _REPO_ROOT / "benchmarks" / "bird" / "mini_dev" / "llm" / "mini_dev_data" / "minidev" / "MINIDEV" / "dev_databases" / "superhero" / "superhero.sqlite"
QUESTION = "List the height of the heroes whose eye color is amber"


def main():
    from config import settings, DBType
    from db_connector import DatabaseConnector
    from query_engine import QueryEngine
    from anthropic_provider import AnthropicProvider

    assert settings.BENCHMARK_MODE is True

    print(f"DB: {DB_PATH.name}")
    print(f"Q:  {QUESTION!r}")
    print("=" * 70)

    # Build QueryEngine
    connector = DatabaseConnector(
        db_type=DBType.SQLITE,
        connection_uri=f"sqlite:///{DB_PATH.as_posix()}",
    )
    connector.connect()
    provider = AnthropicProvider(
        api_key=settings.ANTHROPIC_API_KEY,
        default_model=settings.PRIMARY_MODEL,
        fallback_model=settings.FALLBACK_MODEL,
    )
    qe = QueryEngine(db_connector=connector, namespace="preflight-superhero", provider=provider)

    print(f"hybrid_enabled: {qe._hybrid_enabled}")
    print(f"schema_collection: {qe.schema_collection.name}")
    print(f"existing collection count: {qe.schema_collection.count()}")
    print("=" * 70)

    # Seed (idempotent — skip if already populated)
    if qe.schema_collection.count() == 0:
        n = qe.train_schema()
        print(f"Seeded {n} table docs (fresh)")
    else:
        # Force BM25 rebuild from existing chroma data
        qe._rebuild_bm25_index()
        print(f"Schema already seeded ({qe.schema_collection.count()} docs); BM25 rebuilt from chroma")
    print(f"BM25 corpus size: {len(qe._bm25_corpus)}")
    print("=" * 70)

    # Inspect 3 retrieval channels separately
    print("\n=== 1. BM25 top-10 ===")
    q_tokens = qe._tokenize_for_bm25(QUESTION)
    print(f"tokenized: {q_tokens}")
    bm25_scores = qe._bm25_index.get_scores(q_tokens)
    bm25_ranked = sorted(range(len(bm25_scores)), key=lambda i: -bm25_scores[i])[:10]
    for rank, idx in enumerate(bm25_ranked, 1):
        entry = qe._bm25_corpus[idx]
        # Extract table name from doc
        first_line = entry["doc"].split("\n", 1)[0]
        table_name = first_line.replace("Table:", "").strip() if first_line.startswith("Table:") else "<unknown>"
        print(f"  {rank:2d}. id={entry['id']!r:32s} score={bm25_scores[idx]:6.3f}  table={table_name}")

    print("\n=== 2. MiniLM (Chroma) top-10 ===")
    n = min(10, qe.schema_collection.count() or 1)
    chroma = qe.schema_collection.query(query_texts=[QUESTION], n_results=n)
    chroma_ids = (chroma.get("ids") or [[]])[0]
    chroma_dists = (chroma.get("distances") or [[]])[0]
    chroma_docs = (chroma.get("documents") or [[]])[0]
    for rank, (doc_id, dist, doc) in enumerate(zip(chroma_ids, chroma_dists, chroma_docs), 1):
        first_line = doc.split("\n", 1)[0] if doc else ""
        table_name = first_line.replace("Table:", "").strip() if first_line.startswith("Table:") else "<unknown>"
        # Cosine distance: 0 = identical, 2 = opposite
        print(f"  {rank:2d}. id={doc_id!r:32s} dist={dist:6.3f}  table={table_name}")

    print("\n=== 3. RRF-fused top-10 ===")
    fused = qe.find_relevant_tables(QUESTION, top_k=10)
    fused_ids = (fused.get("ids") or [[]])[0]
    fused_dists = (fused.get("distances") or [[]])[0]
    fused_docs = (fused.get("documents") or [[]])[0]
    for rank, (doc_id, dist, doc) in enumerate(zip(fused_ids, fused_dists, fused_docs), 1):
        first_line = doc.split("\n", 1)[0] if doc else ""
        table_name = first_line.replace("Table:", "").strip() if first_line.startswith("Table:") else "<unknown>"
        # distance = 1 - rrf_score, so rrf_score = 1 - distance
        rrf_score = 1.0 - dist
        print(f"  {rank:2d}. id={doc_id!r:32s} rrf={rrf_score:6.4f}  table={table_name}")

    print("\n=== 4. Eyeball check ===")
    expected = {"superhero", "colour", "hero_attribute"}  # qid 781 likely needs superhero+colour join
    fused_top3 = []
    for doc_id, doc in zip(fused_ids[:3], fused_docs[:3]):
        first_line = doc.split("\n", 1)[0] if doc else ""
        if first_line.startswith("Table:"):
            fused_top3.append(first_line.replace("Table:", "").strip())
    print(f"Fused top-3 tables: {fused_top3}")
    print(f"Required for qid 781 SQL: superhero (height_cm) + colour (eye_colour_id join)")
    if "superhero" in fused_top3 and "colour" in fused_top3:
        print("[OK] superhero + colour both in top-3 — RRF fusion is finding the right tables")
    elif "superhero" in fused_top3 or "colour" in fused_top3:
        present = [t for t in ["superhero", "colour"] if t in fused_top3]
        missing = [t for t in ["superhero", "colour"] if t not in fused_top3]
        print(f"[PARTIAL] top-3 has {present} but missing {missing}")
    else:
        print(f"[FAIL] top-3 does NOT contain superhero or colour — fusion suspect")

    return 0


if __name__ == "__main__":
    _sys.exit(main())
