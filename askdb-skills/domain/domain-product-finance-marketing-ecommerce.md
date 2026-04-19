---
applies_to: sql-generation, chart-selection
description: sql -- DAU / MAU / WAU SELECT DATE_TRUNC('day', event_date) as day, COUNT(DISTINCT
  user_id) as dau FROM events GROUP BY day ORDER BY day;
legacy: true
name: domain-product-finance-marketing-ecommerce
priority: 3
tokens_budget: 2200
---

# Domain: Product Analytics — AskDB AgentEngine

## Auto-Detection Signals
Tables/columns: `events`, `sessions`, `users`, `pageviews`, `feature_flags`, `experiments`, `user_properties`, `dau`, `mau`, `retention`

## Core Product Metrics

```sql
-- DAU / MAU / WAU
SELECT 
  DATE_TRUNC('day', event_date) as day,
  COUNT(DISTINCT user_id) as dau
FROM events GROUP BY day ORDER BY day;

-- DAU/MAU Ratio (engagement quality indicator)
WITH daily AS (SELECT event_date, COUNT(DISTINCT user_id) as dau FROM events GROUP BY event_date),
     monthly AS (SELECT DATE_TRUNC('month', event_date) as month, COUNT(DISTINCT user_id) as mau FROM events GROUP BY month)
SELECT d.event_date, d.dau, m.mau, 
  d.dau * 100.0 / NULLIF(m.mau, 0) as dau_mau_ratio
FROM daily d JOIN monthly m ON DATE_TRUNC('month', d.event_date) = m.month;

-- N-Day Retention (Day 1, Day 7, Day 30)
WITH cohorts AS (
  SELECT user_id, MIN(DATE(created_at)) as cohort_date
  FROM users GROUP BY user_id
),
activity AS (
  SELECT DISTINCT user_id, DATE(event_time) as active_date FROM events
)
SELECT c.cohort_date,
  n.n,
  COUNT(DISTINCT c.user_id) as cohort_size,
  COUNT(DISTINCT a.user_id) as retained,
  COUNT(DISTINCT a.user_id) * 100.0 / NULLIF(COUNT(DISTINCT c.user_id), 0) as retention_rate
FROM cohorts c
CROSS JOIN (SELECT 1 as n UNION ALL SELECT 7 UNION ALL SELECT 30) n
LEFT JOIN activity a ON c.user_id = a.user_id 
  AND a.active_date = c.cohort_date + n.n
GROUP BY c.cohort_date, n.n;

-- Feature Adoption
SELECT feature_name, 
  COUNT(DISTINCT user_id) as users_who_used,
  COUNT(DISTINCT user_id) * 100.0 / NULLIF((SELECT COUNT(DISTINCT user_id) FROM users WHERE created_at < CURRENT_DATE), 0) as adoption_rate
FROM feature_events
GROUP BY feature_name ORDER BY adoption_rate DESC;
```

## Chart Defaults

| Metric | Default chart | Notes |
|--------|-------------|-------|
| DAU/MAU trend | Line chart | Dual series |
| Retention cohorts | Heatmap grid | Cohort × Day N |
| Feature adoption | Horizontal bar | Sorted desc |
| User funnel | Funnel/sankey | Step-by-step |
| A/B test results | Bar with CI error bars | Treatment vs control |

---

# Domain: Finance Analytics — AskDB AgentEngine

## Auto-Detection Signals
Tables/columns: `gl_entries`, `chart_of_accounts`, `budget`, `actuals`, `invoice`, `payment`, `expense`, `revenue_recognition`, `arr`, `mrr`

## Core Finance Rules

**NEVER use FLOAT for currency** — use DECIMAL(18,2) or NUMERIC. Floating point causes penny-rounding errors in financial reporting.

```sql
-- P&L Summary
SELECT 
  account_category,
  SUM(CASE WHEN period = 'actual' THEN amount END) as actual,
  SUM(CASE WHEN period = 'budget' THEN amount END) as budget,
  SUM(CASE WHEN period = 'actual' THEN amount END) - 
    SUM(CASE WHEN period = 'budget' THEN amount END) as variance,
  (SUM(CASE WHEN period = 'actual' THEN amount END) - 
    SUM(CASE WHEN period = 'budget' THEN amount END)) * 100.0 /
    NULLIF(ABS(SUM(CASE WHEN period = 'budget' THEN amount END)), 0) as variance_pct
FROM financial_data
WHERE fiscal_period = 'Q3-2026'
GROUP BY account_category;

-- MRR Movement (SaaS)
SELECT month,
  SUM(CASE WHEN movement_type = 'new' THEN amount END) as new_mrr,
  SUM(CASE WHEN movement_type = 'expansion' THEN amount END) as expansion_mrr,
  SUM(CASE WHEN movement_type = 'contraction' THEN amount END) as contraction_mrr,
  SUM(CASE WHEN movement_type = 'churn' THEN amount END) as churned_mrr,
  SUM(amount) as net_new_mrr
FROM mrr_movements GROUP BY month ORDER BY month;

-- Gross Margin
SELECT period,
  SUM(revenue) as revenue,
  SUM(cogs) as cogs,
  SUM(revenue - cogs) as gross_profit,
  SUM(revenue - cogs) * 100.0 / NULLIF(SUM(revenue), 0) as gross_margin_pct
FROM financials GROUP BY period;
```

