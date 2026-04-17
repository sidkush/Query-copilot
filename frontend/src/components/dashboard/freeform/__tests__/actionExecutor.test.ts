import { describe, it, expect } from 'vitest';
import {
  matchActions,
  deriveTargetOps,
  executeCascade,
} from '../lib/actionExecutor';
import type {
  ActionDefinition,
  FilterAction,
  HighlightAction,
  UrlAction,
  GoToSheetAction,
  ChangeParameterAction,
  ChangeSetAction,
  MarkEvent,
} from '../lib/actionTypes';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkActionFilter(overrides?: Partial<FilterAction>): FilterAction {
  return {
    id: 'f1',
    name: 'Filter Action',
    kind: 'filter',
    sourceSheets: ['sheet-A'],
    trigger: 'select',
    targetSheets: ['sheet-B', 'sheet-C'],
    fieldMapping: [{ source: 'Week', target: 'FilterWeek' }],
    clearBehavior: 'show-all',
    ...overrides,
  };
}

function mkActionHighlight(overrides?: Partial<HighlightAction>): HighlightAction {
  return {
    id: 'h1',
    name: 'Highlight Action',
    kind: 'highlight',
    sourceSheets: ['sheet-A'],
    trigger: 'select',
    targetSheets: ['sheet-B', 'sheet-C'],
    fieldMapping: [{ source: 'Region', target: 'HighlightRegion' }],
    ...overrides,
  };
}

function mkActionUrl(overrides?: Partial<UrlAction>): UrlAction {
  return {
    id: 'u1',
    name: 'URL Action',
    kind: 'url',
    sourceSheets: ['sheet-A'],
    trigger: 'select',
    template: 'https://crm.example.com/accounts/{AccountId}',
    urlTarget: 'new-tab',
    ...overrides,
  };
}

function mkActionGoToSheet(overrides?: Partial<GoToSheetAction>): GoToSheetAction {
  return {
    id: 'g1',
    name: 'GoToSheet Action',
    kind: 'goto-sheet',
    sourceSheets: ['sheet-A'],
    trigger: 'select',
    targetSheetId: 'sheet-Z',
    ...overrides,
  };
}

function mkActionChangeParameter(overrides?: Partial<ChangeParameterAction>): ChangeParameterAction {
  return {
    id: 'p1',
    name: 'ChangeParameter Action',
    kind: 'change-parameter',
    sourceSheets: ['sheet-A'],
    trigger: 'select',
    targetParameterId: 'param-date',
    fieldMapping: [{ source: 'Date', target: 'DateParam' }],
    ...overrides,
  };
}

function mkActionChangeSet(overrides?: Partial<ChangeSetAction>): ChangeSetAction {
  return {
    id: 's1',
    name: 'ChangeSet Action',
    kind: 'change-set',
    sourceSheets: ['sheet-A'],
    trigger: 'select',
    targetSetId: 'set-categories',
    fieldMapping: [{ source: 'Category', target: 'SetCategory' }],
    operation: 'replace',
    ...overrides,
  };
}

