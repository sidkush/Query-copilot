/**
 * Web Worker for sandboxed formula evaluation.
 * Runs metricEvaluator computations off the main thread with timeout protection.
 */

// Inline the evaluator logic since workers can't import ES modules directly in all environments.
// This duplicates the core evaluation functions from metricEvaluator.js.

const TOKEN = {
  NUMBER: 'NUMBER', IDENT: 'IDENT', FUNC: 'FUNC', OP: 'OP',
  LPAREN: 'LPAREN', RPAREN: 'RPAREN', COMMA: 'COMMA', DISTINCT: 'DISTINCT',
  LBRACE: 'LBRACE', RBRACE: 'RBRACE', LBRACKET: 'LBRACKET', RBRACKET: 'RBRACKET',
  COLON: 'COLON',
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
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) { num += input[i]; i++; }
      const val = parseFloat(num);
      if (isNaN(val)) throw new Error(`Invalid number: ${num}`);
      tokens.push({ type: TOKEN.NUMBER, value: val });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) { word += input[i]; i++; }
      const upper = word.toUpperCase();
      if (FUNCTIONS.has(upper)) tokens.push({ type: TOKEN.FUNC, value: upper });
      else if (upper === 'DISTINCT') tokens.push({ type: TOKEN.DISTINCT });
      else if (LOD_KEYWORDS.has(upper)) tokens.push({ type: TOKEN.FUNC, value: upper, isLOD: true });
      else tokens.push({ type: TOKEN.IDENT, value: word });
      continue;
    }
    throw new Error(`Unexpected character: '${ch}'`);
  }
  return tokens;
}

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
    if (t.type === TOKEN.LBRACE) {
      advance();
      const scopeToken = peek();
      if (scopeToken?.type === TOKEN.FUNC && scopeToken.isLOD) {
        const scope = advance().value;
        const dimensions = [];
        if (peek()?.type === TOKEN.LBRACKET) {
          advance();
          while (peek()?.type !== TOKEN.RBRACKET && peek()) {
            if (peek()?.type === TOKEN.IDENT) dimensions.push(advance().value);
            else if (peek()?.type === TOKEN.COMMA) advance();
            else break;
          }
          if (peek()?.type === TOKEN.RBRACKET) advance();
        }
        if (peek()?.type === TOKEN.COLON) advance();
        const expr = parseExpr();
        if (peek()?.type === TOKEN.RBRACE) advance();
        return { type: 'lod', scope, dimensions, expression: expr, requiresBackend: true };
      }
      throw new Error('Expected LOD keyword after {');
    }
    if (t.type === TOKEN.NUMBER) { advance(); return { type: 'number', value: t.value }; }
    if (t.type === TOKEN.FUNC) {
      const func = advance().value;
      expect(TOKEN.LPAREN);
      let distinct = false;
      if (peek()?.type === TOKEN.DISTINCT) { advance(); distinct = true; }
      const col = expect(TOKEN.IDENT).value;
      expect(TOKEN.RPAREN);
      return { type: 'func', func, column: col, distinct };
    }
    if (t.type === TOKEN.LPAREN) { advance(); const node = parseExpr(); expect(TOKEN.RPAREN); return node; }
    if (t.type === TOKEN.IDENT) { advance(); return { type: 'column', name: t.value }; }
    throw new Error(`Unexpected token: ${t.type}`);
  }
  const ast = parseExpr();
  if (pos < tokens.length) throw new Error(`Unexpected token: ${tokens[pos].type}`);
  return ast;
}

function hasAggregate(node) {
  if (!node) return false;
  if (node.type === 'func' || node.type === 'lod') return true;
  if (node.type === 'binary') return hasAggregate(node.left) || hasAggregate(node.right);
  return false;
}

function evaluateAggregate(node, rows) {
  switch (node.type) {
    case 'number': return node.value;
    case 'func': {
      const vals = rows.map(r => r[node.column]).filter(v => v != null && v !== '');
      const nums = vals.map(Number).filter(n => isFinite(n));
      switch (node.func) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVG': return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        case 'COUNT': return node.distinct ? new Set(vals).size : vals.length;
        case 'MIN': return nums.length ? Math.min(...nums) : 0;
        case 'MAX': return nums.length ? Math.max(...nums) : 0;
        default: throw new Error(`Unknown function: ${node.func}`);
      }
    }
    case 'binary': {
      const l = evaluateAggregate(node.left, rows);
      const r = evaluateAggregate(node.right, rows);
      switch (node.op) {
        case '+': return l + r; case '-': return l - r;
        case '*': return l * r; case '/': return r === 0 ? 0 : l / r;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }
    case 'lod': return NaN;
    case 'column': throw new Error(`Column '${node.name}' needs an aggregate function`);
    default: throw new Error(`Unknown node type: ${node.type}`);
  }
}

function evaluateRow(node, row) {
  switch (node.type) {
    case 'number': return node.value;
    case 'column': { const v = Number(row[node.name]); return isFinite(v) ? v : 0; }
    case 'binary': {
      const l = evaluateRow(node.left, row);
      const r = evaluateRow(node.right, row);
      switch (node.op) {
        case '+': return l + r; case '-': return l - r;
        case '*': return l * r; case '/': return r === 0 ? 0 : l / r;
        default: return 0;
      }
    }
    default: throw new Error(`Row-level evaluation does not support ${node.type}`);
  }
}

// ── Message handler ──────────────────────────────────────────

self.onmessage = function (e) {
  const { id, type, formula, rows, metrics, columns } = e.data;
  try {
    if (type === 'compute') {
      const tokens = tokenize(formula);
      const ast = parse(tokens);
      if (hasAggregate(ast)) {
        self.postMessage({ id, value: evaluateAggregate(ast, rows), error: null });
      } else {
        const vals = rows.map(r => evaluateRow(ast, r));
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        self.postMessage({ id, value: avg, error: null });
      }
    } else if (type === 'inject') {
      // Inject custom metric columns
      const newCols = [...columns];
      const newRows = rows.map(r => ({ ...r }));
      for (const metric of metrics) {
        if (!metric.name || !metric.formula || newCols.includes(metric.name)) continue;
        try {
          const tokens = tokenize(metric.formula);
          const ast = parse(tokens);
          if (hasAggregate(ast)) {
            const value = Math.round(evaluateAggregate(ast, rows) * 100) / 100;
            newRows.forEach(r => { r[metric.name] = value; });
          } else {
            newRows.forEach(r => { r[metric.name] = Math.round(evaluateRow(ast, r) * 100) / 100; });
          }
          newCols.push(metric.name);
        } catch { /* skip invalid */ }
      }
      self.postMessage({ id, columns: newCols, rows: newRows, error: null });
    }
  } catch (err) {
    self.postMessage({ id, value: null, error: err.message });
  }
};
