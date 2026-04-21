# Analytics — Drop Lines

Drop lines are a UI aid: when you hover or select a mark, AskDB draws
1-pixel dashed (or dotted) rules from the mark down to the nearest
axis — x, y, or both. No query runs.

## Modes

| Mode | Behaviour |
|---|---|
| **Off** | No drop lines on this sheet. Stored explicitly — switching it on later preserves the other settings. |
| **Drop to X axis** | Vertical line from mark down to y = 0. |
| **Drop to Y axis** | Horizontal line from mark to x = 0. |
| **Both axes** | Both of the above, simultaneously. |

## Styling

- **Color** — any CSS colour; default `#888888`.
- **Style** — `Dashed` (default) emits `strokeDash [4, 3]`; `Dotted` emits `strokeDash [1, 2]`. Width is always 1 pixel (Tableau parity).

## Scope

Drop lines apply **per sheet**, not per chart. One setting covers every
chart you author on that sheet. This matches Tableau's worksheet-level
"Drop Lines" menu.

## Read also
- `frontend/src/chart-ir/analytics/dropLinesToVega.ts`
- `frontend/src/components/dashboard/freeform/panels/DropLinesDialog.jsx`
- `docs/Build_Tableau.md` §XIII.1
