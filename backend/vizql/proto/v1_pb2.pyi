from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import Any as _Any, ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class DataType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    DATA_TYPE_UNSPECIFIED: _ClassVar[DataType]
    DATA_TYPE_BOOL: _ClassVar[DataType]
    DATA_TYPE_BOOLEAN: _ClassVar[DataType]
    DATA_TYPE_DATE: _ClassVar[DataType]
    DATA_TYPE_DATE_TIME: _ClassVar[DataType]
    DATA_TYPE_FLOAT: _ClassVar[DataType]
    DATA_TYPE_INT: _ClassVar[DataType]
    DATA_TYPE_NUMBER: _ClassVar[DataType]
    DATA_TYPE_SPATIAL: _ClassVar[DataType]
    DATA_TYPE_STRING: _ClassVar[DataType]
    DATA_TYPE_UNKNOWN: _ClassVar[DataType]

class FieldRole(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    FIELD_ROLE_UNSPECIFIED: _ClassVar[FieldRole]
    FIELD_ROLE_DIMENSION: _ClassVar[FieldRole]
    FIELD_ROLE_MEASURE: _ClassVar[FieldRole]
    FIELD_ROLE_UNKNOWN: _ClassVar[FieldRole]

class ColumnClass(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    COLUMN_CLASS_UNSPECIFIED: _ClassVar[ColumnClass]
    COLUMN_CLASS_CATEGORICAL_BIN: _ClassVar[ColumnClass]
    COLUMN_CLASS_DANGLING: _ClassVar[ColumnClass]
    COLUMN_CLASS_DATABASE: _ClassVar[ColumnClass]
    COLUMN_CLASS_GROUP: _ClassVar[ColumnClass]
    COLUMN_CLASS_INSTANCE: _ClassVar[ColumnClass]
    COLUMN_CLASS_LOCAL_DATA: _ClassVar[ColumnClass]
    COLUMN_CLASS_MDX_CALC: _ClassVar[ColumnClass]
    COLUMN_CLASS_METADATA: _ClassVar[ColumnClass]
    COLUMN_CLASS_NUMERIC_BIN: _ClassVar[ColumnClass]
    COLUMN_CLASS_USER_CALC: _ClassVar[ColumnClass]
    COLUMN_CLASS_VISUAL_DATA: _ClassVar[ColumnClass]

class MarkType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    MARK_TYPE_UNSPECIFIED: _ClassVar[MarkType]
    MARK_TYPE_BAR: _ClassVar[MarkType]
    MARK_TYPE_LINE: _ClassVar[MarkType]
    MARK_TYPE_AREA: _ClassVar[MarkType]
    MARK_TYPE_PIE: _ClassVar[MarkType]
    MARK_TYPE_CIRCLE: _ClassVar[MarkType]
    MARK_TYPE_SQUARE: _ClassVar[MarkType]
    MARK_TYPE_TEXT: _ClassVar[MarkType]
    MARK_TYPE_SHAPE: _ClassVar[MarkType]
    MARK_TYPE_MAP: _ClassVar[MarkType]
    MARK_TYPE_POLYGON: _ClassVar[MarkType]
    MARK_TYPE_HEATMAP: _ClassVar[MarkType]
    MARK_TYPE_GANTT_BAR: _ClassVar[MarkType]
    MARK_TYPE_VIZ_EXTENSION: _ClassVar[MarkType]

class EncodingType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ENCODING_TYPE_UNSPECIFIED: _ClassVar[EncodingType]
    ENCODING_TYPE_COLOR: _ClassVar[EncodingType]
    ENCODING_TYPE_SIZE: _ClassVar[EncodingType]
    ENCODING_TYPE_SHAPE: _ClassVar[EncodingType]
    ENCODING_TYPE_LABEL: _ClassVar[EncodingType]
    ENCODING_TYPE_TOOLTIP: _ClassVar[EncodingType]
    ENCODING_TYPE_DETAIL: _ClassVar[EncodingType]
    ENCODING_TYPE_PATH: _ClassVar[EncodingType]
    ENCODING_TYPE_ANGLE: _ClassVar[EncodingType]
    ENCODING_TYPE_GEOMETRY: _ClassVar[EncodingType]
    ENCODING_TYPE_CUSTOM: _ClassVar[EncodingType]

class ShelfKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SHELF_KIND_UNSPECIFIED: _ClassVar[ShelfKind]
    SHELF_KIND_ROW: _ClassVar[ShelfKind]
    SHELF_KIND_COLUMN: _ClassVar[ShelfKind]
    SHELF_KIND_DETAIL: _ClassVar[ShelfKind]
    SHELF_KIND_COLOR: _ClassVar[ShelfKind]
    SHELF_KIND_SIZE: _ClassVar[ShelfKind]
    SHELF_KIND_SHAPE: _ClassVar[ShelfKind]
    SHELF_KIND_LABEL: _ClassVar[ShelfKind]
    SHELF_KIND_PATH: _ClassVar[ShelfKind]
    SHELF_KIND_ANGLE: _ClassVar[ShelfKind]
    SHELF_KIND_TOOLTIP: _ClassVar[ShelfKind]
    SHELF_KIND_PAGES: _ClassVar[ShelfKind]
    SHELF_KIND_FILTER: _ClassVar[ShelfKind]

class FilterKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    FILTER_KIND_UNSPECIFIED: _ClassVar[FilterKind]
    FILTER_KIND_CATEGORICAL: _ClassVar[FilterKind]
    FILTER_KIND_HIERARCHICAL: _ClassVar[FilterKind]
    FILTER_KIND_RANGE: _ClassVar[FilterKind]
    FILTER_KIND_RELATIVE_DATE: _ClassVar[FilterKind]

class AggType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    AGG_TYPE_UNSPECIFIED: _ClassVar[AggType]
    AGG_TYPE_SUM: _ClassVar[AggType]
    AGG_TYPE_AVG: _ClassVar[AggType]
    AGG_TYPE_COUNT: _ClassVar[AggType]
    AGG_TYPE_COUNTD: _ClassVar[AggType]
    AGG_TYPE_MIN: _ClassVar[AggType]
    AGG_TYPE_MAX: _ClassVar[AggType]
    AGG_TYPE_MEDIAN: _ClassVar[AggType]
    AGG_TYPE_VAR: _ClassVar[AggType]
    AGG_TYPE_VARP: _ClassVar[AggType]
    AGG_TYPE_STDEV: _ClassVar[AggType]
    AGG_TYPE_STDEVP: _ClassVar[AggType]
    AGG_TYPE_KURTOSIS: _ClassVar[AggType]
    AGG_TYPE_SKEWNESS: _ClassVar[AggType]
    AGG_TYPE_ATTR: _ClassVar[AggType]
    AGG_TYPE_NONE: _ClassVar[AggType]
    AGG_TYPE_PERCENTILE: _ClassVar[AggType]
    AGG_TYPE_COLLECT: _ClassVar[AggType]
    AGG_TYPE_IN_OUT: _ClassVar[AggType]
    AGG_TYPE_END: _ClassVar[AggType]
    AGG_TYPE_QUART1: _ClassVar[AggType]
    AGG_TYPE_QUART3: _ClassVar[AggType]
    AGG_TYPE_USER: _ClassVar[AggType]
    AGG_TYPE_YEAR: _ClassVar[AggType]
    AGG_TYPE_QTR: _ClassVar[AggType]
    AGG_TYPE_MONTH: _ClassVar[AggType]
    AGG_TYPE_WEEK: _ClassVar[AggType]
    AGG_TYPE_DAY: _ClassVar[AggType]
    AGG_TYPE_HOUR: _ClassVar[AggType]
    AGG_TYPE_MINUTE: _ClassVar[AggType]
    AGG_TYPE_SECOND: _ClassVar[AggType]
    AGG_TYPE_WEEKDAY: _ClassVar[AggType]
    AGG_TYPE_MONTH_YEAR: _ClassVar[AggType]
    AGG_TYPE_MDY: _ClassVar[AggType]
    AGG_TYPE_TRUNC_YEAR: _ClassVar[AggType]
    AGG_TYPE_TRUNC_QTR: _ClassVar[AggType]
    AGG_TYPE_TRUNC_MONTH: _ClassVar[AggType]
    AGG_TYPE_TRUNC_WEEK: _ClassVar[AggType]
    AGG_TYPE_TRUNC_DAY: _ClassVar[AggType]
    AGG_TYPE_TRUNC_HOUR: _ClassVar[AggType]
    AGG_TYPE_TRUNC_MINUTE: _ClassVar[AggType]
    AGG_TYPE_TRUNC_SECOND: _ClassVar[AggType]
DATA_TYPE_UNSPECIFIED: DataType
DATA_TYPE_BOOL: DataType
DATA_TYPE_BOOLEAN: DataType
DATA_TYPE_DATE: DataType
DATA_TYPE_DATE_TIME: DataType
DATA_TYPE_FLOAT: DataType
DATA_TYPE_INT: DataType
DATA_TYPE_NUMBER: DataType
DATA_TYPE_SPATIAL: DataType
DATA_TYPE_STRING: DataType
DATA_TYPE_UNKNOWN: DataType
FIELD_ROLE_UNSPECIFIED: FieldRole
FIELD_ROLE_DIMENSION: FieldRole
FIELD_ROLE_MEASURE: FieldRole
FIELD_ROLE_UNKNOWN: FieldRole
COLUMN_CLASS_UNSPECIFIED: ColumnClass
COLUMN_CLASS_CATEGORICAL_BIN: ColumnClass
COLUMN_CLASS_DANGLING: ColumnClass
COLUMN_CLASS_DATABASE: ColumnClass
COLUMN_CLASS_GROUP: ColumnClass
COLUMN_CLASS_INSTANCE: ColumnClass
COLUMN_CLASS_LOCAL_DATA: ColumnClass
COLUMN_CLASS_MDX_CALC: ColumnClass
COLUMN_CLASS_METADATA: ColumnClass
COLUMN_CLASS_NUMERIC_BIN: ColumnClass
COLUMN_CLASS_USER_CALC: ColumnClass
COLUMN_CLASS_VISUAL_DATA: ColumnClass
MARK_TYPE_UNSPECIFIED: MarkType
MARK_TYPE_BAR: MarkType
MARK_TYPE_LINE: MarkType
MARK_TYPE_AREA: MarkType
MARK_TYPE_PIE: MarkType
MARK_TYPE_CIRCLE: MarkType
MARK_TYPE_SQUARE: MarkType
MARK_TYPE_TEXT: MarkType
MARK_TYPE_SHAPE: MarkType
MARK_TYPE_MAP: MarkType
MARK_TYPE_POLYGON: MarkType
MARK_TYPE_HEATMAP: MarkType
MARK_TYPE_GANTT_BAR: MarkType
MARK_TYPE_VIZ_EXTENSION: MarkType
ENCODING_TYPE_UNSPECIFIED: EncodingType
ENCODING_TYPE_COLOR: EncodingType
ENCODING_TYPE_SIZE: EncodingType
ENCODING_TYPE_SHAPE: EncodingType
ENCODING_TYPE_LABEL: EncodingType
ENCODING_TYPE_TOOLTIP: EncodingType
ENCODING_TYPE_DETAIL: EncodingType
ENCODING_TYPE_PATH: EncodingType
ENCODING_TYPE_ANGLE: EncodingType
ENCODING_TYPE_GEOMETRY: EncodingType
ENCODING_TYPE_CUSTOM: EncodingType
SHELF_KIND_UNSPECIFIED: ShelfKind
SHELF_KIND_ROW: ShelfKind
SHELF_KIND_COLUMN: ShelfKind
SHELF_KIND_DETAIL: ShelfKind
SHELF_KIND_COLOR: ShelfKind
SHELF_KIND_SIZE: ShelfKind
SHELF_KIND_SHAPE: ShelfKind
SHELF_KIND_LABEL: ShelfKind
SHELF_KIND_PATH: ShelfKind
SHELF_KIND_ANGLE: ShelfKind
SHELF_KIND_TOOLTIP: ShelfKind
SHELF_KIND_PAGES: ShelfKind
SHELF_KIND_FILTER: ShelfKind
FILTER_KIND_UNSPECIFIED: FilterKind
FILTER_KIND_CATEGORICAL: FilterKind
FILTER_KIND_HIERARCHICAL: FilterKind
FILTER_KIND_RANGE: FilterKind
FILTER_KIND_RELATIVE_DATE: FilterKind
AGG_TYPE_UNSPECIFIED: AggType
AGG_TYPE_SUM: AggType
AGG_TYPE_AVG: AggType
AGG_TYPE_COUNT: AggType
AGG_TYPE_COUNTD: AggType
AGG_TYPE_MIN: AggType
AGG_TYPE_MAX: AggType
AGG_TYPE_MEDIAN: AggType
AGG_TYPE_VAR: AggType
AGG_TYPE_VARP: AggType
AGG_TYPE_STDEV: AggType
AGG_TYPE_STDEVP: AggType
AGG_TYPE_KURTOSIS: AggType
AGG_TYPE_SKEWNESS: AggType
AGG_TYPE_ATTR: AggType
AGG_TYPE_NONE: AggType
AGG_TYPE_PERCENTILE: AggType
AGG_TYPE_COLLECT: AggType
AGG_TYPE_IN_OUT: AggType
AGG_TYPE_END: AggType
AGG_TYPE_QUART1: AggType
AGG_TYPE_QUART3: AggType
AGG_TYPE_USER: AggType
AGG_TYPE_YEAR: AggType
AGG_TYPE_QTR: AggType
AGG_TYPE_MONTH: AggType
AGG_TYPE_WEEK: AggType
AGG_TYPE_DAY: AggType
AGG_TYPE_HOUR: AggType
AGG_TYPE_MINUTE: AggType
AGG_TYPE_SECOND: AggType
AGG_TYPE_WEEKDAY: AggType
AGG_TYPE_MONTH_YEAR: AggType
AGG_TYPE_MDY: AggType
AGG_TYPE_TRUNC_YEAR: AggType
AGG_TYPE_TRUNC_QTR: AggType
AGG_TYPE_TRUNC_MONTH: AggType
AGG_TYPE_TRUNC_WEEK: AggType
AGG_TYPE_TRUNC_DAY: AggType
AGG_TYPE_TRUNC_HOUR: AggType
AGG_TYPE_TRUNC_MINUTE: AggType
AGG_TYPE_TRUNC_SECOND: AggType

class Field(_message.Message):
    __slots__ = ("id", "data_type", "role", "semantic_role", "aggregation", "is_disagg", "column_class")
    ID_FIELD_NUMBER: _ClassVar[int]
    DATA_TYPE_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    SEMANTIC_ROLE_FIELD_NUMBER: _ClassVar[int]
    AGGREGATION_FIELD_NUMBER: _ClassVar[int]
    IS_DISAGG_FIELD_NUMBER: _ClassVar[int]
    COLUMN_CLASS_FIELD_NUMBER: _ClassVar[int]
    id: str
    data_type: DataType
    role: FieldRole
    semantic_role: str
    aggregation: AggType
    is_disagg: bool
    column_class: ColumnClass
    def __init__(self, id: _Optional[str] = ..., data_type: _Optional[_Union[DataType, str]] = ..., role: _Optional[_Union[FieldRole, str]] = ..., semantic_role: _Optional[str] = ..., aggregation: _Optional[_Union[AggType, str]] = ..., is_disagg: bool = ..., column_class: _Optional[_Union[ColumnClass, str]] = ...) -> None: ...

class Calculation(_message.Message):
    __slots__ = ("id", "formula", "is_adhoc")
    ID_FIELD_NUMBER: _ClassVar[int]
    FORMULA_FIELD_NUMBER: _ClassVar[int]
    IS_ADHOC_FIELD_NUMBER: _ClassVar[int]
    id: str
    formula: str
    is_adhoc: bool
    def __init__(self, id: _Optional[str] = ..., formula: _Optional[str] = ..., is_adhoc: bool = ...) -> None: ...

class Shelf(_message.Message):
    __slots__ = ("kind", "fields")
    KIND_FIELD_NUMBER: _ClassVar[int]
    FIELDS_FIELD_NUMBER: _ClassVar[int]
    kind: ShelfKind
    fields: _containers.RepeatedCompositeFieldContainer[Field]
    def __init__(self, kind: _Optional[_Union[ShelfKind, str]] = ..., fields: _Optional[_Iterable[_Union[Field, _Mapping[_Any, _Any]]]] = ...) -> None: ...

class Encoding(_message.Message):
    __slots__ = ("field_encoding_id", "encoding_type", "custom_encoding_type_id", "field")
    FIELD_ENCODING_ID_FIELD_NUMBER: _ClassVar[int]
    ENCODING_TYPE_FIELD_NUMBER: _ClassVar[int]
    CUSTOM_ENCODING_TYPE_ID_FIELD_NUMBER: _ClassVar[int]
    FIELD_FIELD_NUMBER: _ClassVar[int]
    field_encoding_id: str
    encoding_type: EncodingType
    custom_encoding_type_id: str
    field: Field
    def __init__(self, field_encoding_id: _Optional[str] = ..., encoding_type: _Optional[_Union[EncodingType, str]] = ..., custom_encoding_type_id: _Optional[str] = ..., field: _Optional[_Union[Field, _Mapping[_Any, _Any]]] = ...) -> None: ...

class CategoricalFilterProps(_message.Message):
    __slots__ = ("values", "is_exclude_mode", "case_sensitive")
    VALUES_FIELD_NUMBER: _ClassVar[int]
    IS_EXCLUDE_MODE_FIELD_NUMBER: _ClassVar[int]
    CASE_SENSITIVE_FIELD_NUMBER: _ClassVar[int]
    values: _containers.RepeatedScalarFieldContainer[str]
    is_exclude_mode: bool
    case_sensitive: bool
    def __init__(self, values: _Optional[_Iterable[str]] = ..., is_exclude_mode: bool = ..., case_sensitive: bool = ...) -> None: ...

class HierarchicalFilterProps(_message.Message):
    __slots__ = ("filter_levels", "hier_val_selection_models")
    FILTER_LEVELS_FIELD_NUMBER: _ClassVar[int]
    HIER_VAL_SELECTION_MODELS_FIELD_NUMBER: _ClassVar[int]
    filter_levels: _containers.RepeatedScalarFieldContainer[str]
    hier_val_selection_models: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, filter_levels: _Optional[_Iterable[str]] = ..., hier_val_selection_models: _Optional[_Iterable[str]] = ...) -> None: ...

class RangeFilterProps(_message.Message):
    __slots__ = ("min", "max", "range_null_option")
    MIN_FIELD_NUMBER: _ClassVar[int]
    MAX_FIELD_NUMBER: _ClassVar[int]
    RANGE_NULL_OPTION_FIELD_NUMBER: _ClassVar[int]
    min: float
    max: float
    range_null_option: str
    def __init__(self, min: _Optional[float] = ..., max: _Optional[float] = ..., range_null_option: _Optional[str] = ...) -> None: ...

class RelativeDateFilterProps(_message.Message):
    __slots__ = ("anchor_date", "period_type", "date_range_type", "range_n")
    ANCHOR_DATE_FIELD_NUMBER: _ClassVar[int]
    PERIOD_TYPE_FIELD_NUMBER: _ClassVar[int]
    DATE_RANGE_TYPE_FIELD_NUMBER: _ClassVar[int]
    RANGE_N_FIELD_NUMBER: _ClassVar[int]
    anchor_date: str
    period_type: str
    date_range_type: str
    range_n: int
    def __init__(self, anchor_date: _Optional[str] = ..., period_type: _Optional[str] = ..., date_range_type: _Optional[str] = ..., range_n: _Optional[int] = ...) -> None: ...

class FilterSpec(_message.Message):
    __slots__ = ("filter_kind", "field", "categorical", "hierarchical", "range", "relative_date", "has_null", "include_null", "is_logical_table_scoped_filter", "filter_stage", "filter_properties")
    class FilterPropertiesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    FILTER_KIND_FIELD_NUMBER: _ClassVar[int]
    FIELD_FIELD_NUMBER: _ClassVar[int]
    CATEGORICAL_FIELD_NUMBER: _ClassVar[int]
    HIERARCHICAL_FIELD_NUMBER: _ClassVar[int]
    RANGE_FIELD_NUMBER: _ClassVar[int]
    RELATIVE_DATE_FIELD_NUMBER: _ClassVar[int]
    HAS_NULL_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_NULL_FIELD_NUMBER: _ClassVar[int]
    IS_LOGICAL_TABLE_SCOPED_FILTER_FIELD_NUMBER: _ClassVar[int]
    FILTER_STAGE_FIELD_NUMBER: _ClassVar[int]
    FILTER_PROPERTIES_FIELD_NUMBER: _ClassVar[int]
    filter_kind: FilterKind
    field: Field
    categorical: CategoricalFilterProps
    hierarchical: HierarchicalFilterProps
    range: RangeFilterProps
    relative_date: RelativeDateFilterProps
    has_null: bool
    include_null: bool
    is_logical_table_scoped_filter: bool
    filter_stage: str
    filter_properties: _containers.ScalarMap[str, str]
    def __init__(self, filter_kind: _Optional[_Union[FilterKind, str]] = ..., field: _Optional[_Union[Field, _Mapping[_Any, _Any]]] = ..., categorical: _Optional[_Union[CategoricalFilterProps, _Mapping[_Any, _Any]]] = ..., hierarchical: _Optional[_Union[HierarchicalFilterProps, _Mapping[_Any, _Any]]] = ..., range: _Optional[_Union[RangeFilterProps, _Mapping[_Any, _Any]]] = ..., relative_date: _Optional[_Union[RelativeDateFilterProps, _Mapping[_Any, _Any]]] = ..., has_null: bool = ..., include_null: bool = ..., is_logical_table_scoped_filter: bool = ..., filter_stage: _Optional[str] = ..., filter_properties: _Optional[_Mapping[str, str]] = ...) -> None: ...

class Parameter(_message.Message):
    __slots__ = ("id", "name", "data_type", "value", "domain_kind", "domain_values", "domain_min", "domain_max", "domain_step")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DATA_TYPE_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    DOMAIN_KIND_FIELD_NUMBER: _ClassVar[int]
    DOMAIN_VALUES_FIELD_NUMBER: _ClassVar[int]
    DOMAIN_MIN_FIELD_NUMBER: _ClassVar[int]
    DOMAIN_MAX_FIELD_NUMBER: _ClassVar[int]
    DOMAIN_STEP_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    data_type: DataType
    value: str
    domain_kind: str
    domain_values: _containers.RepeatedScalarFieldContainer[str]
    domain_min: float
    domain_max: float
    domain_step: float
    def __init__(self, id: _Optional[str] = ..., name: _Optional[str] = ..., data_type: _Optional[_Union[DataType, str]] = ..., value: _Optional[str] = ..., domain_kind: _Optional[str] = ..., domain_values: _Optional[_Iterable[str]] = ..., domain_min: _Optional[float] = ..., domain_max: _Optional[float] = ..., domain_step: _Optional[float] = ...) -> None: ...

class LodCalculation(_message.Message):
    __slots__ = ("id", "lod_kind", "lod_dims", "inner_calculation", "outer_aggregation")
    ID_FIELD_NUMBER: _ClassVar[int]
    LOD_KIND_FIELD_NUMBER: _ClassVar[int]
    LOD_DIMS_FIELD_NUMBER: _ClassVar[int]
    INNER_CALCULATION_FIELD_NUMBER: _ClassVar[int]
    OUTER_AGGREGATION_FIELD_NUMBER: _ClassVar[int]
    id: str
    lod_kind: str
    lod_dims: _containers.RepeatedCompositeFieldContainer[Field]
    inner_calculation: Calculation
    outer_aggregation: AggType
    def __init__(self, id: _Optional[str] = ..., lod_kind: _Optional[str] = ..., lod_dims: _Optional[_Iterable[_Union[Field, _Mapping[_Any, _Any]]]] = ..., inner_calculation: _Optional[_Union[Calculation, _Mapping[_Any, _Any]]] = ..., outer_aggregation: _Optional[_Union[AggType, str]] = ...) -> None: ...

class Analytics(_message.Message):
    __slots__ = ("slots",)
    class Slot(_message.Message):
        __slots__ = ("id", "kind", "properties")
        class PropertiesEntry(_message.Message):
            __slots__ = ("key", "value")
            KEY_FIELD_NUMBER: _ClassVar[int]
            VALUE_FIELD_NUMBER: _ClassVar[int]
            key: str
            value: str
            def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
        ID_FIELD_NUMBER: _ClassVar[int]
        KIND_FIELD_NUMBER: _ClassVar[int]
        PROPERTIES_FIELD_NUMBER: _ClassVar[int]
        id: str
        kind: str
        properties: _containers.ScalarMap[str, str]
        def __init__(self, id: _Optional[str] = ..., kind: _Optional[str] = ..., properties: _Optional[_Mapping[str, str]] = ...) -> None: ...
    SLOTS_FIELD_NUMBER: _ClassVar[int]
    slots: _containers.RepeatedCompositeFieldContainer[Analytics.Slot]
    def __init__(self, slots: _Optional[_Iterable[_Union[Analytics.Slot, _Mapping[_Any, _Any]]]] = ...) -> None: ...

class VisualSpec(_message.Message):
    __slots__ = ("sheet_id", "fields", "shelves", "encodings", "filters", "parameters", "lod_calculations", "mark_type", "analytics", "is_generative_ai_web_authoring", "domain_type", "join_lod_overrides")
    SHEET_ID_FIELD_NUMBER: _ClassVar[int]
    FIELDS_FIELD_NUMBER: _ClassVar[int]
    SHELVES_FIELD_NUMBER: _ClassVar[int]
    ENCODINGS_FIELD_NUMBER: _ClassVar[int]
    FILTERS_FIELD_NUMBER: _ClassVar[int]
    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    LOD_CALCULATIONS_FIELD_NUMBER: _ClassVar[int]
    MARK_TYPE_FIELD_NUMBER: _ClassVar[int]
    ANALYTICS_FIELD_NUMBER: _ClassVar[int]
    IS_GENERATIVE_AI_WEB_AUTHORING_FIELD_NUMBER: _ClassVar[int]
    DOMAIN_TYPE_FIELD_NUMBER: _ClassVar[int]
    JOIN_LOD_OVERRIDES_FIELD_NUMBER: _ClassVar[int]
    sheet_id: str
    fields: _containers.RepeatedCompositeFieldContainer[Field]
    shelves: _containers.RepeatedCompositeFieldContainer[Shelf]
    encodings: _containers.RepeatedCompositeFieldContainer[Encoding]
    filters: _containers.RepeatedCompositeFieldContainer[FilterSpec]
    parameters: _containers.RepeatedCompositeFieldContainer[Parameter]
    lod_calculations: _containers.RepeatedCompositeFieldContainer[LodCalculation]
    mark_type: MarkType
    analytics: Analytics
    is_generative_ai_web_authoring: bool
    domain_type: str
    join_lod_overrides: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, sheet_id: _Optional[str] = ..., fields: _Optional[_Iterable[_Union[Field, _Mapping[_Any, _Any]]]] = ..., shelves: _Optional[_Iterable[_Union[Shelf, _Mapping[_Any, _Any]]]] = ..., encodings: _Optional[_Iterable[_Union[Encoding, _Mapping[_Any, _Any]]]] = ..., filters: _Optional[_Iterable[_Union[FilterSpec, _Mapping[_Any, _Any]]]] = ..., parameters: _Optional[_Iterable[_Union[Parameter, _Mapping[_Any, _Any]]]] = ..., lod_calculations: _Optional[_Iterable[_Union[LodCalculation, _Mapping[_Any, _Any]]]] = ..., mark_type: _Optional[_Union[MarkType, str]] = ..., analytics: _Optional[_Union[Analytics, _Mapping[_Any, _Any]]] = ..., is_generative_ai_web_authoring: bool = ..., domain_type: _Optional[str] = ..., join_lod_overrides: _Optional[_Iterable[str]] = ...) -> None: ...
