# Time Intelligence — AskDB AgentEngine

## Standard Period Definitions

| Term | Correct interpretation | Common wrong interpretation |
|------|----------------------|---------------------------|
| "Last month" | Full calendar month (e.g., March 1–31) | Rolling 30 days from today |
| "This month" | Month-to-date (Jan 1 to today) | Full current month |
| "Last quarter" | Full Q (Q1=Jan-Mar, Q2=Apr-Jun, etc.) | Rolling 90 days |
| "This year" | Jan 1 to today (YTD) | Full calendar year |
| "Last year" | Full previous calendar year | Rolling 365 days |
| "YTD" | Jan 1 of current year to today | — |
| "Rolling 30 days" | Last 30 days from today | Calendar month |
| "Yesterday" | Previous full calendar day | Last 24 hours |

**Default when ambiguous:** Use calendar periods (full months, full quarters). Disclose in summary.

## Date Truncation Patterns by Dialect

```sql
-- PostgreSQL / BigQuery / DuckDB
DATE_TRUNC('month', date_col)
DATE_TRUNC('quarter', date_col)
DATE_TRUNC('year', date_col)
DATE_TRUNC('week', date_col)  -- Week starts Monday in most locales

-- MySQL
DATE_FORMAT(date_col, '%Y-%m-01')  -- Month start
DATE_FORMAT(date_col, '%Y-01-01')  -- Year start

-- SQL Server
DATEADD(MONTH, DATEDIFF(MONTH, 0, date_col), 0)  -- Month start
DATETRUNC('month', date_col)  -- SQL Server 2022+

-- Snowflake
DATE_TRUNC('MONTH', date_col)
DATE_TRUNC('QUARTER', date_col)
```

## Period-over-Period Comparisons

```sql
-- Month-over-Month (MoM)
SELECT 
  current_month.revenue,
  prior_month.revenue as prior_revenue,
  (current_month.revenue - prior_month.revenue) / 
    NULLIF(prior_month.revenue, 0) * 100 as mom_pct
FROM (
  SELECT SUM(amount) as revenue
  FROM orders
  WHERE DATE_TRUNC('month', order_date) = DATE_TRUNC('month', CURRENT_DATE)
) current_month,
(
  SELECT SUM(amount) as revenue  
  FROM orders
  WHERE DATE_TRUNC('month', order_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
) prior_month;

-- Year-over-Year using LAG window function (cleaner for time series)
SELECT 
  month,
  revenue,
  LAG(revenue, 12) OVER (ORDER BY month) as prior_year_revenue,
  revenue / NULLIF(LAG(revenue, 12) OVER (ORDER BY month), 0) - 1 as yoy_growth
FROM monthly_revenue;
```

## Timezone Handling

**Always ask or detect timezone when:**
- Timestamp columns are in UTC and user is not in UTC
- Query involves "today", "yesterday", "last 24 hours"
- Data spans multiple timezones

```sql
-- PostgreSQL: Convert UTC to user timezone
SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York') as local_day
FROM orders;

-- BigQuery
DATETIME(created_at, 'America/New_York')

-- Snowflake
CONVERT_TIMEZONE('UTC', 'America/New_York', created_at)
```

**When timezone is unknown:** Default to UTC, disclose in summary: "Times shown in UTC. Adjust timezone in settings if needed."

## Fiscal Year Handling

**Detection signals:**
- Schema has `fiscal_year`, `fiscal_quarter`, `fiscal_period` columns
- Company in retail/education/government (common non-calendar fiscal years)

**When detected or asked:**
- Prompt: "What month does your fiscal year start?" 
- Store in session for duration of analysis

```sql
-- Fiscal year starting April 1
-- Fiscal Q1 = April, May, June
SELECT 
  CASE 
    WHEN MONTH(date) >= 4 THEN YEAR(date)
    ELSE YEAR(date) - 1
  END as fiscal_year,
  CASE
    WHEN MONTH(date) BETWEEN 4 AND 6 THEN 'Q1'
    WHEN MONTH(date) BETWEEN 7 AND 9 THEN 'Q2'
    WHEN MONTH(date) BETWEEN 10 AND 12 THEN 'Q3'
    ELSE 'Q4'
  END as fiscal_quarter
FROM orders;
```

## Date Gaps in Time Series

When data has gaps (no sales on weekends, holidays, etc.):

```sql
-- Generate complete date spine and LEFT JOIN actual data
WITH date_spine AS (
  SELECT generate_series(
    '2024-01-01'::date,
    '2024-12-31'::date,
    '1 day'::interval
  )::date as date
)
SELECT ds.date, COALESCE(SUM(o.amount), 0) as revenue
FROM date_spine ds
LEFT JOIN orders o ON ds.date = o.order_date::date
GROUP BY ds.date
ORDER BY ds.date;
```

**Note in summary when using date spine:** "Days with no data shown as $0. Remove this if gaps are meaningful."

## Comparing Periods of Different Lengths

**Example:** February (28 days) vs March (31 days)

```sql
-- Per-day normalization for fair comparison
SELECT 
  month,
  total_revenue,
  days_in_period,
  total_revenue / days_in_period as daily_avg_revenue
FROM (
  SELECT 
    DATE_TRUNC('month', order_date) as month,
    SUM(amount) as total_revenue,
    COUNT(DISTINCT DATE(order_date)) as days_in_period
  FROM orders
  GROUP BY DATE_TRUNC('month', order_date)
) monthly;
```

**Always note:** "February has 28 days vs March's 31 days. Showing both raw totals and daily averages for fair comparison."

---

## Examples

**Input:** "Show me last month's revenue" (run on April 18)
**Correct:** March 1 – March 31, 2026
**Wrong:** March 18 – April 17

**Input:** "Compare this year vs last year"
**Correct:** 
- This year = Jan 1, 2026 to Apr 18, 2026 (YTD)
- Last year = Jan 1, 2025 to Apr 18, 2025 (same period)
**Why:** Comparing full 2025 vs 4 months of 2026 is unfair. Match periods.

**Input:** "Show me daily orders for the last 30 days"
**Correct:** Generate date spine, LEFT JOIN to orders, show 0 for missing days.
