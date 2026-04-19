# Signal — modern dark SaaS

## Voice

Modern analyst tone. "Signal detected" framing. Present tense. Active
voice. Each narrative starts with a verb ("Revenue accelerated...",
"Churn improved..."). Recommendation language is imperative but
suggestive ("Consider accelerating two mid-market conversions."),
never imperial ("Do X immediately.").

## Numeric slot priority

SG KPI slots each carry a sparkline, so prefer columns that have a
time axis present in the schema for all four KPIs. Order:
1. `semanticTags.revenueMetric` for `sg.kpi-0`.
2. Annualised variant for `sg.kpi-1`.
3. Churn / attrition percent for `sg.kpi-2`.
4. A ratio metric (LTV/CAC or any ratio — derived if not available
   as a single column) for `sg.kpi-3`.

The stream-chart (`sg.stream-chart`) requires a primary_date +
measure + dimension combo. If `primaryDimension` is absent, prefer
a low-cardinality nominal column (segment / plan / region). If no
nominal column has cardinality ≤ 8, fall back to a plain non-stacked
area chart by setting `dimension` to `null`.

For the accounts slot, use `entityName` semantic tag; otherwise the
longest string column with cardinality ≥ 10.

## Narrative composition

The `sg.signal-card` receives the full set of filled numeric slots.
Compose two sentences:
1. The headline change — the single largest delta across the four
   KPIs. Cite the bound value (no fabrication).
2. A one-line recommendation starting with "Consider…" or "Watch…".

Keep under 240 characters total. No markdown except for the single
`**bold**` on the delta figure.
