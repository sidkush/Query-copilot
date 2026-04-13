# Smart Twin + DataFusion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use ultraflow skills for building. Use taste/impeccable/emil-design-eng skills for frontend components.

**Goal:** Upgrade DuckDB twin from naive 1% random sampling to 3-layer data locality strategy (full local + smart sampling + materialized aggregates). Integrate Apache DataFusion as query planner for federated pushdown in LiveTier, replacing query_decomposer.py.

**Architecture:** `duckdb_twin.py` gains smart sampling via query pattern analysis + automatic aggregate table generation. New `datafusion_engine.py` wraps `datafusion-python` SessionContext with custom TableProviders for DuckDB twin and remote DBs. LiveTier delegates to DataFusion for parallel execution and federated pushdown. Feature-flagged with fallback to existing `query_decomposer.py`.

**Tech Stack:** datafusion (Python bindings), duckdb (existing), pyarrow (from Plan 1), sqlglot (existing)

**Spec:** `docs/superpowers/specs/2026-04-13-askdb-global-comp-design.md` — Phase 3

---

## File Structure

### New Files
- `backend/datafusion_engine.py` — DataFusion query planner + federated pushdown
- `backend/tests/test_smart_twin.py` — smart sampling + aggregates tests
- `backend/tests/test_datafusion_engine.py` — DataFusion integration tests

### Modified Files
- `backend/requirements.txt` — add datafusion
- `backend/config.py` — add SMART_TWIN_* and DATAFUSION_* flags
- `backend/duckdb_twin.py` — 3-layer sampling + materialized aggregates
- `backend/waterfall_router.py` — LiveTier delegates to DataFusion
- `backend/routers/connection_routes.py` — enhanced turbo status UI data
- `frontend/src/components/TurboStatusPanel.jsx` — enhanced twin management UI (NEW)

---

## Task 1: Add DataFusion Dependency

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add datafusion to requirements.txt**

```
datafusion>=43.0
```

- [ ] **Step 2: Install**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
pip install "datafusion>=43.0"
python -c "import datafusion; print(datafusion.__version__)"
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/requirements.txt
git commit -m "deps: add apache datafusion for query planning and federated pushdown"
```

---

## Task 2: Smart Twin Config Flags

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add config fields**

After `TURBO_TWIN_WARN_UNENCRYPTED` (line ~165):

```python
    # Smart Twin (Phase 3 — Global Comp)
    SMART_TWIN_FULL_COPY_THRESHOLD: int = Field(default=50_000, description="Tables below this row count are fully copied, not sampled")
    SMART_TWIN_AGGREGATE_ENABLED: bool = Field(default=True, description="Auto-generate aggregate tables in twin during sync")
    SMART_TWIN_PATTERN_AWARE: bool = Field(default=True, description="Use query patterns to bias sampling toward frequently-queried data")

    # DataFusion (Phase 3 — Global Comp)
    DATAFUSION_ENABLED: bool = Field(default=True, description="Use DataFusion for query optimization in LiveTier")
    DATAFUSION_TIMEOUT_MS: int = Field(default=5000, description="Per-provider timeout for DataFusion execution")
    DATAFUSION_FALLBACK_TO_DECOMPOSER: bool = Field(default=True, description="Fall back to query_decomposer.py if DataFusion fails")
```

- [ ] **Step 2: Verify**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "from config import settings; print(settings.SMART_TWIN_FULL_COPY_THRESHOLD, settings.DATAFUSION_ENABLED)"
```

Expected: `50000 True`

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/config.py
git commit -m "config: add Smart Twin and DataFusion feature flags"
```

---

## Task 3: Smart Twin — Full Copy for Small Tables

**Files:**
- Create: `backend/tests/test_smart_twin.py`
- Modify: `backend/duckdb_twin.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_smart_twin.py`:

```python
"""Tests for smart twin sampling strategy."""
import pytest
import duckdb
import tempfile
import os
from unittest.mock import MagicMock, patch


