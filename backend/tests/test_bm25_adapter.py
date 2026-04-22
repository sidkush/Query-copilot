from backend.embeddings.bm25_adapter import BM25Adapter


def test_bm25_ranks_exact_match_above_unrelated():
    docs = ["the cat sat on the mat", "weather is nice today", "cats love milk"]
    bm = BM25Adapter(docs)
    scores = bm.score("cat sat mat")
    ranked = sorted(range(len(docs)), key=lambda i: -scores[i])
    assert ranked[0] == 0   # cat sat mat = top


def test_bm25_score_shape_matches_corpus():
    docs = ["a", "b", "c"]
    bm = BM25Adapter(docs)
    assert len(bm.score("anything")) == 3
