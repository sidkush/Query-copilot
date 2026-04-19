# Domain: HR Analytics — AskDB AgentEngine

## Auto-Detection Signals
Tables/columns: `employees`, `headcount`, `departments`, `positions`, `compensation`, `tenure`, `hire_date`, `termination_date`, `performance_rating`, `manager_id`

## PII Sensitivity — Extra Rules for HR Data

HR data contains sensitive PII. Apply enhanced masking:
- `salary`, `compensation`, `pay_rate` → Aggregate only, never individual values unless user is HR admin
- `performance_rating` → Aggregate or anonymize
- `medical_leave`, `disability` → Never surface in charts without explicit permission
- Always aggregate to team/department level minimum unless individual view is explicitly requested

## Core HR Metrics

```sql
-- Headcount (point-in-time)
SELECT DATE_TRUNC('month', date_point) as month,
  COUNT(DISTINCT CASE WHEN hire_date <= date_point AND (termination_date IS NULL OR termination_date > date_point) THEN employee_id END) as headcount
FROM employees, generate_series('2024-01-01', CURRENT_DATE, '1 month') as date_point
GROUP BY month ORDER BY month;

-- Attrition Rate (annualized)
SELECT 
  COUNT(CASE WHEN termination_date BETWEEN period_start AND period_end THEN 1 END) * 100.0 / 
    NULLIF(AVG_headcount, 0) * (12 / months_in_period) as annualized_attrition_rate
FROM hr_summary;

-- Tenure Distribution
SELECT 
  FLOOR(DATEDIFF(COALESCE(termination_date, CURRENT_DATE), hire_date) / 365) as tenure_years,
  COUNT(*) as employee_count
FROM employees
WHERE status = 'active'
GROUP BY tenure_years ORDER BY tenure_years;

-- Org Hierarchy Depth
WITH RECURSIVE org AS (
  SELECT id, name, manager_id, 1 as depth
  FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.manager_id, o.depth + 1
  FROM employees e JOIN org o ON e.manager_id = o.id
)
SELECT name, depth FROM org ORDER BY depth;

-- Compensation Band Analysis (anonymized)
SELECT department, job_level,
  MIN(salary) as min_comp, MAX(salary) as max_comp,
  AVG(salary) as avg_comp, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) as median_comp,
  COUNT(*) as headcount
FROM employees WHERE status = 'active'
GROUP BY department, job_level;
```

## Chart Defaults

| Metric | Chart type |
|--------|----------|
| Headcount over time | Line chart |
| Attrition by department | Horizontal bar |
| Tenure distribution | Histogram |
| Headcount by level | Horizontal bar |
| New hires vs departures | Grouped bar |

---

# Domain: Operations Analytics — AskDB AgentEngine

## Auto-Detection Signals
Tables/columns: `incidents`, `tickets`, `uptime`, `latency`, `throughput`, `inventory`, `fulfillment`, `sla`, `queue_depth`, `response_time`

## Core Operations Metrics

```sql
-- Uptime Calculation
WITH service_events AS (
  SELECT service_name, event_type, started_at, ended_at,
    DATEDIFF('minute', started_at, COALESCE(ended_at, CURRENT_TIMESTAMP)) as duration_minutes
  FROM incidents
)
SELECT service_name,
  SUM(CASE WHEN event_type = 'outage' THEN duration_minutes ELSE 0 END) as downtime_minutes,
  (period_total_minutes - SUM(CASE WHEN event_type = 'outage' THEN duration_minutes ELSE 0 END)) * 100.0 / 
    NULLIF(period_total_minutes, 0) as uptime_pct
FROM service_events
CROSS JOIN (SELECT 43200 as period_total_minutes) period  -- 30 days in minutes
GROUP BY service_name;

-- MTTR (Mean Time to Resolve)
SELECT service_name,
  AVG(DATEDIFF('minute', started_at, resolved_at)) as mttr_minutes,
  COUNT(*) as incident_count
FROM incidents WHERE resolved_at IS NOT NULL
GROUP BY service_name ORDER BY mttr_minutes DESC;

-- P95 Latency (SLA monitoring)
SELECT DATE_TRUNC('hour', timestamp) as hour,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
  AVG(latency_ms) as avg_latency,
  COUNT(*) as request_count
FROM api_logs GROUP BY hour ORDER BY hour;

-- Queue Depth Over Time
SELECT DATE_TRUNC('minute', measured_at) as minute,
  AVG(queue_depth) as avg_depth, MAX(queue_depth) as peak_depth
FROM queue_metrics GROUP BY minute ORDER BY minute;

-- Fulfillment SLA Compliance
SELECT 
  COUNT(CASE WHEN fulfilled_at <= promised_at THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) as sla_compliance_pct,
  AVG(DATEDIFF('hour', created_at, fulfilled_at)) as avg_fulfillment_hours,
  COUNT(CASE WHEN fulfilled_at > promised_at THEN 1 END) as sla_breaches
FROM orders WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY);
```

## LiveOps Chart Defaults

| Metric | Chart type | Notes |
|--------|----------|-------|
| Latency P95 over time | Line chart | Reference line at SLA threshold |
| Error rate | Area chart | Red fill above threshold |
| Queue depth | Area chart | Warning zone highlighted |
| Uptime by service | Horizontal bar | Green/red status coding |
| Incident frequency | Bar chart | By severity and service |
| MTTR trend | Line chart | Goal line overlay |

## Alert Thresholds (Auto-Annotate on Charts)

Automatically add reference lines when these patterns are detected:
- Column named `sla_threshold`, `target`, `goal`, `limit` → add horizontal reference line
- Column named `p95_threshold` → highlight violations in red
- Uptime < 99.9% → flag in chart summary as SLA breach