class TestSmartTwinSampling:
    def test_small_table_full_copy(self):
        """Tables below SMART_TWIN_FULL_COPY_THRESHOLD should be fully copied."""
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()

        # Mock schema_profile with a small table
        schema_profile = MagicMock()
        table_profile = MagicMock()
        table_profile.name = "countries"
        table_profile.row_count_estimate = 240
        table_profile.columns = [{"name": "id", "type": "INTEGER"}, {"name": "name", "type": "VARCHAR"}]
        schema_profile.tables = [table_profile]

        # Verify it generates SELECT * (no sampling) for small tables
        sql = twin._build_smart_sample_sql("countries", schema_profile, None)
        assert "TABLESAMPLE" not in sql
        assert "RANDOM" not in sql.upper()
        assert "RAND" not in sql.upper()
        assert "SELECT *" in sql or "SELECT " in sql
        # Should NOT have LIMIT when doing full copy
        assert "LIMIT" not in sql.upper() or "50000" not in sql

    def test_large_table_sampled(self):
        """Tables above threshold should use sampling."""
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()

        schema_profile = MagicMock()
        table_profile = MagicMock()
        table_profile.name = "orders"
        table_profile.row_count_estimate = 1_200_000
        table_profile.columns = [{"name": "id", "type": "INTEGER"}]
        schema_profile.tables = [table_profile]

        sql = twin._build_smart_sample_sql("orders", schema_profile, None)
        # Should have some form of sampling
        has_sampling = "TABLESAMPLE" in sql or "RANDOM" in sql.upper() or "RAND" in sql.upper() or "LIMIT" in sql.upper()
        assert has_sampling
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_smart_twin.py -v
```

Expected: FAIL — `_build_smart_sample_sql` doesn't exist yet or doesn't accept schema_profile

- [ ] **Step 3: Implement smart sampling in duckdb_twin.py**

Add new method `_build_smart_sample_sql()` to `DuckDBTwin` class. Read current `create_twin()` (lines 276-508) to understand existing sampling logic, then refactor:

```python
def _build_smart_sample_sql(self, table_name: str, schema_profile, query_patterns: dict = None) -> str:
    """Build sampling SQL based on table size and query patterns.
    
    Strategy:
    - Tables below SMART_TWIN_FULL_COPY_THRESHOLD: SELECT * (full copy)
    - Tables above: existing sampling (TABLESAMPLE or ORDER BY RANDOM)
    """
    from config import settings

    # Find table profile
    table_profile = None
    if schema_profile:
        for tp in schema_profile.tables:
            if tp.name == table_name:
                table_profile = tp
                break

    row_count = table_profile.row_count_estimate if table_profile else -1

    # Layer 1: Full copy for small tables
    if 0 < row_count <= settings.SMART_TWIN_FULL_COPY_THRESHOLD:
        return f'SELECT * FROM "{table_name}"'

    # Layer 2: Existing sampling logic for large tables
    # (keep existing _build_sample_sql logic here)
    return self._build_sample_sql(table_name, schema_profile)
```

Modify `create_twin()` to call `_build_smart_sample_sql()` instead of `_build_sample_sql()`.

- [ ] **Step 4: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_smart_twin.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/duckdb_twin.py backend/tests/test_smart_twin.py
git commit -m "feat: smart twin — full copy for tables below 50K rows"
```

---

## Task 4: Smart Twin — Materialized Aggregates

**Files:**
- Modify: `backend/duckdb_twin.py`
- Modify: `backend/tests/test_smart_twin.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_smart_twin.py`:

```python
    def test_materialized_aggregates_created(self):
        """Twin sync should auto-generate aggregate tables for date columns."""
        from duckdb_twin import DuckDBTwin
        twin = DuckDBTwin()

        agg_sqls = twin._build_aggregate_sqls("orders", [
            {"name": "id", "type": "INTEGER"},
            {"name": "total", "type": "DOUBLE"},
            {"name": "created_at", "type": "TIMESTAMP"},
            {"name": "category", "type": "VARCHAR"},
        ])
        assert len(agg_sqls) > 0
        # Should have at least a daily aggregate
        daily = [s for s in agg_sqls if "daily" in s["name"]]
        assert len(daily) > 0
        assert "date_trunc" in daily[0]["sql"].lower() or "DATE_TRUNC" in daily[0]["sql"]
```

- [ ] **Step 2: Implement _build_aggregate_sqls**

Add to `DuckDBTwin` class in `duckdb_twin.py`:

