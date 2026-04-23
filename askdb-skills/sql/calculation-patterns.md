---
applies_to: sql-generation
depends_on:
  - aggregation-rules
  - null-handling
description: Year-over-Year Growth Rate (current_period - prior_year_period) / NULLIF(prior_year_period,
  0) * 100
legacy: true
name: calculation-patterns
priority: 3
tokens_budget: 1400
---

# Calculation Patterns — AskDB AgentEngine

## Business Metrics — Canonical Formulas

### Revenue & Growth
```sql
-- Month-over-Month Growth Rate
(current_month_revenue - prior_month_revenue) / NULLIF(prior_month_revenue, 0) * 100

-- Year-over-Year Growth Rate
(current_period - prior_year_period) / NULLIF(prior_year_period, 0) * 100

-- Compound Monthly Growth Rate (CMGR)
POWER(end_value / NULLIF(start_value, 0), 1.0 / num_months) - 1
```

### SaaS Metrics
```sql
-- MRR (Monthly Recurring Revenue) — from subscriptions
SELECT DATE_TRUNC('month', billing_date) as month,
  SUM(mrr_amount) as mrr
FROM subscriptions
WHERE status = 'active'
GROUP BY DATE_TRUNC('month', billing_date);

-- ARR = MRR * 12

-- Churn Rate
churned_customers / NULLIF(beginning_of_period_customers, 0) * 100

-- Net Revenue Retention (NRR)
(beginning_mrr + expansion_mrr - churned_mrr - contraction_mrr) / NULLIF(beginning_mrr, 0) * 100

-- LTV (simple)
avg_revenue_per_customer / NULLIF(churn_rate, 0)

-- CAC
total_sales_marketing_spend / NULLIF(new_customers_acquired, 0)

-- LTV:CAC Ratio
ltv / NULLIF(cac, 0)
```

### Cohort Retention
```sql
-- N-day retention: % of users from cohort_date still active N days later
WITH cohorts AS (
  SELECT user_id, MIN(DATE(created_at)) as cohort_date
  FROM users GROUP BY user_id
),
activity AS (
  SELECT user_id, DATE(activity_date) as activity_date
  FROM user_activity
)
SELECT 
  c.cohort_date,
  DATE_DIFF(a.activity_date, c.cohort_date, DAY) as days_since_signup,
  COUNT(DISTINCT c.user_id) as cohort_size,
  COUNT(DISTINCT a.user_id) as retained_users,
  COUNT(DISTINCT a.user_id) * 100.0 / NULLIF(COUNT(DISTINCT c.user_id), 0) as retention_rate
FROM cohorts c
LEFT JOIN activity a ON c.user_id = a.user_id
GROUP BY c.cohort_date, DATE_DIFF(a.activity_date, c.cohort_date, DAY);
```

### Funnel Conversion
```sql
-- Stage-by-stage conversion rates
WITH funnel AS (
  SELECT 
    COUNT(DISTINCT CASE WHEN stage >= 1 THEN user_id END) as stage_1,
    COUNT(DISTINCT CASE WHEN stage >= 2 THEN user_id END) as stage_2,
    COUNT(DISTINCT CASE WHEN stage >= 3 THEN user_id END) as stage_3,
    COUNT(DISTINCT CASE WHEN stage >= 4 THEN user_id END) as stage_4
  FROM user_journey
)
SELECT 
  stage_1 as top_of_funnel,
  stage_2,
  stage_3,
  stage_4 as conversions,
  stage_2 * 100.0 / NULLIF(stage_1, 0) as s1_to_s2_pct,
  stage_3 * 100.0 / NULLIF(stage_2, 0) as s2_to_s3_pct,
  stage_4 * 100.0 / NULLIF(stage_1, 0) as overall_conversion_pct
FROM funnel;
```

### Rolling Averages
```sql
-- 7-day rolling average
SELECT date, revenue,
  AVG(revenue) OVER (
    ORDER BY date 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as rolling_7d_avg
FROM daily_revenue;

-- 30-day rolling average
AVG(revenue) OVER (
  ORDER BY date 
  ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
) as rolling_30d_avg
```

### Percentiles
```sql
-- Median (50th percentile)
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) as median_order_value

-- P25, P75, P90, P95, P99
PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY response_time) as p25,
PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY response_time) as p75,
PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95

-- DuckDB / Snowflake / BigQuery use APPROX_QUANTILES or PERCENTILE_CONT
```

### Market Share
```sql
SELECT category, revenue,
  revenue * 100.0 / SUM(revenue) OVER () as market_share_pct
FROM category_revenue
ORDER BY market_share_pct DESC;
```

### Inventory Turnover
```sql
-- COGS / Average Inventory
COGS / NULLIF((beginning_inventory + ending_inventory) / 2, 0) as inventory_turnover

-- Days in inventory
365 / NULLIF(inventory_turnover, 0) as days_in_inventory
```

### Weighted Average (When Volumes Differ)
```sql
-- WRONG: Simple average of rates ignores volume
AVG(conversion_rate)

-- CORRECT: Weighted average recalculated from components
SUM(conversions) / NULLIF(SUM(sessions), 0) as weighted_conversion_rate
```

---

## Examples

**Input:** "What's our LTV:CAC ratio?"
**Correct SQL:**
```sql
WITH metrics AS (
  SELECT
    AVG(lifetime_value) as avg_ltv,
    SUM(marketing_spend + sales_spend) / NULLIF(COUNT(DISTINCT new_customer_id), 0) as cac
  FROM customer_metrics cm
  JOIN acquisition_costs ac ON cm.acquisition_month = ac.month
)
SELECT avg_ltv, cac, 
  ROUND(avg_ltv / NULLIF(cac, 0), 1) as ltv_cac_ratio
FROM metrics;
```

**Input:** "Show me 30-day rolling revenue"
**Correct SQL:**
```sql
SELECT date, revenue,
  ROUND(AVG(revenue) OVER (ORDER BY date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW), 2) as rolling_30d_avg
FROM daily_revenue
ORDER BY date;
```
