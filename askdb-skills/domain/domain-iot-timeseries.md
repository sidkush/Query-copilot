# Domain: IoT & Time Series Analytics — AskDB AgentEngine

## Auto-Detection Signals

Apply this skill when schema contains:
- `sensor_id`, `device_id`, `device_name`, `thing_id`
- `reading`, `measurement`, `telemetry`, `metric_value`
- `timestamp` with high frequency (many rows per device per day)
- Tables like `sensor_readings`, `telemetry`, `events`, `metrics`, `traces`
- Row counts > 100M (strong IoT signal)

## Key Characteristics of IoT Data

| Property | Implication |
|----------|-------------|
| High frequency (seconds/minutes) | Always downsample before rendering |
| Irregular intervals | Use ASOF JOIN for nearest-match lookups |
| Many NULLs (sensor offline) | Use date spine + COALESCE(value, 0) or leave NULL |
| Device hierarchies (site → device → sensor) | Self-join or hierarchy table |
| Late-arriving data | Queries on "last hour" may miss recent readings |
| Schema-on-read (wide rows) | UNPIVOT or EAV pattern required |

## Downsampling Strategy

**Rule:** Never render raw IoT data at full resolution. Use LTTB or statistical downsampling.

```sql
-- Method 1: LTTB via NTILE bucketing (works in any SQL engine)
WITH bucketed AS (
  SELECT
    timestamp,
    value,
    NTILE(1000) OVER (ORDER BY timestamp) as bucket  -- 1000 points target
  FROM sensor_readings
  WHERE sensor_id = 'SENSOR_001'
    AND timestamp >= NOW() - INTERVAL '24 hours'
),
representative AS (
  SELECT
    bucket,
    AVG(timestamp) as ts,
    AVG(value) as avg_val,
    MIN(value) as min_val,
    MAX(value) as max_val,
    COUNT(*) as sample_count
  FROM bucketed
  GROUP BY bucket
)
SELECT ts, avg_val, min_val, max_val FROM representative ORDER BY ts;

-- Method 2: DuckDB native LTTB (when on TurboTier)
-- DuckDB's time_bucket + aggregation (TimescaleDB-style)
SELECT
  time_bucket(INTERVAL '5 minutes', timestamp) as bucket,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value
FROM sensor_readings
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY bucket
ORDER BY bucket;

-- Method 3: Every Nth row (fast approximation)
SELECT timestamp, value
FROM (
  SELECT timestamp, value,
    ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
    COUNT(*) OVER () as total
  FROM sensor_readings WHERE sensor_id = 'SENSOR_001'
) t
WHERE rn % GREATEST(1, total / 1000) = 0  -- Keep ~1000 evenly spaced points
ORDER BY timestamp;
```

## ASOF JOIN — Nearest-Match Lookup

IoT queries frequently need to join a reading to the most recent calibration, config, or label:

```sql
-- DuckDB ASOF JOIN (native, most efficient)
SELECT r.timestamp, r.sensor_id, r.value, c.calibration_factor,
  r.value * c.calibration_factor as calibrated_value
FROM sensor_readings r
ASOF JOIN calibrations c
  ON r.sensor_id = c.sensor_id
  AND r.timestamp >= c.effective_from
ORDER BY r.timestamp;

-- Standard SQL equivalent (for non-DuckDB engines)
SELECT r.timestamp, r.sensor_id, r.value,
  c.calibration_factor,
  r.value * c.calibration_factor as calibrated_value
FROM sensor_readings r
JOIN LATERAL (
  SELECT calibration_factor
  FROM calibrations c
  WHERE c.sensor_id = r.sensor_id
    AND c.effective_from <= r.timestamp
  ORDER BY c.effective_from DESC
  LIMIT 1
) c ON TRUE;
```

## Gap Detection and Filling

Sensors go offline. Gaps in data are meaningful.

```sql
-- Detect gaps > expected_interval
WITH reading_gaps AS (
  SELECT
    sensor_id,
    timestamp,
    LAG(timestamp) OVER (PARTITION BY sensor_id ORDER BY timestamp) as prev_timestamp,
    DATEDIFF('minute',
      LAG(timestamp) OVER (PARTITION BY sensor_id ORDER BY timestamp),
      timestamp
    ) as gap_minutes
  FROM sensor_readings
)
SELECT sensor_id, prev_timestamp as gap_start, timestamp as gap_end, gap_minutes
FROM reading_gaps
WHERE gap_minutes > 5  -- Flag gaps > 5 minutes for 1-minute sensor
ORDER BY gap_minutes DESC;

-- Fill gaps with NULL (for charting — shows breaks in line)
WITH date_spine AS (
  SELECT generate_series(
    '2024-01-01'::timestamp,
    '2024-01-02'::timestamp,
    '1 minute'::interval
  ) as minute
)
SELECT ds.minute, sr.value  -- NULL where no reading
FROM date_spine ds
LEFT JOIN sensor_readings sr
  ON sr.sensor_id = 'SENSOR_001'
  AND DATE_TRUNC('minute', sr.timestamp) = ds.minute
ORDER BY ds.minute;
```