```python
def _build_aggregate_sqls(self, table_name: str, columns: list) -> list:
    """Generate aggregate table creation SQL for a table.
    
    Creates daily aggregate tables for tables with date/timestamp columns
    and numeric columns suitable for SUM/COUNT/AVG.
    """
    from config import settings
    if not settings.SMART_TWIN_AGGREGATE_ENABLED:
        return []

    date_cols = [c for c in columns if any(t in c["type"].upper() for t in ["DATE", "TIMESTAMP", "DATETIME"])]
    numeric_cols = [c for c in columns if any(t in c["type"].upper() for t in ["INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL"])]

    if not date_cols or not numeric_cols:
        return []

    aggregates = []
    date_col = date_cols[0]["name"]  # Use first date column

    agg_expressions = []
    for nc in numeric_cols[:5]:  # Cap at 5 numeric columns
        col = nc["name"]
        agg_expressions.append(f'COUNT("{col}") AS "{col}_count"')
        agg_expressions.append(f'SUM("{col}") AS "{col}_sum"')
        agg_expressions.append(f'AVG("{col}") AS "{col}_avg"')

    agg_str = ", ".join(agg_expressions)

    aggregates.append({
        "name": f"_agg_{table_name}_daily",
        "sql": f'''CREATE TABLE IF NOT EXISTS "_agg_{table_name}_daily" AS
            SELECT DATE_TRUNC('day', "{date_col}") AS day, COUNT(*) AS row_count, {agg_str}
            FROM "{table_name}" GROUP BY 1''',
    })

    return aggregates
```

Call `_build_aggregate_sqls()` in `create_twin()` after all tables are synced, and execute each aggregate SQL on the twin DuckDB connection.

- [ ] **Step 3: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_smart_twin.py -v
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/duckdb_twin.py backend/tests/test_smart_twin.py
git commit -m "feat: smart twin — auto-generate materialized aggregate tables"
```

---

## Task 5: DataFusion Engine Module

**Files:**
- Create: `backend/datafusion_engine.py`
- Create: `backend/tests/test_datafusion_engine.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_datafusion_engine.py`:

```python
"""Tests for DataFusion query planner."""
import pytest
import pyarrow as pa
import duckdb
import tempfile
import os


class TestDataFusionEngine:
    def test_register_and_query_arrow_table(self):
        """Register an Arrow table and query it via DataFusion."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        batch = pa.RecordBatch.from_pydict({
            "id": [1, 2, 3],
            "region": ["NA", "EU", "APAC"],
            "revenue": [1000.0, 2000.0, 1500.0],
        })
        table = pa.Table.from_batches([batch])

        engine.register_arrow_table("sales", table)
        result = engine.execute_sql("SELECT region, revenue FROM sales WHERE revenue > 1200 ORDER BY revenue DESC")

        assert isinstance(result, pa.RecordBatch)
        assert result.num_rows == 2
        regions = result.column("region").to_pylist()
        assert regions == ["EU", "APAC"]

    def test_register_duckdb_twin(self):
        """Register a DuckDB file as a DataFusion table source."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        # Create a temp DuckDB with test data
        tmp = tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False)
        tmp.close()
        try:
            con = duckdb.connect(tmp.name)
            con.execute("CREATE TABLE products (id INT, name VARCHAR, price DOUBLE)")
            con.execute("INSERT INTO products VALUES (1, 'Widget', 9.99), (2, 'Gadget', 19.99)")
            con.close()

            engine.register_duckdb_twin("test_conn", tmp.name)
            result = engine.execute_sql("SELECT name, price FROM products WHERE price > 10")

            assert isinstance(result, pa.RecordBatch)
            assert result.num_rows == 1
            assert result.column("name").to_pylist() == ["Gadget"]
        finally:
            os.unlink(tmp.name)

    def test_plan_query_returns_plan_info(self):
        """plan_query should return optimization info without executing."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        batch = pa.RecordBatch.from_pydict({"x": [1, 2, 3], "y": [10, 20, 30]})
        engine.register_arrow_table("test", pa.Table.from_batches([batch]))

        plan = engine.plan_query("SELECT x, SUM(y) FROM test GROUP BY x")
        assert plan is not None
        assert "optimizable" in plan or hasattr(plan, "is_optimizable")

    def test_fallback_on_invalid_sql(self):
        """Invalid SQL should return None plan, not crash."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        plan = engine.plan_query("SELCT INVALID SYNTAX FROM nowhere")
        assert plan is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_datafusion_engine.py -v
```

- [ ] **Step 3: Implement datafusion_engine.py**

Create `backend/datafusion_engine.py`:

```python
"""DataFusion Query Planner — federated pushdown and parallel execution.

Replaces query_decomposer.py for query optimization. Does NOT replace
waterfall routing. Feature-flagged via DATAFUSION_ENABLED.
"""
from typing import Optional, Dict, Any
from dataclasses import dataclass
import logging

