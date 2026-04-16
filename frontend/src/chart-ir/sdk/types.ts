/**
 * Sub-project C Phase C2 — IChartType SDK type definitions.
 *
 * This file defines the public contract that chart authors implement inside a
 * sandboxed iframe. The host shell communicates with the iframe exclusively
 * through the interfaces defined here.
 *
 * Architecture overview:
 *   - `IChartType` is the root interface authors export as their default.
 *   - `ChartCapabilities` declares what data roles and formatting the chart
 *     accepts; the host uses this to render the field-mapping UI.
 *   - `ChartRenderContext` is passed to `render()` and `update()` on every
 *     data or viewport change; it bundles data, theme tokens, and user config.
 *   - `DataRole` / `FormattingProperty` / `FormattingGroup` describe the
 *     authoring-time schema; they drive the host-side property panel.
 *
 * Sandbox boundary:
 *   Authors MUST NOT import from anywhere outside this file. The iframe has
 *   no access to AskDB internals. All cross-boundary data arrives through
 *   `ChartRenderContext` or host-dispatched postMessage events (not typed
 *   here — those are part of the sandbox protocol spec).
 *
 * Deferred (Phase C3+):
 *   - Selection / brushing callbacks (host ← iframe events)
 *   - Drilldown token pass-through
 *   - Author-declared custom menus
 */

import type { SemanticType } from '../types';

// ─── Data roles ──────────────────────────────────────────────────────────────

/**
 * A single data-role binding declared by the chart author.
 *
 * The host uses the DataRole list from `ChartCapabilities.dataRoles` to
 * render the field-mapping wells in the editor's Marks card. When the user
 * drops a field into a well, the host resolves it against the query result
 * set, and injects the resolved `DataColumn` values into `ChartDataView`.
 */
export interface DataRole {
  /** Machine identifier; must be unique within a single `ChartCapabilities`. */
  name: string;
  /** Human-readable label rendered in the host's field-mapping well. */
  displayName: string;
  /**
   * Accepted field kind.
   * - `'dimension'` — categorical / temporal fields
   * - `'measure'` — quantitative fields
   * - `'any'` — no restriction; author handles type coercion
   */
  kind: 'dimension' | 'measure' | 'any';
  /**
   * When set, the host only allows fields whose detected SemanticType
   * matches this value. The host may warn (not block) on a mismatch to
   * allow power-user overrides.
   */
  requiredType?: SemanticType;
  /**
   * Optional cardinality constraint.
   * - `min` — minimum number of fields the user must bind to this role
   *   before the chart is considered renderable.
   * - `max` — maximum number of fields the host allows in this role.
   *   Omit for unbounded (multi-field roles such as tooltip detail).
   */
  cardinality?: {
    min?: number;
    max?: number;
  };
}

// ─── Formatting schema ────────────────────────────────────────────────────────

/**
 * A single formatting control exposed in the host's property panel.
 *
 * The host renders each property as an appropriate UI control (color swatch,
 * text input, toggle, numeric stepper, dropdown) based on `type`. The value
 * the user selects is passed back to the chart via
 * `ChartRenderContext.config[property.name]`.
 */
export interface FormattingProperty {
  /** Machine identifier. Must be unique within its `FormattingGroup`. */
  name: string;
  /** Human-readable label rendered next to the control. */
  displayName: string;
  /**
   * Control type.
   * - `'color'` — color picker, value is a CSS color string
   * - `'number'` — numeric input / stepper
   * - `'text'` — single-line text input
   * - `'boolean'` — toggle / checkbox
   * - `'select'` — dropdown; requires `options`
   */
  type: 'color' | 'number' | 'text' | 'boolean' | 'select';
  /** Initial value used until the user overrides it. */
  default: unknown;
  /**
   * Available choices for `type === 'select'` controls.
   * Ignored for all other types.
   */
  options?: Array<{
    value: unknown;
    label: string;
  }>;
}