function mkEvent(overrides?: Partial<MarkEvent>): MarkEvent {
  return {
    sourceSheetId: 'sheet-A',
    trigger: 'select',
    markData: { Week: '2026-W12', Region: 'EMEA', AccountId: '42' },
    timestamp: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// matchActions tests
// ---------------------------------------------------------------------------

describe('matchActions', () => {
  it('test 1 — filters out action whose sourceSheets does not include the event sourceSheetId', () => {
    const actions: ActionDefinition[] = [
      mkActionFilter({ sourceSheets: ['sheet-X'] }),  // mismatch
      mkActionFilter({ id: 'f2', name: 'Matching', sourceSheets: ['sheet-A'] }),
    ];
    const result = matchActions(actions, mkEvent());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f2');
  });

  it('test 2 — filters out action whose trigger does not match the event trigger', () => {
    const actions: ActionDefinition[] = [
      mkActionFilter({ trigger: 'hover' }),   // mismatch
      mkActionFilter({ id: 'f2', name: 'Matching', trigger: 'select' }),
    ];
    const result = matchActions(actions, mkEvent({ trigger: 'select' }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f2');
  });

  it('test 3 — respects enabled flag: false excluded, true and undefined both included', () => {
    const actions: ActionDefinition[] = [
      mkActionFilter({ id: 'disabled', name: 'Disabled', enabled: false }),
      mkActionFilter({ id: 'enabled', name: 'Enabled', enabled: true }),
      mkActionFilter({ id: 'implicit', name: 'Implicit', enabled: undefined }),
    ];
    const result = matchActions(actions, mkEvent());
    const ids = result.map((a) => a.id);
    expect(ids).not.toContain('disabled');
    expect(ids).toContain('enabled');
    expect(ids).toContain('implicit');
  });

  it('test 4 — sorts matched actions alphabetically by name', () => {
    const actions: ActionDefinition[] = [
      mkActionFilter({ id: 'c', name: 'C Action' }),
      mkActionFilter({ id: 'a', name: 'A Action' }),
      mkActionFilter({ id: 'b', name: 'B Action' }),
    ];
    const result = matchActions(actions, mkEvent());
    expect(result.map((a) => a.name)).toEqual(['A Action', 'B Action', 'C Action']);
  });
});

// ---------------------------------------------------------------------------
// deriveTargetOps tests
// ---------------------------------------------------------------------------

describe('deriveTargetOps — Filter', () => {
  it('test 5 — emits one op per targetSheet, each with filters + clearBehavior', () => {
    const action = mkActionFilter({
      targetSheets: ['sheet-B', 'sheet-C'],
      fieldMapping: [{ source: 'Week', target: 'FilterWeek' }],
      clearBehavior: 'show-all',
    });
    const ops = deriveTargetOps(action, mkEvent());
    expect(ops).toHaveLength(2);
    for (const op of ops) {
      expect(op.kind).toBe('filter');
      if (op.kind === 'filter') {
        expect(op.filters).toEqual({ FilterWeek: '2026-W12' });
        expect(op.clearBehavior).toBe('show-all');
      }
    }
    const sheetIds = ops.map((o) => (o.kind === 'filter' ? o.sheetId : null));
    expect(sheetIds).toContain('sheet-B');
    expect(sheetIds).toContain('sheet-C');
  });
});

describe('deriveTargetOps — Highlight', () => {
  it('test 6 — emits one op per targetSheet with fieldValues (not filters)', () => {
    const action = mkActionHighlight({
      targetSheets: ['sheet-B', 'sheet-C'],
      fieldMapping: [{ source: 'Region', target: 'HighlightRegion' }],
    });
    const ops = deriveTargetOps(action, mkEvent());
    expect(ops).toHaveLength(2);
    for (const op of ops) {
      expect(op.kind).toBe('highlight');
      if (op.kind === 'highlight') {
        expect(op.fieldValues).toEqual({ HighlightRegion: 'EMEA' });
        expect((op as Record<string, unknown>)['filters']).toBeUndefined();
      }
    }
  });
});

describe('deriveTargetOps — URL', () => {
  it('test 7 — emits single op with substituted URL and urlTarget preserved', () => {
    const action = mkActionUrl({
      template: 'https://crm.example.com/accounts/{AccountId}',
      urlTarget: 'new-tab',
    });
    const ops = deriveTargetOps(action, mkEvent({ markData: { AccountId: '42' } }));
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.kind).toBe('url');
    if (op.kind === 'url') {
      expect(op.url).toBe('https://crm.example.com/accounts/42');
      expect(op.urlTarget).toBe('new-tab');
    }
  });
});

describe('deriveTargetOps — GoToSheet', () => {
  it('test 8 — emits single op pointing at targetSheetId', () => {
    const action = mkActionGoToSheet({ targetSheetId: 'sheet-Z' });
    const ops = deriveTargetOps(action, mkEvent());
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.kind).toBe('goto-sheet');
    if (op.kind === 'goto-sheet') {
      expect(op.sheetId).toBe('sheet-Z');
    }
  });
});

describe('deriveTargetOps — ChangeParameter', () => {
  it('test 9 — valid mapping emits single op with value from markData[mapping[0].source]', () => {
    const action = mkActionChangeParameter({
      targetParameterId: 'param-date',
      fieldMapping: [{ source: 'Date', target: 'DateParam' }],
    });
    const ops = deriveTargetOps(action, mkEvent({ markData: { Date: '2026-04-16' } }));
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.kind).toBe('change-parameter');
    if (op.kind === 'change-parameter') {
      expect(op.parameterId).toBe('param-date');
      expect(op.value).toBe('2026-04-16');
    }
  });

  it('empty mapping returns empty array', () => {
    const action = mkActionChangeParameter({ fieldMapping: [] });
    const ops = deriveTargetOps(action, mkEvent());
    expect(ops).toHaveLength(0);
  });
});

describe('deriveTargetOps — ChangeSet', () => {
  it('test 10 — replace with single mark → 1-member set', () => {
    const action = mkActionChangeSet({
      targetSetId: 'set-categories',
      fieldMapping: [{ source: 'Category', target: 'SetCategory' }],
      operation: 'replace',
    });
    const event = mkEvent({ markData: { Category: 'Furniture' }, multipleMarks: undefined });
    const ops = deriveTargetOps(action, event);
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.kind).toBe('change-set');
    if (op.kind === 'change-set') {
      expect(op.setId).toBe('set-categories');
      expect(op.members).toEqual(['Furniture']);
      expect(op.operation).toBe('replace');
    }
  });

  it('test 11 — multiple marks with duplicates → dedup\'d members', () => {
    const action = mkActionChangeSet({
      targetSetId: 'set-categories',
      fieldMapping: [{ source: 'Category', target: 'SetCategory' }],
      operation: 'add',
    });
    const event = mkEvent({
      markData: { Category: 'Furniture' },
      multipleMarks: [
        { Category: 'Furniture' },
        { Category: 'Technology' },
        { Category: 'Furniture' },  // duplicate
        { Category: 'Office' },
      ],
    });
    const ops = deriveTargetOps(action, event);
    expect(ops).toHaveLength(1);
    const op = ops[0];
    if (op.kind === 'change-set') {
      expect(op.members).toEqual(['Furniture', 'Technology', 'Office']);
      expect(op.operation).toBe('add');
    }
  });
});

