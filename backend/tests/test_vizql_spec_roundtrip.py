"""Plan 7a - VisualSpec protobuf roundtrip.

Covers every message type in backend/vizql/spec.py. Each test constructs
a fully-populated instance, serialises to bytes, deserialises, and
compares structurally. Also pins canonical enum values against
docs/Build_Tableau.md Appendix A.
"""

from __future__ import annotations

import pytest

from vizql import spec
from vizql.proto import v1_pb2 as pb


def make_field(fid: str = "orders.total") -> spec.Field:
    return spec.Field(
        id=fid,
        data_type=spec.DataType.DATA_TYPE_NUMBER,
        role=spec.FieldRole.FIELD_ROLE_MEASURE,
        semantic_role="",
        aggregation=spec.AggType.AGG_TYPE_SUM,
        is_disagg=False,
        column_class=spec.ColumnClass.COLUMN_CLASS_DATABASE,
    )


def test_field_roundtrip():
    f = make_field()
    assert spec.Field.from_proto(f.to_proto()) == f


def test_calculation_roundtrip():
    c = spec.Calculation(id="calc1", formula="SUM([total])/COUNT([order_id])", is_adhoc=True)
    assert spec.Calculation.from_proto(c.to_proto()) == c


def test_shelf_roundtrip_preserves_order():
    s = spec.Shelf(
        kind=spec.ShelfKind.SHELF_KIND_COLUMN,
        fields=[make_field("a"), make_field("b"), make_field("c")],
    )
    rt = spec.Shelf.from_proto(s.to_proto())
    assert [f.id for f in rt.fields] == ["a", "b", "c"]
    assert rt.kind == spec.ShelfKind.SHELF_KIND_COLUMN


def test_encoding_roundtrip_custom_id_preserved():
    e = spec.Encoding(
        field_encoding_id="enc1",
        encoding_type=spec.EncodingType.ENCODING_TYPE_CUSTOM,
        field=make_field(),
        custom_encoding_type_id="org.askdb.treemap.v1",
    )
    rt = spec.Encoding.from_proto(e.to_proto())
    assert rt.custom_encoding_type_id == "org.askdb.treemap.v1"
    assert rt.encoding_type == spec.EncodingType.ENCODING_TYPE_CUSTOM


@pytest.mark.parametrize("kind,props_attr,props_obj", [
    (
        spec.FilterKind.FILTER_KIND_CATEGORICAL,
        "categorical",
        spec.CategoricalFilterProps(values=["NY", "CA"], is_exclude_mode=True, case_sensitive=False),
    ),
    (
        spec.FilterKind.FILTER_KIND_HIERARCHICAL,
        "hierarchical",
        spec.HierarchicalFilterProps(filter_levels=["country", "state"], hier_val_selection_models=["{}"]),
    ),
    (
        spec.FilterKind.FILTER_KIND_RANGE,
        "range",
        spec.RangeFilterProps(min=0.0, max=100.0, range_null_option="drop"),
    ),
    (
        spec.FilterKind.FILTER_KIND_RELATIVE_DATE,
        "relative_date",
        spec.RelativeDateFilterProps(anchor_date="2026-04-17", period_type="days", date_range_type="last", range_n=30),
    ),
])
def test_filter_spec_roundtrip_each_kind(kind, props_attr, props_obj):
    fs = spec.FilterSpec(
        filter_kind=kind,
        field=make_field(),
        has_null=True,
        include_null=False,
        is_logical_table_scoped_filter=True,
        filter_stage="context",
        filter_properties={"apply-to-totals": "true"},
        **{props_attr: props_obj},
    )
    rt = spec.FilterSpec.from_proto(fs.to_proto())
    assert rt.filter_kind == kind
    assert rt.has_null is True
    assert rt.filter_stage == "context"
    assert rt.filter_properties == {"apply-to-totals": "true"}
    assert getattr(rt, props_attr) == props_obj
    for other in ("categorical", "hierarchical", "range", "relative_date"):
        if other == props_attr:
            continue
        assert getattr(rt, other) is None, f"{other} should be None when kind={kind}"


