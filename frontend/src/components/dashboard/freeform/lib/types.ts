// frontend/src/components/dashboard/freeform/lib/types.ts

/** Proportional unit — 0 to 100000 where 100000 = 100% of parent container. */
export type Proportion = number;

export type Padding = { top: number; right: number; bottom: number; left: number };
export type BorderStyle = { width: number; color: string; style: 'solid' | 'dashed' | 'dotted' };
export type BackgroundStyle = { color?: string; image?: string; fit?: 'cover' | 'contain' | 'fill' };

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

export type VisibilityRule = {
  mode: 'field' | 'parameter';
  source: string;
};

export type BaseZone = {
  id: string;
  w: Proportion;
  h: Proportion;
  padding?: { outer: Padding; inner: Padding };
  border?: BorderStyle;
  background?: BackgroundStyle;
  visibilityRule?: VisibilityRule;
  /** Optional user-given display name. If absent, UI derives from type + id. */
  displayName?: string;
  /** If true, drag/resize/delete are blocked. Selection still allowed. */
  locked?: boolean;
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

export type Dashboard = {
  schemaVersion: 'askdb/dashboard/v1';
  id: string;
  name: string;
  /**
   * Archetype id. Known values: 'analyst-pro', 'editorial-terminal',
   * 'liquid-analytics', 'signal-lab', 'kinetic-minimalism'.
   * Future archetypes (phase 2) may add more — kept open as `string`.
   */
  archetype: string;
  size: SizeMode;
  tiledRoot: ContainerZone;
  floatingLayer: FloatingZone[];
  worksheets: Array<{ id: string; chartSpec: unknown; sql?: string; dataRef?: string }>;
  parameters: unknown[];
  sets: unknown[];
  actions: unknown[];
  globalStyle?: { font?: string; background?: string };
};

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
