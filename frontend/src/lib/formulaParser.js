import * as acorn from 'acorn';

const AGGREGATES = new Set([
  'SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'CEIL', 'FLOOR', 'IF',
]);

const BLOCKED_FNS = [
  'eval', 'Function', 'require', 'import', 'fetch', 'XMLHttpRequest',
];

/**
 * Parse a formula expression and validate it.
 *
 * @param {string} formula - e.g. "SUM(revenue) / COUNT(DISTINCT user_id)"
 * @param {string[]} availableColumns - columns from the result set
 * @returns {{ valid: boolean, errors: string[], ast: object|null, referencedColumns: string[] }}
 */
export function parseFormula(formula, availableColumns = []) {
  const errors = [];
  const referencedColumns = [];

  if (!formula || !formula.trim()) {
    return { valid: false, errors: ['Formula is empty'], ast: null, referencedColumns: [] };
  }

  // Check for dangerous patterns before parsing (catches string literals too)
  for (const blocked of BLOCKED_FNS) {
    if (formula.includes(blocked)) {
      errors.push(`Blocked function: "${blocked}" is not allowed in formulas`);
    }
  }

  // If blocked, bail early — no need to parse
  if (errors.length > 0) {
    return { valid: false, errors, ast: null, referencedColumns };
  }

  // Try to parse as JavaScript expression (formulas use JS syntax)
  let ast = null;
  try {
    ast = acorn.parseExpressionAt(formula, 0, { ecmaVersion: 2020 });
  } catch (err) {
    errors.push(`Syntax error: ${err.message}`);
    return { valid: false, errors, ast: null, referencedColumns };
  }

  // Walk AST to find column references (Identifier nodes that are not known functions)
  walkIdentifiers(ast, (name) => {
    if (!AGGREGATES.has(name.toUpperCase())) {
      referencedColumns.push(name);
      if (availableColumns.length > 0 && !availableColumns.includes(name)) {
        errors.push(
          `Unknown column: "${name}" (available: ${availableColumns.join(', ')})`
        );
      }
    }
  });

  return { valid: errors.length === 0, errors, ast, referencedColumns };
}

/**
 * Recursively walk AST nodes and invoke callback for each Identifier.
 * @param {object} node
 * @param {(name: string) => void} callback
 */
function walkIdentifiers(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Identifier') {
    callback(node.name);
    return; // Identifiers have no relevant children
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((c) => walkIdentifiers(c, callback));
    } else if (child && typeof child === 'object' && child.type) {
      walkIdentifiers(child, callback);
    }
  }
}

/**
 * Get autocomplete suggestions for a partial token at the cursor.
 *
 * @param {string} partial - the partial identifier being typed
 * @param {string[]} availableColumns - column names from the result set
 * @param {Array<{id?: string, label?: string, formula?: string}>} availableMetrics - custom metrics
 * @returns {Array<{label: string, kind: 'column'|'metric'|'function', detail: string}>}
 */
export function getFormulaSuggestions(partial = '', availableColumns = [], availableMetrics = []) {
  const suggestions = [];
  const lower = partial.toLowerCase();

  for (const col of availableColumns) {
    if (col.toLowerCase().startsWith(lower)) {
      suggestions.push({ label: col, kind: 'column', detail: 'Column' });
    }
  }

  for (const m of availableMetrics) {
    const label = m.label || m.id || '';
    if (label.toLowerCase().startsWith(lower)) {
      suggestions.push({ label, kind: 'metric', detail: m.formula || '' });
    }
  }

  const FUNCTIONS = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'CEIL', 'FLOOR', 'IF'];
  for (const fn of FUNCTIONS) {
    if (fn.toLowerCase().startsWith(lower)) {
      suggestions.push({ label: fn, kind: 'function', detail: `${fn}(...)` });
    }
  }

  return suggestions;
}
