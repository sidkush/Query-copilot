# Analyst Pro — Plan 10b: Number Format Grammar (Excel-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Excel-compatible number format string parser + formatter in Python *and* TypeScript, surfaced through the Plan 10a `FormatResolver` via `StyleProp.NUMBER_FORMAT` (`"number-format"`), and wire it into Vega-Lite axis labels, tooltip values and text-object parameter substitution.

**Architecture:** A single grammar (`backend/vizql/number_format.py` / `frontend/.../numberFormat.ts`) parses an Excel-derived pattern string into a `NumberFormatAST` (≤ 4 sections: positive; negative; zero; text). A pure formatter walks the AST, applies per-section scale (×100 for `%`, ×1000 for `‰`), formats the integer/decimal/exponent parts with locale-aware separators and `ROUND_HALF_UP` rounding, then prepends/appends literals. Parity between Python and TypeScript is guaranteed by a shared JSON fixture file (200+ cases) consumed by both test harnesses. Vega-Lite consumes formatted output via a D3-format mapping where possible, else via a registered Vega expression function (`askdbFormatNumber`) that calls the TS formatter. A `NumberFormatEditor` panel inside the Plan 10a `FormatInspectorPanel` lets the user pick a named default or author a custom pattern with a live sample preview.

**Tech Stack:** Python 3.10 (`dataclasses`, `decimal.Decimal`, `decimal.ROUND_HALF_UP`, `enum.Enum`; NO new dependencies), TypeScript 5.x (`Intl.NumberFormat`), Vitest, pytest, React 19, `vega`/`vega-lite` (already in deps — registering an expression function via `vega.expressionFunction`).

**References:**
- `docs/Build_Tableau.md` §XIV.2 — Excel number format grammar (AUTHORITATIVE for tokens + section semantics).
- `docs/Build_Tableau.md` §XIV.1 — precedence chain (Plan 10a resolver — consumed via `StyleProp.NUMBER_FORMAT`).
- `docs/Build_Tableau.md` §XIV.6 — rich text (tooltip + title number embeds — integration point for formatted-value substitution).
- `docs/Build_Tableau.md` Appendix C — `tabstylemodel` + `tabdocformatting` field shape.
- `docs/analyst_pro_tableau_parity_roadmap.md` §Plan 10b — AUTHORITATIVE scope.
- Plan 10a (`backend/vizql/formatting_types.py` :: `StyleProp.NUMBER_FORMAT`, `backend/vizql/format_resolver.py`, `frontend/.../formatResolver.ts`) — consumed.
- Plan 7a (`backend/proto/askdb/vizdataservice/v1.proto`) — `VisualSpec.formatting` already carries `StyleRule.properties['number-format']: string`. No proto change required in 10b.

---

## Scope boundaries (explicit non-goals)

Out-of-scope for this plan (tracked elsewhere):
- Date format grammar → Plan 10c (`StyleProp.DATE_FORMAT`).
- Rich-text rendering / theme system → Plan 10d.
- Conditional formatting (stepped palette / calc→color) → Plan 10e.
- Locale-aware *pattern syntax* — patterns are always en-US style (`.` decimal, `,` thousands *in the pattern*); only the **rendered output** is locale-aware via `locale` argument.
- Server-side rendering of formatted numbers in PDF/PNG exports (lands in a follow-up export plan; the formatter is re-usable).

---

## File Structure

**Backend (Python):**
- Create: `backend/vizql/number_format.py` — tokens enum, `NumberFormatAST` + section dataclasses, `parse_number_format()`, `format_number()`, `NumberFormatError`.
- Create: `backend/vizql/number_format_defaults.py` — named-default catalogue (`Number (Standard)`, `Number (Decimal)`, `Currency (Standard)`, `Currency (Custom)`, `Scientific`, `Percentage`, `Custom`).
- Modify: `backend/vizql/__init__.py` — re-export `parse_number_format`, `format_number`, `NumberFormatError`, `DEFAULT_NUMBER_FORMATS` so downstream modules can import from the package root.

**Backend tests:**
- Create: `backend/tests/test_number_format.py` — parser + formatter unit tests + edge cases + parser errors + rounding + NaN/Inf + performance (10k in <50ms).
- Create: `backend/tests/test_number_format_parity.py` — drives `backend/vizql/tests/fixtures/number_format_parity/cases.json` and asserts every case's Python output matches the embedded `expected` field.
- Create: `backend/vizql/tests/fixtures/number_format_parity/cases.json` — 200+ golden cases (`{ pattern, value, locale, expected }`). Used by Python *and* TS parity harnesses.
- Create: `backend/tests/test_number_format_defaults.py` — asserts each named default parses + formats sample values correctly.

**Frontend (TypeScript):**
- Create: `frontend/src/components/dashboard/freeform/lib/numberFormat.ts` — TS mirror of `number_format.py`. Uses `Intl.NumberFormat` for locale-aware thousands + decimal separators.
- Create: `frontend/src/components/dashboard/freeform/lib/numberFormatDefaults.ts` — TS mirror of `number_format_defaults.py`.
- Create: `frontend/src/chart-ir/formatting/vegaFormatAdapter.ts` — `toVegaFormat(ast)` + Vega expression function registration (`askdbFormatNumber`).
- Create: `frontend/src/chart-ir/formatting/registerVegaFormat.ts` — module-level side effect that calls `vega.expressionFunction('askdbFormatNumber', …)`. Imported once from app bootstrap (see T8 Step 5).
- Create: `frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.jsx` — preset dropdown + custom pattern input + live sample preview.
- Create: `frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.module.css`.
- Modify: `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx` — mount `NumberFormatEditor` when the currently-edited property is `StyleProp.NumberFormat`, or as a dedicated section below the property grid.
- Modify: `frontend/src/main.jsx` — import `./chart-ir/formatting/registerVegaFormat` once at startup (side-effect import) so Vega sees `askdbFormatNumber` before any chart renders.

**Frontend tests:**
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts` — mirrors Python unit tests.
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.parity.test.ts` — loads `backend/vizql/tests/fixtures/number_format_parity/cases.json` (via Vite `?raw` import or relative `fs.readFileSync` in a node-env test) and asserts TS output === expected for every case.
- Create: `frontend/src/chart-ir/formatting/__tests__/vegaFormatAdapter.test.ts` — `toVegaFormat` mapping + registered-fn sanity.
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx` — preset selection, custom pattern input, live preview, error indicator.

**Docs:**
- Create: `backend/vizql/NUMBER_FORMAT_GRAMMAR.md` — grammar spec + AST diagram + example table + parity note.
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` — flip Plan 10b header to `✅ Shipped 2026-04-21` with task + test counts.

**Shared fixture directory** (created in T4, consumed by T6):
- Create: `backend/vizql/tests/fixtures/number_format_parity/cases.json` — the canonical corpus. 200+ `{id, pattern, value, locale, expected}` records.

---

## Task 0 — Dependency Gate

**Purpose:** Fail loudly if Plan 10a artefacts are missing. Plan 10b consumes `StyleProp.NUMBER_FORMAT` + the resolver contract.

**Files:** none modified.

- [ ] **Step 1: Verify Plan 10a files exist**

Run:
```bash
cd "QueryCopilot V1"
ls backend/vizql/format_resolver.py backend/vizql/formatting_types.py
ls frontend/src/components/dashboard/freeform/lib/formatResolver.ts frontend/src/components/dashboard/freeform/lib/formattingTypes.ts
ls frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx
```
Expected: every path resolves. If any is missing, STOP and escalate — Plan 10a did not ship.

- [ ] **Step 2: Verify `StyleProp.NUMBER_FORMAT` exists on both sides**

Run:
```bash
grep -n 'NUMBER_FORMAT = "number-format"' backend/vizql/formatting_types.py
grep -n "NumberFormat = 'number-format'" frontend/src/components/dashboard/freeform/lib/formattingTypes.ts
```
Expected: one hit per file. If missing, STOP.

- [ ] **Step 3: Verify Plan 10a commit landed**

Run:
```bash
git log --oneline -120 | grep "Plan 10a"
```
Expected: ≥ 10 commits starting with `feat(analyst-pro):` or `docs(analyst-pro):` ending in `(Plan 10a T<N>)`.

- [ ] **Step 4: Confirm Python stdlib-only policy**

No new dependency lands in this plan. Verify:
```bash
grep -E "^(babel|num2words|icu)" backend/requirements.txt
```
Expected: no output. `decimal` + `math` + `enum` + `dataclasses` cover everything.

- [ ] **Step 5: Record gate clearance**

No commit at T0 — this task is diagnostic only.

---

## Task 1 — Python tokens + AST dataclasses

**Purpose:** Define the typed data model before the parser/formatter consume it. Pure types, no logic.

**Files:**
- Create: `backend/vizql/number_format.py` (new file, types only).
- Test: `backend/tests/test_number_format.py` (types portion only).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_number_format.py`:

```python
"""Plan 10b — Excel-style number format grammar tests."""
from decimal import Decimal

import pytest

from backend.vizql.number_format import (
    DecimalSpec,
    ExponentSpec,
    FormatSection,
    IntegerSpec,
    Literal,
    NumberFormatAST,
    NumberFormatError,
    TokenKind,
)


def test_token_kind_covers_required_tokens():
    required = {
        "DIGIT_OPTIONAL", "DIGIT_REQUIRED", "THOUSANDS_SEP",
        "DECIMAL_POINT", "PERCENT", "PER_MILLE", "EXPONENT",
        "LITERAL", "CURRENCY", "BRACKETED_CURRENCY",
        "SECTION_SEP", "QUOTED_LITERAL",
    }
    actual = {t.name for t in TokenKind}
    assert required <= actual, f"Missing tokens: {required - actual}"


def test_integer_spec_defaults():
    spec = IntegerSpec(min_digits=1, thousands_separator=True)
    assert spec.min_digits == 1
    assert spec.thousands_separator is True


def test_format_section_shape():
    section = FormatSection(
        integer_part=IntegerSpec(min_digits=1, thousands_separator=True),
        decimal_part=DecimalSpec(min_digits=2, max_digits=2),
        exponent_part=None,
        prefix=(Literal("$"),),
        suffix=(),
        scale=1.0,
        negative_style="minus",
    )
    assert section.scale == 1.0
    assert section.negative_style == "minus"
    assert section.prefix[0].text == "$"


def test_number_format_ast_sections_immutable():
    ast = NumberFormatAST(sections=(
        FormatSection(
            integer_part=IntegerSpec(min_digits=1, thousands_separator=False),
            decimal_part=None, exponent_part=None,
            prefix=(), suffix=(), scale=1.0, negative_style="minus",
        ),
    ))
    with pytest.raises((AttributeError, TypeError)):
        ast.sections = ()  # type: ignore[misc]