import pyarrow as pa

logger = logging.getLogger(__name__)


@dataclass
class QueryPlan:
    """Result of DataFusion query planning."""
    is_optimizable: bool
    plan_str: str
    estimated_rows: Optional[int] = None
    strategy: str = "local"  # "local", "pushdown", "hybrid"


class DataFusionEngine:
    """DataFusion-based query planner with DuckDB twin and remote DB support."""

    def __init__(self):
        import datafusion
        self.ctx = datafusion.SessionContext()
        self._registered_tables = set()

    def register_arrow_table(self, name: str, table: pa.Table):
        """Register an Arrow table as a DataFusion table source."""
        self.ctx.register_record_batches(name, [table.to_batches()])
        self._registered_tables.add(name)

    def register_duckdb_twin(self, conn_id: str, twin_path: str):
        """Register all tables from a DuckDB twin file as DataFusion sources."""
        import duckdb
        con = duckdb.connect(twin_path, read_only=True)
        try:
            tables = con.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_name NOT LIKE '\\_%' ESCAPE '\\'").fetchall()
            for (table_name,) in tables:
                arrow_table = con.execute(f'SELECT * FROM "{table_name}"').fetch_arrow_table()
                self.register_arrow_table(table_name, arrow_table)
        finally:
            con.close()

    def plan_query(self, sql: str) -> Optional[QueryPlan]:
        """Build an optimized query plan without executing.
        
        Returns None if SQL is invalid or planning fails.
        """
        try:
            df = self.ctx.sql(sql)
            logical_plan = df.logical_plan()
            plan_str = str(logical_plan)

            return QueryPlan(
                is_optimizable=True,
                plan_str=plan_str,
                strategy="local",
            )
        except Exception as e:
            logger.debug(f"DataFusion plan failed: {e}")
            return None

    def execute_sql(self, sql: str) -> Optional[pa.RecordBatch]:
        """Execute SQL via DataFusion, return Arrow RecordBatch."""
        try:
            df = self.ctx.sql(sql)
            batches = df.collect()
            if not batches:
                return pa.RecordBatch.from_pydict({})
            table = pa.Table.from_batches(batches)
            all_batches = table.to_batches()
            if not all_batches:
                return pa.RecordBatch.from_pydict({})
            if len(all_batches) == 1:
                return all_batches[0]
            return pa.Table.from_batches(all_batches).to_batches()[0]
        except Exception as e:
            logger.error(f"DataFusion execute failed: {e}")
            return None

    def reset(self):
        """Clear all registered tables. Create fresh context."""
        import datafusion
        self.ctx = datafusion.SessionContext()
        self._registered_tables.clear()
```

- [ ] **Step 4: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_datafusion_engine.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/datafusion_engine.py backend/tests/test_datafusion_engine.py
git commit -m "feat: add DataFusion engine — query planning, Arrow table registration, SQL execution"
```

---

## Task 6: LiveTier DataFusion Integration

**Files:**
- Modify: `backend/waterfall_router.py`

- [ ] **Step 1: Add DataFusion path to LiveTier._answer()**

Read current `LiveTier._answer()` (line ~547). Add DataFusion path before existing agent fallback:

```python
async def _answer(self, question, sql, conn_id, schema_profile=None, **kwargs):
    from config import settings

    # DataFusion path
    if settings.DATAFUSION_ENABLED and sql:
        try:
            from datafusion_engine import DataFusionEngine
            df_engine = DataFusionEngine()

            # Register twin if exists
            twin_path = os.path.join(settings.TURBO_TWIN_DIR, f"{conn_id}.duckdb")
            if os.path.exists(twin_path):
                df_engine.register_duckdb_twin(conn_id, twin_path)

            plan = df_engine.plan_query(sql)
            if plan and plan.is_optimizable:
                result = df_engine.execute_sql(sql)
                if result is not None and result.num_rows > 0:
                    return TierResult(
                        hit=True,
                        tier_name="datafusion",
                        data={
                            "record_batch": result,
                            "columns": [f.name for f in result.schema],
                            "rows": None,
                            "answer": "",
                            "confidence": 0.85,
                            "source": "datafusion_local",
                        },
                        metadata={
                            "strategy": plan.strategy,
                            "plan": plan.plan_str[:200],
                        },
                    )
        except Exception as e:
            logger.warning(f"DataFusion failed for {conn_id}, falling back: {e}")
            if not settings.DATAFUSION_FALLBACK_TO_DECOMPOSER:
                raise

    # Existing fallback — return hit=True with empty answer (signal to agent)
    return TierResult(hit=True, tier_name="live", data={"answer": ""})
```

