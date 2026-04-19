/**
 * VisualSpec IR — hand-authored builders + re-exports over the
 * generated protobuf types in ./vizSpecGenerated.
 *
 * App code never imports ./vizSpecGenerated directly — always via
 * this module so we can add ergonomic defaults + guard invariants in
 * one place (e.g. `makeVisualSpec` seeds an empty Analytics object).
 *
 * Protobuf round-trip lives in the __tests__ suite. The browser bundle
 * does NOT ship the protobuf runtime; server boundaries either use JSON
 * (via `VisualSpec.toJSON` / `.fromJSON` from the generated module) or
 * the Python side owns serialisation.
 */

import {
  VisualSpec as PbVisualSpec,
  Field as PbField,
  Shelf as PbShelf,
  Encoding as PbEncoding,
  FilterSpec as PbFilterSpec,
  Parameter as PbParameter,
  LodCalculation as PbLodCalculation,
  Analytics as PbAnalytics,
  Calculation as PbCalculation,
  CategoricalFilterProps as PbCategoricalFilterProps,
  HierarchicalFilterProps as PbHierarchicalFilterProps,
  RangeFilterProps as PbRangeFilterProps,
  RelativeDateFilterProps as PbRelativeDateFilterProps,
  DataType,
  FieldRole,
  ColumnClass,
  MarkType,
  EncodingType,
  ShelfKind,
  FilterKind,
  AggType,
} from './vizSpecGenerated';

// Re-export generated types under their natural names for app code.
export type VisualSpec = PbVisualSpec;
export type Field = PbField;
export type Shelf = PbShelf;
export type Encoding = PbEncoding;
export type FilterSpec = PbFilterSpec;
export type Parameter = PbParameter;
export type LodCalculation = PbLodCalculation;
export type Analytics = PbAnalytics;
export type Calculation = PbCalculation;
export type CategoricalFilterProps = PbCategoricalFilterProps;
export type HierarchicalFilterProps = PbHierarchicalFilterProps;
export type RangeFilterProps = PbRangeFilterProps;
export type RelativeDateFilterProps = PbRelativeDateFilterProps;

export {
  DataType,
  FieldRole,
  ColumnClass,
  MarkType,
  EncodingType,
  ShelfKind,
  FilterKind,
  AggType,
};

// --- Builders (return fully-populated defaults; all fields explicit). --------

export function makeField(init: Partial<Field> & { id: string }): Field {
  return {
    id: init.id,
    dataType: init.dataType ?? DataType.DATA_TYPE_UNSPECIFIED,
    role: init.role ?? FieldRole.FIELD_ROLE_UNSPECIFIED,
    semanticRole: init.semanticRole ?? '',
    aggregation: init.aggregation ?? AggType.AGG_TYPE_UNSPECIFIED,
    isDisagg: init.isDisagg ?? false,
    columnClass: init.columnClass ?? ColumnClass.COLUMN_CLASS_UNSPECIFIED,
  };
}

export function makeShelf(kind: ShelfKind, fields: Field[] = []): Shelf {
  return { kind, fields };
}

export function makeEncoding(init: {
  fieldEncodingId: string;
  encodingType: EncodingType;
  field: Field;
  customEncodingTypeId?: string;
}): Encoding {
  return {
    fieldEncodingId: init.fieldEncodingId,
    encodingType: init.encodingType,
    customEncodingTypeId: init.customEncodingTypeId ?? '',
    field: init.field,
  };
}

export function makeCategoricalFilter(init: {
  field: Field;
  values: string[];
  isExcludeMode?: boolean;
  caseSensitive?: boolean;
  filterStage?: string;
}): FilterSpec {
  return {
    filterKind: FilterKind.FILTER_KIND_CATEGORICAL,
    field: init.field,
    categorical: {
      values: init.values,
      isExcludeMode: init.isExcludeMode ?? false,
      caseSensitive: init.caseSensitive ?? true,
    },
    hierarchical: undefined,
    range: undefined,
    relativeDate: undefined,
    hasNull: false,
    includeNull: false,
    isLogicalTableScopedFilter: false,
    filterStage: init.filterStage ?? 'dimension',
    filterProperties: {},
  };
}

export function makeRangeFilter(init: {
  field: Field;
  min: number;
  max: number;
  rangeNullOption?: 'keep' | 'drop' | 'only';
  filterStage?: string;
}): FilterSpec {
  return {
    filterKind: FilterKind.FILTER_KIND_RANGE,
    field: init.field,
    categorical: undefined,
    hierarchical: undefined,
    range: {
      min: init.min,
      max: init.max,
      rangeNullOption: init.rangeNullOption ?? 'keep',
    },
    relativeDate: undefined,
    hasNull: false,
    includeNull: false,
    isLogicalTableScopedFilter: false,
    filterStage: init.filterStage ?? 'dimension',
    filterProperties: {},
  };
}

export function makeRelativeDateFilter(init: {
  field: Field;
  periodType: string;
  dateRangeType: string;
  rangeN: number;
  anchorDate?: string;
  filterStage?: string;
}): FilterSpec {
  return {
    filterKind: FilterKind.FILTER_KIND_RELATIVE_DATE,
    field: init.field,
    categorical: undefined,
    hierarchical: undefined,
    range: undefined,
    relativeDate: {
      anchorDate: init.anchorDate ?? '',
      periodType: init.periodType,
      dateRangeType: init.dateRangeType,
      rangeN: init.rangeN,
    },
    hasNull: false,
    includeNull: false,
    isLogicalTableScopedFilter: false,
    filterStage: init.filterStage ?? 'dimension',
    filterProperties: {},
  };
}

export function makeParameter(init: {
  id: string;
  name: string;
  dataType: DataType;
  value: string;
  domainKind?: 'list' | 'range' | 'free';
  domainValues?: string[];
  domainMin?: number;
  domainMax?: number;
  domainStep?: number;
}): Parameter {
  return {
    id: init.id,
    name: init.name,
    dataType: init.dataType,
    value: init.value,
    domainKind: init.domainKind ?? 'free',
    domainValues: init.domainValues ?? [],
    domainMin: init.domainMin ?? 0,
    domainMax: init.domainMax ?? 0,
    domainStep: init.domainStep ?? 0,
  };
}

export function makeVisualSpec(init: Partial<VisualSpec> & { sheetId: string }): VisualSpec {
  return {
    sheetId: init.sheetId,
    fields: init.fields ?? [],
    shelves: init.shelves ?? [],
    encodings: init.encodings ?? [],
    filters: init.filters ?? [],
    parameters: init.parameters ?? [],
    lodCalculations: init.lodCalculations ?? [],
    markType: init.markType ?? MarkType.MARK_TYPE_UNSPECIFIED,
    analytics: init.analytics ?? { slots: [] },
    isGenerativeAiWebAuthoring: init.isGenerativeAiWebAuthoring ?? false,
    domainType: init.domainType ?? 'separate',
  };
}

/**
 * JSON roundtrip via the generated `fromJSON` / `toJSON` — stable, no
 * protobuf runtime needed. The underlying helpers come from ts-proto
 * codegen with outputJsonMethods=true.
 */
export function toJSON(v: VisualSpec): unknown {
  return PbVisualSpec.toJSON(v);
}

export function fromJSON(j: unknown): VisualSpec {
  return PbVisualSpec.fromJSON(j);
}
