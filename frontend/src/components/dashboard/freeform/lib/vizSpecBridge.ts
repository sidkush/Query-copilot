/**
 * Bridge: existing Analyst Pro store types → VisualSpec IR.
 *
 * Read-only. Plan 7a ships the IR; Plan 7b's compiler will be the first
 * consumer. Until then, this module exists so callers can start producing
 * VisualSpec instances from current state without the store knowing.
 *
 * Isolation: never mutate inputs, never call into Zustand. Pure.
 */

import type { Filter } from './filterApplication';
import type { DashboardParameter, ParamType, ParamValue } from './parameterTypes';
import type { DashboardSet } from './setTypes';

import {
  makeField,
  makeCategoricalFilter,
  makeParameter,
  makeVisualSpec,
  DataType,
  FieldRole,
  AggType,
  MarkType,
  ColumnClass,
  type VisualSpec,
  type FilterSpec,
  type Parameter as VizParameter,
} from './vizSpec';

export type BridgeInput = {
  sheetId: string;
  /** Plan 4a filters applied to the sheet. */
  sheetFilters: readonly Filter[];
  /** Plan 4c workbook parameters. */
  parameters: readonly DashboardParameter[];
  /** Plan 4b sets (carried for future expansion - see docstring). */
  sets: readonly DashboardSet[];
  /** Mark type if the current worksheet has committed to one. Default
   *  MARK_TYPE_UNSPECIFIED. */
  markType?: MarkType;
  /** AI-origin flag - true when this spec was built from an NL / Agent
   *  authoring path. Plan 7b reads it for telemetry. */
  isGenerativeAiWebAuthoring?: boolean;
};

function paramTypeToDataType(t: ParamType): DataType {
  switch (t) {
    case 'string':
      return DataType.DATA_TYPE_STRING;
    case 'number':
      return DataType.DATA_TYPE_NUMBER;
    case 'boolean':
      return DataType.DATA_TYPE_BOOL;
    case 'date':
      return DataType.DATA_TYPE_DATE_TIME;
  }
}

function paramValueToString(v: ParamValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function bridgeParameter(p: DashboardParameter): VizParameter {
  const dataType = paramTypeToDataType(p.type);
  if (p.domain.kind === 'list') {
    return makeParameter({
      id: p.id,
      name: p.name,
      dataType,
      value: paramValueToString(p.value),
      domainKind: 'list',
      domainValues: p.domain.values.map(paramValueToString),
    });
  }
  if (p.domain.kind === 'range') {
    return makeParameter({
      id: p.id,
      name: p.name,
      dataType,
      value: paramValueToString(p.value),
      domainKind: 'range',
      domainMin: p.domain.min,
      domainMax: p.domain.max,
      domainStep: p.domain.step,
    });
  }
  return makeParameter({
    id: p.id,
    name: p.name,
    dataType,
    value: paramValueToString(p.value),
    domainKind: 'free',
  });
}

function fieldFor(name: string): ReturnType<typeof makeField> {
  return makeField({
    id: name,
    dataType: DataType.DATA_TYPE_UNSPECIFIED,
    role: FieldRole.FIELD_ROLE_DIMENSION,
    aggregation: AggType.AGG_TYPE_NONE,
    columnClass: ColumnClass.COLUMN_CLASS_DATABASE,
  });
}

function coerceScalarToString(v: string | number | boolean | null): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/**
 * Map a single Plan 4a Filter onto a FilterSpec. The Plan 4a Filter.op
 * is one of `'eq' | 'in' | 'notIn'`, all of which land in the
 * CATEGORICAL kind with `isExcludeMode` toggling for `notIn`. Plan 7b
 * will gain dedicated `range`/`relativeDate` mapping when the worksheet
 * UI starts authoring those directly.
 */
function bridgeFilter(f: Filter): FilterSpec {
  const field = fieldFor(f.field);
  if (f.op === 'eq') {
    return makeCategoricalFilter({
      field,
      values: [coerceScalarToString(f.value)],
      isExcludeMode: false,
    });
  }
  // op === 'in' | 'notIn'
  const values = f.values.map((v) => String(v));
  return makeCategoricalFilter({
    field,
    values,
    isExcludeMode: f.op === 'notIn',
  });
}

/**
 * Main entry. Pure: no store reads, no side effects.
 *
 * `sets` is currently carried for API parity and future set-as-filter
 * expansion (Plan 4b). It is intentionally unused today - the Plan 4a
 * runtime already expands set refs into concrete member lists before
 * the filter reaches this bridge.
 */
export function bridgeToVisualSpec(input: BridgeInput): VisualSpec {
  void input.sets; // reserved; see docstring.
  return makeVisualSpec({
    sheetId: input.sheetId,
    fields: [],
    shelves: [],
    encodings: [],
    filters: input.sheetFilters.map(bridgeFilter),
    parameters: input.parameters.map(bridgeParameter),
    lodCalculations: [],
    markType: input.markType ?? MarkType.MARK_TYPE_UNSPECIFIED,
    analytics: { slots: [] },
    isGenerativeAiWebAuthoring: input.isGenerativeAiWebAuthoring ?? false,
    domainType: 'separate',
  });
}