- [ ] **Step 2: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/waterfall_router.py
git commit -m "feat: LiveTier delegates to DataFusion for local twin queries"
```

---

## Task 7: Enhanced Turbo Status API + Frontend

**Files:**
- Modify: `backend/routers/connection_routes.py`
- Create: `frontend/src/components/TurboStatusPanel.jsx`

> **REQUIRED:** Invoke taste or impeccable skill for frontend.

- [ ] **Step 1: Enhance turbo_status endpoint**

In `connection_routes.py`, find `turbo_status()` (line ~828). Add query coverage estimate and per-table breakdown:

```python
# In turbo_status response, add:
twin_info = _duckdb_twin.get_twin_info(conn_id)
if twin_info and twin_info.get("exists"):
    tables_detail = []
    for table in twin_info.get("tables", []):
        # Find row count from schema_profile
        table_rows = schema_profile.get_table_rows(table) if schema_profile else None
        twin_rows = twin_info.get("table_rows", {}).get(table)
        strategy = "Full copy" if twin_rows == table_rows else "Smart sample"
        tables_detail.append({
            "name": table,
            "source_rows": table_rows,
            "twin_rows": twin_rows,
            "strategy": strategy,
        })
    twin_info["tables_detail"] = tables_detail
    twin_info["aggregate_count"] = len([t for t in twin_info.get("tables", []) if t.startswith("_agg_")])
```

- [ ] **Step 2: Create TurboStatusPanel.jsx**

```jsx
import { TOKENS } from './dashboard/tokens';

export default function TurboStatusPanel({ status, onRefresh, onDisable }) {
  if (!status?.enabled) return null;
  const { twin_info } = status;
  if (!twin_info?.exists) return null;

  const tables = twin_info.tables_detail || [];
  const aggCount = twin_info.aggregate_count || 0;
  const sizeMb = twin_info.size_mb?.toFixed(1) || '?';
  const maxMb = 500;

  return (
    <div style={{ borderRadius: TOKENS.radius.md, border: `1px solid ${TOKENS.text}10`, padding: 14 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Turbo Mode</span>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="text-xs" style={{ color: TOKENS.accent }}>Refresh</button>
          <button onClick={onDisable} className="text-xs" style={{ color: TOKENS.colors.danger }}>Disable</button>
        </div>
      </div>

      {/* Table breakdown */}
      <table className="w-full text-xs mb-3">
        <thead>
          <tr style={{ borderBottom: `1px solid ${TOKENS.text}10` }}>
            <th className="text-left py-1">Table</th>
            <th className="text-right py-1">Source</th>
            <th className="text-right py-1">In Twin</th>
            <th className="text-right py-1">Strategy</th>
          </tr>
        </thead>
        <tbody>
          {tables.filter(t => !t.name.startsWith('_')).map(t => (
            <tr key={t.name} style={{ borderBottom: `1px solid ${TOKENS.text}06` }}>
              <td className="py-1">{t.name}</td>
              <td className="text-right" style={{ color: `${TOKENS.text}60` }}>{t.source_rows?.toLocaleString() || '?'}</td>
              <td className="text-right">{t.twin_rows?.toLocaleString() || '?'}</td>
              <td className="text-right" style={{ color: t.strategy === 'Full copy' ? TOKENS.colors.success : TOKENS.accent }}>{t.strategy}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs" style={{ color: `${TOKENS.text}60` }}>
        <span>{aggCount} aggregates · {sizeMb}MB / {maxMb}MB</span>
        <span>Synced {twin_info.last_sync || 'unknown'}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + lint**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build && npm run lint
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/routers/connection_routes.py frontend/src/components/TurboStatusPanel.jsx
git commit -m "feat: enhanced turbo status with per-table breakdown + TurboStatusPanel UI"
```

---

## Task 8: Full Test Suite + Push

- [ ] **Step 1: Run all backend tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 2: Build frontend**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build
```

- [ ] **Step 3: Push**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git push origin askdb-global-comp
```
