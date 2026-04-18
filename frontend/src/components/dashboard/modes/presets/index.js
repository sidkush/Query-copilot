// Barrel of bespoke preset layouts. Each lazy-loads; DashboardShell
// dispatches to the matching layout based on activePresetId.
// Plan A★ — Phases 3-6 flesh out each layout per its wireframe.
import { lazy } from 'react';

export const BoardPackLayout = lazy(() => import('./BoardPackLayout'));
export const OperatorConsoleLayout = lazy(() => import('./OperatorConsoleLayout'));
export const SignalLayout = lazy(() => import('./SignalLayout'));
export const EditorialBriefLayout = lazy(() => import('./EditorialBriefLayout'));
