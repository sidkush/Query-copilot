/**
 * Advanced semantic layer types — D+1 features.
 * Interfaces defined now for forward compatibility; implementation deferred.
 */

/** Row-level access policy — restricts which rows a user can see. */
export interface RowLevelPolicy {
  id: string;
  name: string;
  /** Table this policy applies to. */
  table: string;
  /** SQL WHERE condition that filters rows. */
  condition: string;
  /** Which user roles this policy applies to. */
  roles: string[];
}

/** Drill path — defines a hierarchy for drill-down navigation. */
export interface DrillPath {
  id: string;
  name: string;
  /** Ordered list of dimension ids forming the drill hierarchy. */
  levels: string[];
  /** e.g. ["year", "quarter", "month", "day"] */
}

/** Unit/currency descriptor for a dimension or measure. */
export interface UnitDescriptor {
  type: 'currency' | 'percentage' | 'duration' | 'distance' | 'weight' | 'custom';
  symbol?: string;
  /** ISO 4217 currency code when type=currency */
  currencyCode?: string;
  /** IANA timezone when relevant */
  timezone?: string;
  /** Display format (d3-format string) */
  format?: string;
}

/** LookML-style semantic definition — future DSL target. */
export interface LookMLDefinition {
  /** The LookML source text (future parser target). */
  source: string;
  /** Parsed dimensions (future). */
  dimensions?: unknown[];
  /** Parsed measures (future). */
  measures?: unknown[];
  /** Parse errors (future). */
  errors?: string[];
}

/** Extended SemanticModel with D+1 fields. */
export interface SemanticModelV2Extensions {
  rowLevelPolicies?: RowLevelPolicy[];
  drillPaths?: DrillPath[];
  unitDescriptors?: Record<string, UnitDescriptor>;
  lookml?: LookMLDefinition;
}
