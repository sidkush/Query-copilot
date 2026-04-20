# Table Calculations — Addressing vs Partitioning

> Plan 8c. Reference: `docs/Build_Tableau.md` §V.1 + §V.3.

## Mental model

Two axes control every table calc:

- **Addressing** = the dimensions the calc walks **along**.
  → SQL `ORDER BY` inside the window.
- **Partitioning** = the dimensions the calc **resets** at.
  → SQL `PARTITION BY` inside the window.

Default per §V.3: addressing = "all fields in pane, unordered"
(`IDS_TABLECALC_ORD_PANEUNORDERED`). UI label: "Compute using → Table (across)".

## Visual examples

### Running sum across Year, partitioned by Region

| Region | Year | Sales | RUNNING_SUM(Sales) |
|--------|------|-------|--------------------|
| East   | 2020 | 100   | 100 |
| East   | 2021 | 150   | 250 |
| East   | 2022 | 175   | 425 |
| West   | 2020 | 200   | 200 |  ← resets per Region
| West   | 2021 | 250   | 450 |
| West   | 2022 | 300   | 750 |

Spec:
```json
{ "function": "RUNNING_SUM", "arg_field": "Sales",
  "addressing": ["Year"], "partitioning": ["Region"],
  "direction": "specific", "sort": "asc" }
```

### LOOKUP offset -1 (prior row)

| Region | Year | Sales | LOOKUP(Sales, -1) |
|--------|------|-------|-------------------|
| East   | 2020 | 100   | NULL |
| East   | 2021 | 150   | 100  |
| East   | 2022 | 175   | 150  |
| West   | 2020 | 200   | NULL |  ← resets per Region

LOOKUP runs **client-side** (`tableCalcEvaluator.ts`) because the row-state
walk has no SQL window equivalent that matches Tableau's offset semantics
across all dialects.

## Routing table — server-side vs client-side

| Function family | Side | SQL fn |
|---|---|---|
| RUNNING_* | server | SUM/AVG/MIN/MAX/COUNT + ROWS UNBOUNDED PRECEDING → CURRENT ROW |
| WINDOW_*  | server | matching aggregate (`SUM`, `AVG`, `MEDIAN`, `STDDEV`, `VARIANCE`, `PERCENTILE_CONT`, `CORR`, `COVAR_SAMP`) |
| RANK_*    | server | RANK / DENSE_RANK / ROW_NUMBER / PERCENT_RANK |
| INDEX / FIRST / LAST / SIZE | server | ROW_NUMBER / 1-ROW_NUMBER / COUNT-ROW_NUMBER / COUNT |
| TOTAL / PCT_TOTAL | server | SUM with ROWS UNBOUNDED PRECEDING → UNBOUNDED FOLLOWING |
| LOOKUP / PREVIOUS_VALUE / DIFF / IS_DISTINCT / IS_STACKED | **client** | n/a — pure TS evaluator |

## Filter ordering

Table-calc filters are **stage 8** in the §IV.7 filter pipeline — applied
**after** SQL fetch, **before** render. They never leak into the SQL emitted
by `backend/vizql/logical_to_sql.py`. Use `place_table_calc_filter(predicate)`
in `backend/vizql/filter_ordering.py` to wire one in.

## Compute Using UI

`ComputeUsingDialog.jsx` exposes the §V.3 vocabulary:
- **Table (Across) / Table (Down)** — pane-unordered defaults.
- **Pane (Across) / Pane (Down)** — pane-local addressing.
- **Specific Dimensions** — explicit addressing checklist; remaining
  dimensions become partitioning automatically.

Right-click any table-calc pill → "Compute Using…" → Save calls
`setTableCalcComputeUsingAnalystPro(calcId, spec)`.
