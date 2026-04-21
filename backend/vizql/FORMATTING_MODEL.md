# Analyst Pro — Formatting Model (Plan 10a)

## Precedence diagram (Build_Tableau §XIV.1)

    Mark > Field > Worksheet > Data Source > Workbook > default

Most-specific layer wins. Resolver walks top-to-bottom; first layer with a
rule defining the requested property returns; otherwise returns `default`.

## Backing store

`VisualSpec.formatting: list[StyleRule]` (proto field 17). Client mirror
in Zustand slice `analystProFormatRules`.

## Selector grammar

| Kind | Id field | Specificity |
|---|---|---|
| `mark` | `markId` | 5 |
| `field` | `fieldId` | 4 |
| `sheet` | `sheetId` | 3 |
| `ds` | `dsId` | 2 |
| `workbook` | — | 1 |

## Supported properties (§XIV.6 grammar)

Typography — `font-family`, `font-size`, `font-weight`, `font-style`,
`text-decoration`, `text-align`, `line-height`, `color`,
`background-color`.
Chrome — `border-top/right/bottom/left`, `padding`,
`show-column-banding`, `show-row-banding`, `axis-tick-color`,
`zero-line-color`, `pane-line-thickness`.
Reserved for Plans 10b/10c — `number-format`, `date-format`.

## Resolver guarantees

- Deterministic — same rule list + same query ⇒ identical result.
- Python ↔ TypeScript parity — fixture-driven (`fixtures/format_parity/`).
- Memoised — O(1) after warmup per `(mark, field, sheet, ds, prop)` key.
- Safe — `format_sanitiser.py` rejects `javascript:` / `url(...)` / oversized / non-primitive.

## Known gaps vs Tableau

- **Themes** (§XIV.7 `StyleTheme` enum) — deferred to Plan 10d.
- **Conditional formatting** (§XIV.4) — deferred to Plan 10e (two-mechanism: stepped palette + calc→color).
- **Rich-text rendering** (§XIV.6 `<formatted-text><run/>`) — types only land here; render pipeline lands in 10d.
- **Number/date grammar parsers** — Plans 10b/10c.
- **Axis vs. pane vs. cell scope** for borders — tracked via existing `scope` fields on reference lines; not re-implemented in the resolver.
