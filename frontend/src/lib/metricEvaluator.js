/**
 * Safe recursive-descent expression evaluator for custom dashboard metrics.
 * Supports: SUM, AVG, COUNT, COUNT(DISTINCT), MIN, MAX, arithmetic (+,-,*,/),
 * column references, and numeric literals. No dynamic code execution.
 */

// ── Tokenizer ────────────────────────────────────────────────────────

const TOKEN = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  FUNC: 'FUNC',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  DISTINCT: 'DISTINCT',
  LBRACE: 'LBRACE',     // {
  RBRACE: 'RBRACE',     // }
  LBRACKET: 'LBRACKET', // [
  RBRACKET: 'RBRACKET', // ]
  COLON: 'COLON',       // :
};

const FUNCTIONS = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']);
const LOD_KEYWORDS = new Set(['FIXED', 'INCLUDE', 'EXCLUDE']);

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ('+-*/'.includes(ch)) { tokens.push({ type: TOKEN.OP, value: ch }); i++; continue; }
    if (ch === '(') { tokens.push({ type: TOKEN.LPAREN }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TOKEN.RPAREN }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TOKEN.COMMA }); i++; continue; }
    if (ch === '{') { tokens.push({ type: TOKEN.LBRACE }); i++; continue; }
    if (ch === '}') { tokens.push({ type: TOKEN.RBRACE }); i++; continue; }
    if (ch === '[') { tokens.push({ type: TOKEN.LBRACKET }); i++; continue; }
    if (ch === ']') { tokens.push({ type: TOKEN.RBRACKET }); i++; continue; }
    if (ch === ':') { tokens.push({ type: TOKEN.COLON }); i++; continue; }

    // Numbers (including decimals)
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) { num += input[i]; i++; }
      const val = parseFloat(num);
      if (isNaN(val)) throw new Error(`Invalid number: ${num}`);
      tokens.push({ type: TOKEN.NUMBER, value: val });
      continue;
    }

    // Identifiers, functions, DISTINCT
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) { word += input[i]; i++; }
      const upper = word.toUpperCase();
      if (FUNCTIONS.has(upper)) {
        tokens.push({ type: TOKEN.FUNC, value: upper });
      } else if (upper === 'DISTINCT') {
        tokens.push({ type: TOKEN.DISTINCT });
      } else if (LOD_KEYWORDS.has(upper)) {
        tokens.push({ type: TOKEN.FUNC, value: upper, isLOD: true });
      } else {
        tokens.push({ type: TOKEN.IDENT, value: word });
      }
      continue;
    }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────
// Grammar:
//   expr         -> term (('+' | '-') term)*
//   term         -> factor (('*' | '/') factor)*
//   factor       -> NUMBER | functionCall | '(' expr ')' | IDENT
//   functionCall -> FUNC '(' [DISTINCT] IDENT ')'

