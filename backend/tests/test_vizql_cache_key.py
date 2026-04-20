"""Plan 7e T1 — AbstractQueryCacheKey stability + collision resistance."""
from __future__ import annotations

import pytest

from vizql.cache import AbstractQueryCacheKey, OrderByKey


def _base_key(**overrides) -> AbstractQueryCacheKey:
    defaults = dict(
        ds_id="conn_abc",
        relation_tree_hash="rel_hash_1",
        predicate_hash="pred_hash_1",
        projection=("col_a", "col_b"),
        group_bys=("col_a",),
        order_by=(OrderByKey(column="col_a", descending=False),),
        agg_types=("SUM",),
        dialect="duckdb",
        parameter_snapshot=(),
    )
    defaults.update(overrides)
    return AbstractQueryCacheKey(**defaults)


def test_key_is_hashable_and_equal():
    k1 = _base_key()
    k2 = _base_key()
    assert hash(k1) == hash(k2)
    assert k1 == k2


def test_key_differs_on_projection():
    k1 = _base_key(projection=("col_a", "col_b"))
    k2 = _base_key(projection=("col_a", "col_c"))
    assert k1 != k2
    assert hash(k1) != hash(k2)


def test_key_differs_on_parameter_snapshot():
    """§XIX.1 anti-pattern #4 — parameter change MUST invalidate."""
    k1 = _base_key(parameter_snapshot=(("region", '"EMEA"'),))
    k2 = _base_key(parameter_snapshot=(("region", '"AMER"'),))
    assert k1 != k2


def test_key_canonicalises_projection_order():
    k1 = _base_key(projection=("col_a", "col_b"))
    k2 = _base_key(projection=("col_b", "col_a"))
    assert k1 == k2


def test_key_stable_across_processes():
    k = _base_key()
    assert k.to_canonical_str().startswith("vizql:")
    assert len(k.content_hash()) == 32


def test_order_by_key_equality():
    a = OrderByKey(column="x", descending=True)
    b = OrderByKey(column="x", descending=True)
    c = OrderByKey(column="x", descending=False)
    assert a == b
    assert a != c
    assert hash(a) == hash(b)
