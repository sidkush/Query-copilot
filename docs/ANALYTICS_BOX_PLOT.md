# Analytics — Box Plot

Summarise a measure's distribution with Q1 / median / Q3 + whiskers +
optional outliers. Composes the existing reference-distribution path
(Plan 9a) — no new data pipeline.

## Whisker methods

| Method | Whisker low | Whisker high | Outliers? |
|---|---|---|---|
| **Tukey** | `max(Q1 − 1.5·IQR, MIN)` | `min(Q3 + 1.5·IQR, MAX)` | Yes — rows outside `[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` |
| **Min/Max** | `MIN` | `MAX` | Not meaningful (every row fits inside) |
| **Custom percentile** | `PERCENTILE_CONT(low/100)` | `PERCENTILE_CONT(high/100)` | Yes — rows outside `[low, high]` |

## Scope

- **Entire** — one box over all visible rows.
- **Pane** — one box per row/column header combination.
- **Cell** — one box per cell (per dimensional coordinate).

## Performance

Aggregated stats (Q1 / median / Q3 / MIN / MAX) cost one `PERCENTILE_CONT`
sub-expression each; a single box plot is 5 cacheable queries. Outliers
add one detail-level query that scans the base table — heavier. Disable
outliers if your dataset is above ~1M rows and you do not need them.

## Read also
- `backend/vizql/box_plot.py`, `backend/vizql/box_plot_compiler.py`
- `frontend/src/chart-ir/analytics/boxPlotToVega.ts`
- `docs/Build_Tableau.md` §XIII.1
