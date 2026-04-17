export type ActionTrigger = 'hover' | 'select' | 'menu';
export type ActionClearBehavior = 'leave-filter' | 'show-all' | 'exclude-all';
export type UrlTarget = 'new-tab' | 'iframe' | 'current-tab';

export type FieldMappingEntry =
  | { source: string; target: string }
  | { setRef: string; target: string };

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
  fieldMapping: FieldMappingEntry[];
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
  fieldMapping: FieldMappingEntry[];  // single-entry: source mark field → parameter value
  aggregation?: 'first' | 'sum' | 'avg';  // if multi-mark selection
};

export type ChangeSetAction = BaseAction & {
  kind: 'change-set';
  targetSetId: string;
  fieldMapping: FieldMappingEntry[];
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
  | {
      kind: 'filter';
      sheetId: string;
      filters: Record<string, unknown | { __setRef: string }>;
      clearBehavior: ActionClearBehavior;
    }
  | { kind: 'highlight'; sheetId: string; fieldValues: Record<string, unknown> }
  | { kind: 'url'; url: string; urlTarget: UrlTarget }
  | { kind: 'goto-sheet'; sheetId: string }
  | { kind: 'change-parameter'; parameterId: string; value: unknown }
  | { kind: 'change-set'; setId: string; members: (string | number)[]; operation: 'replace' | 'add' | 'remove' | 'toggle' };
