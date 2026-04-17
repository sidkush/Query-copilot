import type { ActionDefinition, MarkEvent, TargetOp } from './actionTypes';
import { resolveFilters, substituteUrlTemplate, extractSetMembers } from './fieldMapping';

/**
 * Filters actions by sourceSheets + trigger + enabled. Sorts alphabetically by name
 * (Tableau compat). Returns a new array.
 */
export function matchActions(
  actions: ActionDefinition[],
  event: MarkEvent,
): ActionDefinition[] {
  return [...actions]
    .filter(
      (a) =>
        a.enabled !== false &&
        a.sourceSheets.includes(event.sourceSheetId) &&
        a.trigger === event.trigger,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Derive TargetOps for a single action. Pure — no side effects.
 * Handles all 6 action kinds via switch.
 */
export function deriveTargetOps(
  action: ActionDefinition,
  event: MarkEvent,
): TargetOp[] {
  switch (action.kind) {
    case 'filter': {
      const filters = resolveFilters(action.fieldMapping, event.markData);
      return action.targetSheets.map((sheetId) => ({
        kind: 'filter',
        sheetId,
        filters,
        clearBehavior: action.clearBehavior,
      } as TargetOp));
    }
    case 'highlight': {
      const fieldValues = resolveFilters(action.fieldMapping, event.markData);
      return action.targetSheets.map((sheetId) => ({
        kind: 'highlight',
        sheetId,
        fieldValues,
      } as TargetOp));
    }
    case 'url': {
      const url = substituteUrlTemplate(action.template, event.markData);
      return [{ kind: 'url', url, urlTarget: action.urlTarget }];
    }
    case 'goto-sheet':
      return [{ kind: 'goto-sheet', sheetId: action.targetSheetId }];
    case 'change-parameter': {
      if (action.fieldMapping.length === 0) return [];
      const m0 = action.fieldMapping[0];
      const value = event.markData[m0.source];
      return [{ kind: 'change-parameter', parameterId: action.targetParameterId, value }];
    }
    case 'change-set': {
      const events = event.multipleMarks ?? [event.markData];
      const members = extractSetMembers(action.fieldMapping, events);
      return [{
        kind: 'change-set',
        setId: action.targetSetId,
        members,
        operation: action.operation,
      }];
    }
  }
}

/**
 * Convenience: matchActions + flatMap deriveTargetOps.
 */
export function executeCascade(
  actions: ActionDefinition[],
  event: MarkEvent,
): TargetOp[] {
  const matched = matchActions(actions, event);
  return matched.flatMap((a) => deriveTargetOps(a, event));
}
