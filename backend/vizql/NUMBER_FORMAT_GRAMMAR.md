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