/**
 * A named group of related formatting properties.
 *
 * The host renders each group as a collapsible section in the property panel,
 * using `displayName` as the section heading.
 */
export interface FormattingGroup {
  /** Machine identifier for the group. */
  name: string;
  /** Section heading rendered in the host's property panel. */
  displayName: string;
  /** Ordered list of properties within the section. */
  properties: FormattingProperty[];
}

// ─── Chart capabilities ───────────────────────────────────────────────────────

/**
 * Full capability declaration returned by `IChartType.getCapabilities()`.
 *
 * The host calls `getCapabilities()` once at registration time (before any
 * data is available) to build its field-mapping wells and property panel.
 * Capabilities are treated as static for the lifetime of a chart instance.
 */
export interface ChartCapabilities {
  /** Ordered list of data-role wells the chart exposes to the user. */
  dataRoles: DataRole[];
  /**
   * Property panel sections. Omit or pass an empty array for charts with no
   * user-configurable formatting.
   */
  formatting?: FormattingGroup[];
  /**
   * Optional feature flags that inform the host which interaction surface
   * areas this chart participates in.
   */
  features?: {
    /**
     * Whether the chart handles point / interval selection and will fire
     * selection-changed events back to the host (Phase C3+).
     */
    supportsSelection?: boolean;
    /** Whether the chart renders its own hover tooltip. */
    supportsTooltip?: boolean;
    /**
     * Whether the chart reacts to `ThemeTokens` changes and re-renders
     * without a full `destroy()` → `render()` cycle.
     */
    supportsTheme?: boolean;
    /**
     * Whether the chart emits drilldown tokens to the host on mark click
     * (Phase C3+).
     */
    supportsDrilldown?: boolean;
  };
  /**
   * Sandbox privilege requests. The host may deny any privilege without
   * breaking the contract; charts must degrade gracefully.
   */
  privileges?: {
    /**
     * Origins the iframe is permitted to fetch from via `fetch()`.
     * The host enforces this via CSP; listing origins here is a declaration
     * of intent, not a bypass.
     */
    allowedOrigins?: string[];
    /**
     * Whether the chart needs read/write access to `localStorage` in the
     * sandbox origin. Denied for managed / enterprise deployments.
     */
    localStorage?: boolean;
  };
}

// ─── Data view ────────────────────────────────────────────────────────────────

/**
 * A single resolved column from the query result set, bound to a named role.
 *
 * `values` is a dense array of row values in result-set order. The host
 * guarantees that all columns in a `ChartDataView` share the same length
 * (`ChartDataView.rowCount`).
 */
export interface DataColumn {
  /** Column name as it appears in the query result set. */
  name: string;
  /** The data-role name this column was bound to by the user. */
  role: string;
  /**
   * Row values. Type is `unknown[]` because the column may be numeric,
   * string, boolean, or null. Authors should narrow with type guards.
   */
  values: unknown[];
}

/**
 * Snapshot of query data delivered to the chart on each render / update.
 *
 * `columns` is keyed by role name (matching `DataRole.name`), making it easy
 * to look up a specific well without iterating all columns.
 */
