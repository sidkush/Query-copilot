# Analyst Pro — Plan 8a: Calc Expression Parser + Function Catalogue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Tableau-calc syntax into a typed AST, catalogue every function from `Build_Tableau.md` §V.1, validate + type-check expressions before they reach the SQL emitter, and expose a `/api/v1/calcs/validate` endpoint behind `FEATURE_ANALYST_PRO`.

**Architecture:** Four new modules under `backend/vizql/` plus one new router endpoint:

1. `calc_parser.py` — `CalcLexer` (hand-written tokenizer) + `CalcParser` (recursive descent). Emits a frozen-dataclass AST (`Literal`, `FieldRef`, `ParamRef`, `FnCall`, `BinaryOp`, `UnaryOp`, `IfExpr`, `CaseExpr`, `LodExpr`). `parse(formula) → CalcExpr | ParseError`. Pratt-style precedence climbing for binary ops. Supports both `//` and `--` line comments. Field reference grammar follows §V (bracketed `[Name]`); parameter grammar follows §VIII.4 (`<Parameters.Name>` and bracketed `[Parameters].[Name]` form).
2. `calc_functions.py` — `FunctionDef` registry (`FUNCTIONS: dict[str, FunctionDef]`) covering every name from §V.1 (Aggregate, Logical, String, Date, Type-conversion, User, Spatial, Passthrough, Analytics-ext). `TypeConstraint` union: `TypeString`, `TypeNumber`, `TypeInteger`, `TypeDate`, `TypeDateTime`, `TypeBool`, `TypeSpatial`, `TypeAny`, `TypeSameAs(arg_index)`. Each entry holds `arg_types`, `min_args`, `max_args`, `is_aggregate`, `is_table_calc`, `return_type` (constant or callable), `sql_template: dict[Dialect, str]`, `docstring`. Table calc names register only their NAMES + signatures here; full semantics live in Plan 8c.
3. `calc_typecheck.py` — `typecheck(expr, schema) → InferredType | TypeError`. Bottom-up walker resolves `FieldRef` → schema type, `FnCall` → `FunctionDef.return_type`, validates arg arity + types, rejects mixing aggregate + non-aggregate at the same nesting level (unless wrapped in LOD), rejects unknown function names.
4. `calc_to_expression.py` — `compile_calc(expr, dialect, schema) → sa.SQLQueryExpression` (the SQL AST `SQLQueryExpression` from Plan 7c `sql_ast.py`). `FnCall` dispatches via `FunctionDef.sql_template[dialect]`; `ParamRef` substitutes via the public `format_as_literal()` helper added in Task 10 (delegating to `param_substitution._render_literal`); `LodExpr` emits a placeholder `LogicalOpOver` / correlated-subquery marker that Plan 8b finalises. RAWSQL_* gated behind `FEATURE_RAWSQL_ENABLED` (default `False`).

5. New endpoint `POST /api/v1/calcs/validate` in `backend/routers/query_routes.py`: `{ formula, schema_ref }` → `{ valid, inferredType, errors[] }`. Feature-flagged on `FEATURE_ANALYST_PRO`; rate-limited at 10 calls / 30 s per user via a new in-process sliding-window keyed on `email`.

6. `backend/vizql/CALC_LANGUAGE.md` — BNF grammar + function catalogue reference + known gaps from Tableau.

7. `backend/tests/test_calc_parser.py` — every function category gets at least one positive + one negative test; LOD parse for FIXED/INCLUDE/EXCLUDE; nested IF/CASE; precedence; bracketed names with spaces; comments; injection attempts.

**Tech Stack:** Python 3.10+ stdlib only for parser + typechecker. `dataclasses(frozen=True, slots=True)` everywhere. `tuple[T, ...]` for sequence fields. `mypy --strict` clean on every new module. Tests via `pytest` reusing `backend/tests/` config. SQL-AST consumer types come from `backend/vizql/sql_ast.py` (Plan 7c). Dialect enum from `backend/vizql/dialects/registry.py` (Plan 7d). Optional `sqlglot` use ONLY in Task 12's smoke test (round-trip emitted SQL through `sqlglot.parse_one`).

**Scope guard.** No LOD execution semantics — Plan 8b owns the FIXED correlated subquery + INCLUDE/EXCLUDE OVER lowering. No table-calc evaluator — Plan 8c. No Monaco editor / autocomplete UI — Plan 8d. No new Anthropic calls. No DB execution. The compiler emits `SQLQueryExpression` shapes that Plan 7d already knows how to render; we do not touch dialect emitters in this plan.

---

## Reference index (every task author reads before editing)

