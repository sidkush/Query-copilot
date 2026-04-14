/**
 * clientPiiGuard — pass-through PII masking wrapper.
 *
 * NOTE: The authoritative PII masking contract in this project is
 * SERVER-SIDE. backend/pii_masking.py runs `mask_dataframe()` in the
 * query pipeline BEFORE any row ever reaches the client. That is the
 * invariant documented in CLAUDE.md and enforced by the 6-layer
 * validator.
 *
 * This client-side wrapper exists as a belt-and-braces second pass for
 * dense Scorecard-class tiles where the tile might receive pre-joined
 * data from the dataBlender that wasn't re-masked. It is intentionally
 * LOCAL-ONLY — no network call — because calling out to a server
 * endpoint per render would add latency and re-introduce a data-leak
 * risk (the network round-trip crosses a trust boundary twice).
 *
 * What it does:
 *   1. Scans column names for common PII patterns (substring match,
 *      case-insensitive, Unicode-normalized per security coding rules)
 *   2. Replaces matched column values with "••••••" in the return
 *      object (rows are not mutated in place)
 *   3. Returns { columns, rows, maskedCols } so callers can show a
 *      subtle "masked" badge in the UI
 *
 * If the server-side mask has already run (the expected path) this
 * function is a no-op because there are no PII columns left.
 */

// Substring-based (not \b or exact match) so compound names like
// `employee_ssn`, `customer_email_primary`, `dob_formatted` still match.
// Over-masking is safe; under-masking is the bug we're guarding against.
const PII_PATTERNS = [
  'ssn', 'social_security',
  'email',
  'phone',
  'dob', 'date_of_birth', 'birthdate',
  'credit_card', 'card_number', 'cc_number',
  'passport',
  'drivers_license', 'license_number',
  'address',
  'zip', 'postcode', 'postal_code',
  'ip_address',
  'tax_id',
];

const MASK_PLACEHOLDER = '••••••';

function normalize(s) {
  try {
    return String(s).normalize('NFKC').toLowerCase();
  } catch {
    return String(s).toLowerCase();
  }
}

function columnIsPII(columnName) {
  if (!columnName) return false;
  const norm = normalize(columnName);
  for (const pattern of PII_PATTERNS) {
    if (norm.includes(pattern)) return true;
  }
  return false;
}

/**
 * Scan columns, find any that match PII patterns, return masked rows.
 * Returns the original arrays unchanged if no PII detected (common case
 * post server-mask).
 */
export function guardRows(columns, rows) {
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return { columns, rows, maskedCols: [] };
  }

  const maskedCols = columns.filter(columnIsPII);
  if (maskedCols.length === 0) {
    return { columns, rows, maskedCols: [] };
  }

  const maskedSet = new Set(maskedCols);
  const scrubbed = rows.map((row) => {
    const next = { ...row };
    for (const col of maskedSet) {
      if (next[col] != null && next[col] !== '') {
        next[col] = MASK_PLACEHOLDER;
      }
    }
    return next;
  });

  return { columns, rows: scrubbed, maskedCols };
}

/** Check without masking — useful for UI badges. */
export function detectPIIColumns(columns) {
  if (!Array.isArray(columns)) return [];
  return columns.filter(columnIsPII);
}
