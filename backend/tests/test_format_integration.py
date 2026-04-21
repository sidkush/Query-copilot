"""Plan 10a — E2E: author rules → proto round-trip → resolve result."""
from vizql.format_resolver import FormatResolver
from vizql.formatting_types import MarkSelector, StyleProp, StyleRule, WorkbookSelector
from vizql.spec import VisualSpec


def test_spec_rules_resolve_correctly_after_proto_roundtrip():
    rules = [
        StyleRule(WorkbookSelector(), {StyleProp.COLOR: "#000000"}),
        StyleRule(MarkSelector(mark_id="m1"), {StyleProp.COLOR: "#ff0000"}),
    ]
    spec = VisualSpec(sheet_id="s1", formatting=rules)
    proto = spec.to_proto()
    restored = VisualSpec.from_proto(proto)
    resolver = FormatResolver(restored.formatting)
    assert resolver.resolve("m1", "f1", "s1", "d1", StyleProp.COLOR) == "#ff0000"
    assert resolver.resolve("m2", "f1", "s1", "d1", StyleProp.COLOR) == "#000000"
