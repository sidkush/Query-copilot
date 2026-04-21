"""VisualSpec dataclass wrappers + protobuf round-trip.

The protobuf types generated at ``backend/vizql/proto/v1_pb2.py`` are the
wire format. Python code in the agent / compiler / tests works against
these ergonomic dataclasses, then serialises through ``to_proto`` when
crossing a wire boundary.

Design rules:

* Dataclasses mirror the proto messages 1:1.
* Enum values are the generated integer constants from v1_pb2, not
  strings (keeps filter-kind-sensitive branches tight).
* ``to_proto`` and ``from_proto`` are the *only* places that convert -
  callers never touch ``v1_pb2`` messages directly.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Optional

from vizql.proto import v1_pb2 as pb
from .table_calc import TableCalcSpec
from .formatting_types import (
    DataSourceSelector,
    FieldSelector,
    MarkSelector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
    WorksheetSelector,
)

# Re-export enums so callers get a stable import path.
DataType = pb.DataType
FieldRole = pb.FieldRole
ColumnClass = pb.ColumnClass
MarkType = pb.MarkType
EncodingType = pb.EncodingType
ShelfKind = pb.ShelfKind
FilterKind = pb.FilterKind
AggType = pb.AggType


@dataclass
class Field:
    id: str
    data_type: DataType = DataType.DATA_TYPE_UNSPECIFIED
    role: FieldRole = FieldRole.FIELD_ROLE_UNSPECIFIED
    semantic_role: str = ""
    aggregation: AggType = AggType.AGG_TYPE_UNSPECIFIED
    is_disagg: bool = False
    column_class: ColumnClass = ColumnClass.COLUMN_CLASS_UNSPECIFIED

    def to_proto(self) -> pb.Field:
        return pb.Field(
            id=self.id,
            data_type=self.data_type,
            role=self.role,
            semantic_role=self.semantic_role,
            aggregation=self.aggregation,
            is_disagg=self.is_disagg,
            column_class=self.column_class,
        )

    @classmethod
    def from_proto(cls, m: pb.Field) -> "Field":
        return cls(
            id=m.id,
            data_type=m.data_type,
            role=m.role,
            semantic_role=m.semantic_role,
            aggregation=m.aggregation,
            is_disagg=m.is_disagg,
            column_class=m.column_class,
        )


@dataclass
class Calculation:
    id: str
    formula: str
    is_adhoc: bool = False

    def to_proto(self) -> pb.Calculation:
        return pb.Calculation(id=self.id, formula=self.formula, is_adhoc=self.is_adhoc)

    @classmethod
    def from_proto(cls, m: pb.Calculation) -> "Calculation":
        return cls(id=m.id, formula=m.formula, is_adhoc=m.is_adhoc)


@dataclass
class Shelf:
    kind: ShelfKind
    fields: list[Field] = field(default_factory=list)

    def to_proto(self) -> pb.Shelf:
        return pb.Shelf(kind=self.kind, fields=[f.to_proto() for f in self.fields])

    @classmethod
    def from_proto(cls, m: pb.Shelf) -> "Shelf":
        return cls(kind=m.kind, fields=[Field.from_proto(f) for f in m.fields])


@dataclass
class Encoding:
    field_encoding_id: str
    encoding_type: EncodingType
    field: Field
    custom_encoding_type_id: str = ""

    def to_proto(self) -> pb.Encoding:
        return pb.Encoding(
            field_encoding_id=self.field_encoding_id,
            encoding_type=self.encoding_type,
            custom_encoding_type_id=self.custom_encoding_type_id,
            field=self.field.to_proto(),
        )

    @classmethod
    def from_proto(cls, m: pb.Encoding) -> "Encoding":
        return cls(
            field_encoding_id=m.field_encoding_id,
            encoding_type=m.encoding_type,
            custom_encoding_type_id=m.custom_encoding_type_id,
            field=Field.from_proto(m.field),
        )


@dataclass
class CategoricalFilterProps:
    values: list[str] = field(default_factory=list)
    is_exclude_mode: bool = False
    case_sensitive: bool = True


@dataclass
class HierarchicalFilterProps:
    filter_levels: list[str] = field(default_factory=list)
    hier_val_selection_models: list[str] = field(default_factory=list)


@dataclass
class RangeFilterProps:
    min: float = 0.0
    max: float = 0.0
    range_null_option: str = "keep"  # "keep" | "drop" | "only"


@dataclass
class RelativeDateFilterProps:
    anchor_date: str = ""
    period_type: str = ""
    date_range_type: str = ""
    range_n: int = 0


@dataclass
class FilterSpec:
    filter_kind: FilterKind
    field: Field
    categorical: Optional[CategoricalFilterProps] = None
    hierarchical: Optional[HierarchicalFilterProps] = None
    range: Optional[RangeFilterProps] = None
    relative_date: Optional[RelativeDateFilterProps] = None
    has_null: bool = False
    include_null: bool = False
    is_logical_table_scoped_filter: bool = False
    filter_stage: str = "dimension"
    filter_properties: dict[str, str] = dataclasses.field(default_factory=dict)

    def to_proto(self) -> pb.FilterSpec:
        out = pb.FilterSpec(
            filter_kind=self.filter_kind,
            field=self.field.to_proto(),
            has_null=self.has_null,
            include_null=self.include_null,
            is_logical_table_scoped_filter=self.is_logical_table_scoped_filter,
            filter_stage=self.filter_stage,
        )
        for k, v in self.filter_properties.items():
            out.filter_properties[k] = v
        if self.categorical is not None:
            out.categorical.CopyFrom(pb.CategoricalFilterProps(
                values=list(self.categorical.values),
                is_exclude_mode=self.categorical.is_exclude_mode,
                case_sensitive=self.categorical.case_sensitive,
            ))
        if self.hierarchical is not None:
            out.hierarchical.CopyFrom(pb.HierarchicalFilterProps(
                filter_levels=list(self.hierarchical.filter_levels),
                hier_val_selection_models=list(self.hierarchical.hier_val_selection_models),
            ))
        if self.range is not None:
            out.range.CopyFrom(pb.RangeFilterProps(
                min=self.range.min,
                max=self.range.max,
                range_null_option=self.range.range_null_option,
            ))
        if self.relative_date is not None:
            out.relative_date.CopyFrom(pb.RelativeDateFilterProps(
                anchor_date=self.relative_date.anchor_date,
                period_type=self.relative_date.period_type,
                date_range_type=self.relative_date.date_range_type,
                range_n=self.relative_date.range_n,
            ))
        return out

    @classmethod
    def from_proto(cls, m: pb.FilterSpec) -> "FilterSpec":
        return cls(
            filter_kind=m.filter_kind,
            field=Field.from_proto(m.field),
            has_null=m.has_null,
            include_null=m.include_null,
            is_logical_table_scoped_filter=m.is_logical_table_scoped_filter,
            filter_stage=m.filter_stage,
            filter_properties=dict(m.filter_properties),
            categorical=(
                CategoricalFilterProps(
                    values=list(m.categorical.values),
                    is_exclude_mode=m.categorical.is_exclude_mode,
                    case_sensitive=m.categorical.case_sensitive,
                )
                if m.HasField("categorical")
                else None
            ),
            hierarchical=(
                HierarchicalFilterProps(
                    filter_levels=list(m.hierarchical.filter_levels),
                    hier_val_selection_models=list(m.hierarchical.hier_val_selection_models),
                )
                if m.HasField("hierarchical")
                else None
            ),
            range=(
                RangeFilterProps(
                    min=m.range.min,
                    max=m.range.max,
                    range_null_option=m.range.range_null_option,
                )
                if m.HasField("range")
                else None
            ),
            relative_date=(
                RelativeDateFilterProps(
                    anchor_date=m.relative_date.anchor_date,
                    period_type=m.relative_date.period_type,
                    date_range_type=m.relative_date.date_range_type,
                    range_n=m.relative_date.range_n,
                )
                if m.HasField("relative_date")
                else None
            ),
        )


@dataclass
class Parameter:
    id: str
    name: str
    data_type: DataType
    value: str
    domain_kind: str = "free"
    domain_values: list[str] = field(default_factory=list)
    domain_min: float = 0.0
    domain_max: float = 0.0
    domain_step: float = 0.0

    def to_proto(self) -> pb.Parameter:
        return pb.Parameter(
            id=self.id,
            name=self.name,
            data_type=self.data_type,
            value=self.value,
            domain_kind=self.domain_kind,
            domain_values=list(self.domain_values),
            domain_min=self.domain_min,
            domain_max=self.domain_max,
            domain_step=self.domain_step,
        )

    @classmethod
    def from_proto(cls, m: pb.Parameter) -> "Parameter":
        return cls(
            id=m.id,
            name=m.name,
            data_type=m.data_type,
            value=m.value,
            domain_kind=m.domain_kind,
            domain_values=list(m.domain_values),
            domain_min=m.domain_min,
            domain_max=m.domain_max,
            domain_step=m.domain_step,
        )


@dataclass
class LodCalculation:
    id: str
    lod_kind: str
    lod_dims: list[Field] = field(default_factory=list)
    inner_calculation: Optional[Calculation] = None
    outer_aggregation: AggType = AggType.AGG_TYPE_SUM

    def to_proto(self) -> pb.LodCalculation:
        out = pb.LodCalculation(
            id=self.id,
            lod_kind=self.lod_kind,
            lod_dims=[d.to_proto() for d in self.lod_dims],
            outer_aggregation=self.outer_aggregation,
        )
        if self.inner_calculation is not None:
            out.inner_calculation.CopyFrom(self.inner_calculation.to_proto())
        return out

    @classmethod
    def from_proto(cls, m: pb.LodCalculation) -> "LodCalculation":
        return cls(
            id=m.id,
            lod_kind=m.lod_kind,
            lod_dims=[Field.from_proto(d) for d in m.lod_dims],
            inner_calculation=(
                Calculation.from_proto(m.inner_calculation)
                if m.HasField("inner_calculation")
                else None
            ),
            outer_aggregation=m.outer_aggregation,
        )


@dataclass
class AnalyticsSlot:
    id: str
    kind: str
    properties: dict[str, str] = field(default_factory=dict)


@dataclass
class Analytics:
    slots: list[AnalyticsSlot] = field(default_factory=list)

    def to_proto(self) -> pb.Analytics:
        out = pb.Analytics()
        for s in self.slots:
            slot = out.slots.add()
            slot.id = s.id
            slot.kind = s.kind
            for k, v in s.properties.items():
                slot.properties[k] = v
        return out

    @classmethod
    def from_proto(cls, m: pb.Analytics) -> "Analytics":
        return cls(
            slots=[
                AnalyticsSlot(id=s.id, kind=s.kind, properties=dict(s.properties))
                for s in m.slots
            ],
        )


@dataclass
class VisualSpec:
    sheet_id: str
    fields: list[Field] = field(default_factory=list)
    shelves: list[Shelf] = field(default_factory=list)
    encodings: list[Encoding] = field(default_factory=list)
    filters: list[FilterSpec] = field(default_factory=list)
    parameters: list[Parameter] = field(default_factory=list)
    lod_calculations: list[LodCalculation] = field(default_factory=list)
    mark_type: MarkType = MarkType.MARK_TYPE_UNSPECIFIED
    analytics: Analytics = field(default_factory=Analytics)
    is_generative_ai_web_authoring: bool = False
    domain_type: str = "separate"
    # Plan 8b §V.2 — JoinLODOverrides: per-viz list of LodCalculation IDs
    # whose placement was hand-edited in the .twb XML. `place_lod_in_order`
    # skips these so the user's manual choice is preserved.
    join_lod_overrides: list[str] = field(default_factory=list)
    # Plan 8c §V.3 — table-calc specs attached to this viz; resolution
    # is split per spec.function:
    #   server-side: lowered to LogicalOpOver by table_calc.compile_table_calc
    #   client-side: forwarded to frontend evaluator post-fetch
    #
    # NOTE: This field is intentionally Python-only. The matching proto
    # `TableCalcSpec` message + `repeated TableCalcSpec table_calc_specs = 16`
    # are declared in `backend/proto/askdb/vizdataservice/v1.proto` but the
    # generated `v1_pb2.py` was not regenerated in this scaffolding pass
    # (Plan 8c T8) because protoc was not available in the worktree
    # environment. `to_proto`/`from_proto` therefore skip the field; an
    # integration agent should run `bash backend/scripts/regen_proto.sh`
    # and then wire the proto round-trip following the pattern below.
    table_calc_specs: list["TableCalcSpec"] = field(default_factory=list)
    # Plan 10a §XIV.1 — workbook-scoped format rules resolved at render via
    # the Mark > Field > Worksheet > DataSource > Workbook precedence chain.
    formatting: list[StyleRule] = field(default_factory=list)

    def viz_granularity(self) -> frozenset[str]:
        """Plan 8b §V.4 — union of dimension pills on Rows, Columns, Detail,
        Path, and Pages shelves. Measure pills are excluded; the Filters
        shelf is excluded (its pills narrow data, they do not define
        granularity).

        The returned set holds `Field.id` values (the stable column
        identifier) and can be compared directly with a FIXED LOD's
        declared dims to decide whether the FIXED subquery is redundant.
        """
        granularity_shelves: frozenset[int] = frozenset({
            ShelfKind.SHELF_KIND_ROW,
            ShelfKind.SHELF_KIND_COLUMN,
            ShelfKind.SHELF_KIND_DETAIL,
            ShelfKind.SHELF_KIND_PATH,
            ShelfKind.SHELF_KIND_PAGES,
        })
        out: set[str] = set()
        for shelf in self.shelves:
            if shelf.kind not in granularity_shelves:
                continue
            for f in shelf.fields:
                if f.role == FieldRole.FIELD_ROLE_DIMENSION:
                    out.add(f.id)
        return frozenset(out)

    def to_proto(self) -> pb.VisualSpec:
        proto = pb.VisualSpec(
            sheet_id=self.sheet_id,
            fields=[f.to_proto() for f in self.fields],
            shelves=[s.to_proto() for s in self.shelves],
            encodings=[e.to_proto() for e in self.encodings],
            filters=[f.to_proto() for f in self.filters],
            parameters=[p.to_proto() for p in self.parameters],
            lod_calculations=[l.to_proto() for l in self.lod_calculations],
            mark_type=self.mark_type,
            analytics=self.analytics.to_proto(),
            is_generative_ai_web_authoring=self.is_generative_ai_web_authoring,
            domain_type=self.domain_type,
            join_lod_overrides=list(self.join_lod_overrides),
        )
        for rule in self.formatting:
            kind, sid = _selector_to_proto_pair(rule.selector)
            proto_rule = proto.formatting.add()
            proto_rule.selector.kind = kind
            proto_rule.selector.id = sid
            for prop, value in rule.properties.items():
                proto_rule.properties[prop.value] = _value_to_wire(value)
        return proto

    @classmethod
    def from_proto(cls, m: pb.VisualSpec) -> "VisualSpec":
        formatting: list[StyleRule] = []
        for proto_rule in getattr(m, "formatting", []):
            kind = proto_rule.selector.kind
            selector = _SELECTOR_CTOR[kind](proto_rule.selector.id)
            props: dict[StyleProp, object] = {}
            for raw_key, raw_val in proto_rule.properties.items():
                try:
                    key = StyleProp(raw_key)
                except ValueError:
                    continue  # forward-compat: skip unknown props
                props[key] = _value_from_wire(key, raw_val)
            formatting.append(StyleRule(selector=selector, properties=props))
        return cls(
            sheet_id=m.sheet_id,
            fields=[Field.from_proto(f) for f in m.fields],
            shelves=[Shelf.from_proto(s) for s in m.shelves],
            encodings=[Encoding.from_proto(e) for e in m.encodings],
            filters=[FilterSpec.from_proto(f) for f in m.filters],
            parameters=[Parameter.from_proto(p) for p in m.parameters],
            lod_calculations=[LodCalculation.from_proto(l) for l in m.lod_calculations],
            mark_type=m.mark_type,
            analytics=Analytics.from_proto(m.analytics),
            is_generative_ai_web_authoring=m.is_generative_ai_web_authoring,
            domain_type=m.domain_type or "separate",
            join_lod_overrides=list(m.join_lod_overrides),
            formatting=formatting,
        )

    def serialize(self) -> bytes:
        return self.to_proto().SerializeToString()

    @classmethod
    def deserialize(cls, data: bytes) -> "VisualSpec":
        m = pb.VisualSpec()
        m.ParseFromString(data)
        return cls.from_proto(m)


_SELECTOR_CTOR = {
    "mark": lambda id_: MarkSelector(mark_id=id_),
    "field": lambda id_: FieldSelector(field_id=id_),
    "sheet": lambda id_: WorksheetSelector(sheet_id=id_),
    "ds": lambda id_: DataSourceSelector(ds_id=id_),
    "workbook": lambda _id: WorkbookSelector(),
}


def _selector_to_proto_pair(selector) -> tuple[str, str]:
    if isinstance(selector, MarkSelector): return ("mark", selector.mark_id)
    if isinstance(selector, FieldSelector): return ("field", selector.field_id)
    if isinstance(selector, WorksheetSelector): return ("sheet", selector.sheet_id)
    if isinstance(selector, DataSourceSelector): return ("ds", selector.ds_id)
    if isinstance(selector, WorkbookSelector): return ("workbook", "")
    raise ValueError(f"unknown selector: {type(selector).__name__}")


def _value_to_wire(value) -> str:
    if isinstance(value, bool): return "true" if value else "false"
    return str(value)


def _value_from_wire(prop: StyleProp, wire: str) -> object:
    numeric_props = {
        StyleProp.FONT_SIZE, StyleProp.LINE_HEIGHT,
        StyleProp.PANE_LINE_THICKNESS, StyleProp.PADDING,
    }
    bool_props = {StyleProp.SHOW_COLUMN_BANDING, StyleProp.SHOW_ROW_BANDING}
    if prop in bool_props: return wire == "true"
    if prop in numeric_props:
        try: return int(wire)
        except ValueError: return float(wire)
    return wire


__all__ = [
    "DataType", "FieldRole", "ColumnClass", "MarkType", "EncodingType",
    "ShelfKind", "FilterKind", "AggType",
    "Field", "Calculation", "Shelf", "Encoding",
    "CategoricalFilterProps", "HierarchicalFilterProps",
    "RangeFilterProps", "RelativeDateFilterProps", "FilterSpec",
    "Parameter", "LodCalculation", "AnalyticsSlot", "Analytics",
    "VisualSpec",
]
