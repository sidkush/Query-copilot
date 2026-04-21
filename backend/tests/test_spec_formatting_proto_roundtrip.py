from vizql.formatting_types import MarkSelector, StyleProp, StyleRule, WorkbookSelector
from vizql.spec import VisualSpec


def test_formatting_roundtrip():
    rules = [
        StyleRule(WorkbookSelector(), {StyleProp.COLOR: "#000000"}),
        StyleRule(MarkSelector(mark_id="m1"), {StyleProp.COLOR: "#ff0000"}),
    ]
    spec = VisualSpec(sheet_id="s1", formatting=rules)
    proto = spec.to_proto()
    restored = VisualSpec.from_proto(proto)
    assert len(restored.formatting) == 2
    assert restored.formatting[1].properties[StyleProp.COLOR] == "#ff0000"


def test_formatting_empty_default():
    spec = VisualSpec(sheet_id="s1")
    assert spec.formatting == []
    proto = spec.to_proto()
    assert VisualSpec.from_proto(proto).formatting == []
