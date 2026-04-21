# Analytics — Forecast (Plan 9c)

Tableau-parity forecast on any temporal series. Built on Holt-Winters
exponential smoothing with automatic model selection.

## How it works

1. **Preflight.** Series must include a temporal field (`t`) and ≥10
   points. Gaps are NaN-filled to a uniform grid (auto-detected unit
   when `forecast_unit='auto'`).
2. **Fit.** When `model='auto'`, the engine fits all 8 ETS variants
   from the Hyndman taxonomy and picks the lowest-AIC winner.
3. **Predict.** Generates `forecast_length` future points plus
   prediction-interval bands at the chosen confidence level.

## The 8 ETS model codes

Each code is `Error · Trend · Seasonal` where each slot is `A`
(additive), `M` (multiplicative), or `N` (none). The 8 kinds we try:

| Code | Error | Trend | Seasonal | When it wins |
|---|---|---|---|---|
| `ANN` | additive | none | none | Stationary, no trend or seasonality. |
| `AAA` | additive | additive | additive | Trending + seasonal series. |
| `AAM` | additive | additive | multiplicative | Trending + amplifying seasonality. |
| `AMA` | additive | multiplicative | additive | Compounding growth + flat seasonality. |
| `AMM` | additive | multiplicative | multiplicative | Compounding growth + amplifying seasonality. |
| `ANA` | additive | none | additive | Seasonal series with no trend. |
| `ANM` | additive | none | multiplicative | Seasonal series, multiplicative seasonality, no trend. |
| `MNN` | multiplicative | none | none | Stationary positive series with proportional noise. |

Multiplicative slots require strictly-positive `y` values; on series
with non-positive values, multiplicative variants are scored
`AIC = +∞` and skipped.

## Reading information criterion

`AIC = 2k + n·ln(SSE/n)`. Lower wins. AIC penalizes parameter count,
so a slightly worse-fitting simpler model can outrank a richer one
that overfits.

## Confidence intervals

Default on. Levels: 90 / 95 / 99 percent. Bands widen with horizon —
the further out you forecast, the more uncertain the point estimate.

## Partial-period guard (`ignore_last`)

The last reporting period is often incomplete (current month is still
in progress). Set `ignore_last` to drop the last N points before
fitting so the model isn't pulled toward a partial value.

## Auto vs Custom

- **Auto** — try all 8, pick best by AIC, auto-detect season length
  from FFT autocorrelation among `(4, 7, 12, 24, 52)` candidates.
- **Additive / Multiplicative** — force the corresponding ETS family
  (defaults: `AAA` / `MAM`).
- **Custom** — hand-specify season length; engine fits one model only.

## Limits

- Max 10,000 input points (`FORECAST_MAX_ROWS`).
- Max 200 forecast points per request (`FORECAST_MAX_HORIZON`).
- 10-second wall-clock budget (`FORECAST_TIMEOUT_SECONDS`).
- 10 requests / 60s / user (`FORECAST_RATE_LIMIT_PER_60S`).

## See also
- `Build_Tableau.md` §XIII.3 (Holt-Winters reference).
- `backend/vizql/forecast_engine.py` (engine source).
- `frontend/src/chart-ir/analytics/forecastToVega.ts` (Vega-Lite output).