- `docs/Build_Tableau.md`:
  - **§V.1** — full function catalogue. Authoritative name list. Use canonical Tableau spelling: `STARTSWITH` (not `STARTS_WITH`), `COUNTD` (not `COUNT_DISTINCT`), `DATETRUNC` (not `DATE_TRUNC`).
  - **§V.4** — viz level of granularity: `granularity = union(Rows-dims, Cols-dims, Detail, Path, Pages)`. Filters + measure pills excluded. Used by typechecker to validate aggregate context.
  - **§V.5** — null handling: NULL measures are skipped from aggregation unless explicitly counted; `COUNT` / `COUNTD` exclude NULLs; `ZN` coerces NULL → 0; `IFNULL` / `ISNULL` are total functions on NULL.
  - **§VIII.4** — parameter reference grammar: `<Parameters.ParamName>` (custom-SQL-style angle bracket) and `[Parameters].[ParamName]` (bracketed dotted form). Binding is **string substitution** (not a prepared statement), so substitution MUST go through `format_as_literal()` (this plan's Task 10 wrapper around `param_substitution._render_literal`). NEVER interpolate raw values.
  - **§XXV.1** — calc editor ergonomics is Tableau's #1 weakness. Plan 8a's parser is the substrate Plan 8d's Monaco editor will lean on; therefore the parser MUST emit precise positions (line, column, expected token) for autocomplete + diagnostics.
  - **Appendix A.14** — `AggregationType` enum: `Sum`, `Avg`, `Count`, `Countd`, `Min`, `Max`, `Median`, `Var`, `Varp`, `Stdev`, `Stdevp`, `Kurtosis`, `Skewness`, `Attr`, `None`, `Percentile`, `Collect`, `InOut`, `End`, `Quart1`, `Quart3`, `User`, plus date truncations (`Year`, `Qtr`, `Month`, `Week`, `Day`, `Hour`, `Minute`, `Second`, `Weekday`, `MonthYear`, `Mdy`, `TruncYear`, `TruncQtr`, `TruncMonth`, `TruncWeek`, `TruncDay`, `TruncHour`, `TruncMinute`, `TruncSecond`). The aggregate `FunctionDef` entries' `is_aggregate=True` flag mirrors the non-truncation half of this list.
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 8a — authoritative scope (target = 12 tasks; deliverables = parser + catalogue + 400 on unknown function + at least one positive + one negative test per function).
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7a-visualspec-ir.md` — shipped. `backend/vizql/spec.py :: Calculation { id, formula, is_adhoc }` is what Plan 8a parses.
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7c-sql-ast-optimizer.md` — shipped. `backend/vizql/sql_ast.py` is the target IR for Task 10's compiler. Reuse `Column`, `Literal`, `BinaryOp`, `FnCall`, `Case`, `Cast`, `Window`, `Subquery`. Do NOT introduce a new SQL AST.
- `docs/superpowers/plans/2026-04-17-analyst-pro-plan-7d-dialect-emitters.md` — shipped. `backend/vizql/dialects/registry.py :: Dialect` enum. `sql_template[Dialect.DUCKDB]` etc. lookups in `FunctionDef`.
- `backend/vizql/spec.py` — `Calculation` + `LodCalculation` dataclasses already exist; we wire parsing as a pure function (`parse(formula)`) and do NOT mutate `Calculation` shape.
- `backend/vizql/sql_ast.py` — read end-to-end before Task 10. Consumer of `compile_calc()` output.
- `backend/vizql/dialects/registry.py` — `Dialect` enum values.
- `backend/param_substitution.py` — `_render_literal()` (currently private) is the canonical literal-formatting routine. Task 10 adds a public `format_as_literal(value, ptype)` wrapper.
- `backend/routers/query_routes.py` — precedent rate-limit pattern (`_check_rate_limit_memory` lines 97-119). Task 11 mirrors the pattern keyed by `email` instead of `(email, conn_id)`.
- `backend/config.py:263` — `FEATURE_ANALYST_PRO: bool = False` already exists. Task 11 also adds `FEATURE_RAWSQL_ENABLED: bool = False` (Task 8 references it).
- `QueryCopilot V1/CLAUDE.md`, `docs/claude/security-core.md`, `docs/claude/config-defaults.md` — security invariants. Read-only DB, 6-layer SQL validator, PII masking — Plan 8a NEVER weakens them. RAWSQL_* gated, parameter substitution via `format_as_literal`.
- `docs/claude/config-defaults.md` — every numeric constant introduced in this plan (rate limit window/max, max formula length, max calc nesting depth) MUST be added to the "Query / SQL guardrails" or a new "Calc parser" subsection in the same commit that introduces the constant.

---

## File structure

```
backend/
  vizql/
    calc_parser.py          [NEW]   Lexer + recursive-descent parser → CalcExpr AST
    calc_ast.py             [NEW]   Frozen dataclasses: Literal, FieldRef, ParamRef, FnCall, BinaryOp, UnaryOp, IfExpr, CaseExpr, LodExpr
    calc_functions.py       [NEW]   FUNCTIONS dict + FunctionDef + TypeConstraint
    calc_typecheck.py       [NEW]   Bottom-up type inference + arg-arity + aggregate-context validation
    calc_to_expression.py   [NEW]   CalcExpr → sql_ast.SQLQueryExpression (uses FunctionDef.sql_template)
    CALC_LANGUAGE.md        [NEW]   BNF grammar + catalogue reference + Tableau gaps
  routers/
    query_routes.py         [MOD]   New POST /api/v1/calcs/validate endpoint + per-user rate limit (10/30s)
  param_substitution.py     [MOD]   Add public format_as_literal(value, ptype) wrapper
  config.py                 [MOD]   Add FEATURE_RAWSQL_ENABLED (default False) + CALC_RATE_LIMIT_PER_30S (default 10) + MAX_CALC_FORMULA_LEN (default 10_000) + MAX_CALC_NESTING (default 32)
  tests/
    test_calc_parser.py     [NEW]   Lexer + parser + LOD + comments + bracketed names + injection
    test_calc_functions.py  [NEW]   Every catalogue entry: positive + negative
    test_calc_typecheck.py  [NEW]   Aggregate context, type mismatch, unknown function
    test_calc_compile.py    [NEW]   compile_calc → sql_ast shapes for each category
    test_calc_routes.py     [NEW]   /api/v1/calcs/validate endpoint + rate-limit + feature-flag gate
docs/claude/
  config-defaults.md        [MOD]   Add Calc parser subsection (rate limit, max formula len, nesting cap)
docs/
  analyst_pro_tableau_parity_roadmap.md  [MOD]   Mark Plan 8a shipped (Task 12)
```

---

## Task 1: Scaffold `calc_ast.py` + package wiring

**Files:**
- Create: `backend/vizql/calc_ast.py`
- Modify: `backend/vizql/__init__.py` (re-export new module)
- Test: `backend/tests/test_calc_parser.py` (smoke import)

- [ ] **Step 1: Write the failing import test**

```python
# backend/tests/test_calc_parser.py
import pytest


def test_calc_ast_module_imports():
    from backend.vizql import calc_ast as ca

    # Frozen dataclasses, all expected node types exist.
    assert ca.Literal(value=1, data_type="integer").data_type == "integer"
    assert ca.FieldRef(field_name="Sales").field_name == "Sales"
    assert ca.ParamRef(param_name="Region").param_name == "Region"
    assert ca.FnCall(name="SUM", args=(ca.FieldRef("Sales"),)).name == "SUM"
    assert ca.BinaryOp(op="+", lhs=ca.Literal(1, "integer"), rhs=ca.Literal(2, "integer")).op == "+"
    assert ca.UnaryOp(op="-", operand=ca.Literal(1, "integer")).op == "-"
    assert ca.IfExpr(
        cond=ca.Literal(True, "boolean"),
        then_=ca.Literal(1, "integer"),
        elifs=(),
        else_=None,
    ).cond.value is True
    assert ca.CaseExpr(scrutinee=None, whens=(), else_=None).whens == ()
    assert ca.LodExpr(kind="FIXED", dims=(ca.FieldRef("Region"),), body=ca.FnCall("SUM", (ca.FieldRef("Sales"),))).kind == "FIXED"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_calc_parser.py::test_calc_ast_module_imports -v
```

Expected: `ModuleNotFoundError: No module named 'backend.vizql.calc_ast'`.

- [ ] **Step 3: Create `calc_ast.py` with all node dataclasses**

```python
# backend/vizql/calc_ast.py
"""Calc-language AST. Plan 8a (Build_Tableau.md §V).

Frozen dataclasses produced by `calc_parser.parse()`. Consumed by
`calc_typecheck.typecheck()` and `calc_to_expression.compile_calc()`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal as _Lit, Optional, Union


@dataclass(frozen=True, slots=True)
class Position:
    line: int
    column: int


@dataclass(frozen=True, slots=True)
class Literal:
    value: object
    data_type: str  # "string" | "integer" | "real" | "boolean" | "date" | "datetime" | "null"
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class FieldRef:
    field_name: str
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class ParamRef:
    param_name: str
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class FnCall:
    name: str  # canonical UPPERCASE
    args: tuple["CalcExpr", ...]
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class BinaryOp:
    op: str  # "+", "-", "*", "/", "=", "<>", "<=", ">=", "<", ">", "AND", "OR", "IN"
    lhs: "CalcExpr"
    rhs: "CalcExpr"
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class UnaryOp:
    op: str  # "-", "NOT"
    operand: "CalcExpr"
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class IfExpr:
    cond: "CalcExpr"
    then_: "CalcExpr"
    elifs: tuple[tuple["CalcExpr", "CalcExpr"], ...]  # (cond, branch) pairs
    else_: Optional["CalcExpr"]
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class CaseExpr:
    """`scrutinee=None` ⇒ searched CASE; else simple CASE."""
    scrutinee: Optional["CalcExpr"]
    whens: tuple[tuple["CalcExpr", "CalcExpr"], ...]
    else_: Optional["CalcExpr"]
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class LodExpr:
    kind: _Lit["FIXED", "INCLUDE", "EXCLUDE"]
    dims: tuple[FieldRef, ...]
    body: "CalcExpr"
    pos: Optional[Position] = None


CalcExpr = Union[Literal, FieldRef, ParamRef, FnCall, BinaryOp, UnaryOp, IfExpr, CaseExpr, LodExpr]


__all__ = [
    "Position", "Literal", "FieldRef", "ParamRef", "FnCall",
    "BinaryOp", "UnaryOp", "IfExpr", "CaseExpr", "LodExpr", "CalcExpr",
]
```

- [ ] **Step 4: Re-export from package**

Edit `backend/vizql/__init__.py`. Append:

```python
from . import calc_ast as calc_ast  # Plan 8a
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && python -m pytest tests/test_calc_parser.py::test_calc_ast_module_imports -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/calc_ast.py backend/vizql/__init__.py backend/tests/test_calc_parser.py
git commit -m "feat(analyst-pro): scaffold calc AST + package wiring (Plan 8a T1)"
```

---

## Task 2: Implement `CalcLexer`

**Files:**
- Create: `backend/vizql/calc_parser.py` (lexer half only this task)
- Test: `backend/tests/test_calc_parser.py` (extend with lexer tests)

- [ ] **Step 1: Write the failing tests**

```python
# Append to backend/tests/test_calc_parser.py
def test_lexer_tokenises_literals_and_idents():
    from backend.vizql.calc_parser import CalcLexer, TokenKind

    toks = list(CalcLexer("SUM([Sales]) + 1.5").tokens())
    kinds = [t.kind for t in toks]
    assert kinds == [
        TokenKind.IDENT, TokenKind.LPAREN, TokenKind.LBRACKET,
        TokenKind.IDENT, TokenKind.RBRACKET, TokenKind.RPAREN,
        TokenKind.OP, TokenKind.NUMBER, TokenKind.EOF,
    ]


def test_lexer_handles_string_escapes_and_comments():
    from backend.vizql.calc_parser import CalcLexer, TokenKind

    src = """// header
    "hello \\"world\\"" -- trailing
    'single'"""
    toks = [t for t in CalcLexer(src).tokens() if t.kind != TokenKind.EOF]
    assert toks[0].kind == TokenKind.STRING and toks[0].value == 'hello "world"'
    assert toks[1].kind == TokenKind.STRING and toks[1].value == "single"


def test_lexer_recognises_keywords_case_insensitive():
    from backend.vizql.calc_parser import CalcLexer, TokenKind

    toks = list(CalcLexer("if x THEN 1 elseif y then 2 else 3 end").tokens())
    keyword_values = [t.value for t in toks if t.kind == TokenKind.KEYWORD]
    assert keyword_values == ["IF", "THEN", "ELSEIF", "THEN", "ELSE", "END"]


def test_lexer_rejects_unterminated_string():
    from backend.vizql.calc_parser import CalcLexer, LexError

    import pytest
    with pytest.raises(LexError):
        list(CalcLexer('"open').tokens())
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -k lexer -v
```

Expected: collection errors (`ModuleNotFoundError` on `calc_parser`).

- [ ] **Step 3: Implement `calc_parser.py` with lexer only**

```python
# backend/vizql/calc_parser.py
"""Calc-language lexer + recursive-descent parser. Plan 8a.

Hand-written so we control error positions for the Plan 8d Monaco editor
diagnostics. No external lexer/parser deps.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Iterator, Optional

from . import calc_ast as ca


_KEYWORDS = frozenset({
    "IF", "THEN", "ELSE", "ELSEIF", "END",
    "CASE", "WHEN",
    "AND", "OR", "NOT", "IN",
    "FIXED", "INCLUDE", "EXCLUDE",
    "TRUE", "FALSE", "NULL",
})


class TokenKind(enum.Enum):
    IDENT = "IDENT"
    KEYWORD = "KEYWORD"
    STRING = "STRING"
    NUMBER = "NUMBER"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    LBRACKET = "LBRACKET"
    RBRACKET = "RBRACKET"
    LBRACE = "LBRACE"
    RBRACE = "RBRACE"
    LANGLE_PARAM = "LANGLE_PARAM"  # `<Parameters.X>` form opener
    RANGLE_PARAM = "RANGLE_PARAM"
    COMMA = "COMMA"
    COLON = "COLON"
    DOT = "DOT"
    OP = "OP"
    EOF = "EOF"


@dataclass(frozen=True, slots=True)
class Token:
    kind: TokenKind
    value: object
    line: int
    column: int


class LexError(ValueError):
    def __init__(self, msg: str, line: int, column: int):
        super().__init__(f"{msg} at line {line} col {column}")
        self.line = line
        self.column = column


class CalcLexer:
    _MULTI_OPS = ("<>", "<=", ">=", "==")
    _SINGLE_OPS = "+-*/=<>"

    def __init__(self, src: str) -> None:
        self.src = src
        self.i = 0
        self.line = 1
        self.col = 1

    def tokens(self) -> Iterator[Token]:
        while self.i < len(self.src):
            ch = self.src[self.i]
            if ch in " \t\r":
                self._advance(1)
            elif ch == "\n":
                self._newline()
            elif ch == "/" and self._peek(1) == "/":
                self._skip_line_comment()
            elif ch == "-" and self._peek(1) == "-":
                self._skip_line_comment()
            elif ch in "\"'":
                yield self._read_string(ch)
            elif ch.isdigit() or (ch == "." and self._peek(1).isdigit()):
                yield self._read_number()
            elif ch == "[":
                yield self._emit(TokenKind.LBRACKET, "["); self._advance(1)
            elif ch == "]":
                yield self._emit(TokenKind.RBRACKET, "]"); self._advance(1)
            elif ch == "(":
                yield self._emit(TokenKind.LPAREN, "("); self._advance(1)
            elif ch == ")":
                yield self._emit(TokenKind.RPAREN, ")"); self._advance(1)
            elif ch == "{":
                yield self._emit(TokenKind.LBRACE, "{"); self._advance(1)
            elif ch == "}":
                yield self._emit(TokenKind.RBRACE, "}"); self._advance(1)
            elif ch == ",":
                yield self._emit(TokenKind.COMMA, ","); self._advance(1)
            elif ch == ":":
                yield self._emit(TokenKind.COLON, ":"); self._advance(1)
            elif ch == ".":
                yield self._emit(TokenKind.DOT, "."); self._advance(1)
            elif ch == "<":
                yield self._read_op_or_param_open()
            elif ch == ">":
                # `>` could close a <Parameters.X> form. The parser disambiguates.
                # Lex as RANGLE_PARAM only if a previous LANGLE_PARAM is unclosed —
                # tracked by the parser. Here we always emit `OP`; the parser
                # treats `>` after `<Parameters.X` as the closer.
                yield self._emit(TokenKind.OP, ">"); self._advance(1)
            elif ch in self._SINGLE_OPS:
                # Try multi-char first.
                two = self.src[self.i:self.i + 2]
                if two in self._MULTI_OPS:
                    yield self._emit(TokenKind.OP, two); self._advance(2)
                else:
                    yield self._emit(TokenKind.OP, ch); self._advance(1)
            elif ch.isalpha() or ch == "_":
                yield self._read_ident()
            else:
                raise LexError(f"unexpected character {ch!r}", self.line, self.col)
        yield Token(TokenKind.EOF, None, self.line, self.col)

    # ---- helpers ----
    def _peek(self, k: int) -> str:
        j = self.i + k
        return self.src[j] if j < len(self.src) else ""

    def _advance(self, n: int) -> None:
        self.i += n
        self.col += n

    def _newline(self) -> None:
        self.i += 1
        self.line += 1
        self.col = 1

    def _emit(self, kind: TokenKind, value: object) -> Token:
        return Token(kind, value, self.line, self.col)

    def _skip_line_comment(self) -> None:
        while self.i < len(self.src) and self.src[self.i] != "\n":
            self._advance(1)

    def _read_string(self, quote: str) -> Token:
        start_line, start_col = self.line, self.col
        self._advance(1)  # consume opening quote
        out = []
        while True:
            if self.i >= len(self.src):
                raise LexError("unterminated string", start_line, start_col)
            ch = self.src[self.i]
            if ch == "\\" and self._peek(1) in ('"', "'", "\\"):
                out.append(self._peek(1))
                self._advance(2)
            elif ch == quote:
                self._advance(1)
                return Token(TokenKind.STRING, "".join(out), start_line, start_col)
            elif ch == "\n":
                raise LexError("newline in string", start_line, start_col)
            else:
                out.append(ch)
                self._advance(1)

    def _read_number(self) -> Token:
        start_line, start_col = self.line, self.col
        start = self.i
        seen_dot = False
        while self.i < len(self.src) and (self.src[self.i].isdigit() or (self.src[self.i] == "." and not seen_dot)):
            if self.src[self.i] == ".":
                seen_dot = True
            self._advance(1)
        text = self.src[start:self.i]
        value: object = float(text) if seen_dot else int(text)
        return Token(TokenKind.NUMBER, value, start_line, start_col)

    def _read_ident(self) -> Token:
        start_line, start_col = self.line, self.col
        start = self.i
        while self.i < len(self.src) and (self.src[self.i].isalnum() or self.src[self.i] == "_"):
            self._advance(1)
        text = self.src[start:self.i]
        upper = text.upper()
        if upper in _KEYWORDS:
            return Token(TokenKind.KEYWORD, upper, start_line, start_col)
        return Token(TokenKind.IDENT, text, start_line, start_col)

    def _read_op_or_param_open(self) -> Token:
        # `<Parameters.` opens a parameter ref under §VIII.4. Otherwise `<` / `<=` / `<>`.
        start_line, start_col = self.line, self.col
        if self.src.startswith("<Parameters.", self.i):
            self._advance(len("<Parameters."))
            return Token(TokenKind.LANGLE_PARAM, "Parameters.", start_line, start_col)
        two = self.src[self.i:self.i + 2]
        if two in ("<=", "<>"):
            self._advance(2)
            return Token(TokenKind.OP, two, start_line, start_col)
        self._advance(1)
        return Token(TokenKind.OP, "<", start_line, start_col)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -k lexer -v
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_parser.py backend/tests/test_calc_parser.py
git commit -m "feat(analyst-pro): hand-written calc lexer with position tracking (Plan 8a T2)"
```

---

## Task 3: Implement `CalcParser` core (literals, refs, function calls)

**Files:**
- Modify: `backend/vizql/calc_parser.py` (add parser class)
- Test: `backend/tests/test_calc_parser.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_parse_literal_and_field_ref():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    assert parse("123") == ca.Literal(123, "integer", pos=ca.Position(1, 1))
    assert parse("'hi'").value == "hi"
    assert parse("[Sales]").field_name == "Sales"
    assert parse("[Order Date]").field_name == "Order Date"  # bracketed names with spaces


def test_parse_param_ref_both_grammars():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    angle = parse("<Parameters.Region>")
    assert isinstance(angle, ca.ParamRef) and angle.param_name == "Region"

    bracketed = parse("[Parameters].[Region]")
    assert isinstance(bracketed, ca.ParamRef) and bracketed.param_name == "Region"


def test_parse_function_call_with_multiple_args():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("DATEDIFF('day', [Start], [End])")
    assert isinstance(expr, ca.FnCall) and expr.name == "DATEDIFF"
    assert len(expr.args) == 3
    assert expr.args[0].value == "day"
    assert expr.args[1].field_name == "Start"


def test_parse_error_includes_position():
    from backend.vizql.calc_parser import parse, ParseError

    import pytest
    with pytest.raises(ParseError) as excinfo:
        parse("SUM(")
    assert "line 1" in str(excinfo.value) and "expected" in str(excinfo.value).lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -k "parse_literal or parse_param_ref or parse_function or parse_error" -v
```

Expected: ImportError (`parse` not in `calc_parser`).

- [ ] **Step 3: Append parser to `calc_parser.py`**

```python
# Append to backend/vizql/calc_parser.py


class ParseError(ValueError):
    def __init__(self, msg: str, line: int, column: int):
        super().__init__(f"{msg} at line {line} col {column}")
        self.line = line
        self.column = column


class CalcParser:
    """Recursive-descent parser. One pass over the token stream."""

    def __init__(self, src: str, max_depth: int = 32) -> None:
        self.tokens: list[Token] = list(CalcLexer(src).tokens())
        self.pos = 0
        self.max_depth = max_depth
        self.depth = 0

    def parse(self) -> ca.CalcExpr:
        expr = self._parse_expr()
        self._expect(TokenKind.EOF)
        return expr

    # ---- precedence climbing ----
    def _parse_expr(self) -> ca.CalcExpr:
        # Full expression entry — Task 4 wires precedence; for T3 stub via primary.
        return self._parse_primary()

    def _parse_primary(self) -> ca.CalcExpr:
        if self.depth >= self.max_depth:
            t = self._peek()
            raise ParseError("max calc nesting depth exceeded", t.line, t.column)
        self.depth += 1
        try:
            return self._parse_primary_inner()
        finally:
            self.depth -= 1

    def _parse_primary_inner(self) -> ca.CalcExpr:
        t = self._peek()
        pos = ca.Position(t.line, t.column)

        if t.kind == TokenKind.NUMBER:
            self._next()
            kind = "integer" if isinstance(t.value, int) else "real"
            return ca.Literal(t.value, kind, pos=pos)

        if t.kind == TokenKind.STRING:
            self._next()
            return ca.Literal(t.value, "string", pos=pos)

        if t.kind == TokenKind.KEYWORD and t.value in ("TRUE", "FALSE"):
            self._next()
            return ca.Literal(t.value == "TRUE", "boolean", pos=pos)

        if t.kind == TokenKind.KEYWORD and t.value == "NULL":
            self._next()
            return ca.Literal(None, "null", pos=pos)

        if t.kind == TokenKind.LBRACKET:
            return self._parse_bracketed_ref(pos)

        if t.kind == TokenKind.LANGLE_PARAM:
            return self._parse_angle_param(pos)

        if t.kind == TokenKind.IDENT:
            return self._parse_ident_or_call(pos)

        if t.kind == TokenKind.LPAREN:
            self._next()
            inner = self._parse_expr()
            self._expect(TokenKind.RPAREN)
            return inner

        raise ParseError(f"unexpected token {t.kind.value} {t.value!r}", t.line, t.column)

    def _parse_bracketed_ref(self, pos: ca.Position) -> ca.CalcExpr:
        # Two grammars share `[`:
        #   [Field Name]              → FieldRef
        #   [Parameters].[ParamName]  → ParamRef
        self._expect(TokenKind.LBRACKET)
        ident = self._expect(TokenKind.IDENT)
        # Allow embedded spaces inside brackets — collect until ].
        name_parts = [ident.value]
        while self._peek().kind != TokenKind.RBRACKET:
            tok = self._next()
            name_parts.append(str(tok.value))
        self._expect(TokenKind.RBRACKET)
        name = " ".join(name_parts)
        if name == "Parameters" and self._peek().kind == TokenKind.DOT:
            self._next()
            self._expect(TokenKind.LBRACKET)
            param = self._expect(TokenKind.IDENT)
            self._expect(TokenKind.RBRACKET)
            return ca.ParamRef(param_name=str(param.value), pos=pos)
        return ca.FieldRef(field_name=name, pos=pos)

    def _parse_angle_param(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect(TokenKind.LANGLE_PARAM)
        ident = self._expect(TokenKind.IDENT)
        # Closer is the operator-style `>` token emitted by the lexer.
        closer = self._next()
        if not (closer.kind == TokenKind.OP and closer.value == ">"):
            raise ParseError("expected '>' to close <Parameters.…>", closer.line, closer.column)
        return ca.ParamRef(param_name=str(ident.value), pos=pos)

    def _parse_ident_or_call(self, pos: ca.Position) -> ca.CalcExpr:
        ident = self._next()
        name = str(ident.value).upper()
        if self._peek().kind != TokenKind.LPAREN:
            # Bare identifier — treat as field ref shorthand for autocomplete-friendly syntax.
            return ca.FieldRef(field_name=str(ident.value), pos=pos)
        self._expect(TokenKind.LPAREN)
        args: list[ca.CalcExpr] = []
        if self._peek().kind != TokenKind.RPAREN:
            args.append(self._parse_expr())
            while self._peek().kind == TokenKind.COMMA:
                self._next()
                args.append(self._parse_expr())
        self._expect(TokenKind.RPAREN)
        return ca.FnCall(name=name, args=tuple(args), pos=pos)

    # ---- token stream helpers ----
    def _peek(self) -> Token:
        return self.tokens[self.pos]

    def _next(self) -> Token:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def _expect(self, kind: TokenKind) -> Token:
        t = self._peek()
        if t.kind != kind:
            raise ParseError(f"expected {kind.value} got {t.kind.value}", t.line, t.column)
        return self._next()


def parse(formula: str, max_depth: int = 32) -> ca.CalcExpr:
    return CalcParser(formula, max_depth=max_depth).parse()


__all__ = ["CalcLexer", "CalcParser", "Token", "TokenKind", "LexError", "ParseError", "parse"]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -v
```

Expected: previous + new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_parser.py backend/tests/test_calc_parser.py
git commit -m "feat(analyst-pro): calc parser primary — refs, params, fn calls (Plan 8a T3)"
```

---

## Task 4: Operator precedence + binary/unary ops + IN/AND/OR/NOT

**Files:**
- Modify: `backend/vizql/calc_parser.py`
- Test: `backend/tests/test_calc_parser.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_parse_arithmetic_precedence():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("1 + 2 * 3")
    assert isinstance(expr, ca.BinaryOp) and expr.op == "+"
    assert isinstance(expr.rhs, ca.BinaryOp) and expr.rhs.op == "*"


def test_parse_comparison_and_boolean():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("[a] = 1 AND NOT [b] <> 2 OR [c] >= 3")
    assert isinstance(expr, ca.BinaryOp) and expr.op == "OR"
    left = expr.lhs
    assert isinstance(left, ca.BinaryOp) and left.op == "AND"
    not_node = left.rhs
    assert isinstance(not_node, ca.UnaryOp) and not_node.op == "NOT"


def test_parse_unary_minus():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("-[Sales] + 1")
    assert isinstance(expr, ca.BinaryOp) and expr.op == "+"
    assert isinstance(expr.lhs, ca.UnaryOp) and expr.lhs.op == "-"


def test_parse_in_expression():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("[Region] IN ('North', 'South')")
    assert isinstance(expr, ca.BinaryOp) and expr.op == "IN"
    assert isinstance(expr.rhs, ca.FnCall) and expr.rhs.name == "__TUPLE__"
    assert len(expr.rhs.args) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -k "precedence or comparison or unary or in_expression" -v
```

Expected: FAIL — `_parse_expr` is still primary-only.

- [ ] **Step 3: Replace `_parse_expr` with precedence climbing**

Replace the `_parse_expr` method in `CalcParser` and add helpers:

```python
    # Precedence table (low → high). Right-associative entries set assoc="right".
    _PRECEDENCE: dict[str, tuple[int, str]] = {
        "OR":  (1, "left"),
        "AND": (2, "left"),
        "IN":  (3, "left"),
        "=":   (4, "left"),
        "<>":  (4, "left"),
        "<":   (4, "left"),
        "<=":  (4, "left"),
        ">":   (4, "left"),
        ">=":  (4, "left"),
        "+":   (5, "left"),
        "-":   (5, "left"),
        "*":   (6, "left"),
        "/":   (6, "left"),
    }

    def _parse_expr(self, min_prec: int = 0) -> ca.CalcExpr:
        lhs = self._parse_unary()
        while True:
            op = self._peek_binop()
            if op is None:
                break
            prec, assoc = self._PRECEDENCE[op]
            if prec < min_prec:
                break
            op_tok = self._next()
            next_min = prec + (1 if assoc == "left" else 0)
            if op == "IN":
                rhs = self._parse_in_tuple(op_tok)
            else:
                rhs = self._parse_expr(next_min)
            lhs = ca.BinaryOp(op=op, lhs=lhs, rhs=rhs, pos=ca.Position(op_tok.line, op_tok.column))
        return lhs

    def _peek_binop(self) -> Optional[str]:
        t = self._peek()
        if t.kind == TokenKind.OP and t.value in self._PRECEDENCE:
            return str(t.value)
        if t.kind == TokenKind.KEYWORD and t.value in ("AND", "OR", "IN"):
            return str(t.value)
        return None

    def _parse_unary(self) -> ca.CalcExpr:
        t = self._peek()
        if t.kind == TokenKind.OP and t.value == "-":
            self._next()
            operand = self._parse_unary()
            return ca.UnaryOp(op="-", operand=operand, pos=ca.Position(t.line, t.column))
        if t.kind == TokenKind.KEYWORD and t.value == "NOT":
            self._next()
            operand = self._parse_unary()
            return ca.UnaryOp(op="NOT", operand=operand, pos=ca.Position(t.line, t.column))
        return self._parse_primary()

    def _parse_in_tuple(self, op_tok: Token) -> ca.CalcExpr:
        # IN expects a parenthesised list. Represented as FnCall("__TUPLE__", args=…).
        self._expect(TokenKind.LPAREN)
        items: list[ca.CalcExpr] = [self._parse_expr()]
        while self._peek().kind == TokenKind.COMMA:
            self._next()
            items.append(self._parse_expr())
        self._expect(TokenKind.RPAREN)
        return ca.FnCall(name="__TUPLE__", args=tuple(items),
                         pos=ca.Position(op_tok.line, op_tok.column))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -v
```

Expected: all PASS (previous + 4 new).

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_parser.py backend/tests/test_calc_parser.py
git commit -m "feat(analyst-pro): operator precedence + IN/AND/OR/NOT (Plan 8a T4)"
```

---

## Task 5: IF / CASE expressions (searched + simple)

**Files:**
- Modify: `backend/vizql/calc_parser.py`
- Test: `backend/tests/test_calc_parser.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_parse_if_then_elseif_else_end():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("IF [a] > 0 THEN 'pos' ELSEIF [a] = 0 THEN 'zero' ELSE 'neg' END")
    assert isinstance(expr, ca.IfExpr)
    assert isinstance(expr.cond, ca.BinaryOp) and expr.cond.op == ">"
    assert expr.then_.value == "pos"
    assert len(expr.elifs) == 1
    assert expr.elifs[0][1].value == "zero"
    assert expr.else_.value == "neg"


def test_parse_searched_case():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("CASE WHEN [a] > 0 THEN 1 WHEN [a] < 0 THEN -1 ELSE 0 END")
    assert isinstance(expr, ca.CaseExpr) and expr.scrutinee is None
    assert len(expr.whens) == 2
    assert expr.else_.value == 0


def test_parse_simple_case():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("CASE [Region] WHEN 'N' THEN 1 WHEN 'S' THEN 2 END")
    assert isinstance(expr, ca.CaseExpr)
    assert isinstance(expr.scrutinee, ca.FieldRef) and expr.scrutinee.field_name == "Region"
    assert len(expr.whens) == 2 and expr.else_ is None


def test_parse_nested_if_in_case_branch():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("CASE WHEN [a] > 0 THEN IF [b] = 1 THEN 'x' ELSE 'y' END END")
    assert isinstance(expr, ca.CaseExpr)
    inner = expr.whens[0][1]
    assert isinstance(inner, ca.IfExpr) and inner.then_.value == "x"
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: ParseError on `IF`/`CASE` keywords (parser doesn't recognise them yet).

- [ ] **Step 3: Add IF / CASE branches in `_parse_primary_inner`**

Insert ABOVE the `t.kind == TokenKind.IDENT` branch:

```python
        if t.kind == TokenKind.KEYWORD and t.value == "IF":
            return self._parse_if(pos)

        if t.kind == TokenKind.KEYWORD and t.value == "CASE":
            return self._parse_case(pos)
```

Add methods:

```python
    def _parse_if(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect_keyword("IF")
        cond = self._parse_expr()
        self._expect_keyword("THEN")
        then_ = self._parse_expr()
        elifs: list[tuple[ca.CalcExpr, ca.CalcExpr]] = []
        while self._peek_keyword("ELSEIF"):
            self._next()
            ec = self._parse_expr()
            self._expect_keyword("THEN")
            eb = self._parse_expr()
            elifs.append((ec, eb))
        else_: Optional[ca.CalcExpr] = None
        if self._peek_keyword("ELSE"):
            self._next()
            else_ = self._parse_expr()
        self._expect_keyword("END")
        return ca.IfExpr(cond=cond, then_=then_, elifs=tuple(elifs), else_=else_, pos=pos)

    def _parse_case(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect_keyword("CASE")
        # Scrutinee absent ⇒ searched CASE; else simple CASE.
        scrutinee: Optional[ca.CalcExpr] = None
        if not self._peek_keyword("WHEN"):
            scrutinee = self._parse_expr()
        whens: list[tuple[ca.CalcExpr, ca.CalcExpr]] = []
        while self._peek_keyword("WHEN"):
            self._next()
            wcond = self._parse_expr()
            self._expect_keyword("THEN")
            wbranch = self._parse_expr()
            whens.append((wcond, wbranch))
        else_: Optional[ca.CalcExpr] = None
        if self._peek_keyword("ELSE"):
            self._next()
            else_ = self._parse_expr()
        self._expect_keyword("END")
        return ca.CaseExpr(scrutinee=scrutinee, whens=tuple(whens), else_=else_, pos=pos)

    def _peek_keyword(self, kw: str) -> bool:
        t = self._peek()
        return t.kind == TokenKind.KEYWORD and t.value == kw

    def _expect_keyword(self, kw: str) -> Token:
        t = self._peek()
        if not (t.kind == TokenKind.KEYWORD and t.value == kw):
            raise ParseError(f"expected keyword {kw} got {t.value!r}", t.line, t.column)
        return self._next()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_parser.py backend/tests/test_calc_parser.py
git commit -m "feat(analyst-pro): IF/ELSEIF/ELSE/END + CASE searched + simple (Plan 8a T5)"
```

---

## Task 6: LOD expressions `{ FIXED | INCLUDE | EXCLUDE [dims] : body }`

**Files:**
- Modify: `backend/vizql/calc_parser.py`
- Test: `backend/tests/test_calc_parser.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_parse_fixed_lod_single_dim():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("{ FIXED [Region] : SUM([Sales]) }")
    assert isinstance(expr, ca.LodExpr) and expr.kind == "FIXED"
    assert len(expr.dims) == 1 and expr.dims[0].field_name == "Region"
    assert isinstance(expr.body, ca.FnCall) and expr.body.name == "SUM"


def test_parse_include_and_exclude_lod():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    inc = parse("{ INCLUDE [Product] : AVG([Profit]) }")
    exc = parse("{ EXCLUDE [State] : COUNTD([Customer]) }")
    assert inc.kind == "INCLUDE" and inc.body.name == "AVG"
    assert exc.kind == "EXCLUDE" and exc.body.name == "COUNTD"


def test_parse_lod_with_no_dims_is_legal_only_for_fixed_constant():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    # `{ FIXED : SUM([Sales]) }` — table-grand-total LOD. Allowed by parser
    # (typechecker enforces that INCLUDE/EXCLUDE require ≥1 dim).
    expr = parse("{ FIXED : SUM([Sales]) }")
    assert isinstance(expr, ca.LodExpr) and expr.dims == ()


def test_parse_nested_lod():
    from backend.vizql.calc_parser import parse
    from backend.vizql import calc_ast as ca

    expr = parse("{ FIXED [Region] : { FIXED [Segment] : SUM([Sales]) } }")
    assert isinstance(expr, ca.LodExpr)
    assert isinstance(expr.body, ca.LodExpr) and expr.body.kind == "FIXED"
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: ParseError on `{` (no LBRACE handler in primary).

- [ ] **Step 3: Add LBRACE handler + LOD parser**

Insert above `IF` branch in `_parse_primary_inner`:

```python
        if t.kind == TokenKind.LBRACE:
            return self._parse_lod(pos)
```

Add method:

```python
    def _parse_lod(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect(TokenKind.LBRACE)
        kw = self._peek()
        if not (kw.kind == TokenKind.KEYWORD and kw.value in ("FIXED", "INCLUDE", "EXCLUDE")):
            raise ParseError("LOD must start with FIXED|INCLUDE|EXCLUDE", kw.line, kw.column)
        self._next()
        dims: list[ca.FieldRef] = []
        if self._peek().kind != TokenKind.COLON:
            dims.append(self._parse_lod_dim())
            while self._peek().kind == TokenKind.COMMA:
                self._next()
                dims.append(self._parse_lod_dim())
        self._expect(TokenKind.COLON)
        body = self._parse_expr()
        self._expect(TokenKind.RBRACE)
        return ca.LodExpr(kind=str(kw.value), dims=tuple(dims), body=body, pos=pos)

    def _parse_lod_dim(self) -> ca.FieldRef:
        t = self._peek()
        node = self._parse_primary()
        if not isinstance(node, ca.FieldRef):
            raise ParseError("LOD dim must be a [FieldRef]", t.line, t.column)
        return node
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_parser.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_parser.py backend/tests/test_calc_parser.py
git commit -m "feat(analyst-pro): LOD expressions FIXED/INCLUDE/EXCLUDE (Plan 8a T6)"
```

---

## Task 7: Function catalogue — Aggregate + Logical + Type conversion

**Files:**
- Create: `backend/vizql/calc_functions.py`
- Test: `backend/tests/test_calc_functions.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_calc_functions.py
import pytest


def test_function_registry_contains_every_aggregate_name():
    from backend.vizql.calc_functions import FUNCTIONS

    aggregates = {
        "SUM", "AVG", "COUNT", "COUNTD", "MIN", "MAX", "MEDIAN", "ATTR",
        "STDEV", "STDEVP", "VAR", "VARP", "PERCENTILE",
        "KURTOSIS", "SKEWNESS", "COLLECT",
    }
    missing = aggregates - set(FUNCTIONS)
    assert not missing, f"missing aggregates: {sorted(missing)}"
    for name in aggregates:
        assert FUNCTIONS[name].is_aggregate is True


def test_logical_functions_present_with_correct_arities():
    from backend.vizql.calc_functions import FUNCTIONS

    for name in ("IF", "CASE", "IIF", "IFNULL", "ZN", "ISNULL", "NOT", "IN"):
        assert name in FUNCTIONS

    assert FUNCTIONS["IIF"].min_args == 3
    assert FUNCTIONS["IIF"].max_args == 3
    assert FUNCTIONS["ZN"].min_args == 1
    assert FUNCTIONS["ZN"].max_args == 1


def test_type_conversion_functions_have_correct_return_types():
    from backend.vizql.calc_functions import FUNCTIONS, TypeKind

    expected = {
        "STR": TypeKind.STRING,
        "INT": TypeKind.INTEGER,
        "FLOAT": TypeKind.NUMBER,
        "BOOL": TypeKind.BOOLEAN,
        "DATE": TypeKind.DATE,
        "DATETIME": TypeKind.DATETIME,
    }
    for name, expected_kind in expected.items():
        ret = FUNCTIONS[name].return_type
        assert ret.kind == expected_kind


def test_unknown_function_lookup_returns_none():
    from backend.vizql.calc_functions import FUNCTIONS

    assert FUNCTIONS.get("STARTS_WITH") is None  # canonical is STARTSWITH
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_functions.py -v
```

Expected: ImportError.

- [ ] **Step 3: Create `calc_functions.py` with aggregate + logical + type-conv catalogue**

```python
# backend/vizql/calc_functions.py
"""Function catalogue. Plan 8a (Build_Tableau.md §V.1).

All names canonical Tableau spelling. Each FunctionDef holds:
- arg_types: list[TypeConstraint]
- min_args / max_args (max_args=-1 for variadic)
- is_aggregate / is_table_calc
- return_type: TypeConstraint or callable(args) → TypeConstraint
- sql_template: dict[Dialect, str]  — emission template per dialect; Plan 7d's
  Dialect enum values keyed (DUCKDB / POSTGRES / BIGQUERY / SNOWFLAKE).
- docstring
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Callable, Optional, Union

from .dialects.registry import Dialect


class TypeKind(enum.Enum):
    STRING = "string"
    NUMBER = "number"      # real-valued (any numeric ok)
    INTEGER = "integer"
    DATE = "date"
    DATETIME = "datetime"
    BOOLEAN = "boolean"
    SPATIAL = "spatial"
    ANY = "any"
    SAME_AS = "same_as"    # references arg index for return_type


class Category(enum.Enum):
    AGGREGATE = "aggregate"
    LOGICAL = "logical"
    STRING = "string"
    DATE = "date"
    TYPE_CONVERSION = "type_conversion"
    USER = "user"
    SPATIAL = "spatial"
    PASSTHROUGH = "passthrough"
    ANALYTICS_EXT = "analytics_ext"
    TABLE_CALC = "table_calc"


@dataclass(frozen=True, slots=True)
class TypeConstraint:
    kind: TypeKind
    arg_index: int = -1  # only meaningful for TypeKind.SAME_AS

    @classmethod
    def string(cls) -> "TypeConstraint": return cls(TypeKind.STRING)
    @classmethod
    def number(cls) -> "TypeConstraint": return cls(TypeKind.NUMBER)
    @classmethod
    def integer(cls) -> "TypeConstraint": return cls(TypeKind.INTEGER)
    @classmethod
    def date(cls) -> "TypeConstraint": return cls(TypeKind.DATE)
    @classmethod
    def datetime(cls) -> "TypeConstraint": return cls(TypeKind.DATETIME)
    @classmethod
    def boolean(cls) -> "TypeConstraint": return cls(TypeKind.BOOLEAN)
    @classmethod
    def spatial(cls) -> "TypeConstraint": return cls(TypeKind.SPATIAL)
    @classmethod
    def any_(cls) -> "TypeConstraint": return cls(TypeKind.ANY)
    @classmethod
    def same_as(cls, idx: int) -> "TypeConstraint": return cls(TypeKind.SAME_AS, arg_index=idx)


ReturnType = Union[TypeConstraint, Callable[[tuple[TypeConstraint, ...]], TypeConstraint]]


@dataclass(frozen=True, slots=True)
class FunctionDef:
    name: str
    category: Category
    arg_types: tuple[TypeConstraint, ...]
    min_args: int
    max_args: int  # -1 = variadic
    return_type: ReturnType
    sql_template: dict[Dialect, str] = field(default_factory=dict)
    is_aggregate: bool = False
    is_table_calc: bool = False
    docstring: str = ""


# ---- helper builders ----
def _agg(name: str, arg: TypeConstraint, ret: TypeConstraint, *,
         distinct: bool = False, docstring: str = "") -> FunctionDef:
    fn = "COUNT" if name in ("COUNT", "COUNTD") else name
    template = f"{fn}({{args[0]}})" if not distinct else f"COUNT(DISTINCT {{args[0]}})"
    per_dialect = {d: template for d in Dialect}
    return FunctionDef(
        name=name, category=Category.AGGREGATE,
        arg_types=(arg,), min_args=1, max_args=1,
        return_type=ret, sql_template=per_dialect,
        is_aggregate=True, docstring=docstring,
    )


def _bin(name: str, arg: TypeConstraint, ret: TypeConstraint, op: str) -> FunctionDef:
    return FunctionDef(
        name=name, category=Category.AGGREGATE,
        arg_types=(arg, arg), min_args=2, max_args=2,
        return_type=ret, sql_template={d: f"{op}({{args[0]}}, {{args[1]}})" for d in Dialect},
        is_aggregate=True,
    )


# ---- catalogue ----
FUNCTIONS: dict[str, FunctionDef] = {}


def _register(fn: FunctionDef) -> None:
    if fn.name in FUNCTIONS:
        raise RuntimeError(f"duplicate function {fn.name}")
    FUNCTIONS[fn.name] = fn


# Aggregate (Build_Tableau §V.1)
for name in ("SUM", "AVG", "MIN", "MAX", "MEDIAN", "STDEV", "STDEVP", "VAR", "VARP",
             "KURTOSIS", "SKEWNESS"):
    _register(_agg(name, TypeConstraint.number(), TypeConstraint.number()))

_register(_agg("COUNT", TypeConstraint.any_(), TypeConstraint.integer()))
_register(FunctionDef(
    name="COUNTD", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
    return_type=TypeConstraint.integer(),
    sql_template={d: "COUNT(DISTINCT {args[0]})" for d in Dialect},
    is_aggregate=True, docstring="distinct count",
))
_register(FunctionDef(
    name="ATTR", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
    return_type=TypeConstraint.same_as(0),
    sql_template={d: "CASE WHEN MIN({args[0]}) = MAX({args[0]}) THEN MIN({args[0]}) ELSE NULL END" for d in Dialect},
    is_aggregate=True,
    docstring="returns value if all rows agree, else NULL",
))
_register(FunctionDef(
    name="PERCENTILE", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.number(), TypeConstraint.number()),
    min_args=2, max_args=2,
    return_type=TypeConstraint.number(),
    sql_template={d: "PERCENTILE_CONT({args[1]}) WITHIN GROUP (ORDER BY {args[0]})" for d in Dialect},
    is_aggregate=True,
))
_register(FunctionDef(
    name="COLLECT", category=Category.AGGREGATE,
    arg_types=(TypeConstraint.spatial(),), min_args=1, max_args=1,
    return_type=TypeConstraint.spatial(),
    sql_template={d: "ST_COLLECT({args[0]})" for d in Dialect},
    is_aggregate=True,
    docstring="spatial aggregate",
))


# Logical (§V.1)
def _logical(name: str, min_a: int, max_a: int, arg: TypeConstraint, ret: TypeConstraint,
             template: dict[Dialect, str]) -> None:
    _register(FunctionDef(
        name=name, category=Category.LOGICAL,
        arg_types=(arg,), min_args=min_a, max_args=max_a,
        return_type=ret, sql_template=template,
    ))


# IF / CASE handled by parser AST, but registered here for catalogue completeness +
# typecheck dispatch when treated as an FnCall (e.g. ad-hoc adapters call them).
_register(FunctionDef(
    name="IF", category=Category.LOGICAL,
    arg_types=(TypeConstraint.boolean(), TypeConstraint.any_(), TypeConstraint.any_()),
    min_args=2, max_args=-1,
    return_type=TypeConstraint.same_as(1),
    sql_template={d: "CASE WHEN {args[0]} THEN {args[1]} ELSE {args[2]} END" for d in Dialect},
    docstring="parser also has dedicated IfExpr node; FUNCTIONS entry is for catalogue + introspection",
))
_register(FunctionDef(
    name="CASE", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=-1,
    return_type=TypeConstraint.any_(),
    sql_template={d: "" for d in Dialect},  # parser emits CaseExpr; template unused
    docstring="parser also has dedicated CaseExpr node",
))
_register(FunctionDef(
    name="IIF", category=Category.LOGICAL,
    arg_types=(TypeConstraint.boolean(), TypeConstraint.any_(), TypeConstraint.any_()),
    min_args=3, max_args=4,
    return_type=TypeConstraint.same_as(1),
    sql_template={d: "CASE WHEN {args[0]} THEN {args[1]} ELSE {args[2]} END" for d in Dialect},
    docstring="IIF(test, then, else, [unknown])",
))
_register(FunctionDef(
    name="IFNULL", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(), TypeConstraint.same_as(0)), min_args=2, max_args=2,
    return_type=TypeConstraint.same_as(0),
    sql_template={d: "COALESCE({args[0]}, {args[1]})" for d in Dialect},
))
_register(FunctionDef(
    name="ZN", category=Category.LOGICAL,
    arg_types=(TypeConstraint.number(),), min_args=1, max_args=1,
    return_type=TypeConstraint.number(),
    sql_template={d: "COALESCE({args[0]}, 0)" for d in Dialect},
    docstring="zero-if-null per §V.5",
))
_register(FunctionDef(
    name="ISNULL", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} IS NULL)" for d in Dialect},
))
_register(FunctionDef(
    name="NOT", category=Category.LOGICAL,
    arg_types=(TypeConstraint.boolean(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "NOT ({args[0]})" for d in Dialect},
))
_register(FunctionDef(
    name="IN", category=Category.LOGICAL,
    arg_types=(TypeConstraint.any_(),), min_args=2, max_args=-1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "{args[0]} IN ({rest})" for d in Dialect},
    docstring="parser also produces BinaryOp(op='IN', rhs=__TUPLE__)",
))


# Type conversion (§V.1)
for name, ret_kind, sql in (
    ("STR",      TypeKind.STRING,   "CAST({args[0]} AS VARCHAR)"),
    ("INT",      TypeKind.INTEGER,  "CAST({args[0]} AS BIGINT)"),
    ("FLOAT",    TypeKind.NUMBER,   "CAST({args[0]} AS DOUBLE)"),
    ("BOOL",     TypeKind.BOOLEAN,  "CAST({args[0]} AS BOOLEAN)"),
    ("DATE",     TypeKind.DATE,     "CAST({args[0]} AS DATE)"),
    ("DATETIME", TypeKind.DATETIME, "CAST({args[0]} AS TIMESTAMP)"),
):
    _register(FunctionDef(
        name=name, category=Category.TYPE_CONVERSION,
        arg_types=(TypeConstraint.any_(),), min_args=1, max_args=1,
        return_type=TypeConstraint(ret_kind),
        sql_template={d: sql for d in Dialect},
    ))


__all__ = [
    "TypeKind", "Category", "TypeConstraint", "ReturnType",
    "FunctionDef", "FUNCTIONS",
]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_functions.py -v
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_functions.py backend/tests/test_calc_functions.py
git commit -m "feat(analyst-pro): function catalogue — aggregate + logical + type-conv (Plan 8a T7)"
```

---

## Task 8: Function catalogue — String + Date + User + Spatial + Passthrough + Analytics-ext + Table-calc names

**Files:**
- Modify: `backend/vizql/calc_functions.py`
- Modify: `backend/config.py` (add `FEATURE_RAWSQL_ENABLED`)
- Test: `backend/tests/test_calc_functions.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_string_functions_complete_per_v_1():
    from backend.vizql.calc_functions import FUNCTIONS, Category

    expected = {
        "LEN", "LEFT", "RIGHT", "MID", "REPLACE", "UPPER", "LOWER",
        "LTRIM", "RTRIM", "TRIM", "STARTSWITH", "ENDSWITH", "CONTAINS",
        "SPLIT", "FIND", "REGEXP_EXTRACT", "REGEXP_MATCH", "REGEXP_REPLACE",
    }
    for name in expected:
        assert FUNCTIONS[name].category is Category.STRING, name


def test_date_functions_complete_per_v_1():
    from backend.vizql.calc_functions import FUNCTIONS, Category

    expected = {
        "DATEDIFF", "DATETRUNC", "DATEPART", "DATEADD", "DATENAME",
        "MAKEDATE", "MAKEDATETIME", "MAKETIME",
        "NOW", "TODAY",
        "YEAR", "QUARTER", "MONTH", "WEEK", "DAY",
        "HOUR", "MINUTE", "SECOND", "WEEKDAY",
    }
    for name in expected:
        assert FUNCTIONS[name].category is Category.DATE, name


def test_user_spatial_passthrough_analytics_ext_present():
    from backend.vizql.calc_functions import FUNCTIONS, Category

    for name in ("USERNAME", "FULLNAME", "USERDOMAIN", "ISFULLNAME", "ISUSERNAME", "ISMEMBEROF", "USER"):
        assert FUNCTIONS[name].category is Category.USER

    for name in ("MAKEPOINT", "MAKELINE", "DISTANCE", "BUFFER", "AREA",
                 "INTERSECTS", "OVERLAPS", "DIFFERENCE", "UNION"):
        assert FUNCTIONS[name].category is Category.SPATIAL

    for name in ("RAWSQL_BOOL", "RAWSQL_INT", "RAWSQL_REAL", "RAWSQL_STR",
                 "RAWSQL_DATE", "RAWSQL_DATETIME"):
        assert FUNCTIONS[name].category is Category.PASSTHROUGH

    for name in ("SCRIPT_REAL", "SCRIPT_STR", "SCRIPT_INT", "SCRIPT_BOOL"):
        assert FUNCTIONS[name].category is Category.ANALYTICS_EXT


def test_table_calc_names_registered_with_table_calc_flag():
    from backend.vizql.calc_functions import FUNCTIONS

    for name in ("RUNNING_SUM", "RUNNING_AVG", "WINDOW_SUM", "WINDOW_AVG",
                 "INDEX", "FIRST", "LAST", "SIZE", "LOOKUP", "PREVIOUS_VALUE",
                 "RANK", "RANK_DENSE", "RANK_MODIFIED", "RANK_UNIQUE", "RANK_PERCENTILE",
                 "TOTAL", "PCT_TOTAL", "DIFF"):
        assert FUNCTIONS[name].is_table_calc is True


def test_feature_rawsql_enabled_default_false():
    from backend.config import settings

    assert settings.FEATURE_RAWSQL_ENABLED is False
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: KeyError + AttributeError on `FEATURE_RAWSQL_ENABLED`.

- [ ] **Step 3: Append catalogue entries to `calc_functions.py`**

Append after the type-conversion block in `calc_functions.py`:

```python
# ---- String (§V.1) ----
def _str(name: str, n: int, ret: TypeConstraint, sql: str) -> None:
    _register(FunctionDef(
        name=name, category=Category.STRING,
        arg_types=tuple(TypeConstraint.any_() for _ in range(max(n, 1))),
        min_args=n, max_args=n if n >= 0 else -1,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_str("LEN", 1, TypeConstraint.integer(), "LENGTH({args[0]})")
_str("LEFT", 2, TypeConstraint.string(), "LEFT({args[0]}, {args[1]})")
_str("RIGHT", 2, TypeConstraint.string(), "RIGHT({args[0]}, {args[1]})")
_str("MID", 3, TypeConstraint.string(), "SUBSTRING({args[0]}, {args[1]}, {args[2]})")
_str("REPLACE", 3, TypeConstraint.string(), "REPLACE({args[0]}, {args[1]}, {args[2]})")
_str("UPPER", 1, TypeConstraint.string(), "UPPER({args[0]})")
_str("LOWER", 1, TypeConstraint.string(), "LOWER({args[0]})")
_str("LTRIM", 1, TypeConstraint.string(), "LTRIM({args[0]})")
_str("RTRIM", 1, TypeConstraint.string(), "RTRIM({args[0]})")
_str("TRIM", 1, TypeConstraint.string(), "TRIM({args[0]})")
_str("STARTSWITH", 2, TypeConstraint.boolean(), "({args[0]} LIKE {args[1]} || '%')")
_str("ENDSWITH", 2, TypeConstraint.boolean(), "({args[0]} LIKE '%' || {args[1]})")
_str("CONTAINS", 2, TypeConstraint.boolean(), "(POSITION({args[1]} IN {args[0]}) > 0)")
_str("SPLIT", 3, TypeConstraint.string(), "SPLIT_PART({args[0]}, {args[1]}, {args[2]})")
_str("FIND", 2, TypeConstraint.integer(), "POSITION({args[1]} IN {args[0]})")
_str("REGEXP_EXTRACT", 2, TypeConstraint.string(), "REGEXP_EXTRACT({args[0]}, {args[1]})")
_str("REGEXP_MATCH", 2, TypeConstraint.boolean(), "REGEXP_MATCHES({args[0]}, {args[1]})")
_str("REGEXP_REPLACE", 3, TypeConstraint.string(), "REGEXP_REPLACE({args[0]}, {args[1]}, {args[2]})")


# ---- Date (§V.1) ----
def _date(name: str, n_min: int, n_max: int, ret: TypeConstraint, sql: str) -> None:
    _register(FunctionDef(
        name=name, category=Category.DATE,
        arg_types=tuple(TypeConstraint.any_() for _ in range(max(n_min, 1))),
        min_args=n_min, max_args=n_max,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_date("DATEDIFF", 3, 4, TypeConstraint.integer(), "DATE_DIFF({args[0]}, {args[1]}, {args[2]})")
_date("DATETRUNC", 2, 3, TypeConstraint.datetime(), "DATE_TRUNC({args[0]}, {args[1]})")
_date("DATEPART", 2, 3, TypeConstraint.integer(), "DATE_PART({args[0]}, {args[1]})")
_date("DATEADD", 3, 3, TypeConstraint.datetime(), "DATE_ADD({args[1]}, INTERVAL ({args[1]}) {args[0]})")
_date("DATENAME", 2, 3, TypeConstraint.string(), "TO_CHAR({args[1]}, {args[0]})")
_date("MAKEDATE", 3, 3, TypeConstraint.date(), "MAKE_DATE({args[0]}, {args[1]}, {args[2]})")
_date("MAKEDATETIME", 2, 2, TypeConstraint.datetime(), "({args[0]} + {args[1]})")
_date("MAKETIME", 3, 3, TypeConstraint.datetime(), "MAKE_TIME({args[0]}, {args[1]}, {args[2]})")
_date("NOW", 0, 0, TypeConstraint.datetime(), "NOW()")
_date("TODAY", 0, 0, TypeConstraint.date(), "CURRENT_DATE")
_date("YEAR", 1, 1, TypeConstraint.integer(), "EXTRACT(YEAR FROM {args[0]})")
_date("QUARTER", 1, 1, TypeConstraint.integer(), "EXTRACT(QUARTER FROM {args[0]})")
_date("MONTH", 1, 1, TypeConstraint.integer(), "EXTRACT(MONTH FROM {args[0]})")
_date("WEEK", 1, 1, TypeConstraint.integer(), "EXTRACT(WEEK FROM {args[0]})")
_date("DAY", 1, 1, TypeConstraint.integer(), "EXTRACT(DAY FROM {args[0]})")
_date("HOUR", 1, 1, TypeConstraint.integer(), "EXTRACT(HOUR FROM {args[0]})")
_date("MINUTE", 1, 1, TypeConstraint.integer(), "EXTRACT(MINUTE FROM {args[0]})")
_date("SECOND", 1, 1, TypeConstraint.integer(), "EXTRACT(SECOND FROM {args[0]})")
_date("WEEKDAY", 1, 1, TypeConstraint.integer(), "EXTRACT(DOW FROM {args[0]})")


# ---- User (§V.1) ----
def _user(name: str, ret: TypeConstraint, sql: str) -> None:
    _register(FunctionDef(
        name=name, category=Category.USER,
        arg_types=(), min_args=0, max_args=0,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_user("USERNAME", TypeConstraint.string(), "{user_name}")
_user("FULLNAME", TypeConstraint.string(), "{user_full_name}")
_user("USERDOMAIN", TypeConstraint.string(), "{user_domain}")
_user("USER", TypeConstraint.string(), "{user_name}")  # Tableau alias
_register(FunctionDef(
    name="ISFULLNAME", category=Category.USER,
    arg_types=(TypeConstraint.string(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} = {user_full_name})" for d in Dialect},
))
_register(FunctionDef(
    name="ISUSERNAME", category=Category.USER,
    arg_types=(TypeConstraint.string(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} = {user_name})" for d in Dialect},
))
_register(FunctionDef(
    name="ISMEMBEROF", category=Category.USER,
    arg_types=(TypeConstraint.string(),), min_args=1, max_args=1,
    return_type=TypeConstraint.boolean(),
    sql_template={d: "({args[0]} = ANY({user_groups}))" for d in Dialect},
))


# ---- Spatial (§V.1) ----
def _sp(name: str, n: int, ret: TypeConstraint, sql: str,
        arg: TypeConstraint = TypeConstraint.spatial()) -> None:
    _register(FunctionDef(
        name=name, category=Category.SPATIAL,
        arg_types=tuple(arg for _ in range(n)), min_args=n, max_args=n,
        return_type=ret, sql_template={d: sql for d in Dialect},
    ))


_sp("MAKEPOINT", 2, TypeConstraint.spatial(), "ST_POINT({args[0]}, {args[1]})", arg=TypeConstraint.number())
_sp("MAKELINE", 2, TypeConstraint.spatial(), "ST_MAKELINE({args[0]}, {args[1]})")
_sp("DISTANCE", 3, TypeConstraint.number(), "ST_DISTANCE({args[0]}, {args[1]})")
_sp("BUFFER", 3, TypeConstraint.spatial(), "ST_BUFFER({args[0]}, {args[1]})")
_sp("AREA", 2, TypeConstraint.number(), "ST_AREA({args[0]})")
_sp("INTERSECTS", 2, TypeConstraint.boolean(), "ST_INTERSECTS({args[0]}, {args[1]})")
_sp("OVERLAPS", 2, TypeConstraint.boolean(), "ST_OVERLAPS({args[0]}, {args[1]})")
_sp("DIFFERENCE", 2, TypeConstraint.spatial(), "ST_DIFFERENCE({args[0]}, {args[1]})")
_sp("UNION", 2, TypeConstraint.spatial(), "ST_UNION({args[0]}, {args[1]})")


# ---- Passthrough RAWSQL_* (§V.1) — feature-flagged ----
def _rawsql(suffix: str, ret: TypeConstraint) -> None:
    _register(FunctionDef(
        name=f"RAWSQL_{suffix}", category=Category.PASSTHROUGH,
        arg_types=(TypeConstraint.string(),), min_args=1, max_args=-1,
        return_type=ret,
        sql_template={d: "{rawsql}" for d in Dialect},
        docstring="dialect-specific literal — gated on FEATURE_RAWSQL_ENABLED",
    ))


_rawsql("BOOL", TypeConstraint.boolean())
_rawsql("INT", TypeConstraint.integer())
_rawsql("REAL", TypeConstraint.number())
_rawsql("STR", TypeConstraint.string())
_rawsql("DATE", TypeConstraint.date())
_rawsql("DATETIME", TypeConstraint.datetime())


# ---- Analytics extension stubs (§V.1) — Phase 12 wires the bridge ----
for _suffix, _ret in (("REAL", TypeConstraint.number()),
                      ("STR", TypeConstraint.string()),
                      ("INT", TypeConstraint.integer()),
                      ("BOOL", TypeConstraint.boolean())):
    _register(FunctionDef(
        name=f"SCRIPT_{_suffix}", category=Category.ANALYTICS_EXT,
        arg_types=(TypeConstraint.string(),), min_args=1, max_args=-1,
        return_type=_ret,
        sql_template={d: "" for d in Dialect},  # not emittable until Phase 12
        docstring="external Python/R analytics — Phase 12",
    ))


# ---- Table-calc names (§V.1) — full semantics in Plan 8c ----
_TABLE_CALCS = (
    "RUNNING_SUM", "RUNNING_AVG", "RUNNING_MIN", "RUNNING_MAX", "RUNNING_COUNT",
    "WINDOW_SUM", "WINDOW_AVG", "WINDOW_MIN", "WINDOW_MAX", "WINDOW_MEDIAN",
    "WINDOW_STDEV", "WINDOW_VAR", "WINDOW_PERCENTILE", "WINDOW_CORR", "WINDOW_COVAR",
    "INDEX", "FIRST", "LAST", "SIZE", "LOOKUP", "PREVIOUS_VALUE",
    "RANK", "RANK_DENSE", "RANK_MODIFIED", "RANK_UNIQUE", "RANK_PERCENTILE",
    "TOTAL", "PCT_TOTAL", "DIFF", "IS_DISTINCT", "IS_STACKED",
)
for _name in _TABLE_CALCS:
    _register(FunctionDef(
        name=_name, category=Category.TABLE_CALC,
        arg_types=(TypeConstraint.any_(),),
        min_args=0, max_args=-1,
        return_type=TypeConstraint.any_(),
        sql_template={d: "" for d in Dialect},  # Plan 8c emits via window fn lowering
        is_table_calc=True,
        docstring="table calculation — semantics in Plan 8c",
    ))
```

Add to `backend/config.py` near line 263:

```python
    FEATURE_RAWSQL_ENABLED: bool = False
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_functions.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_functions.py backend/config.py backend/tests/test_calc_functions.py
git commit -m "feat(analyst-pro): catalogue — string/date/user/spatial/raw/script/table-calc names (Plan 8a T8)"
```

---

## Task 9: Type inference + validation (`calc_typecheck.py`)

**Files:**
- Create: `backend/vizql/calc_typecheck.py`
- Test: `backend/tests/test_calc_typecheck.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_calc_typecheck.py
import pytest


def _schema():
    # Map field_name → type kind string. Mirrors the tiny shape typecheck()
    # consumes (a Mapping[str, str]).
    return {
        "Sales": "number",
        "Region": "string",
        "OrderDate": "date",
        "Profit": "number",
    }


def test_sum_numeric_inferred_number():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_typecheck import typecheck, TypeKind

    expr = parse("SUM([Sales])")
    assert typecheck(expr, _schema()).kind is TypeKind.NUMBER


def test_sum_on_string_rejected():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    expr = parse("SUM([Region])")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "SUM" in str(excinfo.value)


def test_unknown_function_rejected():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    expr = parse("WAT([Sales])")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "unknown function" in str(excinfo.value).lower()


def test_aggregate_mixed_with_non_aggregate_rejected():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    # SUM([Sales]) + [Sales] mixes aggregate + row-level.
    expr = parse("SUM([Sales]) + [Sales]")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "aggregate" in str(excinfo.value).lower()


def test_lod_wraps_aggregate_so_outer_can_be_row_level():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_typecheck import typecheck, TypeKind

    # { FIXED [Region] : SUM([Sales]) } / [Sales]  is allowed: LOD result is
    # a row-level value at outer scope.
    expr = parse("{ FIXED [Region] : SUM([Sales]) } / [Sales]")
    assert typecheck(expr, _schema()).kind is TypeKind.NUMBER


def test_if_branches_must_have_compatible_types():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    expr = parse("IF [Sales] > 0 THEN 'pos' ELSE 1 END")
    with pytest.raises(CalcTypeError) as excinfo:
        typecheck(expr, _schema())
    assert "branch" in str(excinfo.value).lower() or "type" in str(excinfo.value).lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_typecheck.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `calc_typecheck.py`**

```python
# backend/vizql/calc_typecheck.py
"""Bottom-up type inference + validation. Plan 8a.

Walks a CalcExpr emitted by `calc_parser.parse()`, resolves FieldRef types
via the supplied schema mapping, dispatches FnCall via FUNCTIONS, and
rejects: unknown functions, arg arity mismatches, type mismatches, and
aggregate / non-aggregate mixing at the same scope.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from . import calc_ast as ca
from .calc_functions import FUNCTIONS, TypeConstraint, TypeKind, Category


class TypeError(ValueError):  # noqa: A001 — module-scoped, not the builtin
    pass


@dataclass(frozen=True, slots=True)
class InferredType:
    kind: TypeKind
    is_aggregate: bool = False  # True if value is the result of an aggregate at this scope


_NUMERIC_KINDS = {TypeKind.NUMBER, TypeKind.INTEGER}
_TEMPORAL_KINDS = {TypeKind.DATE, TypeKind.DATETIME}


def typecheck(expr: ca.CalcExpr, schema: Mapping[str, str]) -> InferredType:
    """Top-level entry. Schema maps field_name → type kind string
    ("number", "integer", "string", "date", "datetime", "boolean", "spatial").
    Raises TypeError on any violation; returns InferredType on success.
    """
    return _walk(expr, schema)


def _walk(expr: ca.CalcExpr, schema: Mapping[str, str]) -> InferredType:
    if isinstance(expr, ca.Literal):
        return InferredType(_kind_from_literal_type(expr.data_type))

    if isinstance(expr, ca.FieldRef):
        kind_str = schema.get(expr.field_name)
        if kind_str is None:
            raise TypeError(f"unknown field [{expr.field_name}]")
        return InferredType(_kind_from_str(kind_str))

    if isinstance(expr, ca.ParamRef):
        # Parameters are typed at substitution time (Task 11 endpoint receives
        # parameter types in the request body). Default ANY in pure parser tests.
        return InferredType(TypeKind.ANY)

    if isinstance(expr, ca.FnCall):
        return _check_fn_call(expr, schema)

    if isinstance(expr, ca.BinaryOp):
        return _check_binary(expr, schema)

    if isinstance(expr, ca.UnaryOp):
        operand = _walk(expr.operand, schema)
        if expr.op == "NOT" and operand.kind is not TypeKind.BOOLEAN:
            raise TypeError(f"NOT requires boolean, got {operand.kind.value}")
        if expr.op == "-" and operand.kind not in _NUMERIC_KINDS:
            raise TypeError(f"unary minus requires numeric, got {operand.kind.value}")
        return operand

    if isinstance(expr, ca.IfExpr):
        return _check_if(expr, schema)

    if isinstance(expr, ca.CaseExpr):
        return _check_case(expr, schema)

    if isinstance(expr, ca.LodExpr):
        body = _walk(expr.body, schema)
        # LOD wraps an aggregate; outer scope sees a row-level value.
        if expr.kind in ("INCLUDE", "EXCLUDE") and not expr.dims:
            raise TypeError(f"{expr.kind} LOD requires at least one dim")
        return InferredType(body.kind, is_aggregate=False)

    raise TypeError(f"unhandled node {type(expr).__name__}")


def _kind_from_literal_type(t: str) -> TypeKind:
    return {
        "string": TypeKind.STRING, "integer": TypeKind.INTEGER, "real": TypeKind.NUMBER,
        "boolean": TypeKind.BOOLEAN, "date": TypeKind.DATE, "datetime": TypeKind.DATETIME,
        "null": TypeKind.ANY,
    }[t]


def _kind_from_str(s: str) -> TypeKind:
    table = {
        "string": TypeKind.STRING, "integer": TypeKind.INTEGER, "number": TypeKind.NUMBER,
        "real": TypeKind.NUMBER, "float": TypeKind.NUMBER, "double": TypeKind.NUMBER,
        "boolean": TypeKind.BOOLEAN, "bool": TypeKind.BOOLEAN,
        "date": TypeKind.DATE, "datetime": TypeKind.DATETIME, "timestamp": TypeKind.DATETIME,
        "spatial": TypeKind.SPATIAL, "geometry": TypeKind.SPATIAL,
    }
    return table.get(s.lower(), TypeKind.ANY)


def _compat(actual: TypeKind, required: TypeKind) -> bool:
    if required is TypeKind.ANY or actual is TypeKind.ANY:
        return True
    if required is TypeKind.NUMBER and actual in _NUMERIC_KINDS:
        return True
    if required is TypeKind.INTEGER and actual is TypeKind.INTEGER:
        return True
    if required is TypeKind.DATETIME and actual in _TEMPORAL_KINDS:
        return True
    return actual is required


def _check_fn_call(expr: ca.FnCall, schema: Mapping[str, str]) -> InferredType:
    if expr.name == "__TUPLE__":
        # Internal IN-list marker; arms are expressions with mixed types — return ANY.
        for a in expr.args:
            _walk(a, schema)
        return InferredType(TypeKind.ANY)

    fn = FUNCTIONS.get(expr.name)
    if fn is None:
        raise TypeError(f"unknown function {expr.name}")

    arg_types = tuple(_walk(a, schema) for a in expr.args)

    if len(arg_types) < fn.min_args or (fn.max_args >= 0 and len(arg_types) > fn.max_args):
        raise TypeError(
            f"{fn.name} expects {fn.min_args}..{fn.max_args} args, got {len(arg_types)}"
        )

    # Aggregate-of-aggregate forbidden unless wrapped in LOD (LOD walks reset
    # is_aggregate to False at the outer scope).
    if fn.is_aggregate and any(a.is_aggregate for a in arg_types):
        raise TypeError(f"{fn.name} cannot be applied to an aggregate expression")

    # Type-match each declared arg position.
    for i, declared in enumerate(fn.arg_types):
        if i >= len(arg_types):
            break
        if declared.kind is TypeKind.SAME_AS:
            continue  # checked at return-type resolution
        if not _compat(arg_types[i].kind, declared.kind):
            raise TypeError(
                f"{fn.name} arg {i + 1}: expected {declared.kind.value}, got {arg_types[i].kind.value}"
            )

    # Resolve return type.
    if isinstance(fn.return_type, TypeConstraint):
        ret = fn.return_type
        if ret.kind is TypeKind.SAME_AS and 0 <= ret.arg_index < len(arg_types):
            return InferredType(arg_types[ret.arg_index].kind, is_aggregate=fn.is_aggregate)
        return InferredType(ret.kind, is_aggregate=fn.is_aggregate)
    resolved = fn.return_type(tuple(TypeConstraint(a.kind) for a in arg_types))
    return InferredType(resolved.kind, is_aggregate=fn.is_aggregate)


def _check_binary(expr: ca.BinaryOp, schema: Mapping[str, str]) -> InferredType:
    lhs = _walk(expr.lhs, schema)
    rhs = _walk(expr.rhs, schema)
    if lhs.is_aggregate != rhs.is_aggregate:
        raise TypeError("cannot mix aggregate and non-aggregate operands")

    op = expr.op
    if op in ("+", "-", "*", "/"):
        if not (lhs.kind in _NUMERIC_KINDS and rhs.kind in _NUMERIC_KINDS):
            raise TypeError(f"arithmetic {op} requires numeric operands")
        return InferredType(TypeKind.NUMBER, is_aggregate=lhs.is_aggregate)
    if op in ("=", "<>", "<", "<=", ">", ">="):
        return InferredType(TypeKind.BOOLEAN, is_aggregate=lhs.is_aggregate)
    if op in ("AND", "OR"):
        if lhs.kind is not TypeKind.BOOLEAN or rhs.kind is not TypeKind.BOOLEAN:
            raise TypeError(f"{op} requires boolean operands")
        return InferredType(TypeKind.BOOLEAN, is_aggregate=lhs.is_aggregate)
    if op == "IN":
        return InferredType(TypeKind.BOOLEAN, is_aggregate=lhs.is_aggregate)
    raise TypeError(f"unknown operator {op}")


def _check_if(expr: ca.IfExpr, schema: Mapping[str, str]) -> InferredType:
    cond = _walk(expr.cond, schema)
    if cond.kind is not TypeKind.BOOLEAN:
        raise TypeError("IF condition must be boolean")
    branches = [_walk(expr.then_, schema)]
    for c, b in expr.elifs:
        if _walk(c, schema).kind is not TypeKind.BOOLEAN:
            raise TypeError("ELSEIF condition must be boolean")
        branches.append(_walk(b, schema))
    if expr.else_ is not None:
        branches.append(_walk(expr.else_, schema))
    return _join_branches(branches)


def _check_case(expr: ca.CaseExpr, schema: Mapping[str, str]) -> InferredType:
    branches: list[InferredType] = []
    for cond, branch in expr.whens:
        _walk(cond, schema)
        branches.append(_walk(branch, schema))
    if expr.else_ is not None:
        branches.append(_walk(expr.else_, schema))
    if expr.scrutinee is not None:
        _walk(expr.scrutinee, schema)
    return _join_branches(branches)


def _join_branches(branches: list[InferredType]) -> InferredType:
    kinds = {b.kind for b in branches if b.kind is not TypeKind.ANY}
    if len(kinds) > 1 and not kinds.issubset(_NUMERIC_KINDS):
        raise TypeError(f"branch types differ: {sorted(k.value for k in kinds)}")
    is_agg = any(b.is_aggregate for b in branches)
    if is_agg and not all(b.is_aggregate for b in branches):
        raise TypeError("CASE/IF branches mix aggregate and non-aggregate")
    head = next(iter(kinds), TypeKind.ANY)
    return InferredType(head, is_aggregate=is_agg)


__all__ = ["TypeError", "InferredType", "TypeKind", "typecheck"]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_typecheck.py -v
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/calc_typecheck.py backend/tests/test_calc_typecheck.py
git commit -m "feat(analyst-pro): bottom-up calc typechecker + aggregate-context guard (Plan 8a T9)"
```

---

## Task 10: AST → SQL `Expression` compiler (`calc_to_expression.py`)

**Files:**
- Create: `backend/vizql/calc_to_expression.py`
- Modify: `backend/param_substitution.py` (add public `format_as_literal`)
- Test: `backend/tests/test_calc_compile.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_calc_compile.py
import pytest


def _schema():
    return {"Sales": "number", "Region": "string", "OrderDate": "date"}


def test_compile_field_ref_to_column():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_to_expression import compile_calc
    from backend.vizql import sql_ast as sa
    from backend.vizql.dialects.registry import Dialect

    out = compile_calc(parse("[Sales]"), Dialect.DUCKDB, _schema(), table_alias="t0")
    assert isinstance(out, sa.Column) and out.name == "Sales" and out.table_alias == "t0"


def test_compile_aggregate_emits_fn_call():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_to_expression import compile_calc
    from backend.vizql import sql_ast as sa
    from backend.vizql.dialects.registry import Dialect

    out = compile_calc(parse("SUM([Sales])"), Dialect.DUCKDB, _schema(), table_alias="t0")
    assert isinstance(out, sa.FnCall) and out.name == "SUM"
    assert isinstance(out.args[0], sa.Column) and out.args[0].name == "Sales"


def test_compile_binary_op():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_to_expression import compile_calc
    from backend.vizql import sql_ast as sa
    from backend.vizql.dialects.registry import Dialect

    out = compile_calc(parse("[Sales] + 1"), Dialect.DUCKDB, _schema(), table_alias="t0")
    assert isinstance(out, sa.BinaryOp) and out.op == "+"
    assert isinstance(out.left, sa.Column) and isinstance(out.right, sa.Literal)


def test_compile_param_ref_substitutes_via_format_as_literal():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_to_expression import compile_calc
    from backend.vizql import sql_ast as sa
    from backend.vizql.dialects.registry import Dialect

    out = compile_calc(
        parse("<Parameters.Threshold>"),
        Dialect.DUCKDB, _schema(),
        params={"Threshold": {"type": "number", "value": 100}},
        table_alias="t0",
    )
    assert isinstance(out, sa.Literal) and out.value == "100"


def test_compile_rawsql_blocked_when_feature_disabled():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_to_expression import compile_calc, CompileError
    from backend.vizql.dialects.registry import Dialect

    with pytest.raises(CompileError):
        compile_calc(parse("RAWSQL_INT('1')"), Dialect.DUCKDB, _schema(), table_alias="t0")


def test_compile_lod_emits_window_marker():
    from backend.vizql.calc_parser import parse
    from backend.vizql.calc_to_expression import compile_calc
    from backend.vizql import sql_ast as sa
    from backend.vizql.dialects.registry import Dialect

    out = compile_calc(
        parse("{ INCLUDE [Region] : SUM([Sales]) }"),
        Dialect.DUCKDB, _schema(), table_alias="t0",
    )
    # LOD lowering for INCLUDE → Window over SUM. Plan 8b finalises FIXED;
    # here we expect a Window node with PARTITION BY [Region].
    assert isinstance(out, sa.Window)


def test_format_as_literal_quotes_string_safely():
    from backend.param_substitution import format_as_literal

    assert format_as_literal("o'brien", "string") == "'o''brien'"
    assert format_as_literal(42, "integer") == "42"
    assert format_as_literal(True, "boolean") == "TRUE"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_compile.py -v
```

Expected: ImportError + AttributeError on `format_as_literal`.

- [ ] **Step 3: Add public `format_as_literal` wrapper to `param_substitution.py`**

Append to `backend/param_substitution.py`:

```python
def format_as_literal(value: Any, ptype: str) -> str:
    """Public wrapper around `_render_literal`. The single source of truth for
    SQL literal formatting in calc-expression compilation (Plan 8a).
    NEVER interpolate user values without going through this helper."""
    return _render_literal({"type": ptype, "value": value})
```

- [ ] **Step 4: Implement `calc_to_expression.py`**

```python
# backend/vizql/calc_to_expression.py
"""CalcExpr → SQL AST Expression compiler. Plan 8a.

Consumes a calc AST (calc_ast.CalcExpr), produces a sql_ast.SQLQueryExpression
that Plan 7d's dialect emitters render. Functions dispatch via FunctionDef
templates; param references substitute via format_as_literal (Plan 7c security).
"""
from __future__ import annotations

from typing import Any, Mapping, Optional

from . import calc_ast as ca
from . import sql_ast as sa
from .calc_functions import FUNCTIONS, Category, TypeKind
from .dialects.registry import Dialect


class CompileError(ValueError):
    pass


def compile_calc(
    expr: ca.CalcExpr,
    dialect: Dialect,
    schema: Mapping[str, str],
    *,
    table_alias: str = "t",
    params: Optional[Mapping[str, Mapping[str, Any]]] = None,
    feature_rawsql_enabled: bool = False,
) -> sa.SQLQueryExpression:
    """Compile a calc AST to a sql_ast expression.

    `params`: { name: { 'type': 'string'|'integer'|... , 'value': … } }, used
    for substituting <Parameters.Name> via format_as_literal.
    `feature_rawsql_enabled`: Plan 11 endpoint passes settings.FEATURE_RAWSQL_ENABLED.
    """
    ctx = _Ctx(dialect=dialect, schema=schema, table_alias=table_alias,
               params=params or {}, rawsql=feature_rawsql_enabled)
    return _walk(expr, ctx)


from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class _Ctx:
    dialect: Dialect
    schema: Mapping[str, str]
    table_alias: str
    params: Mapping[str, Mapping[str, Any]]
    rawsql: bool


_TYPE_TO_SQL_KIND = {
    "string": "varchar", "integer": "integer", "number": "double",
    "real": "double", "boolean": "boolean", "date": "date",
    "datetime": "timestamp", "spatial": "geometry",
}


def _walk(expr: ca.CalcExpr, ctx: _Ctx) -> sa.SQLQueryExpression:
    # backend/ is on sys.path (see main.py); vizql/ siblings use relative
    # imports but root-level helpers use absolute imports. Match the pattern
    # already used by query_routes.py:274 (`from param_substitution import …`).
    from param_substitution import format_as_literal  # type: ignore[import-not-found]

    if isinstance(expr, ca.Literal):
        ptype = expr.data_type if expr.data_type != "real" else "number"
        rendered = "NULL" if expr.value is None else format_as_literal(expr.value, ptype)
        return sa.Literal(value=rendered, data_type=_TYPE_TO_SQL_KIND.get(expr.data_type, "unknown"))

    if isinstance(expr, ca.FieldRef):
        kind_str = ctx.schema.get(expr.field_name, "unknown")
        return sa.Column(name=expr.field_name, table_alias=ctx.table_alias,
                         resolved_type=_TYPE_TO_SQL_KIND.get(kind_str, kind_str))

    if isinstance(expr, ca.ParamRef):
        p = ctx.params.get(expr.param_name)
        if p is None:
            raise CompileError(f"parameter <Parameters.{expr.param_name}> not bound")
        rendered = format_as_literal(p["value"], p["type"])
        return sa.Literal(value=rendered, data_type=_TYPE_TO_SQL_KIND.get(p["type"], "unknown"))

    if isinstance(expr, ca.UnaryOp):
        operand = _walk(expr.operand, ctx)
        if expr.op == "NOT":
            return sa.FnCall(name="NOT", args=(operand,), resolved_type="boolean")
        return sa.BinaryOp(op="*", left=sa.Literal("-1", "integer"), right=operand,
                           resolved_type="number")

    if isinstance(expr, ca.BinaryOp):
        return sa.BinaryOp(op=expr.op, left=_walk(expr.lhs, ctx), right=_walk(expr.rhs, ctx))

    if isinstance(expr, ca.IfExpr):
        whens = [(_walk(expr.cond, ctx), _walk(expr.then_, ctx))]
        for c, b in expr.elifs:
            whens.append((_walk(c, ctx), _walk(b, ctx)))
        else_ = _walk(expr.else_, ctx) if expr.else_ is not None else None
        return sa.Case(whens=tuple(whens), else_=else_)

    if isinstance(expr, ca.CaseExpr):
        # Simple CASE rewrites scrutinee = arm-cond into searched CASE for sa.Case.
        whens: list[tuple[sa.SQLQueryExpression, sa.SQLQueryExpression]] = []
        scrutinee_expr = _walk(expr.scrutinee, ctx) if expr.scrutinee is not None else None
        for cond, branch in expr.whens:
            cond_sa = _walk(cond, ctx)
            if scrutinee_expr is not None:
                cond_sa = sa.BinaryOp(op="=", left=scrutinee_expr, right=cond_sa,
                                      resolved_type="boolean")
            whens.append((cond_sa, _walk(branch, ctx)))
        else_ = _walk(expr.else_, ctx) if expr.else_ is not None else None
        return sa.Case(whens=tuple(whens), else_=else_)

    if isinstance(expr, ca.LodExpr):
        # Plan 8b finalises FIXED → correlated subquery. Here:
        #   FIXED  → Subquery placeholder (raises CompileError until 8b lands)
        #   INCLUDE/EXCLUDE → Window over SUM/etc.
        if expr.kind == "FIXED":
            raise CompileError(
                "FIXED LOD compilation is owned by Plan 8b; Plan 8a only parses + typechecks it"
            )
        body = _walk(expr.body, ctx)
        partitions = tuple(_walk(d, ctx) for d in expr.dims)
        return sa.Window(expr=body, partition_bys=partitions, order_bys=())

    if isinstance(expr, ca.FnCall):
        return _compile_fn(expr, ctx)

    raise CompileError(f"unhandled node {type(expr).__name__}")


def _compile_fn(expr: ca.FnCall, ctx: _Ctx) -> sa.SQLQueryExpression:
    if expr.name == "__TUPLE__":
        # IN-list payload — handled by BinaryOp("IN") above; never compiled standalone.
        raise CompileError("__TUPLE__ must appear as RHS of IN")

    fn = FUNCTIONS.get(expr.name)
    if fn is None:
        raise CompileError(f"unknown function {expr.name}")

    if fn.category is Category.PASSTHROUGH and not ctx.rawsql:
        raise CompileError(
            f"{fn.name}: RAWSQL passthrough requires FEATURE_RAWSQL_ENABLED"
        )
    if fn.category is Category.ANALYTICS_EXT:
        raise CompileError(f"{fn.name}: external analytics scripts require Phase 12")
    if fn.is_table_calc:
        raise CompileError(f"{fn.name}: table calc lowering owned by Plan 8c")

    sa_args = tuple(_walk(a, ctx) for a in expr.args)

    # Aggregate / scalar functions both emit sa.FnCall — dialect emitter
    # resolves the template per-dialect at SQL emission time. Plan 8a does
    # NOT pre-render the template string here; it preserves the call-tree
    # so Plan 7d's dialect layer can pick the right per-dialect form.
    return sa.FnCall(
        name=fn.name,
        args=sa_args,
        distinct=(fn.name == "COUNTD"),
    )


__all__ = ["compile_calc", "CompileError"]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_compile.py -v
```

Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/calc_to_expression.py backend/param_substitution.py backend/tests/test_calc_compile.py
git commit -m "feat(analyst-pro): compile calc AST to sql_ast Expression + format_as_literal (Plan 8a T10)"
```

---

## Task 11: API endpoint `POST /api/v1/calcs/validate` + per-user rate limit

**Files:**
- Modify: `backend/routers/query_routes.py` (new endpoint + rate-limit helper)
- Modify: `backend/config.py` (`CALC_RATE_LIMIT_PER_30S`, `MAX_CALC_FORMULA_LEN`, `MAX_CALC_NESTING`)
- Modify: `docs/claude/config-defaults.md` (document new constants)
- Test: `backend/tests/test_calc_routes.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_calc_routes.py
import pytest
from fastapi.testclient import TestClient


def _client(monkeypatch, *, analyst_pro: bool = True):
    monkeypatch.setenv("FEATURE_ANALYST_PRO", "true" if analyst_pro else "false")
    from importlib import reload
    import config
    reload(config)
    import main
    reload(main)
    return TestClient(main.app)


def _auth_headers():
    # Reuse demo user shortcut. Existing tests document this pattern in
    # backend/tests/test_query_routes.py — copy that helper.
    from auth import create_access_token
    token = create_access_token({"sub": "demo@askdb.dev"})
    return {"Authorization": f"Bearer {token}"}


def test_validate_known_function_returns_inferred_type(monkeypatch):
    client = _client(monkeypatch)
    r = client.post(
        "/api/v1/calcs/validate",
        headers=_auth_headers(),
        json={
            "formula": "SUM([Sales])",
            "schema_ref": {"Sales": "number"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["inferredType"] == "number"
    assert body["errors"] == []


def test_validate_unknown_function_400(monkeypatch):
    client = _client(monkeypatch)
    r = client.post(
        "/api/v1/calcs/validate",
        headers=_auth_headers(),
        json={"formula": "WAT([Sales])", "schema_ref": {"Sales": "number"}},
    )
    assert r.status_code == 400
    assert "unknown function" in r.json()["detail"].lower()


def test_validate_blocked_when_feature_off(monkeypatch):
    client = _client(monkeypatch, analyst_pro=False)
    r = client.post(
        "/api/v1/calcs/validate",
        headers=_auth_headers(),
        json={"formula": "SUM([Sales])", "schema_ref": {"Sales": "number"}},
    )
    assert r.status_code == 404


def test_validate_rate_limit_kicks_in(monkeypatch):
    monkeypatch.setenv("CALC_RATE_LIMIT_PER_30S", "3")
    client = _client(monkeypatch)
    body = {"formula": "SUM([Sales])", "schema_ref": {"Sales": "number"}}
    for _ in range(3):
        assert client.post("/api/v1/calcs/validate", headers=_auth_headers(), json=body).status_code == 200
    r = client.post("/api/v1/calcs/validate", headers=_auth_headers(), json=body)
    assert r.status_code == 429


def test_validate_rejects_oversized_formula(monkeypatch):
    monkeypatch.setenv("MAX_CALC_FORMULA_LEN", "20")
    client = _client(monkeypatch)
    r = client.post(
        "/api/v1/calcs/validate",
        headers=_auth_headers(),
        json={"formula": "SUM([Sales]) + " * 50, "schema_ref": {"Sales": "number"}},
    )
    assert r.status_code == 413


def test_validate_injection_attempt_rejected_or_safe(monkeypatch):
    client = _client(monkeypatch)
    # Calc body containing a SQL-style injection. Either ParseError (400) or
    # safely escaped via format_as_literal — never raw passthrough.
    r = client.post(
        "/api/v1/calcs/validate",
        headers=_auth_headers(),
        json={
            "formula": "'); DROP TABLE users;--",
            "schema_ref": {},
        },
    )
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        # If parsed, must be quoted as a string literal — not interpolated.
        assert "DROP TABLE" not in r.json().get("compiledHint", "DROP TABLE absent")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_calc_routes.py -v
```

Expected: 404 on `/api/v1/calcs/validate` (endpoint absent).

- [ ] **Step 3: Add config keys + endpoint**

In `backend/config.py` near `FEATURE_ANALYST_PRO` (line 263):

```python
    FEATURE_ANALYST_PRO: bool = False
    FEATURE_RAWSQL_ENABLED: bool = False
    CALC_RATE_LIMIT_PER_30S: int = 10
    MAX_CALC_FORMULA_LEN: int = 10_000
    MAX_CALC_NESTING: int = 32
```

In `backend/routers/query_routes.py`, append endpoint + helper:

```python
# ---- Plan 8a: calc validation endpoint ----
import collections
from threading import Lock

_CALC_RL_LOCK = Lock()
_CALC_RL_TIMESTAMPS: dict[str, list[float]] = collections.defaultdict(list)


def _enforce_calc_rate_limit(email: str) -> None:
    from config import settings
    now = time.time()
    window = 30.0
    cap = settings.CALC_RATE_LIMIT_PER_30S
    with _CALC_RL_LOCK:
        ts = [t for t in _CALC_RL_TIMESTAMPS[email] if t > now - window]
        if len(ts) >= cap:
            raise HTTPException(
                status_code=429,
                detail=f"calc validation rate limit: max {cap} per 30s",
            )
        ts.append(now)
        _CALC_RL_TIMESTAMPS[email] = ts


class _CalcValidateRequest(BaseModel):
    formula: str
    schema_ref: dict[str, str] = Field(default_factory=dict)
    params: dict[str, dict] = Field(default_factory=dict)


@router.post("/v1/calcs/validate")
async def validate_calc(req: _CalcValidateRequest, current_user: dict = Depends(get_current_user)):
    from config import settings
    if not settings.FEATURE_ANALYST_PRO:
        raise HTTPException(status_code=404, detail="calc validation disabled")

    if len(req.formula) > settings.MAX_CALC_FORMULA_LEN:
        raise HTTPException(status_code=413, detail="formula too long")

    email = current_user.get("email") or current_user.get("sub", "")
    _enforce_calc_rate_limit(email)

    from vizql.calc_parser import parse, ParseError, LexError
    from vizql.calc_typecheck import typecheck, TypeError as CalcTypeError

    errors: list[dict] = []
    inferred = None
    try:
        ast = parse(req.formula, max_depth=settings.MAX_CALC_NESTING)
        inferred = typecheck(ast, req.schema_ref)
    except (ParseError, LexError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except CalcTypeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "valid": True,
        "inferredType": inferred.kind.value,
        "isAggregate": inferred.is_aggregate,
        "errors": errors,
    }
```

Add the validate router endpoint relative-mount note: the existing `query_routes.router` already mounts under `/api`; `@router.post("/v1/calcs/validate")` produces `/api/v1/calcs/validate`. If `query_routes.router` does not include `/api` in its prefix (verify by grepping `app.include_router(...query_router..., prefix=...)` in `main.py`), prepend `/api` to the path string.

In `docs/claude/config-defaults.md`, add a new subsection under the "Query / SQL guardrails" table:

```markdown
### Calc parser (Plan 8a)

| Constant | Value | Notes |
|---|---|---|
| `CALC_RATE_LIMIT_PER_30S` | `10` | per-user `/api/v1/calcs/validate` cap |
| `MAX_CALC_FORMULA_LEN` | `10_000` | reject oversized formula bodies (413) |
| `MAX_CALC_NESTING` | `32` | parser depth cap (ParseError beyond) |
| `FEATURE_RAWSQL_ENABLED` | `False` | `RAWSQL_*` passthrough gate |
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_calc_routes.py -v
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/query_routes.py backend/config.py backend/tests/test_calc_routes.py docs/claude/config-defaults.md
git commit -m "feat(analyst-pro): /api/v1/calcs/validate endpoint + per-user rate limit (Plan 8a T11)"
```

---

## Task 12: `CALC_LANGUAGE.md` BNF + roadmap shipped marker + final pytest sweep

**Files:**
- Create: `backend/vizql/CALC_LANGUAGE.md`
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` (mark Plan 8a shipped)

- [ ] **Step 1: Write `CALC_LANGUAGE.md`**

```markdown
# Calc Language Reference (Plan 8a)

Tableau-compatible expression language for calculated fields. Parser at
`backend/vizql/calc_parser.py`; function catalogue at
`backend/vizql/calc_functions.py`; typechecker at `backend/vizql/calc_typecheck.py`;
SQL emitter at `backend/vizql/calc_to_expression.py`.

## Grammar (EBNF)

```
expr        ::= or_expr
or_expr     ::= and_expr ( "OR" and_expr )*
and_expr    ::= in_expr ( "AND" in_expr )*
in_expr     ::= cmp_expr ( "IN" "(" expr ( "," expr )* ")" )?
cmp_expr    ::= add_expr ( ("=" | "<>" | "<" | "<=" | ">" | ">=") add_expr )*
add_expr    ::= mul_expr ( ("+" | "-") mul_expr )*
mul_expr    ::= unary    ( ("*" | "/") unary )*
unary       ::= ("-" | "NOT") unary | primary
primary     ::= literal
              | field_ref
              | param_ref
              | fn_call
              | if_expr
              | case_expr
              | lod_expr
              | "(" expr ")"

literal     ::= NUMBER | STRING | "TRUE" | "FALSE" | "NULL"
field_ref   ::= "[" IDENT_RUN "]" | IDENT
param_ref   ::= "<Parameters." IDENT ">" | "[Parameters]" "." "[" IDENT "]"
fn_call     ::= IDENT "(" ( expr ( "," expr )* )? ")"
if_expr     ::= "IF" expr "THEN" expr ( "ELSEIF" expr "THEN" expr )* ( "ELSE" expr )? "END"
case_expr   ::= "CASE" expr? ( "WHEN" expr "THEN" expr )+ ( "ELSE" expr )? "END"
lod_expr    ::= "{" ("FIXED"|"INCLUDE"|"EXCLUDE") ( field_ref ("," field_ref)* )? ":" expr "}"
```

Comments: `// line` or `-- line`. Strings: `"…"` or `'…'`, `\\` and `\"` escapes.

## Function catalogue

See `calc_functions.py :: FUNCTIONS`. Categories cover every entry from
`docs/Build_Tableau.md` §V.1: Aggregate, Logical, String, Date,
Type-conversion, User, Spatial, Passthrough (RAWSQL_*), Analytics-ext
(SCRIPT_*), Table-calc names (full semantics in Plan 8c).

Canonical names follow Tableau spelling: `STARTSWITH` (not `STARTS_WITH`),
`COUNTD` (not `COUNT_DISTINCT`), `DATETRUNC` (not `DATE_TRUNC`).

## Differences from Tableau (known gaps)

- `RAWSQL_*` requires `FEATURE_RAWSQL_ENABLED=true` (default off).
- `SCRIPT_REAL` / `SCRIPT_STR` / `SCRIPT_INT` / `SCRIPT_BOOL` parse + typecheck
  but cannot compile until Phase 12 (analytics extension bridge).
- Table calculations (`RUNNING_*`, `WINDOW_*`, `INDEX`, `RANK*`, `TOTAL`,
  `PCT_TOTAL`, `DIFF`, `LOOKUP`, `PREVIOUS_VALUE`, `FIRST`, `LAST`, `SIZE`)
  parse + typecheck via Plan 8a; window-frame compilation lands in Plan 8c.
- `FIXED` LOD parses + typechecks here; correlated-subquery lowering in Plan 8b.
- `INCLUDE` / `EXCLUDE` LOD compile to a `Window` node (Plan 7c sql_ast)
  with `partition_bys` set from LOD dims; final `OVER (PARTITION BY …)`
  emission belongs to Plan 7d.
- No spatial-aggregate execution until DuckDB spatial extension is loaded
  per-connection (Phase 11).
- Custom Tableau type-coerce shorthand `[Field].[YEAR]` is NOT supported;
  use `YEAR([Field])` instead.

## Security

- Field identifiers and parameter values NEVER interpolate raw into SQL.
  All literals route through `param_substitution.format_as_literal()`.
- Endpoint `/api/v1/calcs/validate` is rate-limited per user
  (`CALC_RATE_LIMIT_PER_30S` default 10).
- Formulas longer than `MAX_CALC_FORMULA_LEN` (10_000) are rejected at the
  endpoint with HTTP 413.
- Parser depth capped at `MAX_CALC_NESTING` (32) to prevent stack abuse.
```

- [ ] **Step 2: Run the full Plan 8a test sweep**

```bash
cd backend && python -m pytest tests/test_calc_parser.py tests/test_calc_functions.py tests/test_calc_typecheck.py tests/test_calc_compile.py tests/test_calc_routes.py -v
```

Expected: every test PASS. If anything fails, fix in this commit before marking the plan shipped.

- [ ] **Step 3: Run the broader regression suite**

```bash
cd backend && python -m pytest tests/ -q
```

Expected: zero new failures vs. the baseline. The "Known Test Debt" entries from `CLAUDE.md` remain unchanged.

- [ ] **Step 4: Mark Plan 8a shipped in roadmap**

In `docs/analyst_pro_tableau_parity_roadmap.md`, after the Plan 8a "Task count target: 12." line, append:

```markdown
**Status:** ✅ Shipped — 2026-04-20. 12 tasks. New modules: `backend/vizql/calc_ast.py`, `backend/vizql/calc_parser.py`, `backend/vizql/calc_functions.py`, `backend/vizql/calc_typecheck.py`, `backend/vizql/calc_to_expression.py`, `backend/vizql/CALC_LANGUAGE.md`. New endpoint: `POST /api/v1/calcs/validate` (FEATURE_ANALYST_PRO-gated, 10/30s per user). New config: `FEATURE_RAWSQL_ENABLED` (default False), `CALC_RATE_LIMIT_PER_30S=10`, `MAX_CALC_FORMULA_LEN=10000`, `MAX_CALC_NESTING=32`. Public helper: `param_substitution.format_as_literal()`. Plan doc: `docs/superpowers/plans/2026-04-20-analyst-pro-plan-8a-calc-parser-function-catalogue.md`.
```

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/CALC_LANGUAGE.md docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): CALC_LANGUAGE.md BNF + Plan 8a shipped marker (Plan 8a T12)"
```

---

## Done criteria

- All 12 tasks committed with `feat(analyst-pro): … (Plan 8a T<N>)` or `docs(analyst-pro): …` form.
- Every function name from `Build_Tableau.md` §V.1 appears in `FUNCTIONS` with the canonical Tableau spelling.
- Every catalogue entry has at least one positive + one negative test (across `test_calc_functions.py` + `test_calc_typecheck.py`).
- `RAWSQL_*` rejected unless `FEATURE_RAWSQL_ENABLED=true`.
- `/api/v1/calcs/validate` returns inferred type + 400 on unknown / type / parse errors + 429 on rate-limit + 413 on oversized formulas + 404 when `FEATURE_ANALYST_PRO=false`.
- `mypy --strict backend/vizql/calc_*.py` clean.
- `param_substitution.format_as_literal()` is the only path values reach SQL.
- Roadmap §Plan 8a marked shipped with task count + new module list.
- `docs/claude/config-defaults.md` updated with the four new constants in the same commit that introduced them (Task 11).
