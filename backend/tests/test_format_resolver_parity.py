"""Plan 10a — JSON-fixture parity harness. TS mirror runs the same fixtures."""
import json
from pathlib import Path

import pytest

from vizql.format_resolver import FormatResolver
from vizql.formatting_types import StyleProp, StyleRule

FIXTURES = Path(__file__).resolve().parents[1] / "vizql" / "tests" / "fixtures" / "format_parity"


def _build_selector(raw):
    from vizql.formatting_types import (
        DataSourceSelector,
        FieldSelector,
        MarkSelector,
        WorkbookSelector,
        WorksheetSelector,
    )
    return {
        "mark": lambda: MarkSelector(mark_id=raw["id"]),
        "field": lambda: FieldSelector(field_id=raw["id"]),
        "sheet": lambda: WorksheetSelector(sheet_id=raw["id"]),
        "ds": lambda: DataSourceSelector(ds_id=raw["id"]),
        "workbook": lambda: WorkbookSelector(),
    }[raw["kind"]]()


def _coerce(prop: StyleProp, wire: str):
    numeric = {StyleProp.FONT_SIZE, StyleProp.LINE_HEIGHT, StyleProp.PADDING, StyleProp.PANE_LINE_THICKNESS}
    if prop in numeric:
        try: return int(wire)
        except ValueError: return float(wire)
    return wire


@pytest.mark.parametrize("path", sorted(FIXTURES.glob("*.json")))
def test_parity_fixture(path: Path):
    spec = json.loads(path.read_text())
    rules = [
        StyleRule(
            selector=_build_selector(r["selector"]),
            properties={StyleProp(k): _coerce(StyleProp(k), v) for k, v in r["properties"].items()},
        )
        for r in spec["rules"]
    ]
    r = FormatResolver(rules)
    for q in spec["queries"]:
        got = r.resolve(q["mark"], q["field"], q["sheet"], q["ds"], StyleProp(q["prop"]))
        assert got == q["expected"], f"{path.name} :: query={q} got={got}"
