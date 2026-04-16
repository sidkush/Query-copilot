/**
 * Sub-project D — semantic layer: persistent color map.
 *
 * A ColorMap stores per-connection (column, value) → hex color assignments
 * so that categorical values like "Europe" stay the same blue across every
 * chart on the same connection. Assignments are injected into Vega-Lite
 * `encoding.color.scale` by the compiler.
 *
 * Assignment key format:
 *   - Unqualified:      "column:value"            e.g. "region:Europe"
 *   - Table-qualified:  "table.column:value"      e.g. "orders.region:Europe"
 *
 * Assignment value: hex color string matching /^#[0-9a-fA-F]{3,8}$/
 *   e.g. "#4a8fe7", "#fff", "#aabbccdd" (with alpha)
 */

import type { ChangelogEntry } from './linguistic';

// ---------------------------------------------------------------------------
// ColorMap type
// ---------------------------------------------------------------------------

/**
 * Persistent color map for a single connection.
 * Stored in the backend and merged into ChartSpec at compile time.
 */
export interface ColorMap {
  /** Schema version — always 1 for this iteration. */
  version: 1;
  /** Connection identifier this map belongs to. */
  conn_id: string;
  /** ISO-8601 timestamp of the most recent mutation. */
  updated_at: string;
  /**
   * Map of `"column:value"` or `"table.column:value"` → hex color string.
   * Example: { "region:Europe": "#4a8fe7", "orders.status:shipped": "#2ecc71" }
   */
  assignments: Record<string, string>;
  /** Ordered audit log of changes to this color map. */
  changelog: ChangelogEntry[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ColorMapValidationResult {
  valid: boolean;
  errors: string[];
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Validates an unknown value as a well-formed ColorMap.
 *
 * Rules:
 * - version must be exactly 1
 * - conn_id must be a non-empty string
 * - updated_at must be a non-empty string
 * - assignments must be a plain object
 *   - each key must contain a `:` (column:value separator)
 *   - each value must match /^#[0-9a-fA-F]{3,8}$/
 * - changelog must be an array
 */
export function validateColorMap(map: unknown): ColorMapValidationResult {
  const errors: string[] = [];

  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    return { valid: false, errors: ['ColorMap must be a non-null object'] };
  }

  const m = map as Record<string, unknown>;

  // version
  if (m['version'] !== 1) {
    errors.push(`version must be 1, got ${JSON.stringify(m['version'])}`);
  }

  // conn_id
  if (typeof m['conn_id'] !== 'string' || m['conn_id'].length === 0) {
    errors.push('conn_id must be a non-empty string');
  }

  // updated_at
  if (typeof m['updated_at'] !== 'string' || m['updated_at'].length === 0) {
    errors.push('updated_at must be a non-empty string');
  }

  // assignments
  if (
    typeof m['assignments'] !== 'object' ||
    m['assignments'] === null ||
    Array.isArray(m['assignments'])
  ) {
    errors.push('assignments must be a plain object');
  } else {
    const assignments = m['assignments'] as Record<string, unknown>;
    for (const [key, value] of Object.entries(assignments)) {
      if (!key.includes(':')) {
        errors.push(`assignments key "${key}" must contain ":" (column:value format)`);
      }
      if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
        errors.push(
          `assignments["${key}"] value "${String(value)}" is not a valid hex color (expected /^#[0-9a-fA-F]{3,8}$/)`,
        );
      }
    }
  }

  // changelog
  if (!Array.isArray(m['changelog'])) {
    errors.push('changelog must be an array');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Looks up the hex color assigned to a specific column + value pair.
 *
 * Lookup order (most-specific first):
 * 1. Table-qualified key: `"{tableName}.{column}:{value}"` (only when tableName provided)
 * 2. Unqualified key:     `"{column}:{value}"`
 *
 * Returns the hex string if found, or `undefined` if not assigned.
 */
export function resolveColor(
  map: ColorMap,
  column: string,
  value: string,
  tableName?: string,
): string | undefined {
  if (tableName) {
    const qualifiedKey = `${tableName}.${column}:${value}`;
    if (Object.prototype.hasOwnProperty.call(map.assignments, qualifiedKey)) {
      return map.assignments[qualifiedKey];
    }
  }

  const unqualifiedKey = `${column}:${value}`;
  return map.assignments[unqualifiedKey];
}

// ---------------------------------------------------------------------------
// Scale builder
// ---------------------------------------------------------------------------

/**
 * Builds a Vega-Lite `scale` object (domain + range) for a given field name
 * by collecting all assignments in the color map whose column part matches
 * `fieldName` (either an exact unqualified match or a table-qualified key
 * ending in `.{fieldName}`).
 *
 * Returns `{ domain: string[], range: string[] }` suitable for injection into
 * `encoding.color.scale`, or `null` when no assignments match.
 *
 * Example output injected by the compiler:
 *   encoding.color.scale = { domain: ["Europe", "Asia"], range: ["#4a8fe7", "#e74c3c"] }
 */
export function buildColorScale(
  map: ColorMap,
  fieldName: string,
): { domain: string[]; range: string[] } | null {
  const domain: string[] = [];
  const range: string[] = [];

  for (const [key, hex] of Object.entries(map.assignments)) {
    // key format: "column:value" or "table.column:value"
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) continue;

    const columnPart = key.slice(0, colonIdx);
    const value = key.slice(colonIdx + 1);

    // Match exact unqualified ("region") or table-qualified ending (".region")
    const isMatch =
      columnPart === fieldName ||
      columnPart.endsWith(`.${fieldName}`);

    if (isMatch) {
      domain.push(value);
      range.push(hex);
    }
  }

  if (domain.length === 0) return null;
  return { domain, range };
}
