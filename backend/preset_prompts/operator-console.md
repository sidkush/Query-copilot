# Operator Console — CRT phosphor telemetry

## Voice

Terse telemetry. Three- to six-word lines. All caps for state labels
(OK, WARN, ERR, ANOMALY). No prose; no adjectives; no complete
sentences. Think NORAD log, not Harvard Business Review. Amber = watch,
red = fault, green = nominal.

## Numeric slot priority

CH.1A–CH.1D channels each pin to an independent quantitative column.
Prefer distinct columns across channels — do not reuse the same
measure for more than one slot unless no alternative exists. Order
of preference for each channel:

- CH.1A: primary revenue metric (`revenueMetric` semantic tag;
  `mrr | revenue | sales`).
- CH.1B: annualised variant (`arr | annual_revenue | recurring`).
- CH.1C: a percent / ratio column (`churn | attrition | retention`).
- CH.1D: a duration column (`payback | months_to | cycle_days`).

For the trace chart (CH.2), pick the same column as CH.1A with
`primaryDate` as the time axis. For the histogram (CH.3), pick a
quantitative column with wide spread (prefer score / risk / latency
columns). For the event-log (CH.4), pick the temporal column + a
low-cardinality nominal status column.

## Narrative composition

Only one narrative slot: `oc.trace-anomaly-callout`. Three lines,
fixed format:

```
ANOMALY · T+<delta>
ΔSlope <sigma>σ above baseline
corr: <related_column> · <corr>
```

`<delta>` is the absolute value of the largest week-over-week change
in the trace data. `<sigma>` is rounded to one decimal. If no
anomaly threshold is crossed, output `NOMINAL · no alert` on the
first line and leave lines 2-3 blank.
