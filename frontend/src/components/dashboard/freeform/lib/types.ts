// frontend/src/components/dashboard/freeform/lib/types.ts

import type { DashboardSet } from './setTypes';
import type { DashboardParameter, ParamValue } from './parameterTypes';

/** Proportional unit — 0 to 100000 where 100000 = 100% of parent container. */
export type Proportion = number;

export type Padding = { top: number; right: number; bottom: number; left: number };

/** Plan 5d — flat background shape per roadmap. color is a CSS colour
 *  (hex / rgb / named); opacity is 0–1. The legacy BackgroundStyle
 *  (image / fit) is dropped — image zones carry imageSrc directly. */
export type BackgroundAP = { color: string; opacity: number };

/** Plan 5d — per-edge border weight. Order follows Tableau's StyledBox
 *  convention (Build_Tableau.md §XIV.5): [left, right, top, bottom]. */
export type BorderAP = {
  weight: [number, number, number, number];
  color: string;
  style: 'solid' | 'dashed';
};

export type LeafType =
  | 'worksheet'
  | 'text'
  | 'filter'
  | 'legend'
  | 'parameter'
  | 'image'
  | 'webpage'
  | 'blank'
  | 'navigation'
  | 'extension';

export type ContainerType = 'container-horz' | 'container-vert';

export type VisibilityRule =
  | { kind: 'always' }
  | { kind: 'setMembership'; setId: string; mode: 'hasAny' | 'isEmpty' }
  | { kind: 'parameterEquals'; parameterId: string; value: ParamValue }
  | { kind: 'hasActiveFilter'; sheetId: string };

export type EvaluationContextSheetFilter = {
  field: string;
  op: string;
  value: unknown;
};

export type EvaluationContext = {
  sets: readonly DashboardSet[];
  parameters: readonly DashboardParameter[];
  sheetFilters: Readonly<Record<string, ReadonlyArray<EvaluationContextSheetFilter>>>;
};

export type BaseZone = {
  id: string;
  w: Proportion;
  h: Proportion;
  /** @deprecated Plan 5d — replaced by scalar innerPadding/outerPadding.
   *  Kept declared so legacy persisted dashboards don't trip TS. ZoneFrame
   *  no longer reads this field after Plan 5d T6. */
  padding?: { outer: Padding; inner: Padding };
  /** Plan 5d — per-edge border. */
  border?: BorderAP;
  /** Plan 5d — solid colour + opacity. */
  background?: BackgroundAP;
  visibilityRule?: VisibilityRule;
  /** Optional user-given display name. If absent, UI derives from type + id. */
  displayName?: string;
  /** If true, drag/resize/delete are blocked. Selection still allowed. */
  locked?: boolean;
  // Plan 5d properties.
  /** Inner padding inside the zone body, in pixels. Default 4. */
  innerPadding?: number;
  /** Outer padding around the zone frame, in pixels. Default 0. */
  outerPadding?: number;
  /** Title bar show/hide. Default comes from TITLE_SHOWN_BY_DEFAULT. */
  showTitle?: boolean;
  /** Caption show/hide (worksheet only). Default comes from CAPTION_SHOWN_BY_DEFAULT. */
  showCaption?: boolean;
  /** Vega-Lite autosize mode for chart contents. Default 'fit'. */
  fitMode?: 'fit' | 'fit-width' | 'fit-height' | 'entire' | 'fixed';
  /** Plan 5e — advisory pixel override written by "Fit to Content". The
   *  layout resolver honours this on floating containers today (via pxW/pxH
   *  on the floating layer); tiled-container honour lands in Plan 7a. */
  sizeOverride?: { pxW: number; pxH: number };
};

export type LeafZone = BaseZone & {
  type: LeafType;
  worksheetRef?: string;
  text?: { markdown: string };
  filterRef?: { field: string; widget: 'dropdown' | 'range' | 'multi' };
  legendRef?: { worksheetRef: string; encoding: 'color' | 'size' | 'shape' };
  parameterRef?: string;
  imageSrc?: string;
  webpageUrl?: string;
};

export type ContainerZone = BaseZone & {
  type: ContainerType;
  children: Zone[];
};

export type Zone = LeafZone | ContainerZone;

export type FloatingZone = LeafZone & {
  floating: true;
  /** user-authored pixel offset from dashboard origin (x-axis) */
  x: number;
  /** user-authored pixel offset from dashboard origin (y-axis) */
  y: number;
  /** user-authored pixel width. Raw input — pair with ResolvedZone.width for computed layout output. */
  pxW: number;
  /** user-authored pixel height. Raw input — pair with ResolvedZone.height for computed layout output. */
  pxH: number;
  zIndex: number;
};

