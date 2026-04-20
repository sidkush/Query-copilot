"""Plan 8b T8: context-filter promotion hint tests.

NOTE: Tests use `from vizql import context_filter_helper as cfh` rather
than the plan's `from backend.vizql import context_filter_helper as cfh`
because existing backend tests put `backend/` on sys.path via pytest's
`pythonpath = .` (see e.g. `test_calc_parser.py`). Run from `backend/`
via `python -m pytest`.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vizql import context_filter_helper as cfh
from vizql import calc_ast as ca


def _fixed(dims: tuple[str, ...]) -> ca.LodExpr:
    return ca.LodExpr(
        kind="FIXED",
        dims=tuple(ca.FieldRef(field_name=d) for d in dims),
        body=ca.FnCall(name="SUM", args=(ca.FieldRef(field_name="Sales"),)),
    )


def test_promotes_when_filter_narrows_and_fixed_ignores_field():
    f = cfh.FilterHint(
        field_name="Segment",
        kind="dimension",
        domain_size=3,
        selected_size=1,          # narrows 67% — > 50%
    )
    lods = [_fixed(("Region",))]  # FIXED does not include Segment
    hint = cfh.should_promote_to_context(f, lods)
    assert hint is not None
    assert "Segment" in hint.message
    assert "context" in hint.message.lower()


def test_no_promotion_when_fixed_already_includes_field():
    f = cfh.FilterHint(field_name="Region", kind="dimension", domain_size=5, selected_size=1)
    lods = [_fixed(("Region",))]  # FIXED already partitions by Region
    assert cfh.should_promote_to_context(f, lods) is None


def test_no_promotion_when_filter_does_not_narrow():
    f = cfh.FilterHint(field_name="Segment", kind="dimension", domain_size=3, selected_size=3)
    lods = [_fixed(("Region",))]
    assert cfh.should_promote_to_context(f, lods) is None


def test_no_promotion_when_no_fixed_lod_present():
    f = cfh.FilterHint(field_name="Segment", kind="dimension", domain_size=3, selected_size=1)
    assert cfh.should_promote_to_context(f, []) is None


def test_no_promotion_for_measure_filter():
    f = cfh.FilterHint(field_name="Sales", kind="measure", domain_size=1000, selected_size=1)
    lods = [_fixed(("Region",))]
    assert cfh.should_promote_to_context(f, lods) is None


def test_message_matches_build_tableau_xxv3_language():
    f = cfh.FilterHint(field_name="Region", kind="dimension", domain_size=4, selected_size=1)
    lods = [_fixed(("Product",))]
    hint = cfh.should_promote_to_context(f, lods)
    assert hint is not None
    # Quote-match the authoring friction language from §XXV.3.
    assert "FIXED LOD" in hint.message
    assert "filter order" in hint.message.lower()
