---
name: metric-definitions-glossary
description: Canonical cross-domain metric defs — revenue, active users, churn, retention, AOV, CAC, LTV, funnel, cohort — referenced by domain skills
priority: 3
tokens_budget: 1400
applies_to: sql-generation
---

# Metric Definitions Glossary — AskDB AgentEngine

Canonical, dialect-agnostic metric definitions. Domain skills reference this file instead of redefining.

## Revenue

- **Gross revenue** = SUM of all invoiced amounts before refunds/credits/discounts. `SUM(invoices.total)`.
- **Net revenue** = Gross − refunds − credits − discounts. `SUM(invoices.total) - SUM(refunds.amount) - SUM(credits.amount)`.
- **Recognized revenue** = Portion of contract-value recognized in the current period (ASC 606). Requires a `revenue_schedule` table. Do NOT infer from invoice date alone.
- **Booked revenue** = Contract value signed this period, independent of when recognized. `SUM(contracts.acv) WHERE signed_at IN period`.
- **MRR** = Monthly recurring revenue. For subscription SaaS: `SUM(active subscriptions.monthly_price)` on the last day of the month.
- **ARR** = Annual recurring revenue = `MRR × 12`.

Default when ambiguous: **net revenue**. Always disclose choice in summary.

## Customers / Users

- **Customer** = organization entity (one row in `customers` / `accounts`). Many users per customer common in B2B.
- **User** = individual login (one row in `users`). A customer with 10 users is still 1 customer.
- **Active user** = user with ≥ 1 session or ≥ 1 qualifying event in the window. "Qualifying" is product-defined; default = any event in `events` table.
- **DAU / WAU / MAU** = daily/weekly/monthly active users over a rolling window. `COUNT(DISTINCT user_id) WHERE event_date IN window`.
- **Stickiness** = `DAU / MAU`. Target 0.2 = visit 20% of days.
- **New user** = first event / first login / first purchase within window, depending on product.
- **Returning user** = not a new user in window.

## Churn

- **Gross churn rate** = `(customers lost in period) / (customers at start of period)`. SaaS convention: monthly.
- **Net revenue retention (NRR)** = `(starting MRR + expansion − contraction − churn) / starting MRR`. Good SaaS: > 100%.
- **Gross revenue retention (GRR)** = same but excluding expansion. Cap at 100%.
- **Logo churn** = customer count churn (ignoring revenue).
- **Revenue churn** = `(MRR lost to churn) / (starting MRR)`.
- **Soft churn** = inactive ≥ 30 days but not officially cancelled. Default: treat as churned for DAU but not for revenue until cancelled.

## Order / Transaction

- **AOV** (average order value) = `SUM(order_total) / COUNT(DISTINCT order_id)`.
- **ARPU** (average revenue per user) = `SUM(revenue) / COUNT(DISTINCT user_id)`.
- **Basket size** = items per order. `SUM(items) / COUNT(DISTINCT order_id)`.

## Conversion / Funnel

- **Conversion rate** = `(converters) / (entrants to funnel step)`. Always specify the two steps.
- **Top-of-funnel** = entrants (sessions / leads).
- **Bottom-of-funnel** = final-step completers (paid customers / closed-won).
- **Stage conversion** = conversion between adjacent stages.
- **Overall conversion** = top-to-bottom.
- Funnel stages default: awareness → interest → consideration → purchase → retention. Product-specific events override.

## Cohort retention

- **Cohort** = users grouped by their acquisition period (e.g., `signup_month`).
- **Retention at week N** = `(cohort users active in week N) / (cohort size at week 0)`.
- **Classic cohort table** = rows = cohort period, columns = elapsed weeks, cell = retention %. Use `FIXED` LOD in Tableau or `FIRST_VALUE(signup_date) OVER (PARTITION BY user_id ORDER BY event_date)` in SQL.

## Unit economics

- **CAC** (customer acquisition cost) = `SUM(marketing spend + sales spend) / (new customers acquired)` in period.
- **LTV** (lifetime value) = `(AOV × purchase frequency × customer lifespan)` OR, for SaaS: `ARPU / churn rate`.
- **LTV/CAC ratio** = target ≥ 3.
- **Payback period** = `CAC / (ARPU × gross margin)`. Target ≤ 18 months SaaS.
- **Gross margin** = `(revenue − COGS) / revenue`.

## Marketing

- **CTR** (click-through rate) = `clicks / impressions`.
- **CPC** (cost per click) = `spend / clicks`.
- **CPM** (cost per thousand impressions) = `spend × 1000 / impressions`.
- **ROAS** (return on ad spend) = `attributed revenue / ad spend`.
- **Attribution** defaults to last-touch unless overridden. Multi-touch requires `FIXED` cohort calc.

## HR / Ops

- **Headcount** = active employees on a given date. Point-in-time metric, not period-summed.
- **Attrition rate** = `(departures in period) / (avg headcount in period)`. Annualized.
- **MTTR** (mean time to recovery) = `AVG(resolved_at − created_at)` for incidents/tickets.
- **SLA compliance** = `(tickets within SLA) / (tickets total)`.

## Time periods

- **YTD** = from Jan 1 of reference year through reference date.
- **PYTD** = Jan 1 of year−1 through (reference date − 1 year), Feb 29 clamped to Feb 28.
- **QTD** = from quarter_start(reference) through reference date.
- **Rolling 30d** = `reference − 29d` through reference (inclusive both ends = 30 days).
- **Fiscal year** = requires `fiscal_year_start_month` parameter; never assume calendar.

See `sql/time-intelligence.md` for the SQL patterns.

## Disambiguation rule

When user says a metric name ambiguous across definitions ("revenue"), pick the default (net) AND disclose the choice:

> "Computed net revenue (gross − refunds). If you want gross, say 'gross revenue'."

## Override mechanism

Users can declare company-specific definitions via `/api/v1/schema/metrics` (to be implemented). Overrides live in `.data/user_data/{hash}/metric_overrides.json`. Override takes precedence over glossary defaults.

---

## Examples

**Input:** User: "What's our revenue this quarter?"
**Output:** Apply default = **net revenue**. SQL: `SUM(invoices.total) - COALESCE(SUM(refunds.amount),0) - COALESCE(SUM(credits.amount),0)` scoped to quarter. Summary: "Net revenue (gross − refunds − credits) for Q1 2026: $8.2M."

**Input:** User: "churn rate for March".
**Output:** Ambiguous. Apply disambiguation: default = gross churn (customer count). Disclose: "Gross customer churn in March: 4.2% (142 of 3,380 customers). If you wanted revenue churn, let me know."

**Input:** User: "cohort retention by signup week".
**Output:** Use cohort-table pattern. `WITH cohorts AS (SELECT user_id, DATE_TRUNC('week', signup_date) AS cohort FROM users), activity AS (SELECT c.cohort, DATE_TRUNC('week', e.event_date) AS week, COUNT(DISTINCT e.user_id) AS active FROM cohorts c JOIN events e USING (user_id) GROUP BY 1,2) SELECT cohort, week, active*1.0/FIRST_VALUE(active) OVER (PARTITION BY cohort ORDER BY week) AS retention FROM activity`.

**Input:** User has company override `MRR = SUM(subscriptions.mrr) WHERE status='active'` in metric_overrides.json.
**Output:** Use override verbatim. Summary notes: "Using your custom MRR definition."
