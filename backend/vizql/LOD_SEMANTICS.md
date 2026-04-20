# LOD Semantics — FIXED / INCLUDE / EXCLUDE

**Plan 8b — shipped 2026-04-20.** Canonical reference: `docs/Build_Tableau.md`
§V.2 (LOD semantics) + §IV.7 (filter order-of-ops) + §XIX.1 (anti-patterns).
Appendix E.2 captures the one-line fact: **"FIXED LOD = correlated subquery;
INCLUDE / EXCLUDE = window."**

---

## The 9-stage filter order — where each LOD kind lands

```
  User query
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 1. Extract filters        — baked into the extract               │
│ 2. Data Source filters    — WHERE on every query against DS      │
│ 3. Context filters        — CTE wrapping the plan                │  <── Promote a dim filter here
│ 4. FIXED LOD expressions  — correlated subquery against (1-3)    │      to narrow FIXED LODs.
│ 5. Dimension filters      — outer WHERE                          │
│ 6. INCLUDE / EXCLUDE LOD  — window / OVER                        │
│ 7. Measure filters        — HAVING                               │
│ 8. Table calc filters     — client-side, post-fetch              │
│ 9. Totals                 — separate query                       │
└──────────────────────────────────────────────────────────────────┘
```

**Immediate consequence (§IV.7):** a dimension filter at step 5 does **NOT**
filter a FIXED LOD at step 4 — unless you promote the filter to Context
(step 3). `context_filter_helper.should_promote_to_context` detects this
trap and emits a hint.

---

## FIXED — correlated subquery

```
{FIXED [Region] : SUM([Sales])}
   in viz grouped by Region + City
```

**Compilation (`lod_compiler._compile_fixed`):**

- Inner: `SELECT Region, SUM(Sales) AS _lod_val FROM t GROUP BY Region`
- Outer: correlated on `(Region, Region)` (fixed dim ∩ viz granularity)
- Placed at stage 4.

**DuckDB SQL (golden):**

```sql
SELECT
  t.Region,
  t.City,
  SUM(t.Sales) AS sum_sales,
  (SELECT _lod_val
     FROM (SELECT t_inner.Region AS Region,
                  SUM(t_inner.Sales) AS _lod_val
             FROM t AS t_inner
             GROUP BY t_inner.Region)
     WHERE Region = t.Region) AS region_total
FROM t
GROUP BY t.Region, t.City;
```

**Snowflake / PostgreSQL:** identical shape (both support correlated
subqueries). **MSSQL:** wrap in APPLY if the planner chokes on nested
correlation; handled in Plan 7d dialect emitter.

**Anti-pattern (§XIX.1 #1):** FIXED on a high-cardinality dim (e.g.
`[TransactionID]`). Correlated subquery produces one row per distinct value
and blows up. `lod_analyzer.analyze_fixed_lod` warns when the estimated
Cartesian product exceeds `LOD_WARN_THRESHOLD_ROWS` (default 1 000 000).
Never blocks — observation-only. Tableau's `ExtractLODValidator` does the
same class of check.

---

## INCLUDE — window OVER (viz_granularity ∪ include_dims)

```
{INCLUDE [Product] : AVG([Profit])}
   in viz grouped by Region
```

**Compilation (`lod_compiler._compile_include`):**

- `partition_by = sorted(viz) ∪ include_dims`   (deterministic: viz first,
  sorted; then include_dims in source order).
- `expr = AVG(Profit)`
- Placed at stage 6.

**DuckDB SQL:**

```sql
SELECT
  t.Region,
  AVG(t.Profit) OVER (PARTITION BY t.Region, t.Product) AS avg_profit_by_region_product
FROM t;
```

---

## EXCLUDE — window OVER (viz_granularity \ exclude_dims)

```
{EXCLUDE [Region] : SUM([Sales])}
   in viz grouped by Region + City
```

**Compilation (`lod_compiler._compile_exclude`):**

- `partition_by = sorted(viz) \ exclude_dims`.
- Placed at stage 6.

**DuckDB SQL:**

```sql
SELECT
  t.Region,
  t.City,
  SUM(t.Sales) OVER (PARTITION BY t.City) AS city_total_sales
FROM t;
```

**No-op warning.** If `viz ∩ exclude_dims = ∅`, the EXCLUDE is a no-op —
the partition_by is unchanged from the viz granularity. We still emit the
window, but attach a `warnings` entry telling the author to drop the
EXCLUDE or change viz dims.

---

## JoinLODOverrides

Per-viz override set. Each entry is a `LodCalculation.id` whose compiled
partition_by was hand-edited by the author (for example: INCLUDE a dim that
Tableau would normally auto-compute out). Serialised on `VisualSpec
.join_lod_overrides: repeated string`. `filter_ordering.place_lod_in_order`
skips any LOD whose id is in the override list — the caller has already
spliced that LOD into the plan manually.

---

## See also

- `backend/vizql/lod_compiler.py` — compilation.
- `backend/vizql/lod_analyzer.py` — cost / warning.
- `backend/vizql/context_filter_helper.py` — promote-to-context hint.
- `backend/vizql/filter_ordering.py` — `place_lod_in_order`.
- `docs/Build_Tableau.md` §IV.7, §IV.8, §V.2, §V.4, §XIX.1, §XXV.3, Appendix E.2.
