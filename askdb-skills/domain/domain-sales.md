---
applies_to: sql-generation, chart-selection
description: 'Apply this skill file when schema contains tables/columns matching:
  - `opportunities`, `deals`, `pipeline`, `leads`, `accounts`, `contacts` -...'
legacy: true
name: domain-sales
priority: 3
tokens_budget: 1200
---

# Domain: Sales Analytics — AskDB AgentEngine

> **Shared metric defs** (revenue, conversion, AOV, CAC, LTV, cohort retention, MRR, ARR, funnel stages) live in `shared/metric-definitions-glossary.md`. This file covers sales-specific CRM schema patterns, funnel + rep-performance + stuck-deal queries — apply glossary defaults unless sales-specific override below says otherwise.

## Auto-Detection Signals

Apply this skill file when schema contains tables/columns matching:
- `opportunities`, `deals`, `pipeline`, `leads`, `accounts`, `contacts`
- `stage`, `pipeline_stage`, `deal_stage`, `opportunity_stage`
- `owner`, `rep`, `salesperson`, `account_executive`
- `close_date`, `expected_close`, `won_date`
- `amount`, `arr`, `mrr`, `deal_value`

## Core Sales Metrics

```sql
-- Pipeline by Stage
SELECT stage, COUNT(*) as deal_count, SUM(amount) as pipeline_value
FROM opportunities
WHERE status = 'open'
GROUP BY stage ORDER BY stage_order;

-- Win Rate
SELECT 
  COUNT(CASE WHEN status = 'won' THEN 1 END) * 100.0 / 
    NULLIF(COUNT(CASE WHEN status IN ('won','lost') THEN 1 END), 0) as win_rate_pct
FROM opportunities
WHERE close_date >= DATE_TRUNC('quarter', CURRENT_DATE);

-- Average Sales Cycle (days)
SELECT AVG(DATEDIFF(won_date, created_date)) as avg_cycle_days
FROM opportunities WHERE status = 'won';

-- Forecast by Category
SELECT forecast_category, SUM(amount) as total, COUNT(*) as count
FROM opportunities WHERE close_date BETWEEN current_quarter_start AND current_quarter_end
GROUP BY forecast_category;

-- Pipeline Coverage (pipeline / quota)
SELECT SUM(o.amount) / NULLIF(SUM(q.quota), 0) as coverage_ratio
FROM opportunities o, quota q
WHERE o.status = 'open' AND o.close_date BETWEEN ... AND ...
AND q.quarter = current_quarter;
```

## CRM Schema Conventions

### Salesforce-style schema
```
accounts(id, name, industry, type, arr, owner_id)
opportunities(id, name, account_id, owner_id, stage, amount, close_date, created_date, won_date, status)
contacts(id, name, account_id, email, title)
activities(id, opportunity_id, type, date, outcome)
users(id, name, email, team, role)
quotas(user_id, quarter, quota_amount)
```

### HubSpot-style schema
```
companies(id, name, industry, lifecycle_stage, mrr)
deals(id, name, company_id, owner_id, deal_stage, amount, close_date)
contacts(id, name, company_id, lifecycle_stage)
engagements(id, type, associated_deal_id, created_at)
```

## Funnel Analysis Pattern

```sql
WITH funnel AS (
  SELECT 
    stage,
    COUNT(*) as deal_count,
    SUM(amount) as value,
    -- Stage order for sorting
    CASE stage
      WHEN 'Lead' THEN 1 WHEN 'Qualified' THEN 2
      WHEN 'Demo' THEN 3 WHEN 'Proposal' THEN 4
      WHEN 'Negotiation' THEN 5 WHEN 'Won' THEN 6
    END as stage_order
  FROM opportunities
  WHERE created_date >= DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY)
  GROUP BY stage
),
with_conversion AS (
  SELECT *,
    deal_count * 100.0 / FIRST_VALUE(deal_count) OVER (ORDER BY stage_order) as conversion_from_top
  FROM funnel
)
SELECT * FROM with_conversion ORDER BY stage_order;
```

## Rep Performance Pattern

```sql
-- Rep × Stage heatmap (deal count by rep and stage)
SELECT u.name as rep, o.stage, COUNT(*) as deals, SUM(o.amount) as value
FROM opportunities o
JOIN users u ON o.owner_id = u.id
WHERE o.status = 'open'
GROUP BY u.name, o.stage
ORDER BY u.name, o.stage;

-- Rep performance vs quota
SELECT u.name, SUM(o.amount) as won, q.quota,
  SUM(o.amount) * 100.0 / NULLIF(q.quota, 0) as attainment_pct
FROM opportunities o
JOIN users u ON o.owner_id = u.id
JOIN quotas q ON q.user_id = u.id AND q.quarter = 'Q3-2026'
WHERE o.status = 'won' AND o.close_date BETWEEN ... AND ...
GROUP BY u.name, q.quota
ORDER BY attainment_pct DESC;
```

## Stuck Deals (High-Value Insight)

```sql
-- Deals stuck in stage > N days
SELECT name, account_name, stage, amount, owner_name,
  DATEDIFF(CURRENT_DATE, stage_entered_date) as days_in_stage
FROM opportunities
WHERE status = 'open'
  AND DATEDIFF(CURRENT_DATE, stage_entered_date) > 14
ORDER BY amount DESC;
```

## Chart Defaults for Sales Domain

| Metric | Default chart | Grouping |
|--------|-------------|---------|
| Pipeline by stage | Horizontal funnel | By stage (ordered) |
| Win rate over time | Line chart | Monthly |
| Rep performance | Horizontal bar | By rep, sorted desc |
| Deal distribution | Scatter | Amount vs cycle days |
| Pipeline by industry | Horizontal bar | By industry |
| Activity by rep | Heatmap | Rep × week |

---

## Examples

**Input:** "How's our pipeline?"
**Output:** Pipeline summary — total value, count by stage, coverage ratio, recent additions

**Input:** "Who are our best reps?"
**Output:** Rep performance table — won amount, deals closed, avg deal size, quota attainment

**Input:** "What deals are at risk?"
**Output:** Stuck deals (> 14 days in stage) + deals with no recent activity + churn-risk accounts