export interface ChartDataView {
  /** Role-keyed map of resolved columns. */
  columns: Record<string, DataColumn>;
  /** Number of rows; equals `values.length` for every column. */
  rowCount: number;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

/**
 * Design tokens passed from the host theme to the chart.
 *
 * Authors should apply these tokens instead of hardcoding colors or font
 * families so that their charts respect the user's active theme (including
 * the 6 Stage Mode themes).
 */
export interface ThemeTokens {
  /**
   * Semantic color map. Common keys: `'background'`, `'foreground'`,
   * `'primary'`, `'accent'`, `'muted'`, `'border'`. The host may include
   * additional chart-palette entries such as `'series-0'` … `'series-11'`.
   */
  colors: Record<string, string>;
  /**
   * Font-family map. Common keys: `'heading'`, `'body'`, `'mono'`.
   */
  fonts: Record<string, string>;
  /**
   * Spacing scale in pixels. Common keys: `'xs'`, `'sm'`, `'md'`, `'lg'`,
   * `'xl'`.
   */
  spacing: Record<string, number>;
  /** `true` when the active theme has a dark background. */
  isDark: boolean;
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

/**
 * Current iframe dimensions in CSS pixels.
 *
 * Passed on every `render()` and `update()` call. Authors should listen for
 * `update()` with a changed viewport to drive responsive layout, rather than
 * installing their own ResizeObserver.
 */
export interface Viewport {
  width: number;
  height: number;
}

// ─── Render context ───────────────────────────────────────────────────────────

/**
 * Aggregated context object passed to `IChartType.render()` and
 * `IChartType.update()`.
 *
 * The host re-creates this object (shallow) on every tick that sees a change
 * in data, viewport, theme, or config. Authors should treat it as immutable
 * and avoid caching sub-references across calls.
 */
export interface ChartRenderContext {
  /** Resolved query data, role-keyed. */
  data: ChartDataView;
  /** Current iframe dimensions. */
  viewport: Viewport;
  /** Active theme tokens from the host. */
  theme: ThemeTokens;
  /**
   * User-configured formatting values, keyed by `FormattingProperty.name`.
   * The host merges author-declared defaults with user overrides before
   * passing this object, so authors always receive a fully-populated map.
   */
  config: Record<string, unknown>;
}

// ─── IChartType — root interface ──────────────────────────────────────────────

/**
 * The contract every sandboxed chart author must implement.
 *
 * Authors export a class or object that satisfies this interface as the
 * default export of their entry module. The host sandbox runner calls:
 *
 *   1. `getCapabilities()` — once, at registration / warm-up time.
 *   2. `render(container, ctx)` — once, when the chart is first mounted.
 *   3. `update(ctx)` — on every subsequent data / theme / viewport change.
 *   4. `destroy()` — when the tile is unmounted or the user navigates away.
 *
 * Lifecycle invariants:
 *   - `render()` is always called before `update()` or `destroy()`.
 *   - `destroy()` is always the final call; the host will not call `update()`
 *     after `destroy()`.
 *   - `getCapabilities()` may be called before `render()` and must not rely
 *     on any DOM state.
 *   - All methods are called on the iframe's main thread; authors must not
 *     block the thread for more than ~16 ms per call.
 */
export interface IChartType {
  /** Globally unique chart identifier. Conventionally `{org}:{slug}`. */
  readonly id: string;
  /** Human-readable chart name shown in the host's chart picker. */
  readonly name: string;
  /**
   * Semantic version string (`MAJOR.MINOR.PATCH`). The host may use this to
   * detect capability changes when a chart author ships an update.
   */
  readonly version: string;

  /**
   * Return the static capability declaration.
   *
   * Called once by the host before any data is available. Must be pure and
   * synchronous. Must not throw.
   */
  getCapabilities(): ChartCapabilities;

  /**
   * Mount and perform initial render into `container`.
   *
   * `container` is a single `<div>` inside the iframe that fills the
   * viewport. Authors may append any DOM structure inside it. The host
   * guarantees `container` is empty and attached to the document when
   * `render()` is called.
   *
   * @param container - The host-managed mount point element.
   * @param ctx - Initial render context (data, viewport, theme, config).
   */
  render(container: HTMLElement, ctx: ChartRenderContext): void;

  /**
   * Re-render in response to a context change.
   *
   * The host calls `update()` whenever data, viewport, theme, or config
   * changes after the initial `render()`. Authors may diff against their
   * previous context to minimize redraws.
   *
   * @param ctx - Updated render context.
   */
  update(ctx: ChartRenderContext): void;

  /**
   * Tear down the chart and release all resources.
   *
   * Authors must remove all DOM nodes they created, cancel any pending
   * animation frames, disconnect observers, and free WebGL contexts.
   * The host will discard `container` after `destroy()` returns.
   */
  destroy(): void;
}