## Anomaly Detection Patterns

```sql
-- Z-score based anomaly detection
WITH stats AS (
  SELECT sensor_id,
    AVG(value) as mean_val,
    STDDEV(value) as stddev_val
  FROM sensor_readings
  WHERE timestamp >= NOW() - INTERVAL '7 days'
  GROUP BY sensor_id
)
SELECT r.timestamp, r.sensor_id, r.value,
  (r.value - s.mean_val) / NULLIF(s.stddev_val, 0) as z_score,
  CASE
    WHEN ABS((r.value - s.mean_val) / NULLIF(s.stddev_val, 0)) > 3 THEN 'ANOMALY'
    WHEN ABS((r.value - s.mean_val) / NULLIF(s.stddev_val, 0)) > 2 THEN 'WARNING'
    ELSE 'NORMAL'
  END as status
FROM sensor_readings r
JOIN stats s ON r.sensor_id = s.sensor_id
WHERE r.timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY ABS((r.value - s.mean_val) / NULLIF(s.stddev_val, 0)) DESC;

-- Rolling Z-score (local anomalies within trend)
SELECT timestamp, sensor_id, value,
  (value - AVG(value) OVER w) / NULLIF(STDDEV(value) OVER w, 0) as local_z_score
FROM sensor_readings
WINDOW w AS (
  PARTITION BY sensor_id
  ORDER BY timestamp
  ROWS BETWEEN 100 PRECEDING AND CURRENT ROW
)
WHERE timestamp >= NOW() - INTERVAL '24 hours';
```

## Device Hierarchy Queries

```sql
-- Site → Gateway → Device → Sensor hierarchy
WITH RECURSIVE device_tree AS (
  -- Root: Sites
  SELECT id, name, parent_id, 'site' as level, 0 as depth
  FROM devices WHERE parent_id IS NULL

  UNION ALL

  -- Recursive: children
  SELECT d.id, d.name, d.parent_id,
    CASE d.type WHEN 'gateway' THEN 'gateway'
                WHEN 'device' THEN 'device'
                ELSE 'sensor' END,
    dt.depth + 1
  FROM devices d
  JOIN device_tree dt ON d.parent_id = dt.id
)
SELECT dt.*, COUNT(r.id) as reading_count_last_hour
FROM device_tree dt
LEFT JOIN sensor_readings r
  ON r.device_id = dt.id
  AND r.timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY dt.id, dt.name, dt.parent_id, dt.level, dt.depth
ORDER BY dt.depth, dt.name;
```

## Chart Defaults for IoT Domain

| Metric | Chart type | Notes |
|--------|----------|-------|
| Sensor value over time | Line chart | Always downsample first |
| Multi-sensor comparison | Multi-line | Max 6 sensors per chart |
| Device health status | Status heatmap | Device × time grid |
| Anomaly distribution | Scatter | Z-score vs time |
| Throughput/rate | Area chart | Events per minute |
| Gap analysis | Timeline/Gantt | Online/offline periods |
| Histogram of values | Histogram | Distribution across readings |

## Performance Considerations

**Critical rules for IoT data at scale:**

1. **Always filter by time range first** — IoT tables partition by time
2. **Always filter by device/sensor** before aggregating across all
3. **Use APPROX functions** at > 100M rows (`APPROX_COUNT_DISTINCT`, `APPROX_QUANTILES`)
4. **Route to DataFusion** for queries across > 10M rows on live data
5. **TurboTier twin** should be pre-downsampled (daily/hourly aggregates) — not raw readings

**Summary note for IoT charts:** Always include: "Showing [N]-minute averages of [M] raw readings."

---

## Examples

**Input:** "Show me temperature readings for sensor 42 today"
**Action:**
1. Detect: 86,400+ rows (1 per second × 24 hours). Must downsample.
2. Apply 5-minute bucketing → 288 points
3. Show: avg_temp per 5-minute bucket + min/max as shaded band
4. Summary: "Showing 5-minute averages of 86,400 raw readings. Peak: 78.4°F at 2:15 PM."

**Input:** "Which sensors went offline today?"
**Action:**
1. Detect expected interval from schema (or ask)
2. Run gap detection query
3. Show: Gantt-style timeline chart — green = online, red = offline
4. Summary: "3 sensors had offline gaps today. SENSOR_007 was offline for 2h 14m (longest gap)."