// ---------------------------------------------------------------------------
// executeCascade tests
// ---------------------------------------------------------------------------

describe('executeCascade', () => {
  it('test 12 — 3 actions (2 matching, 1 not) → ops only from matching, in alphabetical order', () => {
    const actionA: ActionDefinition = mkActionFilter({
      id: 'a',
      name: 'Alpha Filter',
      sourceSheets: ['sheet-A'],
      trigger: 'select',
      targetSheets: ['sheet-B'],
      fieldMapping: [{ source: 'Week', target: 'FilterWeek' }],
      clearBehavior: 'show-all',
    });
    const actionB: ActionDefinition = mkActionGoToSheet({
      id: 'b',
      name: 'Zeta GoToSheet',
      sourceSheets: ['sheet-A'],
      trigger: 'select',
      targetSheetId: 'sheet-Z',
    });
    const actionC: ActionDefinition = mkActionUrl({
      id: 'c',
      name: 'Mango URL',
      sourceSheets: ['sheet-WRONG'],  // non-matching source
      trigger: 'select',
    });

    const event = mkEvent();
    const ops = executeCascade([actionA, actionB, actionC], event);

    // Should have ops from Alpha Filter (1 op) + Zeta GoToSheet (1 op)
    // Alphabetical: Alpha Filter before Zeta GoToSheet
    expect(ops).toHaveLength(2);
    expect(ops[0].kind).toBe('filter');
    expect(ops[1].kind).toBe('goto-sheet');
  });
});
