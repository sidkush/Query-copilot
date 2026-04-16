/**
 * Internal types for the VizQL Canvas 2D renderer pipeline.
 */

// ── Encoding channel descriptors ────────────────────────────

export interface EncodingChannel {
  field: string;
  type: 'nominal' | 'ordinal' | 'quantitative' | 'temporal';
  aggregate?: string;
  bin?: boolean | { maxbins: number };
  timeUnit?: string;
  format?: string;
  title?: string;
  sort?: unknown;
  scheme?: string;
}

export interface CompiledEncoding {
  x?: EncodingChannel;
  y?: EncodingChannel;
  x2?: EncodingChannel;
  y2?: EncodingChannel;
  color?: EncodingChannel;
  size?: EncodingChannel;
  shape?: EncodingChannel;
  opacity?: EncodingChannel;
  text?: EncodingChannel;
  detail?: EncodingChannel[];
  tooltip?: EncodingChannel[];
  theta?: EncodingChannel;
  row?: EncodingChannel;
  column?: EncodingChannel;
  xOffset?: EncodingChannel;
}

// ── Compiled spec ───────────────────────────────────────────

export type MarkType =
  | 'bar' | 'line' | 'area' | 'point' | 'circle' | 'square'
  | 'tick' | 'rect' | 'arc' | 'text' | 'rule' | 'trail'
  | 'boxplot' | 'geoshape';

export interface MarkConfig {
  type: MarkType;
  filled?: boolean;
  point?: boolean | { size?: number };
  color?: string;
  strokeDash?: number[];
  strokeWidth?: number;
}

export interface CompiledSpec {
  mark: MarkConfig;
  encoding: CompiledEncoding;
  /** Layered specs (already compiled) */
  layers?: CompiledSpec[];
  /** Facet field + inner spec */
  facet?: { field: string; type: string; columns?: number; spec: CompiledSpec };
  width: number;
  height: number;
}

// ── Aggregated data ─────────────────────────────────────────

export interface AggregatedData {
  /** Rows after GROUP BY + aggregation */
  rows: Record<string, unknown>[];
  /** Domain info per field (for scale construction) */
  domains: Map<string, { values?: unknown[]; min?: number; max?: number; type: string }>;
}

// ── Scales ──────────────────────────────────────────────────

export interface LinearScale {
  kind: 'linear';
  domain: [number, number];
  range: [number, number];
  map(value: number): number;
  ticks(count?: number): number[];
  nice(): LinearScale;
}

export interface BandScale {
  kind: 'band';
  domain: string[];
  range: [number, number];
  bandwidth: number;
  step: number;
  padding: number;
  map(value: string): number;
}

export interface TimeScale {
  kind: 'time';
  domain: [number, number]; // epoch ms
  range: [number, number];
  map(value: number | string | Date): number;
  ticks(count?: number): Date[];
}

export interface ColorScale {
  kind: 'color';
  type: 'nominal' | 'sequential';
  domain: unknown[];
  map(value: unknown): string;
}

export type Scale = LinearScale | BandScale | TimeScale | ColorScale;

export interface ScaleSet {
  x?: Scale;
  y?: Scale;
  color?: ColorScale;
  size?: LinearScale;
  theta?: LinearScale;
  xOffset?: BandScale;
}

// ── Layout ──────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AxisLayout {
  position: 'bottom' | 'left' | 'top' | 'right';
  scale: Scale;
  title?: string;
  ticks: { value: unknown; pixel: number; label: string }[];
  gridLines: number[];
}

export interface LegendLayout {
  rect: Rect;
  title: string;
  entries: { label: string; color: string }[];
  type: 'categorical' | 'gradient';
}

export interface ChartLayout {
  /** Full canvas size */
  canvas: Rect;
  /** Plotting area (inside axes) */
  plot: Rect;
  /** Axis configs */
  xAxis?: AxisLayout;
  yAxis?: AxisLayout;
  /** Legend */
  legend?: LegendLayout;
  /** Facet panes (if faceted) */
  panes?: { rect: Rect; value: string }[];
  /** Margins used */
  margin: { top: number; right: number; bottom: number; left: number };
}

// ── Canvas context type alias ───────────────────────────────

export type Ctx = CanvasRenderingContext2D;
