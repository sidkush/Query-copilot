/**
 * Sub-project C — user-authored chart types.
 *
 * A UserChartType is a named template that wraps a ChartSpec with a
 * list of parameters. At instantiate time, the template's
 * `${paramName}` placeholders inside spec field paths are replaced
 * with the caller-supplied values, producing a runnable ChartSpec.
 *
 * This keeps user-authored types first-class alongside the built-in
 * Show-Me recommendations: the editor's chart picker + the agent's
 * `suggest_chart` tool both consume the same registry + instantiation
 * API. Organizations can ship their branded chart types
 * (revenue-waterfall, cohort-retention, funnel-conversion) without
 * forking chart-ir.
 *
 * Phase C foundation ships:
 *   - Type definitions (this file)
 *   - Validator (schema.ts) — checks required fields + param refs
 *   - Registry (registry.ts) — in-memory store with register/get/list
 *   - Instantiator (instantiate.ts) — resolves ${param} placeholders
 *
 * Deferred to Phase C follow-up:
 *   - Backend storage + REST API for per-user / per-org custom types
 *   - Frontend chart picker integration
 *   - Agent tool integration for emitting user-type ChartSpecs
 */

import type { ChartSpec, SemanticType } from '../types';

export type UserChartTypeParamKind =
  | 'field'
  | 'aggregate'
  | 'literal'
  | 'number'
  | 'boolean';

export interface UserChartTypeParam {
  /** Parameter name referenced as `${name}` inside the spec template. */
  name: string;
  /** How the parameter is resolved at instantiate time. */
  kind: UserChartTypeParamKind;
  /** Optional human-readable label for the UI picker. */
  label?: string;
  /** Required semantic type when kind === 'field'. */
  semanticType?: SemanticType;
  /** Whether the parameter must be provided. Default true. */
  required?: boolean;
  /** Optional default value when the caller omits the param. */
  default?: unknown;
}

export interface UserChartType {
  /** Unique id. Conventionally `{org}:{slug}` or `user:{email}:{slug}`. */
  id: string;
  /** Display name shown in the picker. */
  name: string;
  /** Short description for the picker tooltip. */
  description?: string;
  /** Category heading for the picker ('Custom', 'Org', etc.). */
  category?: string;
  /** Monotonic schema version for forward-compat. 1 = Phase C original; 2 = adds tier/version/capabilities. */
  schemaVersion: 1 | 2;
  /** Parameters consumed by the template. */
  parameters: UserChartTypeParam[];
  /**
   * ChartSpec template. Any string value inside the template may use
   * `${paramName}` placeholders that will be substituted at instantiate
   * time. Non-string values (numbers, objects, arrays) are left alone
   * unless they contain strings with placeholders themselves.
   */
  specTemplate: ChartSpec;
}

export interface InstantiateParams {
  [name: string]: unknown;
}
