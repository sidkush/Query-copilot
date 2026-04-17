export type ActionTrigger = 'hover' | 'select' | 'menu';
export type ActionClearBehavior = 'leave-filter' | 'show-all' | 'exclude-all';
export type UrlTarget = 'new-tab' | 'iframe' | 'current-tab';

/** Runtime marker emitted by resolveFilters to defer set-member lookup
 *  until the runtime hook has access to the dashboard sets list. */
export type SetRefMarker = { __setRef: string };

/** A mapping entry that pulls a value from mark data at runtime. */
export type SourceMapping = { source: string; target: string };

/** A mapping entry that resolves to a dashboard Set's members at runtime. */
export type SetRefMapping = { setRef: string; target: string };

/** Any mapping entry — convenience union. */
export type FieldMappingEntry = SourceMapping | SetRefMapping;

export type BaseAction = {
  id: string;
  name: string;
  enabled?: boolean;  // default true
  sourceSheets: string[];  // worksheet zone ids
  trigger: ActionTrigger;
};

export type FilterAction = BaseAction & {
  kind: 'filter';
  targetSheets: string[];
  fieldMapping: FieldMappingEntry[];
  clearBehavior: ActionClearBehavior;
};

export type HighlightAction = BaseAction & {
  kind: 'highlight';
  targetSheets: string[];
  fieldMapping: SourceMapping[];
};

export type UrlAction = BaseAction & {
  kind: 'url';
  template: string;  // e.g. 'https://crm/{AccountId}'
  urlTarget: UrlTarget;
};

export type GoToSheetAction = BaseAction & {
  kind: 'goto-sheet';
  targetSheetId: string;
};

export type ChangeParameterAction = BaseAction & {
  kind: 'change-parameter';
  targetParameterId: string;
  fieldMapping: SourceMapping[];  // single-entry: source mark field → parameter value
  aggregation?: 'first' | 'sum' | 'avg';  // if multi-mark selection
};

export type ChangeSetAction = BaseAction & {
  kind: 'change-set';
  targetSetId: string;
  fieldMapping: SourceMapping[];
  operation: 'replace' | 'add' | 'remove' | 'toggle';
};

export type ActionDefinition =
  | FilterAction
  | HighlightAction
  | UrlAction
  | GoToSheetAction
  | ChangeParameterAction
  | ChangeSetAction;

/** Shape of a mark event from a worksheet zone. */
export type MarkEvent = {
  sourceSheetId: string;
  trigger: ActionTrigger;
  markData: Record<string, unknown>;  // field → value for the interacted mark
  timestamp: number;
  multipleMarks?: Record<string, unknown>[];  // for lasso / multi-select
};

/** A single target operation emitted by the executor. */
export type TargetOp =
  | { kind: 'filter'; sheetId: string; filters: Record<string, unknown>; clearBehavior: ActionClearBehavior }
  | { kind: 'highlight'; sheetId: string; fieldValues: Record<string, unknown> }
  | { kind: 'url'; url: string; urlTarget: UrlTarget }
  | { kind: 'goto-sheet'; sheetId: string }
  | { kind: 'change-parameter'; parameterId: string; value: unknown }
  | { kind: 'change-set'; setId: string; members: (string | number)[]; operation: 'replace' | 'add' | 'remove' | 'toggle' };