function parse(tokens) {
  let pos = 0;

  function peek() { return tokens[pos] || null; }
  function advance() { return tokens[pos++]; }
  function expect(type) {
    const t = advance();
    if (!t || t.type !== type) throw new Error(`Expected ${type}, got ${t?.type || 'EOF'}`);
    return t;
  }

  function parseExpr() {
    let node = parseTerm();
    while (peek()?.type === TOKEN.OP && (peek().value === '+' || peek().value === '-')) {
      const op = advance().value;
      node = { type: 'binary', op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek()?.type === TOKEN.OP && (peek().value === '*' || peek().value === '/')) {
      const op = advance().value;
      node = { type: 'binary', op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseFactor() {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');

    // LOD expression: { FIXED [dim1, dim2] : expr }
    if (t.type === TOKEN.LBRACE) {
      advance(); // consume {
      const scopeToken = peek();
      if (scopeToken?.type === TOKEN.FUNC && scopeToken.isLOD) {
        const scope = advance().value; // FIXED, INCLUDE, or EXCLUDE

        // Parse dimension list: [dim1] or [dim1, dim2]
        const dimensions = [];
        if (peek()?.type === TOKEN.LBRACKET) {
          advance(); // consume [
          while (peek()?.type !== TOKEN.RBRACKET && peek()) {
            if (peek()?.type === TOKEN.IDENT) {
              dimensions.push(advance().value);
            } else if (peek()?.type === TOKEN.COMMA) {
              advance(); // skip comma
            } else {
              break;
            }
          }
          if (peek()?.type === TOKEN.RBRACKET) advance(); // consume ]
        }

        // Expect colon
        if (peek()?.type === TOKEN.COLON) advance();

        // Parse the inner expression
        const expr = parseExpr();

        // Expect closing brace
        if (peek()?.type === TOKEN.RBRACE) advance();

        return { type: 'lod', scope, dimensions, expression: expr, requiresBackend: true };
      }
      throw new Error('Expected LOD keyword (FIXED, INCLUDE, EXCLUDE) after {');
    }

    if (t.type === TOKEN.NUMBER) {
      advance();
      return { type: 'number', value: t.value };
    }

    if (t.type === TOKEN.FUNC) {
      const func = advance().value;
      expect(TOKEN.LPAREN);
      let distinct = false;
      if (peek()?.type === TOKEN.DISTINCT) { advance(); distinct = true; }
      const col = expect(TOKEN.IDENT).value;
      expect(TOKEN.RPAREN);
      return { type: 'func', func, column: col, distinct };
    }

    if (t.type === TOKEN.LPAREN) {
      advance();
      const node = parseExpr();
      expect(TOKEN.RPAREN);
      return node;
    }

    if (t.type === TOKEN.IDENT) {
      advance();
      return { type: 'column', name: t.value };
    }

    throw new Error(`Unexpected token: ${t.type}`);
  }

  const ast = parseExpr();
  if (pos < tokens.length) throw new Error(`Unexpected token after expression: ${tokens[pos].type}`);
  return ast;
}

// ── AST Analysis ─────────────────────────────────────────────────────

function hasAggregate(node) {
  if (!node) return false;
  if (node.type === 'func') return true;
  if (node.type === 'lod') return true;
  if (node.type === 'binary') return hasAggregate(node.left) || hasAggregate(node.right);
  return false;
}

// ── Aggregate Evaluator (returns a single number) ────────────────────

function evaluateAggregate(node, rows) {
  switch (node.type) {
    case 'number': return node.value;

    case 'func': {
      const vals = rows.map(r => r[node.column]).filter(v => v != null && v !== '');
      const nums = vals.map(Number).filter(n => isFinite(n));

      switch (node.func) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVG': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'COUNT':
          return node.distinct ? new Set(vals).size : vals.length;
        case 'MIN': return nums.length ? Math.min(...nums) : 0;
        case 'MAX': return nums.length ? Math.max(...nums) : 0;
        default: throw new Error(`Unknown function: ${node.func}`);
      }
    }

    case 'binary': {
      const l = evaluateAggregate(node.left, rows);
      const r = evaluateAggregate(node.right, rows);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? 0 : l / r;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }

    case 'lod':
      // LOD expressions require backend processing
      // Return NaN as a marker — the frontend should check requiresBackend before evaluating
      return NaN;

    case 'column':
      throw new Error(`Column reference '${node.name}' cannot be used in an aggregate expression without a function (SUM, AVG, etc.)`);

    default: throw new Error(`Unknown node type: ${node.type}`);
  }
}

// ── Row-level Evaluator (returns value per row) ──────────────────────

function evaluateRow(node, row) {
  switch (node.type) {
    case 'number': return node.value;
    case 'column': {
      const v = Number(row[node.name]);
      return isFinite(v) ? v : 0;
    }
    case 'binary': {
      const l = evaluateRow(node.left, row);
      const r = evaluateRow(node.right, row);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? 0 : l / r;
        default: return 0;
      }
    }
    default: throw new Error(`Row-level evaluation does not support ${node.type} nodes`);
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Evaluate a formula against a set of rows.
 * @param {string} formula - e.g. "SUM(revenue) / COUNT(DISTINCT customer_id)"
 * @param {object[]} rows - data rows
 * @returns {{ value: number|null, error: string|null }}
 */
function containsLOD(node) {
  if (!node) return false;
  if (node.type === 'lod') return true;
  if (node.type === 'binary') return containsLOD(node.left) || containsLOD(node.right);
  return false;
}

export function computeMetricForRows(formula, rows) {
  try {
    const tokens = tokenize(formula);
    const ast = parse(tokens);

    // Check if expression contains LOD — can't evaluate client-side
    if (containsLOD(ast)) {
      return { value: null, error: null, requiresBackend: true, lodDefinition: ast };
    }

    if (hasAggregate(ast)) {
      return { value: evaluateAggregate(ast, rows), error: null };
    } else {
      // Row-level: return average for a single summary value
      const vals = rows.map(r => evaluateRow(ast, r));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { value: avg, error: null };
    }
  } catch (err) {
    return { value: null, error: err.message };
  }
}

/**
 * Inject custom metric columns into a dataset.
 * @param {Array<{id, name, formula}>} customMetrics
 * @param {string[]} columns
 * @param {object[]} rows
 * @returns {{ columns: string[], rows: object[] }}
 */
export function injectMetricColumns(customMetrics, columns, rows) {
  if (!customMetrics?.length || !rows?.length) return { columns, rows };

  const newCols = [...columns];
  const newRows = rows.map(r => ({ ...r }));

  for (const metric of customMetrics) {
    if (!metric.name || !metric.formula) continue;
    if (newCols.includes(metric.name)) continue; // don't shadow real columns

    try {
      const tokens = tokenize(metric.formula);
      const ast = parse(tokens);
      const isAgg = hasAggregate(ast);

      if (isAgg) {
        const value = evaluateAggregate(ast, rows);
        const rounded = Math.round(value * 100) / 100;
        newRows.forEach(r => { r[metric.name] = rounded; });
      } else {
        newRows.forEach(r => { r[metric.name] = Math.round(evaluateRow(ast, r) * 100) / 100; });
      }
      newCols.push(metric.name);
    } catch {
      // Skip metrics with invalid formulas silently
    }
  }

  return { columns: newCols, rows: newRows };
}