def test_number_format_error_is_exception():
    err = NumberFormatError("bad", column=3)
    assert isinstance(err, Exception)
    assert err.column == 3
    assert "column 3" in str(err)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_number_format.py -v`
Expected: `ImportError: cannot import name 'TokenKind' from 'backend.vizql.number_format'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/vizql/number_format.py`:

```python
"""Plan 10b — Excel-style number format grammar.

Parses Excel-derived format strings into a `NumberFormatAST` and formats
numeric values through it. Pure stdlib (decimal + enum + dataclasses).

References:
    - Build_Tableau.md §XIV.2 (Excel grammar, AUTHORITATIVE).
    - Build_Tableau.md §XIV.1 (consumed via FormatResolver `StyleProp.NUMBER_FORMAT`).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple


class TokenKind(Enum):
    DIGIT_OPTIONAL = "#"
    DIGIT_REQUIRED = "0"
    THOUSANDS_SEP = ","
    DECIMAL_POINT = "."
    PERCENT = "%"
    PER_MILLE = "\u2030"
    EXPONENT = "E"
    LITERAL = "literal"
    QUOTED_LITERAL = "quoted"
    CURRENCY = "currency"
    BRACKETED_CURRENCY = "bracketed_currency"
    SECTION_SEP = ";"


@dataclass(frozen=True)
class Literal:
    text: str


@dataclass(frozen=True)
class IntegerSpec:
    min_digits: int
    thousands_separator: bool


@dataclass(frozen=True)
class DecimalSpec:
    min_digits: int
    max_digits: int


@dataclass(frozen=True)
class ExponentSpec:
    min_digits: int
    plus_sign: bool


@dataclass(frozen=True)
class FormatSection:
    integer_part: IntegerSpec
    decimal_part: Optional[DecimalSpec]
    exponent_part: Optional[ExponentSpec]
    prefix: Tuple[Literal, ...]
    suffix: Tuple[Literal, ...]
    scale: float
    negative_style: str  # "minus" | "parens"


@dataclass(frozen=True)
class NumberFormatAST:
    sections: Tuple[FormatSection, ...]


class NumberFormatError(ValueError):
    """Raised on invalid number format string. Carries 1-based column number."""

    def __init__(self, message: str, column: int) -> None:
        super().__init__(f"{message} (at column {column})")
        self.column = column
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_number_format.py -v`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/vizql/number_format.py backend/tests/test_number_format.py
git commit -m "feat(analyst-pro): add NumberFormatAST + TokenKind dataclasses (Plan 10b T1)"
```

---

## Task 2 — Python parser (recursive-descent)

**Purpose:** `parse_number_format(spec: str) -> NumberFormatAST` with column-numbered errors. Must reject invalid patterns loudly, never silently fall back.

**Files:**
- Modify: `backend/vizql/number_format.py` — add `parse_number_format()` + internal helpers.
- Test: `backend/tests/test_number_format.py` — extend with parser tests.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_number_format.py`:

```python
from backend.vizql.number_format import parse_number_format


class TestParser:
    def test_integer_with_thousands(self):
        ast = parse_number_format("#,##0")
        assert len(ast.sections) == 1
        sec = ast.sections[0]
        assert sec.integer_part.thousands_separator is True
        assert sec.integer_part.min_digits == 1
        assert sec.decimal_part is None
        assert sec.scale == 1.0

    def test_fixed_two_decimals(self):
        ast = parse_number_format("#,##0.00")
        sec = ast.sections[0]
        assert sec.decimal_part == DecimalSpec(min_digits=2, max_digits=2)

    def test_percent_scales_by_100(self):
        ast = parse_number_format("0.0%")
        sec = ast.sections[0]
        assert sec.scale == 100.0
        assert sec.decimal_part == DecimalSpec(min_digits=1, max_digits=1)
        assert sec.suffix[-1].text == "%"

    def test_scientific(self):
        ast = parse_number_format("0.##E+00")
        sec = ast.sections[0]
        assert sec.exponent_part == ExponentSpec(min_digits=2, plus_sign=True)
        assert sec.decimal_part == DecimalSpec(min_digits=0, max_digits=2)

    def test_currency_literal(self):
        ast = parse_number_format("$#,##0")
        sec = ast.sections[0]
        assert sec.prefix[0].text == "$"

    def test_bracketed_currency(self):
        ast = parse_number_format("[USD]#,##0.00")
        sec = ast.sections[0]
        assert sec.prefix[0].text == "USD"

    def test_two_sections_parens_negative(self):
        ast = parse_number_format("$#,##0;($#,##0)")
        assert len(ast.sections) == 2
        neg = ast.sections[1]
        assert neg.negative_style == "parens"
        assert neg.prefix[0].text == "("
        assert neg.suffix[-1].text == ")"

    def test_quoted_literal(self):
        ast = parse_number_format('#,##0 "items"')
        sec = ast.sections[0]
        assert any(lit.text == "items" for lit in sec.suffix)

    def test_four_sections(self):
        ast = parse_number_format('#,##0;-#,##0;"zero";@')
        assert len(ast.sections) == 4

    def test_rejects_five_sections(self):
        with pytest.raises(NumberFormatError) as exc:
            parse_number_format("0;0;0;0;0")
        assert exc.value.column >= 1

    def test_rejects_unmatched_quote(self):
        with pytest.raises(NumberFormatError) as exc:
            parse_number_format('0 "unterminated')
        assert "quote" in str(exc.value).lower()

    def test_rejects_invalid_scientific(self):
        with pytest.raises(NumberFormatError):
            parse_number_format("0E")  # exponent needs digit spec

    def test_empty_pattern_rejected(self):
        with pytest.raises(NumberFormatError):
            parse_number_format("")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_number_format.py::TestParser -v`
Expected: `AttributeError` / `ImportError` — `parse_number_format` not defined.

- [ ] **Step 3: Implement the parser**

Append to `backend/vizql/number_format.py`:

```python
# --- Parser ------------------------------------------------------------

_CURRENCY_CHARS = {"$", "\u20ac", "\u00a5", "\u00a3"}  # $, €, ¥, £


def parse_number_format(spec: str) -> NumberFormatAST:
    """Recursive-descent parse. Raises NumberFormatError with 1-based column."""
    if spec == "":
        raise NumberFormatError("empty format string", column=1)
    raw_sections = _split_sections(spec)
    if len(raw_sections) > 4:
        raise NumberFormatError("too many sections (max 4)", column=spec.find(";") + 1)
    sections = tuple(
        _parse_section(text, base_col, idx)
        for idx, (text, base_col) in enumerate(raw_sections)
    )
    return NumberFormatAST(sections=sections)


def _split_sections(spec: str) -> list[tuple[str, int]]:
    """Split on `;` respecting quoted literals and `\\` escapes. Returns
    list of (section_text, 1-based column where this section starts)."""
    out: list[tuple[str, int]] = []
    buf: list[str] = []
    start = 1
    i = 0
    in_quote = False
    while i < len(spec):
        c = spec[i]
        if c == "\\" and i + 1 < len(spec):
            buf.append(spec[i : i + 2])
            i += 2
            continue
        if c == '"':
            in_quote = not in_quote
            buf.append(c)
            i += 1
            continue
        if c == ";" and not in_quote:
            out.append(("".join(buf), start))
            buf = []
            start = i + 2
            i += 1
            continue
        buf.append(c)
        i += 1
    if in_quote:
        raise NumberFormatError("unmatched quote", column=spec.rfind('"') + 1)
    out.append(("".join(buf), start))
    return out


def _parse_section(text: str, base_col: int, section_index: int) -> FormatSection:
    """Parse a single section. `base_col` is the column in the original spec
    where `text` starts (1-based)."""
    prefix: list[Literal] = []
    suffix: list[Literal] = []
    int_digits_optional = 0
    int_digits_required = 0
    thousands = False
    decimal_min = 0
    decimal_max = 0
    in_decimal = False
    exp_digits = 0
    exp_plus = False
    have_exp = False
    scale = 1.0
    negative_style = "minus"
    seen_digit = False

    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        col = base_col + i

        if c == "\\" and i + 1 < n:
            (prefix if not seen_digit else suffix).append(Literal(text[i + 1]))
            i += 2
            continue

        if c == '"':
            end = text.find('"', i + 1)
            if end == -1:
                raise NumberFormatError("unmatched quote", column=col)
            literal = text[i + 1 : end]
            (prefix if not seen_digit else suffix).append(Literal(literal))
            i = end + 1
            continue

        if c == "[":
            end = text.find("]", i + 1)
            if end == -1:
                raise NumberFormatError("unmatched bracket", column=col)
            bracket_body = text[i + 1 : end]
            prefix.append(Literal(bracket_body))
            i = end + 1
            continue

        if c in _CURRENCY_CHARS:
            (prefix if not seen_digit else suffix).append(Literal(c))
            i += 1
            continue

        if c == "#":
            if not in_decimal:
                int_digits_optional += 1
            else:
                decimal_max += 1
            seen_digit = True
            i += 1
            continue

        if c == "0":
            if not in_decimal:
                int_digits_required += 1
                int_digits_optional += 1
            else:
                decimal_min += 1
                decimal_max += 1
            seen_digit = True
            i += 1
            continue

        if c == ",":
            if seen_digit and not in_decimal:
                thousands = True
                i += 1
                continue
            (prefix if not seen_digit else suffix).append(Literal(","))
            i += 1
            continue

        if c == ".":
            if in_decimal:
                raise NumberFormatError("multiple decimal points", column=col)
            in_decimal = True
            i += 1
            continue

        if c == "%":
            scale *= 100.0
            suffix.append(Literal("%"))
            i += 1
            continue

        if c == "\u2030":
            scale *= 1000.0
            suffix.append(Literal("\u2030"))
            i += 1
            continue

        if c == "E":
            if i + 1 >= n or text[i + 1] not in "+-":
                raise NumberFormatError(
                    "scientific exponent must be E+ or E-", column=col
                )
            exp_plus = text[i + 1] == "+"
            j = i + 2
            digits = 0
            while j < n and text[j] == "0":
                digits += 1
                j += 1
            if digits == 0:
                raise NumberFormatError(
                    "scientific exponent needs at least one 0", column=base_col + j
                )
            exp_digits = digits
            have_exp = True
            i = j
            continue

        if c == "(" and section_index == 1:
            negative_style = "parens"
            prefix.append(Literal("("))
            i += 1
            continue
        if c == ")" and section_index == 1 and negative_style == "parens":
            suffix.append(Literal(")"))
            i += 1
            continue

        if c == "@":
            suffix.append(Literal("@"))
            i += 1
            continue

        if c == " " or c.isprintable():
            (prefix if not seen_digit else suffix).append(Literal(c))
            i += 1
            continue

        raise NumberFormatError(f"unexpected character {c!r}", column=col)

    if not seen_digit and section_index < 3:
        raise NumberFormatError(
            "section must contain at least one digit placeholder", column=base_col
        )

    min_int = max(int_digits_required, 1) if seen_digit else 0
    integer_spec = IntegerSpec(min_digits=min_int, thousands_separator=thousands)
    decimal_spec = (
        DecimalSpec(min_digits=decimal_min, max_digits=decimal_max) if in_decimal else None
    )
    exponent_spec = (
        ExponentSpec(min_digits=exp_digits, plus_sign=exp_plus) if have_exp else None
    )

    return FormatSection(
        integer_part=integer_spec,
        decimal_part=decimal_spec,
        exponent_part=exponent_spec,
        prefix=tuple(prefix),
        suffix=tuple(suffix),
        scale=scale,
        negative_style=negative_style,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest backend/tests/test_number_format.py::TestParser -v`
Expected: all 13 parser tests pass. If a `isprintable()` fallback swallows something that should error (e.g. stray backtick), tighten the catch-all — do not loosen the error checks.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/number_format.py backend/tests/test_number_format.py
git commit -m "feat(analyst-pro): add Excel number format parser (Plan 10b T2)"
```

---

## Task 3 — Python formatter (`format_number`)

**Purpose:** Given an AST and a numeric value, produce the final string. Locale-aware separators, `ROUND_HALF_UP` to match Tableau. Handle NaN/Inf. Select correct section by sign.

**Files:**
- Modify: `backend/vizql/number_format.py` — append `format_number()`.
- Test: `backend/tests/test_number_format.py` — extend.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_number_format.py`:

```python
import math

from backend.vizql.number_format import format_number


class TestFormatter:
    def _fmt(self, pattern: str, value, locale: str = "en-US") -> str:
        return format_number(value, parse_number_format(pattern), locale=locale)

    def test_integer_thousands(self):
        assert self._fmt("#,##0", 1234567) == "1,234,567"

    def test_fixed_two_decimals(self):
        assert self._fmt("#,##0.00", 1234.5) == "1,234.50"

    def test_percent_scales(self):
        assert self._fmt("0.0%", 0.125) == "12.5%"

    def test_scientific(self):
        assert self._fmt("0.##E+00", 12345) == "1.23E+04"

    def test_currency_negative_parens(self):
        assert self._fmt("$#,##0;($#,##0)", 1234) == "$1,234"
        assert self._fmt("$#,##0;($#,##0)", -1234) == "($1,234)"

    def test_bracketed_currency(self):
        assert self._fmt("[USD]#,##0.00", 1234.5) == "USD1,234.50"

    def test_quoted_literal(self):
        assert self._fmt('#,##0 "items"', 7) == "7 items"

    def test_zero_section(self):
        pat = '#,##0;-#,##0;"zero"'
        assert self._fmt(pat, 0) == "zero"

    def test_rounding_half_up(self):
        # Tableau observed: half-up, not banker's.
        assert self._fmt("0", 0.5) == "1"
        assert self._fmt("0", 1.5) == "2"
        assert self._fmt("0.0", 1.25) == "1.3"

    def test_nan_infinity(self):
        assert self._fmt("#,##0", float("nan")) == "NaN"
        assert self._fmt("#,##0", float("inf")) == "Infinity"
        assert self._fmt("#,##0", float("-inf")) == "-Infinity"

    def test_very_large(self):
        assert self._fmt("#,##0", 10**20) == "100,000,000,000,000,000,000"

    def test_very_small(self):
        assert self._fmt("0.##E+00", 1e-20) == "1E-20"

    def test_locale_de(self):
        # DE uses `.` thousands, `,` decimal.
        assert self._fmt("#,##0.00", 1234.5, locale="de-DE") == "1.234,50"

    def test_minimum_integer_digits(self):
        assert self._fmt("0000", 12) == "0012"

    def test_ten_k_numbers_under_50ms(self):
        import time
        ast = parse_number_format("#,##0.00")
        vals = [i * 1.5 for i in range(10_000)]
        t0 = time.perf_counter()
        for v in vals:
            format_number(v, ast)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        assert elapsed_ms < 50, f"formatter too slow: {elapsed_ms:.1f} ms"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_number_format.py::TestFormatter -v`
Expected: `AttributeError: … format_number`.

- [ ] **Step 3: Implement the formatter**

Append to `backend/vizql/number_format.py`:

```python
# --- Formatter ---------------------------------------------------------

import math
from decimal import Decimal, ROUND_HALF_UP, localcontext


# Minimal locale registry. We do NOT depend on babel/icu — hand-roll a tiny
# table. Unknown locales fall through to en-US.
_LOCALE_SEPS: dict[str, tuple[str, str]] = {
    "en-US": (",", "."),
    "en-GB": (",", "."),
    "de-DE": (".", ","),
    "fr-FR": ("\u202f", ","),  # narrow no-break space
    "es-ES": (".", ","),
    "ja-JP": (",", "."),
    "zh-CN": (",", "."),
}


def _seps(locale: str) -> tuple[str, str]:
    return _LOCALE_SEPS.get(locale, _LOCALE_SEPS["en-US"])


def _pick_section(ast: NumberFormatAST, value: float | int | Decimal) -> tuple[FormatSection, bool]:
    """Returns (section, should_negate_sign). `should_negate_sign=True`
    means the formatter must emit a leading `-` (the section was chosen
    for a negative but doesn't carry its own minus/parens)."""
    sections = ast.sections
    n = len(sections)
    if isinstance(value, Decimal):
        is_nan = value.is_nan()
        is_neg = (not is_nan) and value < 0
        is_zero = (not is_nan) and value == 0
    else:
        fv = float(value)
        is_nan = math.isnan(fv)
        is_neg = (not is_nan) and fv < 0
        is_zero = (not is_nan) and fv == 0.0

    if is_nan:
        return sections[0], False
    if n == 1:
        return sections[0], is_neg
    if n == 2:
        if is_neg:
            return sections[1], False
        return sections[0], False
    if n == 3:
        if is_zero:
            return sections[2], False
        if is_neg:
            return sections[1], False
        return sections[0], False
    # n == 4
    if is_zero:
        return sections[2], False
    if is_neg:
        return sections[1], False
    return sections[0], False


def _format_integer_part(abs_int_str: str, spec: IntegerSpec, locale: str) -> str:
    thousands, _decimal = _seps(locale)
    padded = abs_int_str.lstrip("0") or "0"
    if len(padded) < spec.min_digits:
        padded = padded.rjust(spec.min_digits, "0")
    if not spec.thousands_separator:
        return padded
    # group from right
    rev = padded[::-1]
    groups = [rev[i : i + 3] for i in range(0, len(rev), 3)]
    return thousands.join(groups)[::-1]


def format_number(
    value: float | int | Decimal,
    ast: NumberFormatAST,
    locale: str = "en-US",
) -> str:
    """Format `value` per `ast`. Locale controls output separators only."""
    if isinstance(value, float) and math.isnan(value):
        return "NaN"
    if isinstance(value, float) and math.isinf(value):
        return "-Infinity" if value < 0 else "Infinity"

    section, needs_minus_prefix = _pick_section(ast, value)

    # Apply scale. Keep Decimal path exact where possible.
    if isinstance(value, Decimal):
        dv = value * Decimal(str(section.scale))
    else:
        dv = Decimal(str(float(value) * section.scale))

    abs_dv = abs(dv)

    _thousands, decimal_sep = _seps(locale)

    out_core: str

    if section.exponent_part is not None:
        out_core = _format_scientific(abs_dv, section, decimal_sep)
    else:
        # Round to decimal_part.max_digits (or 0).
        max_dec = section.decimal_part.max_digits if section.decimal_part else 0
        quant = Decimal(1).scaleb(-max_dec) if max_dec > 0 else Decimal(1)
        rounded = abs_dv.quantize(quant, rounding=ROUND_HALF_UP) if max_dec >= 0 else abs_dv

        sign, digits, exponent = rounded.as_tuple()
        digit_str = "".join(str(d) for d in digits)
        if exponent < 0:
            split = len(digit_str) + exponent  # exponent negative
            if split <= 0:
                int_part = "0"
                frac_part = ("0" * -split) + digit_str
            else:
                int_part = digit_str[:split]
                frac_part = digit_str[split:]
        else:
            int_part = digit_str + ("0" * exponent)
            frac_part = ""

        int_rendered = _format_integer_part(int_part, section.integer_part, locale)

        if section.decimal_part is not None:
            min_d = section.decimal_part.min_digits
            frac_part = frac_part[:max_dec]  # already quantized, but safety
            if len(frac_part) < min_d:
                frac_part = frac_part.ljust(min_d, "0")
            # trim trailing beyond min_d up to max_dec only if using `#`
            if max_dec > min_d:
                frac_part = frac_part.rstrip("0")
                if len(frac_part) < min_d:
                    frac_part = frac_part.ljust(min_d, "0")
            if frac_part:
                out_core = int_rendered + decimal_sep + frac_part
            else:
                out_core = int_rendered
        else:
            out_core = int_rendered

    prefix = "".join(lit.text for lit in section.prefix)
    suffix = "".join(lit.text for lit in section.suffix)
    result = prefix + out_core + suffix
    if needs_minus_prefix:
        result = "-" + result
    return result


def _format_scientific(abs_dv: Decimal, section: FormatSection, decimal_sep: str) -> str:
    """Render `abs_dv` in scientific notation per section spec."""
    assert section.exponent_part is not None
    if abs_dv == 0:
        exp = 0
        mantissa = Decimal(0)
    else:
        # Normalise to `d.dddd * 10^n` where 1 <= d < 10.
        s = f"{abs_dv:E}"  # e.g. "1.234500E+04"
        m_str, e_str = s.split("E")
        mantissa = Decimal(m_str)
        exp = int(e_str)

    max_dec = section.decimal_part.max_digits if section.decimal_part else 0
    min_dec = section.decimal_part.min_digits if section.decimal_part else 0
    quant = Decimal(1).scaleb(-max_dec) if max_dec > 0 else Decimal(1)
    mantissa = mantissa.quantize(quant, rounding=ROUND_HALF_UP)

    m_str = format(mantissa, "f")
    if "." in m_str:
        int_part, frac_part = m_str.split(".")
    else:
        int_part, frac_part = m_str, ""
    if max_dec > min_dec:
        frac_part = frac_part.rstrip("0")
        if len(frac_part) < min_dec:
            frac_part = frac_part.ljust(min_dec, "0")
    elif len(frac_part) < min_dec:
        frac_part = frac_part.ljust(min_dec, "0")

    body = int_part + (decimal_sep + frac_part if frac_part else "")

    exp_digits = section.exponent_part.min_digits
    exp_sign = "+" if exp >= 0 else "-"
    if not section.exponent_part.plus_sign and exp >= 0:
        exp_sign = ""
    exp_body = f"{abs(exp):0{exp_digits}d}"
    return f"{body}E{exp_sign}{exp_body}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest backend/tests/test_number_format.py::TestFormatter -v`
Expected: all 15 formatter tests pass. If `test_rounding_half_up` fails (`banker's rounding`), double-check that `ROUND_HALF_UP` is imported and passed; do not change the assertion — Tableau uses half-up. If `test_ten_k_numbers_under_50ms` fails, profile: the `as_tuple()`/string path is the hot loop. Inline the group formatting before adding caching — avoid premature optimisation.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/number_format.py backend/tests/test_number_format.py
git commit -m "feat(analyst-pro): implement format_number with locale + rounding (Plan 10b T3)"
```

---

## Task 4 — Golden-fixture corpus + parity harness (Python side)

**Purpose:** Lock in a 200+ case corpus once, so Python and TypeScript can be independently verified against *the same* expected outputs. This is the only way to guarantee true parity.

**Files:**
- Create: `backend/vizql/tests/fixtures/number_format_parity/cases.json`.
- Create: `backend/tests/test_number_format_parity.py`.

- [ ] **Step 1: Write the failing parity test**

Create `backend/tests/test_number_format_parity.py`:

```python
"""Plan 10b — parity golden-fixture harness. Shared with TS tests."""
import json
from pathlib import Path

import pytest

from backend.vizql.number_format import format_number, parse_number_format

FIXTURE = Path(__file__).parent.parent / "vizql" / "tests" / "fixtures" / "number_format_parity" / "cases.json"


@pytest.fixture(scope="module")
def cases():
    assert FIXTURE.exists(), f"fixture missing at {FIXTURE}"
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(data) >= 200, f"need >= 200 cases, got {len(data)}"
    return data


def test_parity_cases(cases):
    failures = []
    for case in cases:
        ast = parse_number_format(case["pattern"])
        got = format_number(case["value"], ast, locale=case.get("locale", "en-US"))
        if got != case["expected"]:
            failures.append(
                f"[{case['id']}] pattern={case['pattern']!r} value={case['value']!r} "
                f"expected={case['expected']!r} got={got!r}"
            )
    assert not failures, "parity failures:\n" + "\n".join(failures[:20])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_number_format_parity.py -v`
Expected: `AssertionError: fixture missing at …/cases.json`.

- [ ] **Step 3: Generate the fixture corpus**

Create `backend/vizql/tests/fixtures/number_format_parity/cases.json` with at minimum 200 entries. Categories required (counts approximate — aim ≥ each):

- 20× `#,##0` across {-1e20, -1234567, -1, 0, 1, 1234, 1234567, 1e20}.
- 20× `#,##0.00` with fractional inputs incl. 0.005 (half-up rounding) and 999.995.
- 20× `0.0%` across {-1, -0.5, 0, 0.01, 0.125, 0.999, 1.5}.
- 15× `0.##E+00` across {1e-20, 1e-3, 1, 12345, 1e20, 0}.
- 15× `$#,##0` + 10× `$#,##0;($#,##0)` (both signs).
- 10× `[USD]#,##0.00`, 10× `[EUR]#,##0.00`, 10× `[XYZ]#,##0` (custom currency).
- 10× `#,##0 "items"` + 5× `+#,##0;-#,##0` (explicit sign).
- 15× `#,##0;-#,##0;"zero";@` across {-5, 0, 5, "abc" (string -> text section — use `null` in JSON and have the formatter handle `None` / `string`)}.
- 20× `#,##0.00` across locales {`en-US`, `de-DE`, `fr-FR`, `es-ES`} with the same set of values for byte-level locale divergence.
- 10× edge values (`NaN`, `Infinity`, `-Infinity`) across representative patterns.
- 10× zero-padding (`0000`, `00.000`, `#.0`).

Each record:

```json
{
  "id": "thousand-int-1",
  "pattern": "#,##0",
  "value": 1234567,
  "locale": "en-US",
  "expected": "1,234,567"
}
```

Strategy: author a small throwaway Python script **outside the repo** that calls `format_number` on the Cartesian product and writes the JSON — but hand-audit every negative/zero section + rounding boundary case. Record the hand-audited expected strings in the file. Do NOT auto-generate the expected field by running the formatter you are testing — the fixture must be a specification, not a snapshot.

Hand-audit checklist (at minimum):
- `#,##0.00` on `0.005` → `"0.01"` (half-up).
- `#,##0.00` on `0.004` → `"0.00"`.
- `#,##0.00` on `0.015` → `"0.02"`.
- `#,##0.00` on `999.995` → `"1,000.00"` (carry).
- `0.0%` on `0.005` → `"0.5%"` (scale then round).
- `$#,##0;($#,##0)` on `-0` → `"$0"` (0 uses positive section).
- `[USD]#,##0.00` de-DE on `1234.5` → `"USD1.234,50"`.

For NaN/Inf/string-in-text-section cases where Python emits something deterministic but surprising, record the exact string Python produces, then port that convention to TS. (E.g. `NaN`/`Infinity`/`-Infinity` literals.)

- [ ] **Step 4: Run the parity test**

Run: `python -m pytest backend/tests/test_number_format_parity.py -v`
Expected: PASS with ≥ 200 cases. Iterate on the formatter *or* the fixture (whichever is wrong — use the Tableau reference in `Build_Tableau.md` §XIV.2 as tiebreaker) until green.

- [ ] **Step 5: Commit**

```bash
git add backend/vizql/tests/fixtures/number_format_parity/cases.json backend/tests/test_number_format_parity.py
git commit -m "test(analyst-pro): add number-format golden parity corpus (Plan 10b T4)"
```

---

## Task 5 — TypeScript parser + AST port

**Purpose:** Port AST + parser to TS. Exact structural parity with Python, so shared fixtures drive both.

**Files:**
- Create: `frontend/src/components/dashboard/freeform/lib/numberFormat.ts` (types + parser only in this task).
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  NumberFormatError,
  parseNumberFormat,
} from '../numberFormat';

