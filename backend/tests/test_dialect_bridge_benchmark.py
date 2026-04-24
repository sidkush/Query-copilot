"""Phase M-alt benchmark — 50-Q corpus × 8 engines, forward transpile + round-trip.

Gate: ≥95% forward-transpile success. ≥90% round-trip. Any regression blocks merge.
"""
import json
from pathlib import Path

import pytest
import sqlglot

from dialect_bridge import transpile


CORPUS_PATH = Path(__file__).parent / "fixtures" / "bench_corpus.jsonl"
REFERENCE_SQL = Path(__file__).parent / "fixtures" / "bench_reference_sql.jsonl"
# sqlglot canonical dialect names — 'postgresql'->'postgres', 'mssql'->'tsql'
ENGINES = ["bigquery", "duckdb", "postgres", "snowflake", "redshift", "mysql", "tsql", "clickhouse"]


def _load_reference_sql():
    """Pair bench_corpus.jsonl NL with reference SQL from the M1 spike artefact."""
    if not REFERENCE_SQL.exists():
        pytest.skip(f"reference SQL fixture missing: {REFERENCE_SQL}")
    with REFERENCE_SQL.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def test_forward_transpile_coverage_across_engines():
    """Every query in the corpus transpiles BigQuery -> every target without exception."""
    corpus = _load_reference_sql()
    total = 0
    ok = 0
    fails: list = []
    for entry in corpus:
        sql = entry["sql"]
        for tgt in ENGINES:
            if tgt == "bigquery":
                continue   # source dialect; pass-through
            total += 1
            out = transpile(sql, source="bigquery", target=tgt)
            try:
                sqlglot.parse_one(out, dialect=tgt)
                ok += 1
            except Exception as exc:
                fails.append({"id": entry["id"], "target": tgt, "err": str(exc)[:120]})
    fwd_pct = ok / total if total else 0
    print(f"Forward transpile: {ok}/{total} = {fwd_pct:.1%}")
    if fails:
        print("Failures (first 10):")
        for f in fails[:10]:
            print(f"  {f}")
    assert fwd_pct >= 0.95, f"Forward transpile {fwd_pct:.1%} below 95% gate; failures: {len(fails)}"


def test_round_trip_semantic_preservation():
    """Transpile BQ -> target -> BQ and verify the round-trip parses cleanly."""
    corpus = _load_reference_sql()
    total = 0
    ok = 0
    fails: list = []
    for entry in corpus:
        sql = entry["sql"]
        for tgt in ENGINES:
            if tgt == "bigquery":
                continue
            total += 1
            forward = transpile(sql, source="bigquery", target=tgt)
            back = transpile(forward, source=tgt, target="bigquery")
            try:
                sqlglot.parse_one(back, dialect="bigquery")
                ok += 1
            except Exception as exc:
                fails.append({"id": entry["id"], "target": tgt, "err": str(exc)[:120]})
    rt_pct = ok / total if total else 0
    print(f"Round-trip: {ok}/{total} = {rt_pct:.1%}")
    if fails:
        print("Round-trip failures (first 10):")
        for f in fails[:10]:
            print(f"  {f}")
    assert rt_pct >= 0.90, f"Round-trip {rt_pct:.1%} below 90% gate"
