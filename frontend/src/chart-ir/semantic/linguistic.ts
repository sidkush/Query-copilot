/**
 * Sub-project D — semantic layer, Phase D0.
 *
 * LinguisticModel: per-connection synonyms, phrasings, and sample questions
 * that teach the AI agent NL vocabulary for a database schema.
 *
 * Design intent:
 *   - synonyms: map common business terms to actual table/column/value names.
 *   - phrasings: structural sentence templates that encode how users naturally
 *     express relationships (e.g. "X sold to Y" → a join path).
 *   - sampleQuestions: curated NL questions per table, used for onboarding
 *     suggestions and few-shot context injection into the agent prompt.
 *   - changelog: append-only log of how the model was built/modified, so
 *     the agent can explain why it understands certain phrasings.
 *
 * Deferred to Phase D+1:
 *   - Phrasing resolution to SQL fragments.
 *   - Server-side synonym bootstrapping from schema crawl.
 *   - Version migration helpers.
 */

// ---------------------------------------------------------------------------
// Primitive union types
// ---------------------------------------------------------------------------

export type PhrasingType = 'attribute' | 'verb' | 'name' | 'adjective' | 'preposition';

export type SuggestionStatus = 'suggested' | 'accepted' | 'user_created';

// ---------------------------------------------------------------------------
// Structural types
// ---------------------------------------------------------------------------

export interface Phrasing {
  /** Unique id within a LinguisticModel. */
  id: string;
  type: PhrasingType;
  /**
   * A sentence template with `{entity}` placeholders, e.g.
   * `"{customer} purchased {product}"` for a verb phrasing that maps
   * customer → orders.customer_id, product → order_items.product_id.
   */
  template: string;
  /**
   * Entity names referenced inside the template. Each entry should be a
   * table or column name in the connected schema.
   */
  entities: string[];
  /**
   * Optional ordered list of join keys / table names describing the path
   * the agent must traverse to answer queries using this phrasing.
   * Phase D+1 will make this mandatory and schema-validated.
   */
  joinPath?: string[];
  status: SuggestionStatus;
}

export interface SampleQuestion {
  /** Unique id within a LinguisticModel. */
  id: string;
  /** The table this question primarily concerns. */
  table: string;
  /** Plain-English question a user might ask. */
  question: string;
  status: SuggestionStatus;
}

export interface ChangelogEntry {
  /** ISO-8601 timestamp. */
  ts: string;
  action: 'bootstrap' | 'accept_suggestion' | 'user_edit' | 'teach_correction';
  /** What was changed — e.g. "synonyms.tables.customers" or "phrasings/p-001". */
  target: string;
  /** Serialized prior value (optional — not present on bootstrap). */
  before?: unknown;
  /** Serialized new value (optional — not present on deletion). */
  after?: unknown;
}

export interface LinguisticSynonyms {
  /** table name → list of synonymous user terms */
  tables: Record<string, string[]>;
  /** "table.column" or just "column" → list of synonymous user terms */
  columns: Record<string, string[]>;
  /** "table.column=value" → list of synonymous display labels */
  values: Record<string, string[]>;
}

export interface LinguisticModel {
  version: 1;
  /** Connection id this model is scoped to. */
  conn_id: string;
  /** ISO-8601 timestamp of the last mutation. */
  updated_at: string;
  synonyms: LinguisticSynonyms;
  phrasings: Phrasing[];
  sampleQuestions: SampleQuestion[];
  changelog: ChangelogEntry[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface LinguisticValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_PHRASING_TYPES = new Set<string>([
  'attribute',
  'verb',
  'name',
  'adjective',
  'preposition',
]);

/**
 * Validate a LinguisticModel for structural soundness.
 *
 * Checks:
 *   - Must be a plain object (not null / array).
 *   - version must be exactly 1.
 *   - conn_id must be a non-empty string.
 *   - updated_at must be a non-empty string.
 *   - synonyms must be an object with tables / columns / values sub-objects.
 *   - phrasings must be an array; each entry must have a unique id,
 *     a known type, and a non-empty template.
 *   - sampleQuestions must be an array.
 *   - changelog must be an array.
 */
export function validateLinguisticModel(model: unknown): LinguisticValidationResult {
  const errors: string[] = [];

  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return { valid: false, errors: ['LinguisticModel must be a plain object'] };
  }

  const m = model as Record<string, unknown>;

  // version
  if (m['version'] !== 1) {
    errors.push(`version must be 1, got ${String(m['version'])}`);
  }

  // conn_id
  if (typeof m['conn_id'] !== 'string' || !m['conn_id']) {
    errors.push('conn_id must be a non-empty string');
  }

  // updated_at
  if (typeof m['updated_at'] !== 'string' || !m['updated_at']) {
    errors.push('updated_at must be a non-empty string');
  }

  // synonyms
  if (!m['synonyms'] || typeof m['synonyms'] !== 'object' || Array.isArray(m['synonyms'])) {
    errors.push('synonyms must be a plain object');
  } else {
    const syn = m['synonyms'] as Record<string, unknown>;
    if (!syn['tables'] || typeof syn['tables'] !== 'object' || Array.isArray(syn['tables'])) {
      errors.push('synonyms.tables must be an object');
    }
    if (!syn['columns'] || typeof syn['columns'] !== 'object' || Array.isArray(syn['columns'])) {
      errors.push('synonyms.columns must be an object');
    }
    if (!syn['values'] || typeof syn['values'] !== 'object' || Array.isArray(syn['values'])) {
      errors.push('synonyms.values must be an object');
    }
  }

  // phrasings
  if (!Array.isArray(m['phrasings'])) {
    errors.push('phrasings must be an array');
  } else {
    const seenIds = new Set<string>();
    for (let i = 0; i < m['phrasings'].length; i++) {
      const p = m['phrasings'][i];
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        errors.push(`phrasings[${i}] must be an object`);
        continue;
      }
      const phrasing = p as Record<string, unknown>;

      // id
      if (typeof phrasing['id'] !== 'string' || !phrasing['id']) {
        errors.push(`phrasings[${i}].id must be a non-empty string`);
      } else {
        if (seenIds.has(phrasing['id'])) {
          errors.push(`Duplicate phrasing id: ${phrasing['id']}`);
        }
        seenIds.add(phrasing['id']);
      }

      // type
      if (typeof phrasing['type'] !== 'string' || !VALID_PHRASING_TYPES.has(phrasing['type'])) {
        errors.push(
          `phrasings[${i}].type must be one of ${[...VALID_PHRASING_TYPES].join(', ')}, got ${String(phrasing['type'])}`,
        );
      }

      // template
      if (typeof phrasing['template'] !== 'string' || !phrasing['template']) {
        errors.push(`phrasings[${i}].template must be a non-empty string`);
      }
    }
  }

  // sampleQuestions
  if (!Array.isArray(m['sampleQuestions'])) {
    errors.push('sampleQuestions must be an array');
  }

  // changelog
  if (!Array.isArray(m['changelog'])) {
    errors.push('changelog must be an array');
  }

  return { valid: errors.length === 0, errors };
}