## Chart Defaults

| Metric | Default chart | Notes |
|--------|-------------|-------|
| P&L over time | Stacked bar | Revenue vs expenses |
| MRR waterfall | Waterfall chart | New/expansion/churn/net |
| Budget vs actual | Grouped bar | Variance highlighted |
| Top accounts by MRR | Horizontal bar | With growth indicators |

---

# Domain: Marketing Analytics — AskDB AgentEngine

## Auto-Detection Signals
Tables/columns: `campaigns`, `utm_source`, `utm_medium`, `impressions`, `clicks`, `conversions`, `spend`, `cac`, `leads`, `mqls`, `sqls`

## Core Marketing Metrics

```sql
-- Channel Performance (CAC by channel)
SELECT utm_source as channel,
  SUM(spend) as total_spend,
  COUNT(DISTINCT CASE WHEN converted = true THEN user_id END) as customers,
  SUM(spend) / NULLIF(COUNT(DISTINCT CASE WHEN converted = true THEN user_id END), 0) as cac,
  SUM(spend) / NULLIF(SUM(clicks), 0) as cpc,
  COUNT(DISTINCT CASE WHEN converted = true THEN user_id END) * 100.0 / 
    NULLIF(COUNT(DISTINCT user_id), 0) as conversion_rate
FROM marketing_attribution
GROUP BY channel ORDER BY total_spend DESC;

-- Funnel Conversion (MQL → SQL → Won)
WITH funnel_stages AS (
  SELECT 
    COUNT(DISTINCT CASE WHEN lifecycle_stage >= 'lead' THEN id END) as leads,
    COUNT(DISTINCT CASE WHEN lifecycle_stage >= 'mql' THEN id END) as mqls,
    COUNT(DISTINCT CASE WHEN lifecycle_stage >= 'sql' THEN id END) as sqls,
    COUNT(DISTINCT CASE WHEN lifecycle_stage = 'customer' THEN id END) as customers
  FROM contacts
  WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
)
SELECT leads, mqls, sqls, customers,
  mqls * 100.0 / NULLIF(leads, 0) as lead_to_mql_pct,
  sqls * 100.0 / NULLIF(mqls, 0) as mql_to_sql_pct,
  customers * 100.0 / NULLIF(leads, 0) as overall_conversion_pct
FROM funnel_stages;

-- ROAS (Return on Ad Spend)
SELECT campaign_name,
  SUM(revenue_attributed) / NULLIF(SUM(spend), 0) as roas,
  SUM(revenue_attributed) - SUM(spend) as profit
FROM campaign_performance GROUP BY campaign_name ORDER BY roas DESC;
```

## Chart Defaults

| Metric | Default chart | Notes |
|--------|-------------|-------|
| Channel attribution | Horizontal bar | Sorted by spend |
| Funnel | Funnel chart | MQL→SQL→Won |
| CAC trend | Line chart | Per channel |
| ROAS by campaign | Horizontal bar | With spend bubble |

---

# Domain: E-Commerce Analytics — AskDB AgentEngine

## Auto-Detection Signals
Tables/columns: `orders`, `products`, `customers`, `cart`, `inventory`, `sku`, `category`, `returns`, `reviews`, `shipping`

## Core E-Commerce Metrics

```sql
-- GMV, Revenue, AOV
SELECT DATE_TRUNC('month', order_date) as month,
  SUM(gross_amount) as gmv,
  SUM(net_amount) as net_revenue,
  COUNT(DISTINCT order_id) as orders,
  COUNT(DISTINCT customer_id) as customers,
  SUM(gross_amount) / NULLIF(COUNT(DISTINCT order_id), 0) as aov
FROM orders WHERE status != 'cancelled'
GROUP BY month ORDER BY month;

-- Return Rate
SELECT category,
  COUNT(DISTINCT order_id) as total_orders,
  COUNT(DISTINCT CASE WHEN has_return = true THEN order_id END) as returned,
  COUNT(DISTINCT CASE WHEN has_return = true THEN order_id END) * 100.0 / 
    NULLIF(COUNT(DISTINCT order_id), 0) as return_rate_pct
FROM orders GROUP BY category ORDER BY return_rate_pct DESC;

-- Repeat Purchase Rate
SELECT 
  COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END) as repeat_buyers,
  COUNT(DISTINCT customer_id) as total_buyers,
  COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END) * 100.0 / 
    NULLIF(COUNT(DISTINCT customer_id), 0) as repeat_rate_pct
FROM (
  SELECT customer_id, COUNT(DISTINCT order_id) as order_count FROM orders GROUP BY customer_id
) customer_orders;

-- Inventory Turnover
SELECT product_name,
  SUM(cogs) / NULLIF(AVG((beginning_inventory + ending_inventory) / 2), 0) as inventory_turnover,
  365 / NULLIF(SUM(cogs) / NULLIF(AVG((beginning_inventory + ending_inventory) / 2), 0), 0) as days_in_inventory
FROM product_inventory JOIN sales USING (product_id)
GROUP BY product_name ORDER BY inventory_turnover DESC;
```