describe('parseNumberFormat', () => {
  it('parses integer with thousands', () => {
    const ast = parseNumberFormat('#,##0');
    expect(ast.sections.length).toBe(1);
    expect(ast.sections[0].integerPart.thousandsSeparator).toBe(true);
    expect(ast.sections[0].integerPart.minDigits).toBe(1);
  });

  it('parses two-decimal', () => {
    const ast = parseNumberFormat('#,##0.00');
    expect(ast.sections[0].decimalPart).toEqual({ minDigits: 2, maxDigits: 2 });
  });

  it('parses percent with ×100 scale', () => {
    const ast = parseNumberFormat('0.0%');
    expect(ast.sections[0].scale).toBe(100);
  });

  it('parses scientific', () => {
    const ast = parseNumberFormat('0.##E+00');
    expect(ast.sections[0].exponentPart).toEqual({ minDigits: 2, plusSign: true });
  });

  it('parses two-section paren negative', () => {
    const ast = parseNumberFormat('$#,##0;($#,##0)');
    expect(ast.sections.length).toBe(2);
    expect(ast.sections[1].negativeStyle).toBe('parens');
  });

  it('parses bracketed currency', () => {
    const ast = parseNumberFormat('[USD]#,##0.00');
    expect(ast.sections[0].prefix[0].text).toBe('USD');
  });

  it('parses quoted literal', () => {
    const ast = parseNumberFormat('#,##0 "items"');
    expect(ast.sections[0].suffix.some(l => l.text === 'items')).toBe(true);
  });

  it('rejects five sections', () => {
    expect(() => parseNumberFormat('0;0;0;0;0')).toThrow(NumberFormatError);
  });

  it('rejects unmatched quote', () => {
    expect(() => parseNumberFormat('0 "unterminated')).toThrow(NumberFormatError);
  });

  it('rejects invalid scientific', () => {
    expect(() => parseNumberFormat('0E')).toThrow(NumberFormatError);
  });

  it('rejects empty', () => {
    expect(() => parseNumberFormat('')).toThrow(NumberFormatError);
  });

  it('NumberFormatError carries 1-based column', () => {
    try {
      parseNumberFormat('0;0;0;0;0');
    } catch (e) {
      expect(e).toBeInstanceOf(NumberFormatError);
      expect((e as NumberFormatError).column).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`
Expected: resolution error — module does not exist.

- [ ] **Step 3: Implement TS types + parser**

Create `frontend/src/components/dashboard/freeform/lib/numberFormat.ts`:

```ts
// Plan 10b — TS port of backend/vizql/number_format.py.
// Parity guaranteed by the shared fixture at
// backend/vizql/tests/fixtures/number_format_parity/cases.json.

export enum TokenKind {
  DIGIT_OPTIONAL = '#',
  DIGIT_REQUIRED = '0',
  THOUSANDS_SEP = ',',
  DECIMAL_POINT = '.',
  PERCENT = '%',
  PER_MILLE = '\u2030',
  EXPONENT = 'E',
  LITERAL = 'literal',
  QUOTED_LITERAL = 'quoted',
  CURRENCY = 'currency',
  BRACKETED_CURRENCY = 'bracketed_currency',
  SECTION_SEP = ';',
}

export interface Literal { readonly text: string }
export interface IntegerSpec { readonly minDigits: number; readonly thousandsSeparator: boolean }
export interface DecimalSpec { readonly minDigits: number; readonly maxDigits: number }
export interface ExponentSpec { readonly minDigits: number; readonly plusSign: boolean }

export type NegativeStyle = 'minus' | 'parens';

export interface FormatSection {
  readonly integerPart: IntegerSpec;
  readonly decimalPart: DecimalSpec | null;
  readonly exponentPart: ExponentSpec | null;
  readonly prefix: readonly Literal[];
  readonly suffix: readonly Literal[];
  readonly scale: number;
  readonly negativeStyle: NegativeStyle;
}

export interface NumberFormatAST { readonly sections: readonly FormatSection[] }

export class NumberFormatError extends Error {
  readonly column: number;
  constructor(message: string, column: number) {
    super(`${message} (at column ${column})`);
    this.name = 'NumberFormatError';
    this.column = column;
  }
}

const CURRENCY_CHARS = new Set(['$', '\u20ac', '\u00a5', '\u00a3']);

export function parseNumberFormat(spec: string): NumberFormatAST {
  if (spec === '') throw new NumberFormatError('empty format string', 1);
  const raw = splitSections(spec);
  if (raw.length > 4) {
    throw new NumberFormatError('too many sections (max 4)', spec.indexOf(';') + 1);
  }
  const sections = raw.map(([text, baseCol], idx) => parseSection(text, baseCol, idx));
  return { sections };
}

function splitSections(spec: string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  let buf = '';
  let start = 1;
  let inQuote = false;
  for (let i = 0; i < spec.length; ) {
    const c = spec[i];
    if (c === '\\' && i + 1 < spec.length) {
      buf += spec.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === '"') {
      inQuote = !inQuote;
      buf += c;
      i += 1;
      continue;
    }
    if (c === ';' && !inQuote) {
      out.push([buf, start]);
      buf = '';
      start = i + 2;
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  if (inQuote) {
    throw new NumberFormatError('unmatched quote', spec.lastIndexOf('"') + 1);
  }
  out.push([buf, start]);
  return out;
}

function parseSection(text: string, baseCol: number, sectionIndex: number): FormatSection {
  const prefix: Literal[] = [];
  const suffix: Literal[] = [];
  let intMinReq = 0;
  let thousands = false;
  let decMin = 0;
  let decMax = 0;
  let inDecimal = false;
  let expDigits = 0;
  let expPlus = false;
  let haveExp = false;
  let scale = 1;
  let negativeStyle: NegativeStyle = 'minus';
  let seenDigit = false;

  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    const col = baseCol + i;
    const push = (l: Literal) => (seenDigit ? suffix : prefix).push(l);

    if (c === '\\' && i + 1 < n) { push({ text: text[i + 1] }); i += 2; continue; }
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end === -1) throw new NumberFormatError('unmatched quote', col);
      push({ text: text.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (c === '[') {
      const end = text.indexOf(']', i + 1);
      if (end === -1) throw new NumberFormatError('unmatched bracket', col);
      prefix.push({ text: text.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (CURRENCY_CHARS.has(c)) { push({ text: c }); i += 1; continue; }
    if (c === '#') { if (!inDecimal); else decMax += 1; seenDigit = true; i += 1; continue; }
    if (c === '0') {
      if (!inDecimal) intMinReq += 1;
      else { decMin += 1; decMax += 1; }
      seenDigit = true; i += 1; continue;
    }
    if (c === ',') {
      if (seenDigit && !inDecimal) { thousands = true; i += 1; continue; }
      push({ text: ',' }); i += 1; continue;
    }
    if (c === '.') {
      if (inDecimal) throw new NumberFormatError('multiple decimal points', col);
      inDecimal = true; i += 1; continue;
    }
    if (c === '%') { scale *= 100; suffix.push({ text: '%' }); i += 1; continue; }
    if (c === '\u2030') { scale *= 1000; suffix.push({ text: '\u2030' }); i += 1; continue; }
    if (c === 'E') {
      if (i + 1 >= n || (text[i + 1] !== '+' && text[i + 1] !== '-')) {
        throw new NumberFormatError('scientific exponent must be E+ or E-', col);
      }
      expPlus = text[i + 1] === '+';
      let j = i + 2;
      let d = 0;
      while (j < n && text[j] === '0') { d += 1; j += 1; }
      if (d === 0) throw new NumberFormatError('scientific exponent needs at least one 0', baseCol + j);
      expDigits = d; haveExp = true; i = j; continue;
    }
    if (c === '(' && sectionIndex === 1) { negativeStyle = 'parens'; prefix.push({ text: '(' }); i += 1; continue; }
    if (c === ')' && sectionIndex === 1 && negativeStyle === 'parens') { suffix.push({ text: ')' }); i += 1; continue; }
    if (c === '@') { suffix.push({ text: '@' }); i += 1; continue; }
    push({ text: c }); i += 1;
  }

  if (!seenDigit && sectionIndex < 3) {
    throw new NumberFormatError('section must contain at least one digit placeholder', baseCol);
  }

  return {
    integerPart: { minDigits: Math.max(intMinReq, seenDigit ? 1 : 0), thousandsSeparator: thousands },
    decimalPart: inDecimal ? { minDigits: decMin, maxDigits: decMax } : null,
    exponentPart: haveExp ? { minDigits: expDigits, plusSign: expPlus } : null,
    prefix,
    suffix,
    scale,
    negativeStyle,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`
Expected: all 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/numberFormat.ts frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts
git commit -m "feat(analyst-pro): port number format parser to TypeScript (Plan 10b T5)"
```

---

## Task 6 — TypeScript formatter + shared-fixture parity

**Purpose:** `formatNumber(value, ast, locale?)` in TS, then run the same fixture corpus from Task 4 and assert TS output matches byte-for-byte.

**Files:**
- Modify: `frontend/src/components/dashboard/freeform/lib/numberFormat.ts` — append formatter.
- Create: `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.parity.test.ts`.

- [ ] **Step 1: Write the failing formatter tests**

Append to `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`:

```ts
import { formatNumber } from '../numberFormat';

describe('formatNumber', () => {
  const f = (p: string, v: number | string, locale = 'en-US') =>
    formatNumber(v as number, parseNumberFormat(p), locale);

  it('integer thousands', () => { expect(f('#,##0', 1234567)).toBe('1,234,567'); });
  it('two decimals', () => { expect(f('#,##0.00', 1234.5)).toBe('1,234.50'); });
  it('percent', () => { expect(f('0.0%', 0.125)).toBe('12.5%'); });
  it('scientific', () => { expect(f('0.##E+00', 12345)).toBe('1.23E+04'); });
  it('currency parens negative', () => {
    expect(f('$#,##0;($#,##0)', -1234)).toBe('($1,234)');
  });
  it('bracketed currency', () => { expect(f('[USD]#,##0.00', 1234.5)).toBe('USD1,234.50'); });
  it('quoted literal', () => { expect(f('#,##0 "items"', 7)).toBe('7 items'); });
  it('zero section', () => { expect(f('#,##0;-#,##0;"zero"', 0)).toBe('zero'); });
  it('rounding half-up', () => { expect(f('0', 0.5)).toBe('1'); });
  it('rounding 999.995', () => { expect(f('#,##0.00', 999.995)).toBe('1,000.00'); });
  it('NaN', () => { expect(f('#,##0', Number.NaN)).toBe('NaN'); });
  it('Infinity', () => { expect(f('#,##0', Number.POSITIVE_INFINITY)).toBe('Infinity'); });
  it('-Infinity', () => { expect(f('#,##0', Number.NEGATIVE_INFINITY)).toBe('-Infinity'); });
  it('locale de-DE', () => { expect(f('#,##0.00', 1234.5, 'de-DE')).toBe('1.234,50'); });
  it('minimum integer digits', () => { expect(f('0000', 12)).toBe('0012'); });
  it('10k values under 50ms', () => {
    const ast = parseNumberFormat('#,##0.00');
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) formatNumber(i * 1.5, ast);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`
Expected: `formatNumber is not exported`.

- [ ] **Step 3: Implement `formatNumber`**

Append to `frontend/src/components/dashboard/freeform/lib/numberFormat.ts`:

```ts
// --- Formatter ---

const LOCALE_SEPS: Record<string, [string, string]> = {
  'en-US': [',', '.'],
  'en-GB': [',', '.'],
  'de-DE': ['.', ','],
  'fr-FR': ['\u202f', ','],
  'es-ES': ['.', ','],
  'ja-JP': [',', '.'],
  'zh-CN': [',', '.'],
};

function seps(locale: string): [string, string] {
  return LOCALE_SEPS[locale] ?? LOCALE_SEPS['en-US'];
}

function pickSection(ast: NumberFormatAST, value: number):
  { section: FormatSection; addMinus: boolean } {
  const sections = ast.sections;
  const n = sections.length;
  const isNaN_ = Number.isNaN(value);
  const isNeg = !isNaN_ && value < 0;
  const isZero = !isNaN_ && value === 0;
  if (isNaN_) return { section: sections[0], addMinus: false };
  if (n === 1) return { section: sections[0], addMinus: isNeg };
  if (n === 2) return { section: isNeg ? sections[1] : sections[0], addMinus: false };
  if (n === 3) return {
    section: isZero ? sections[2] : isNeg ? sections[1] : sections[0],
    addMinus: false,
  };
  return {
    section: isZero ? sections[2] : isNeg ? sections[1] : sections[0],
    addMinus: false,
  };
}

function roundHalfUp(value: number, decimals: number): string {
  // Use string math to avoid JS float quirks around .5.
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  let v = Math.abs(value);
  const mult = Math.pow(10, decimals);
  // Add tiny epsilon relative to magnitude to counter 1.005-style cases.
  const shifted = v * mult;
  const rounded = Math.floor(shifted + 0.5 + Number.EPSILON * shifted);
  const str = (rounded / mult).toFixed(decimals);
  return neg ? '-' + str : str;
}

function formatInteger(absIntStr: string, spec: IntegerSpec, locale: string): string {
  const [thousands] = seps(locale);
  let padded = absIntStr.replace(/^0+/, '') || '0';
  if (padded.length < spec.minDigits) padded = padded.padStart(spec.minDigits, '0');
  if (!spec.thousandsSeparator) return padded;
  const rev = padded.split('').reverse().join('');
  const groups: string[] = [];
  for (let i = 0; i < rev.length; i += 3) groups.push(rev.slice(i, i + 3));
  return groups.join(thousands).split('').reverse().join('');
}

export function formatNumber(
  value: number,
  ast: NumberFormatAST,
  locale: string = 'en-US',
): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return 'Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';

  const { section, addMinus } = pickSection(ast, value);
  const scaled = value * section.scale;
  const absScaled = Math.abs(scaled);
  const [, decimalSep] = seps(locale);

  let core: string;
  if (section.exponentPart) {
    core = formatScientific(absScaled, section, decimalSep);
  } else {
    const maxDec = section.decimalPart?.maxDigits ?? 0;
    const rounded = roundHalfUp(absScaled, maxDec);
    const [intPart, fracPartRaw = ''] = rounded.split('.');
    const intRendered = formatInteger(intPart, section.integerPart, locale);
    if (section.decimalPart) {
      let frac = fracPartRaw.slice(0, maxDec);
      const minD = section.decimalPart.minDigits;
      if (frac.length < minD) frac = frac.padEnd(minD, '0');
      if (maxDec > minD) {
        frac = frac.replace(/0+$/, '');
        if (frac.length < minD) frac = frac.padEnd(minD, '0');
      }
      core = frac ? intRendered + decimalSep + frac : intRendered;
    } else {
      core = intRendered;
    }
  }

  const prefix = section.prefix.map(l => l.text).join('');
  const suffix = section.suffix.map(l => l.text).join('');
  let result = prefix + core + suffix;
  if (addMinus) result = '-' + result;
  return result;
}

function formatScientific(abs: number, section: FormatSection, decimalSep: string): string {
  const exp = section.exponentPart!;
  if (abs === 0) {
    const body = '0' + (exp.minDigits > 0 ? '' : '');
    const sign = exp.plusSign ? '+' : '';
    return `${body}E${sign}${'0'.repeat(exp.minDigits)}`;
  }
  const e = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, e);
  const maxDec = section.decimalPart?.maxDigits ?? 0;
  const minDec = section.decimalPart?.minDigits ?? 0;
  const mStr = roundHalfUp(mantissa, maxDec);
  const [mi, mfRaw = ''] = mStr.split('.');
  let mf = mfRaw;
  if (maxDec > minDec) {
    mf = mf.replace(/0+$/, '');
    if (mf.length < minDec) mf = mf.padEnd(minDec, '0');
  } else if (mf.length < minDec) {
    mf = mf.padEnd(minDec, '0');
  }
  const body = mi + (mf ? decimalSep + mf : '');
  const sign = e >= 0 ? (exp.plusSign ? '+' : '') : '-';
  const expBody = Math.abs(e).toString().padStart(exp.minDigits, '0');
  return `${body}E${sign}${expBody}`;
}
```

- [ ] **Step 4: Run unit tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts`
Expected: all 17 describe-blocks green. If `roundHalfUp` diverges from Python on `.005` edges, switch to a BigInt-based scaled integer round for `maxDec ≤ 15` — do NOT paper over with `toFixed` alone (JS `toFixed` uses banker-ish rounding on some engines).

- [ ] **Step 5: Write the parity test against the shared fixture**

Create `frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.parity.test.ts`:

```ts
// Vitest: node environment so we can read the JSON from disk.
// Configure per-file: `// @vitest-environment node` directive.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { formatNumber, parseNumberFormat } from '../numberFormat';

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../../../../../backend/vizql/tests/fixtures/number_format_parity/cases.json',
);

interface Case {
  id: string;
  pattern: string;
  value: number;
  locale?: string;
  expected: string;
}

const cases: Case[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

describe('number-format parity with Python', () => {
  it('has >= 200 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(200);
  });

  it.each(cases)('[$id] $pattern($value) == $expected', (c) => {
    const ast = parseNumberFormat(c.pattern);
    const got = formatNumber(c.value, ast, c.locale ?? 'en-US');
    expect(got).toBe(c.expected);
  });
});
```

- [ ] **Step 6: Run parity tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/lib/__tests__/numberFormat.parity.test.ts`
Expected: all 200+ cases pass. Any failure is a TS formatter bug (Python is the reference since its fixture authorship is hand-audited). Fix `numberFormat.ts` until green. Do not modify `cases.json` in this task.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/freeform/lib/numberFormat.ts frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts frontend/src/components/dashboard/freeform/lib/__tests__/numberFormat.parity.test.ts
git commit -m "feat(analyst-pro): port number formatter to TS + parity corpus (Plan 10b T6)"
```

---

## Task 7 — Default format catalogue (Python + TS)

**Purpose:** Named defaults the inspector UI surfaces in the preset dropdown. Tiny data module; no logic.

**Files:**
- Create: `backend/vizql/number_format_defaults.py`.
- Create: `backend/tests/test_number_format_defaults.py`.
- Create: `frontend/src/components/dashboard/freeform/lib/numberFormatDefaults.ts`.
- Modify: `backend/vizql/__init__.py` — re-export.

- [ ] **Step 1: Write the failing Python test**

Create `backend/tests/test_number_format_defaults.py`:

```python
from backend.vizql.number_format import format_number, parse_number_format
from backend.vizql.number_format_defaults import DEFAULT_NUMBER_FORMATS


def test_catalogue_has_required_names():
    names = {d["name"] for d in DEFAULT_NUMBER_FORMATS}
    assert names == {
        "Number (Standard)",
        "Number (Decimal)",
        "Currency (Standard)",
        "Currency (Custom)",
        "Scientific",
        "Percentage",
    }


def test_every_default_parses_and_formats():
    for default in DEFAULT_NUMBER_FORMATS:
        ast = parse_number_format(default["pattern"])
        out = format_number(1234.5, ast)
        assert isinstance(out, str) and out  # non-empty


def test_standard_pattern():
    standard = next(d for d in DEFAULT_NUMBER_FORMATS if d["name"] == "Number (Standard)")
    assert standard["pattern"] == "#,##0"


def test_percentage_pattern():
    pct = next(d for d in DEFAULT_NUMBER_FORMATS if d["name"] == "Percentage")
    assert "%" in pct["pattern"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_number_format_defaults.py -v`
Expected: `ImportError: DEFAULT_NUMBER_FORMATS`.

- [ ] **Step 3: Implement Python catalogue**

Create `backend/vizql/number_format_defaults.py`:

```python
"""Named Excel-style number format defaults surfaced by the inspector UI."""
from __future__ import annotations

from typing import List, TypedDict


class NumberFormatDefault(TypedDict):
    name: str
    pattern: str
    description: str


DEFAULT_NUMBER_FORMATS: List[NumberFormatDefault] = [
    {"name": "Number (Standard)", "pattern": "#,##0", "description": "Integer with thousands separator"},
    {"name": "Number (Decimal)", "pattern": "#,##0.00", "description": "Two fixed decimals with thousands separator"},
    {"name": "Currency (Standard)", "pattern": "$#,##0.00;($#,##0.00)", "description": "USD with parenthesised negatives"},
    {"name": "Currency (Custom)", "pattern": "[USD]#,##0.00", "description": "Bracketed ISO code prefix"},
    {"name": "Scientific", "pattern": "0.##E+00", "description": "Scientific notation"},
    {"name": "Percentage", "pattern": "0.0%", "description": "One-decimal percentage"},
]
```

- [ ] **Step 4: Re-export from package root**

Modify `backend/vizql/__init__.py` — add:

```python
from .number_format import (
    NumberFormatAST,
    NumberFormatError,
    format_number,
    parse_number_format,
)
from .number_format_defaults import DEFAULT_NUMBER_FORMATS

__all__ = [
    # ... keep existing entries ...
    "NumberFormatAST",
    "NumberFormatError",
    "format_number",
    "parse_number_format",
    "DEFAULT_NUMBER_FORMATS",
]
```

(If `__all__` or existing imports differ, merge — do not overwrite.)

- [ ] **Step 5: Run Python tests**

Run: `python -m pytest backend/tests/test_number_format_defaults.py -v`
Expected: 4 tests pass.

- [ ] **Step 6: Mirror to TypeScript**

Create `frontend/src/components/dashboard/freeform/lib/numberFormatDefaults.ts`:

```ts
export interface NumberFormatDefault {
  readonly name: string;
  readonly pattern: string;
  readonly description: string;
}

export const DEFAULT_NUMBER_FORMATS: readonly NumberFormatDefault[] = [
  { name: 'Number (Standard)', pattern: '#,##0', description: 'Integer with thousands separator' },
  { name: 'Number (Decimal)', pattern: '#,##0.00', description: 'Two fixed decimals with thousands separator' },
  { name: 'Currency (Standard)', pattern: '$#,##0.00;($#,##0.00)', description: 'USD with parenthesised negatives' },
  { name: 'Currency (Custom)', pattern: '[USD]#,##0.00', description: 'Bracketed ISO code prefix' },
  { name: 'Scientific', pattern: '0.##E+00', description: 'Scientific notation' },
  { name: 'Percentage', pattern: '0.0%', description: 'One-decimal percentage' },
] as const;
```

No separate TS unit test for this file — it's a plain data constant; covered indirectly by the NumberFormatEditor test in T9.

- [ ] **Step 7: Commit**

```bash
git add backend/vizql/number_format_defaults.py backend/tests/test_number_format_defaults.py backend/vizql/__init__.py frontend/src/components/dashboard/freeform/lib/numberFormatDefaults.ts
git commit -m "feat(analyst-pro): add named number format defaults catalogue (Plan 10b T7)"
```

---

## Task 8 — Vega-Lite integration adapter + expression function

**Purpose:** Map Excel patterns to D3 format strings where possible (axis labels, tooltips). For patterns D3 can't express (conditional sections, parens for negatives, bracketed currency literals), register a Vega expression function `askdbFormatNumber(value, patternSpec)` that calls the TS formatter.

**Files:**
- Create: `frontend/src/chart-ir/formatting/vegaFormatAdapter.ts`.
- Create: `frontend/src/chart-ir/formatting/registerVegaFormat.ts`.
- Create: `frontend/src/chart-ir/formatting/__tests__/vegaFormatAdapter.test.ts`.
- Modify: `frontend/src/main.jsx` — side-effect import at startup.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/chart-ir/formatting/__tests__/vegaFormatAdapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parseNumberFormat } from '../../../components/dashboard/freeform/lib/numberFormat';
import { toVegaFormat } from '../vegaFormatAdapter';

describe('toVegaFormat', () => {
  it('maps #,##0 to d3 `,.0f`', () => {
    const out = toVegaFormat(parseNumberFormat('#,##0'));
    expect(out).toEqual({ format: ',.0f', formatType: 'number' });
  });

  it('maps #,##0.00 to d3 `,.2f`', () => {
    const out = toVegaFormat(parseNumberFormat('#,##0.00'));
    expect(out).toEqual({ format: ',.2f', formatType: 'number' });
  });

  it('maps 0.0% to d3 `.1%`', () => {
    const out = toVegaFormat(parseNumberFormat('0.0%'));
    expect(out).toEqual({ format: '.1%', formatType: 'number' });
  });

  it('maps 0.##E+00 to d3 `.2e`', () => {
    const out = toVegaFormat(parseNumberFormat('0.##E+00'));
    expect(out).toEqual({ format: '.2e', formatType: 'number' });
  });

  it('falls back to askdbFormatNumber for paren-negative', () => {
    const out = toVegaFormat(parseNumberFormat('$#,##0;($#,##0)'));
    expect(out.formatType).toBe('number');
    expect(out.format).toBe('askdb:$#,##0;($#,##0)');
  });

  it('falls back to askdbFormatNumber for bracketed currency', () => {
    const out = toVegaFormat(parseNumberFormat('[USD]#,##0.00'));
    expect(out.format).toBe('askdb:[USD]#,##0.00');
  });
});

describe('askdbFormatNumber Vega expression fn', () => {
  it('registers on vega global', async () => {
    const mod = await import('../registerVegaFormat');
    const vega = await import('vega');
    expect(typeof (vega as any).expressionFunction).toBe('function');
    // After import, askdbFormatNumber must be callable via the registry.
    const expr = (vega as any).expressionFunction('askdbFormatNumber');
    expect(typeof expr).toBe('function');
    // Smoke: call through the registered fn.
    const out = mod.askdbFormatNumberImpl(1234.5, '#,##0.00');
    expect(out).toBe('1,234.50');
    // Invalid pattern → bubble up as string "#ERR" (non-throwing to keep chart from blanking).
    expect(mod.askdbFormatNumberImpl(1, '')).toBe('#ERR');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/chart-ir/formatting/`
Expected: module resolution error.

- [ ] **Step 3: Implement the adapter**

Create `frontend/src/chart-ir/formatting/vegaFormatAdapter.ts`:

```ts
import type { NumberFormatAST } from '../../components/dashboard/freeform/lib/numberFormat';

export interface VegaFormatSpec {
  readonly format: string;
  readonly formatType: 'number' | 'time';
}

/**
 * Map a parsed `NumberFormatAST` to a Vega-Lite format spec. If the AST
 * can be expressed exactly in D3-format, return that. Otherwise return
 * a sentinel `askdb:<raw-pattern>` string and rely on the registered
 * `askdbFormatNumber` Vega expression function to do the work.
 */
export function toVegaFormat(ast: NumberFormatAST, rawPattern?: string): VegaFormatSpec {
  // Only single-section patterns without paren-negative + without
  // bracketed literals map cleanly to D3.
  if (ast.sections.length !== 1) {
    return askdbFallback(ast, rawPattern);
  }
  const s = ast.sections[0];
  const hasBracket = s.prefix.some(l => l.text.length > 1 && !/^[$€¥£]$/.test(l.text));
  const hasParens = s.negativeStyle === 'parens';
  if (hasBracket || hasParens) return askdbFallback(ast, rawPattern);

  const dec = s.decimalPart?.maxDigits ?? 0;
  if (s.exponentPart) return { format: `.${dec}e`, formatType: 'number' };
  if (s.scale === 100) return { format: `.${dec}%`, formatType: 'number' };
  const thousands = s.integerPart.thousandsSeparator ? ',' : '';
  return { format: `${thousands}.${dec}f`, formatType: 'number' };
}

function askdbFallback(_ast: NumberFormatAST, rawPattern?: string): VegaFormatSpec {
  return { format: `askdb:${rawPattern ?? ''}`, formatType: 'number' };
}
```

Note: callers that want the fallback to round-trip must pass the original `rawPattern` string. Wire it at call sites (T8 Step 6 below documents the axis/tooltip wiring).

- [ ] **Step 4: Implement the Vega expression function registration**

Create `frontend/src/chart-ir/formatting/registerVegaFormat.ts`:

```ts
import * as vega from 'vega';

import {
  formatNumber,
  NumberFormatError,
  parseNumberFormat,
} from '../../components/dashboard/freeform/lib/numberFormat';

const astCache = new Map<string, ReturnType<typeof parseNumberFormat>>();

export function askdbFormatNumberImpl(value: number, pattern: string): string {
  if (!pattern) return '#ERR';
  let ast = astCache.get(pattern);
  if (!ast) {
    try {
      ast = parseNumberFormat(pattern);
      astCache.set(pattern, ast);
    } catch (e) {
      if (e instanceof NumberFormatError) return '#ERR';
      throw e;
    }
  }
  return formatNumber(Number(value), ast);
}

// Register once at module load. Safe to import multiple times — re-registration
// is an idempotent overwrite in vega's registry.
(vega as any).expressionFunction('askdbFormatNumber', askdbFormatNumberImpl);
```

Modify `frontend/src/main.jsx` — add near the top, before any chart-rendering imports:

```jsx
// Register AskDB number format expression function for Vega-Lite specs.
import './chart-ir/formatting/registerVegaFormat';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/chart-ir/formatting/`
Expected: 8 tests pass.

- [ ] **Step 6: Document consumer call site (no code change, just a note)**

The adapter returns `askdb:<pattern>` for patterns D3 can't express. Consumers that build Vega-Lite specs (e.g. `frontend/src/chart-ir/router.ts` + tooltip builders) must detect this sentinel and rewrite the encoding to `{ value: { expr: "askdbFormatNumber(datum.<field>, '<pattern>')" }, format: undefined }` instead of setting `format` directly. Concrete wiring lands in a follow-up plan touching `router.ts` — **leave that call-site change to a dedicated task** (it risks breaking Vega-Lite assertions tracked as known test debt in `CLAUDE.md` ≫ "Known Test Debt"). In this plan, ship the adapter + registered fn + docs only; `toVegaFormat` is tested in isolation.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/chart-ir/formatting/vegaFormatAdapter.ts frontend/src/chart-ir/formatting/registerVegaFormat.ts frontend/src/chart-ir/formatting/__tests__/vegaFormatAdapter.test.ts frontend/src/main.jsx
git commit -m "feat(analyst-pro): add Vega format adapter + askdbFormatNumber fn (Plan 10b T8)"
```

---

## Task 9 — NumberFormatEditor UI inside FormatInspectorPanel

**Purpose:** Let the user pick a named default or author a custom pattern, with live preview + inline error indicator. Writes to the store via the existing Plan 10a `setFormatRuleAnalystPro` action, under `StyleProp.NumberFormat`.

**Files:**
- Create: `frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.jsx`.
- Create: `frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.module.css`.
- Create: `frontend/src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx`.
- Modify: `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx` — mount editor below the property grid.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NumberFormatEditor from '../NumberFormatEditor';

describe('NumberFormatEditor', () => {
  it('renders preset dropdown with all defaults', () => {
    render(<NumberFormatEditor value="" onChange={() => {}} />);
    const select = screen.getByTestId('nfmt-preset');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(options).toEqual(expect.arrayContaining([
      'Custom', 'Number (Standard)', 'Number (Decimal)',
      'Currency (Standard)', 'Currency (Custom)', 'Scientific', 'Percentage',
    ]));
  });

  it('selecting preset fires onChange with pattern', () => {
    const onChange = vi.fn();
    render(<NumberFormatEditor value="" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('nfmt-preset'), { target: { value: 'Percentage' } });
    expect(onChange).toHaveBeenCalledWith('0.0%');
  });

  it('typing custom pattern fires onChange', () => {
    const onChange = vi.fn();
    render(<NumberFormatEditor value="#,##0" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('nfmt-custom'), { target: { value: '0.00%' } });
    expect(onChange).toHaveBeenCalledWith('0.00%');
  });

  it('shows live preview of 1234567.89 against current pattern', () => {
    render(<NumberFormatEditor value="#,##0.00" onChange={() => {}} />);
    expect(screen.getByTestId('nfmt-preview')).toHaveTextContent('Sample: 1,234,567.89');
  });

  it('shows error indicator for invalid pattern', () => {
    render(<NumberFormatEditor value='0 "unclosed' onChange={() => {}} />);
    expect(screen.getByTestId('nfmt-error')).toBeInTheDocument();
  });

  it('preset auto-selects "Custom" when pattern is not a catalogue default', () => {
    render(<NumberFormatEditor value="000.00" onChange={() => {}} />);
    expect(screen.getByTestId('nfmt-preset')).toHaveValue('Custom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx`
Expected: resolution error.

- [ ] **Step 3: Implement the editor**

Create `frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.module.css`:

```css
.editor { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
.row { display: flex; align-items: center; gap: 8px; }
.label { min-width: 80px; font-size: 12px; color: var(--askdb-text-muted, #888); }
.preview { font-family: monospace; font-size: 12px; padding: 4px 8px; background: var(--askdb-bg-subtle, #f5f5f5); border-radius: 4px; }
.error { color: var(--askdb-error, #c53030); font-size: 12px; }
```

Create `frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.jsx`:

```jsx
// Plan 10b — Number format editor. Mounted inside FormatInspectorPanel.
// Lets the user pick a named default or type a custom Excel-style pattern.
// Live-previews against 1,234,567.89 and shows error indicator for bad patterns.
import React, { useMemo } from 'react';

import {
  formatNumber,
  NumberFormatError,
  parseNumberFormat,
} from '../lib/numberFormat';
import { DEFAULT_NUMBER_FORMATS } from '../lib/numberFormatDefaults';

import styles from './NumberFormatEditor.module.css';

const SAMPLE_VALUE = 1234567.89;
const CUSTOM_LABEL = 'Custom';

export default function NumberFormatEditor({ value, onChange }) {
  const matchedPreset = useMemo(() => {
    const hit = DEFAULT_NUMBER_FORMATS.find((d) => d.pattern === value);
    return hit ? hit.name : CUSTOM_LABEL;
  }, [value]);

  const { preview, error } = useMemo(() => {
    if (!value) return { preview: '', error: null };
    try {
      const ast = parseNumberFormat(value);
      return { preview: formatNumber(SAMPLE_VALUE, ast), error: null };
    } catch (e) {
      if (e instanceof NumberFormatError) return { preview: '', error: e.message };
      throw e;
    }
  }, [value]);

  const handlePreset = (e) => {
    const name = e.target.value;
    if (name === CUSTOM_LABEL) return;
    const hit = DEFAULT_NUMBER_FORMATS.find((d) => d.name === name);
    if (hit) onChange(hit.pattern);
  };

  const handleCustom = (e) => {
    onChange(e.target.value);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <span className={styles.label}>Preset</span>
        <select
          data-testid="nfmt-preset"
          value={matchedPreset}
          onChange={handlePreset}
        >
          <option value={CUSTOM_LABEL}>{CUSTOM_LABEL}</option>
          {DEFAULT_NUMBER_FORMATS.map((d) => (
            <option key={d.name} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Pattern</span>
        <input
          data-testid="nfmt-custom"
          type="text"
          value={value ?? ''}
          onChange={handleCustom}
          spellCheck={false}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Preview</span>
        <span data-testid="nfmt-preview" className={styles.preview}>
          {preview ? `Sample: ${preview}` : 'Sample: —'}
        </span>
      </div>
      {error && (
        <div data-testid="nfmt-error" className={styles.error}>{error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx`
Expected: 6 tests pass.

- [ ] **Step 5: Mount editor inside FormatInspectorPanel**

Modify `frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx` — append a new section below the property grid:

```jsx
// ...existing imports...
import NumberFormatEditor from './NumberFormatEditor';
import { StyleProp } from '../lib/formattingTypes';

// ...inside FormatInspectorPanel's return, after the closing </table>:
{/* Plan 10b — number format editor section */}
<section className={styles.section}>
  <h4 className={styles.sectionTitle}>Number format</h4>
  <NumberFormatEditor
    value={String(
      resolver.resolve(
        context.markId, context.fieldId, context.sheetId, context.dsId,
        StyleProp.NumberFormat,
      ) ?? ''
    )}
    onChange={(pattern) => setRule(selector, StyleProp.NumberFormat, pattern)}
  />
</section>
```

Add corresponding rules to `FormatInspectorPanel.module.css`:

```css
.section { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--askdb-border, #e2e2e2); }
.sectionTitle { font-size: 13px; font-weight: 600; margin: 0 0 6px 0; }
```

- [ ] **Step 6: Re-run inspector tests**

Run: `cd frontend && npx vitest run src/components/dashboard/freeform/panels/__tests__/FormatInspectorPanel.test.tsx`
Expected: existing Plan 10a tests still green. If any test selects elements by position and our new section breaks positional queries, tighten the failing selector to a `data-testid`-based query. Do NOT delete failing Plan 10a assertions.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.jsx frontend/src/components/dashboard/freeform/panels/NumberFormatEditor.module.css frontend/src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.jsx frontend/src/components/dashboard/freeform/panels/FormatInspectorPanel.module.css
git commit -m "feat(analyst-pro): mount NumberFormatEditor in FormatInspectorPanel (Plan 10b T9)"
```

---

## Task 10 — Documentation + integration smoke test + roadmap flip

**Purpose:** Write the grammar doc, add a cross-layer smoke test that goes `StyleRule → FormatResolver → format_number`, and flip the roadmap to Shipped.

**Files:**
- Create: `backend/vizql/NUMBER_FORMAT_GRAMMAR.md`.
- Create: `backend/tests/test_number_format_integration.py`.
- Modify: `docs/analyst_pro_tableau_parity_roadmap.md` — Plan 10b heading → Shipped.

- [ ] **Step 1: Write the failing integration smoke test**

Create `backend/tests/test_number_format_integration.py`:

```python
"""Plan 10b — integration: resolver + formatter end-to-end."""
from backend.vizql.format_resolver import FormatResolver
from backend.vizql.formatting_types import (
    FieldSelector,
    StyleProp,
    StyleRule,
    WorkbookSelector,
)
from backend.vizql.number_format import format_number, parse_number_format


def test_field_number_format_wins_over_workbook():
    rules = (
        StyleRule(
            selector=WorkbookSelector(),
            properties={StyleProp.NUMBER_FORMAT: "#,##0"},
        ),
        StyleRule(
            selector=FieldSelector(field_id="sales"),
            properties={StyleProp.NUMBER_FORMAT: "$#,##0.00;($#,##0.00)"},
        ),
    )
    resolver = FormatResolver(rules)
    pattern = resolver.resolve(
        mark_id=None, field_id="sales", sheet_id=None, ds_id=None,
        prop=StyleProp.NUMBER_FORMAT,
    )
    assert pattern == "$#,##0.00;($#,##0.00)"
    ast = parse_number_format(str(pattern))
    assert format_number(-1234.5, ast) == "($1,234.50)"


def test_workbook_fallback_when_no_field_rule():
    rules = (
        StyleRule(
            selector=WorkbookSelector(),
            properties={StyleProp.NUMBER_FORMAT: "#,##0"},
        ),
    )
    resolver = FormatResolver(rules)
    pattern = resolver.resolve(
        mark_id=None, field_id="sales", sheet_id=None, ds_id=None,
        prop=StyleProp.NUMBER_FORMAT,
    )
    assert pattern == "#,##0"
    assert format_number(1234.5, parse_number_format(str(pattern))) == "1,234"


def test_unformatted_field_returns_raw_repr_path():
    resolver = FormatResolver(())
    pattern = resolver.resolve(
        mark_id=None, field_id="x", sheet_id=None, ds_id=None,
        prop=StyleProp.NUMBER_FORMAT,
    )
    assert pattern is None  # no default — consumer chooses fallback string repr
```

(If the Plan 10a `FormatResolver` constructor takes a different arg shape, align — e.g. `FormatResolver(rules=..., defaults=...)`. Verify by `grep -n 'class FormatResolver' backend/vizql/format_resolver.py`.)

- [ ] **Step 2: Run the integration tests**

Run: `python -m pytest backend/tests/test_number_format_integration.py -v`
Expected: 3 tests pass. If `FormatResolver` signature differs, fix the test invocation — do NOT change the resolver.

- [ ] **Step 3: Write `NUMBER_FORMAT_GRAMMAR.md`**

Create `backend/vizql/NUMBER_FORMAT_GRAMMAR.md`:

```markdown
# AskDB Number Format Grammar

Excel-derived format-string parser + formatter. Shared Python + TypeScript.
Consumed by the Plan 10a `FormatResolver` under `StyleProp.NUMBER_FORMAT`.

## Tokens

| Token | Meaning |
|---|---|
| `#` | Optional digit |
| `0` | Required digit |
| `,` | Thousands separator (in digit run) / literal (elsewhere) |
| `.` | Decimal point |
| `%` | Scale ×100, emit `%` |
| `‰` | Scale ×1000, emit `‰` |
| `E+00` / `E-00` | Scientific exponent |
| `$ € ¥ £` | Currency literal (prefix/suffix) |
| `[XXX]` | Bracketed currency literal (e.g. `[USD]`) |
| `"…"` | Quoted literal |
| `\c` | Escaped single char |
| `;` | Section separator |
| `(`/`)` | Paren negative (section index 1 only) |

## Sections

Up to 4 separated by `;`: **positive; negative; zero; text**. Fallback:
- 1 section → all signs.
- 2 sections → (positive+zero), (negative).
- 3 sections → positive, negative, zero.
- 4 sections → positive, negative, zero, text.

## AST

See `backend/vizql/number_format.py` :: `NumberFormatAST` / `FormatSection` / `IntegerSpec` / `DecimalSpec` / `ExponentSpec`.

## Examples

| Pattern | Input | Output |
|---|---|---|
| `#,##0` | 1234567 | `1,234,567` |
| `#,##0.00` | 1234.5 | `1,234.50` |
| `0.0%` | 0.125 | `12.5%` |
| `$#,##0;($#,##0)` | -1234 | `($1,234)` |
| `0.##E+00` | 12345 | `1.23E+04` |
| `[USD]#,##0.00` | 1234.5 | `USD1,234.50` |

## Locale

Pattern syntax is always en-US (`.` decimal, `,` thousands in the
pattern). Rendered output is locale-aware via the `locale` argument:

| Locale | Thousands | Decimal |
|---|---|---|
| `en-US` / `en-GB` | `,` | `.` |
| `de-DE` | `.` | `,` |
| `fr-FR` | NBSP | `,` |
| `es-ES` | `.` | `,` |

Unknown locales fall through to en-US.

## Rounding

`ROUND_HALF_UP` (matches Tableau observation, not banker's). `0.5 → 1`,
`1.5 → 2`, `0.005 → 0.01`.

## NaN / Infinity

Emit literal `NaN` / `Infinity` / `-Infinity`. No section is used.

## Vega-Lite integration

`frontend/src/chart-ir/formatting/vegaFormatAdapter.ts :: toVegaFormat`
maps patterns to D3 format strings where possible. Non-expressible
patterns use the sentinel `askdb:<pattern>`; Vega calls
`askdbFormatNumber(value, pattern)` (registered in
`registerVegaFormat.ts`) to render them.

## Parity

Python + TypeScript produce byte-identical output on 200+ golden cases
(`backend/vizql/tests/fixtures/number_format_parity/cases.json`).
Any divergence is a TS bug; Python is the reference.
```

- [ ] **Step 4: Flip roadmap**

Modify `docs/analyst_pro_tableau_parity_roadmap.md` — replace the Plan 10b heading:

```markdown
### Plan 10b — Number Format Grammar (Excel-style) — ✅ Shipped 2026-04-21

**Status:** ✅ Shipped 2026-04-21. 10 tasks.
Backend modules: `backend/vizql/{number_format,number_format_defaults}.py`.
Frontend: `frontend/src/components/dashboard/freeform/lib/{numberFormat,numberFormatDefaults}.ts`,
`frontend/src/chart-ir/formatting/{vegaFormatAdapter,registerVegaFormat}.ts`,
`panels/NumberFormatEditor.jsx`. Consumed via `StyleProp.NUMBER_FORMAT` through the
Plan 10a `FormatResolver`. Vega integration: D3-format mapping where expressible,
falls back to registered `askdbFormatNumber` Vega expression fn for paren-negative /
bracketed currency / multi-section patterns. Tests: parser (13) + formatter (15) +
parity corpus (200+) + defaults (4) + integration (3) backend; unit (17) + parity
(200+) + adapter (8) + editor (6) frontend — all green. FormatInspectorPanel gains a
Number format section with preset dropdown + custom pattern + live 1,234,567.89
preview + error indicator. Docs: `backend/vizql/NUMBER_FORMAT_GRAMMAR.md`. Router
`askdb:<pattern>` sentinel consumer wiring tracked as a follow-up task (to keep
Plan 10b from touching the known `chart-ir/router` test-debt baseline). Plan doc:
`docs/superpowers/plans/2026-04-21-analyst-pro-plan-10b-number-format-grammar.md`.
```

- [ ] **Step 5: Run full relevant suites**

Run:
```bash
python -m pytest backend/tests/test_number_format.py backend/tests/test_number_format_parity.py backend/tests/test_number_format_defaults.py backend/tests/test_number_format_integration.py -v
cd frontend
npx vitest run src/components/dashboard/freeform/lib/__tests__/numberFormat.test.ts src/components/dashboard/freeform/lib/__tests__/numberFormat.parity.test.ts src/components/dashboard/freeform/panels/__tests__/NumberFormatEditor.test.jsx src/chart-ir/formatting/__tests__/
```
Expected: all green. Full backend suite should also remain green (`python -m pytest backend/tests/ -v` — spot check; Plan 10b adds no shared-state changes).

- [ ] **Step 6: Commit**

```bash
git add backend/vizql/NUMBER_FORMAT_GRAMMAR.md backend/tests/test_number_format_integration.py docs/analyst_pro_tableau_parity_roadmap.md
git commit -m "docs(analyst-pro): NUMBER_FORMAT_GRAMMAR.md + integration tests + shipped marker (Plan 10b T10)"
```

---

## Self-Review Checklist (run after the plan is applied end-to-end)

- [ ] Every AUTHORITATIVE item from the roadmap §Plan 10b appears in at least one task:
  - [x] Grammar (T1 + T2).
  - [x] `NumberFormatAST` dataclasses (T1).
  - [x] Formatter (T3).
  - [x] TS port (T5 + T6).
  - [x] Vega-Lite integration (T8).
  - [x] Tests incl. 200+ parity (T4 + T6).
  - [x] Default catalogue (T7).
  - [x] Format editor UI (T9).
- [ ] No TODO / TBD / placeholder text in any step.
- [ ] Symbol + property names stable across tasks:
  - Python: `NumberFormatAST`, `FormatSection`, `IntegerSpec`, `DecimalSpec`, `ExponentSpec`, `Literal`, `parse_number_format`, `format_number`, `NumberFormatError`, `DEFAULT_NUMBER_FORMATS`.
  - TS: `NumberFormatAST`, `FormatSection`, `IntegerSpec`, `DecimalSpec`, `ExponentSpec`, `Literal`, `parseNumberFormat`, `formatNumber`, `NumberFormatError`, `DEFAULT_NUMBER_FORMATS`, `toVegaFormat`, `askdbFormatNumberImpl`.
- [ ] Parser error paths are tested (unmatched quote / bracket, >4 sections, invalid scientific, empty).
- [ ] Rounding is half-up, not banker's, in both languages — tested.
- [ ] NaN / Infinity emit literal strings, tested.
- [ ] Locale affects separators only, never pattern syntax — tested (`de-DE`).
- [ ] Performance target tested in both languages (10k / <50ms).
- [ ] `StyleProp.NUMBER_FORMAT` is the single integration point; no new StyleProp values added.
- [ ] No protobuf change.
- [ ] No Plan 10a file logic edited (only imports + mount point additions).
- [ ] No change to `chart-ir/router.ts` — the adapter is tested in isolation to preserve the known-debt baseline. Call-site wiring is deferred.

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via `superpowers:executing-plans`.