def test_parameter_roundtrip_all_domain_kinds():
    for domain_kind in ("list", "range", "free"):
        p = spec.Parameter(
            id="p1",
            name="Region",
            data_type=spec.DataType.DATA_TYPE_STRING,
            value="NY",
            domain_kind=domain_kind,
            domain_values=["NY", "CA"] if domain_kind == "list" else [],
            domain_min=0.0 if domain_kind != "range" else 1.0,
            domain_max=0.0 if domain_kind != "range" else 100.0,
            domain_step=0.0 if domain_kind != "range" else 1.0,
        )
        assert spec.Parameter.from_proto(p.to_proto()) == p


def test_lod_calculation_roundtrip():
    l = spec.LodCalculation(
        id="lod1",
        lod_kind="fixed",
        lod_dims=[make_field("region"), make_field("year")],
        inner_calculation=spec.Calculation(id="inner", formula="SUM([sales])"),
        outer_aggregation=spec.AggType.AGG_TYPE_AVG,
    )
    rt = spec.LodCalculation.from_proto(l.to_proto())
    assert rt == l


def test_analytics_roundtrip_preserves_slot_properties():
    a = spec.Analytics(slots=[
        spec.AnalyticsSlot(id="ref1", kind="reference-line", properties={"value": "10", "axis": "y"}),
        spec.AnalyticsSlot(id="trend1", kind="trend", properties={"model": "linear"}),
    ])
    rt = spec.Analytics.from_proto(a.to_proto())
    assert rt == a


def test_visual_spec_full_roundtrip():
    v = spec.VisualSpec(
        sheet_id="sheet-1",
        fields=[make_field("a"), make_field("b")],
        shelves=[spec.Shelf(kind=spec.ShelfKind.SHELF_KIND_ROW, fields=[make_field("a")])],
        encodings=[spec.Encoding(
            field_encoding_id="e1",
            encoding_type=spec.EncodingType.ENCODING_TYPE_COLOR,
            field=make_field("b"),
        )],
        filters=[spec.FilterSpec(
            filter_kind=spec.FilterKind.FILTER_KIND_CATEGORICAL,
            field=make_field("region"),
            categorical=spec.CategoricalFilterProps(values=["NY"]),
            filter_stage="dimension",
        )],
        parameters=[spec.Parameter(
            id="p1", name="Year", data_type=spec.DataType.DATA_TYPE_INT, value="2026",
            domain_kind="range", domain_min=2020.0, domain_max=2030.0, domain_step=1.0,
        )],
        lod_calculations=[],
        mark_type=spec.MarkType.MARK_TYPE_BAR,
        analytics=spec.Analytics(),
        is_generative_ai_web_authoring=True,
        domain_type="snowflake",
    )
    payload = v.serialize()
    assert isinstance(payload, bytes)
    assert len(payload) > 0
    rt = spec.VisualSpec.deserialize(payload)
    assert rt == v


def test_is_generative_ai_web_authoring_flag_default_false():
    v = spec.VisualSpec(sheet_id="s1")
    assert v.is_generative_ai_web_authoring is False
    rt = spec.VisualSpec.deserialize(v.serialize())
    assert rt.is_generative_ai_web_authoring is False


def test_enum_canonical_values_pinned_to_appendix_a():
    """Pin canonical integer tags so regenerated protos never silently renumber."""
    assert pb.DataType.DATA_TYPE_BOOL == 1
    assert pb.DataType.DATA_TYPE_STRING == 9
    assert pb.MarkType.MARK_TYPE_VIZ_EXTENSION == 13
    assert pb.EncodingType.ENCODING_TYPE_CUSTOM == 10
    assert pb.FilterKind.FILTER_KIND_RELATIVE_DATE == 4
    assert pb.AggType.AGG_TYPE_TRUNC_YEAR == 41
    assert pb.AggType.AGG_TYPE_TRUNC_SECOND == 48


def test_empty_spec_serialises_and_deserialises():
    v = spec.VisualSpec(sheet_id="")
    rt = spec.VisualSpec.deserialize(v.serialize())
    assert rt.sheet_id == ""
    assert rt.fields == []
    assert rt.mark_type == spec.MarkType.MARK_TYPE_UNSPECIFIED