export type SizeMode =
  | { mode: 'automatic' }
  | { mode: 'range'; minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
  | { mode: 'fixed'; width: number; height: number; preset?: FixedPreset };

export type FixedPreset =
  | 'desktop'          // 1366x768
  | 'laptop'           // 1440x900
  | 'ipad-landscape'   // 1024x768
  | 'ipad-portrait'    // 768x1024
  | 'phone'            // 375x667
  | 'custom';

export const FIXED_PRESETS: Record<Exclude<FixedPreset, 'custom'>, { width: number; height: number }> = {
  desktop: { width: 1366, height: 768 },
  laptop: { width: 1440, height: 900 },
  'ipad-landscape': { width: 1024, height: 768 },
  'ipad-portrait': { width: 768, height: 1024 },
  phone: { width: 375, height: 667 },
};

/**
 * Connected-data binding for a themed preset slot. Each preset layout
 * declares its slots in `modes/presets/slots.ts`; the autogen backend
 * fills these, and users edit them via the SlotEditPopover.
 *
 * Typed-Seeking-Spring Phase 1.
 */
export type TileBindingAgg =
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'MIN'
  | 'MAX'
  | 'COUNT_DISTINCT';

export type TileBindingKind = 'kpi' | 'chart' | 'table' | 'narrative';

export type TileBinding = {
  /** Points into `dashboard.tiles` for kpi/chart/table kinds. Absent
   *  on narrative bindings (they render from `renderedMarkdown`). */
  tileId?: string;
  slotId: string;
  kind: TileBindingKind;
  /** Measure reference — column + aggregation. Present on kpi/chart/table
   *  bindings that aggregate a numeric field. */
  measure?: { column: string; agg: TileBindingAgg };
  /** Primary dimension for grouping / x-axis / rank. */
  dimension?: string;
  /** Optional single-condition filter applied before aggregation. */
  filter?: {
    column: string;
    op: 'eq' | 'in' | 'gt' | 'lt';
    value: unknown;
  };
  /** Narrative-only: markdown with `{variable}` tokens referencing
   *  other slots' values. */
  markdownTemplate?: string;
  /** Narrative-only: the LLM's last-generated final copy, with
   *  variables resolved. */
  renderedMarkdown?: string;
  /** When true, Rebuild skips this slot so user edits survive. */
  isUserPinned?: boolean;
  /** When the autogen couldn't pick a field (e.g. no numeric column
   *  matched), the slot surfaces a "Bind data" CTA instead of silently
   *  rendering the fallback. */
  unresolved?: boolean;
};

/** Optional semantic hints a user gave the autogen about their schema.
 *  Captured once per dashboard via the SemanticTagWizard and reused on
 *  every Rebuild. Every field is skippable — the autogen falls back to
 *  pure heuristics when a tag is absent. */
export type DashboardSemanticTags = {
  primaryDate?: string;
  revenueMetric?: { column: string; agg: TileBindingAgg };
  primaryDimension?: string;
  entityName?: string;
  timeGrain?: 'day' | 'week' | 'month' | 'quarter';
};

export type BindingAutogenState =
  | 'pending'
  | 'running'
  | 'complete'
  | 'partial'
  | 'error';

export type Dashboard = {
  schemaVersion: 'askdb/dashboard/v1';
  id: string;
  name: string;
  /**
   * Active preset id. Replaces the former `archetype` field. Known
   * values: 'analyst-pro' (and, once plans B–E ship, 'board-pack',
   * 'operator-console', 'signal', 'editorial-brief'). Kept open as
   * `string` so later presets can register without a type bump.
   */
  activePresetId: string;
  /**
   * Per-preset saved ZoneTree. Switching preset loads the entry under
   * `[presetId]` (or seeds it from `preset.starter` on first visit).
   * `tiledRoot` is the root ContainerZone (or `null` for an empty
   * floating-only layout); `floatingLayer` is the floating overlay.
   */
  presetLayouts: Record<
    string,
    { tiledRoot: Zone | null; floatingLayer: FloatingZone[] }
  >;
  size: SizeMode;
  tiledRoot: ContainerZone;
  floatingLayer: FloatingZone[];
  worksheets: Array<{ id: string; chartSpec: unknown; sql?: string; dataRef?: string }>;
  parameters: unknown[];
  sets: unknown[];
  actions: unknown[];
  globalStyle?: { font?: string; background?: string };
  /**
   * Typed-Seeking-Spring Phase 1 — connection-bound dashboard save:
   * every saved dashboard pins to exactly one DB connection id.
   * Reopening the dashboard under a different active connection
   * prompts the user to switch via ConnectionMismatchBanner.
   */
  boundConnId?: string;
  /** Semantic hints captured by the SemanticTagWizard on save. */
  semanticTags?: DashboardSemanticTags;
  /** Per-preset slot → binding map. Populated by the autogen
   *  orchestrator + edited live by SlotEditPopover. Absent entries
   *  render from the preset slot descriptor's static fallback. */
  presetBindings?: Record<string, Record<string, TileBinding>>;
  /** Autogen lifecycle state; drives the DashboardShell progress chip. */
  bindingAutogenState?: BindingAutogenState;
  bindingAutogenError?: string;
};

// Plan 6a — Device layouts (Build_Tableau.md §IX.5, Appendix A.13, E.15).
// Tablet/Phone inherit from base Desktop; each DeviceLayoutOverride is a
// sparse per-zone diff. `visible: false` == Tableau's HiddenByUser: render
// suppressed, data pipeline still runs.
export type DashboardDeviceLayout = 'desktop' | 'tablet' | 'phone';

export interface ZoneOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  visible?: boolean;
}

export interface DeviceLayoutOverride {
  zoneOverrides: Record<string, ZoneOverride>;
}

export interface DashboardDeviceLayouts {
  tablet?: DeviceLayoutOverride;
  phone?: DeviceLayoutOverride;
}

/** Zone with resolved pixel dimensions (output of layoutResolver).
 *  For floating zones: pxW/pxH copy into width/height unchanged.
 *  For tiled zones: width/height are computed from proportional w/h × container size. */
export type ResolvedZone = {
  zone: Zone | FloatingZone;
  /** computed pixel offset from dashboard origin (x-axis) */
  x: number;
  /** computed pixel offset from dashboard origin (y-axis) */
  y: number;
  /** computed pixel width */
  width: number;
  /** computed pixel height */
  height: number;
  depth: number;  // tree depth, 0 = root; -1 = floating layer
};
