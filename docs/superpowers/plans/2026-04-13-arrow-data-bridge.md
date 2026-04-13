# Arrow Data Bridge + Performance UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use ultraflow skills for building. Use taste/impeccable/emil-design-eng skills for frontend components.

**Goal:** Add zero-copy Apache Arrow data bridge between DuckDB, Polars, and the waterfall pipeline, eliminating Python list/dict serialization overhead. Add performance visibility UI.

**Architecture:** New `arrow_bridge.py` module handles all Arrow ↔ DuckDB ↔ Polars ↔ pandas conversions. `TierResult` evolves to carry Arrow RecordBatches internally, serializing to JSON only at API boundary. PII masking gains an Arrow-native path. Performance pill shows tier + latency on every query result.

**Tech Stack:** pyarrow, polars, duckdb (existing), pandas (existing, legacy compat)

**Spec:** `docs/superpowers/specs/2026-04-13-askdb-global-comp-design.md` — Phase 1

---

## File Structure

### New Files
- `backend/arrow_bridge.py` — Arrow ↔ DuckDB ↔ Polars ↔ pandas conversion utilities
- `backend/tests/test_arrow_bridge.py` — Arrow bridge tests
- `backend/tests/test_pii_arrow.py` — PII masking on Arrow RecordBatch tests
- `frontend/src/components/PerformancePill.jsx` — query latency + tier badge component

### Modified Files
- `backend/requirements.txt` — add pyarrow, polars
- `backend/config.py` — add ARROW_BRIDGE_ENABLED, PERFORMANCE_TRACKING_ENABLED flags
- `backend/pii_masking.py` — add `mask_record_batch()` function
- `backend/duckdb_twin.py` — `query_twin()` returns Arrow RecordBatch via `fetch_arrow_table()`
- `backend/waterfall_router.py` — `TierResult.data` carries `record_batch` field, `BaseTier._apply_masking()` calls Arrow masking path
- `backend/routers/query_routes.py` — serialize Arrow to JSON at API boundary
- `backend/routers/agent_routes.py` — serialize Arrow to JSON for SSE streaming
- `backend/agent_engine.py` — `_tool_run_sql()` returns Arrow-backed results
- `frontend/src/components/agent/AgentStepFeed.jsx` — render PerformancePill on result steps
- `frontend/src/store.js` — add `performanceMetrics` slice

---

## Task 1: Add Dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add pyarrow and polars to requirements.txt**

Open `backend/requirements.txt` and add after the `pandas>=2.2` line:

```
pyarrow>=15.0
polars>=1.0
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
pip install pyarrow>=15.0 polars>=1.0
```

Expected: Both install successfully. Verify with:
```bash
python -c "import pyarrow; print(pyarrow.__version__); import polars; print(polars.__version__)"
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/requirements.txt
git commit -m "deps: add pyarrow and polars for Arrow data bridge"
```

---

## Task 2: Arrow Bridge Module

**Files:**
- Create: `backend/arrow_bridge.py`
- Create: `backend/tests/test_arrow_bridge.py`

- [ ] **Step 1: Write failing tests for arrow_bridge**

Create `backend/tests/test_arrow_bridge.py`:

```python
"""Tests for Arrow data bridge — zero-copy conversions between DuckDB, Polars, pandas, and JSON."""
import pytest
import pyarrow as pa
import polars as pl
import pandas as pd


def _sample_batch() -> pa.RecordBatch:
    """Create a sample Arrow RecordBatch for testing."""
    return pa.RecordBatch.from_pydict({
        "id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"],
        "revenue": [100.5, 200.3, 300.1],
    })


class TestArrowBridge:
    def test_arrow_to_polars_zero_copy(self):
        from arrow_bridge import arrow_to_polars
        batch = _sample_batch()
        lf = arrow_to_polars(batch)
        assert isinstance(lf, pl.LazyFrame)
        df = lf.collect()
        assert len(df) == 3
        assert df["name"][0] == "Alice"

    def test_arrow_to_pandas(self):
        from arrow_bridge import arrow_to_pandas
        batch = _sample_batch()
        df = arrow_to_pandas(batch)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 3
        assert list(df.columns) == ["id", "name", "revenue"]

    def test_arrow_to_json(self):
        from arrow_bridge import arrow_to_json
        batch = _sample_batch()
        columns, rows = arrow_to_json(batch)
        assert columns == ["id", "name", "revenue"]
        assert len(rows) == 3
        assert rows[0] == [1, "Alice", 100.5]

    def test_polars_to_arrow(self):
        from arrow_bridge import polars_to_arrow
        df = pl.DataFrame({"x": [1, 2], "y": ["a", "b"]})
        batch = polars_to_arrow(df)
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 2

    def test_pandas_to_arrow(self):
        from arrow_bridge import pandas_to_arrow
        df = pd.DataFrame({"x": [1, 2], "y": ["a", "b"]})
        batch = pandas_to_arrow(df)
        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 2

    def test_arrow_to_json_empty_batch(self):
        from arrow_bridge import arrow_to_json
        batch = pa.RecordBatch.from_pydict({"id": [], "name": []})
        columns, rows = arrow_to_json(batch)
        assert columns == ["id", "name"]
        assert rows == []

    def test_arrow_to_json_with_nulls(self):
        from arrow_bridge import arrow_to_json
        batch = pa.RecordBatch.from_pydict({"id": [1, None, 3], "name": ["a", "b", None]})
        columns, rows = arrow_to_json(batch)
        assert rows[1][0] is None
        assert rows[2][1] is None

    def test_extract_columns_and_rows_from_tier_data(self):
        """TierResult.data may have record_batch — extract_columns_rows handles both formats."""
        from arrow_bridge import extract_columns_rows
        batch = _sample_batch()
        # Arrow path
        cols, rows = extract_columns_rows({"record_batch": batch})
        assert cols == ["id", "name", "revenue"]
        assert len(rows) == 3
        # Legacy path (no record_batch key)
        cols2, rows2 = extract_columns_rows({"columns": ["a"], "rows": [[1]]})
        assert cols2 == ["a"]
        assert rows2 == [[1]]
        # None/empty
        cols3, rows3 = extract_columns_rows(None)
        assert cols3 == []
        assert rows3 == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_arrow_bridge.py -v
```

Expected: All tests FAIL with `ModuleNotFoundError: No module named 'arrow_bridge'`

- [ ] **Step 3: Implement arrow_bridge.py**

Create `backend/arrow_bridge.py`:

```python
"""Arrow Data Bridge — zero-copy conversions between DuckDB, Arrow, Polars, and pandas.

All tier results flow through this module. JSON serialization happens ONLY at API
boundary (agent_routes.py, query_routes.py), never inside tiers.
"""
from typing import Any, Optional

import pyarrow as pa
import polars as pl
import pandas as pd


def arrow_to_polars(batch: pa.RecordBatch) -> pl.LazyFrame:
    """Convert Arrow RecordBatch to Polars LazyFrame (zero-copy)."""
    table = pa.Table.from_batches([batch])
    return pl.from_arrow(table).lazy()


def arrow_to_pandas(batch: pa.RecordBatch) -> pd.DataFrame:
    """Convert Arrow RecordBatch to pandas DataFrame."""
    return batch.to_pandas()


def arrow_to_json(batch: pa.RecordBatch) -> tuple[list[str], list[list[Any]]]:
    """Convert Arrow RecordBatch to (columns, rows) for JSON API responses.

    This is the ONLY place Arrow data gets serialized to Python lists.
    Call this at API boundary only — never inside tiers or agent engine.
    """
    columns = [field.name for field in batch.schema]
    rows = []
    for i in range(batch.num_rows):
        row = []
        for col_idx in range(batch.num_columns):
            val = batch.column(col_idx)[i].as_py()
            row.append(val)
        rows.append(row)
    return columns, rows


def polars_to_arrow(df: pl.DataFrame) -> pa.RecordBatch:
    """Convert Polars DataFrame to Arrow RecordBatch."""
    table = df.to_arrow()
    batches = table.to_batches()
    if not batches:
        return pa.RecordBatch.from_pydict({col: [] for col in df.columns})
    return batches[0] if len(batches) == 1 else pa.Table.from_batches(batches).to_batches()[0]


def pandas_to_arrow(df: pd.DataFrame) -> pa.RecordBatch:
    """Convert pandas DataFrame to Arrow RecordBatch."""
    table = pa.Table.from_pandas(df)
    batches = table.to_batches()
    if not batches:
        return pa.RecordBatch.from_pydict({col: [] for col in df.columns})
    return batches[0] if len(batches) == 1 else pa.Table.from_batches(batches).to_batches()[0]


def extract_columns_rows(data: Optional[dict]) -> tuple[list[str], list[list]]:
    """Extract (columns, rows) from TierResult.data — handles both Arrow and legacy formats.

    Arrow path: data["record_batch"] exists → convert via arrow_to_json
    Legacy path: data["columns"] and data["rows"] exist → pass through
    """
    if not data:
        return [], []
    if "record_batch" in data and data["record_batch"] is not None:
        return arrow_to_json(data["record_batch"])
    return data.get("columns", []), data.get("rows", [])
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_arrow_bridge.py -v
```

Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/arrow_bridge.py backend/tests/test_arrow_bridge.py
git commit -m "feat: add Arrow data bridge module with zero-copy conversions"
```

---

## Task 3: Config Flags

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add Arrow and performance config flags**

In `backend/config.py`, add after the `BEHAVIOR_WARMING_ENABLED` field (around line 177):

```python
    # Arrow Data Bridge (Phase 1 — Global Comp)
    ARROW_BRIDGE_ENABLED: bool = Field(default=True, description="Use Arrow RecordBatches in tier results instead of Python dicts")
    ARROW_FALLBACK_TO_PANDAS: bool = Field(default=True, description="Fall back to pandas path if Arrow conversion fails")
    PERFORMANCE_TRACKING_ENABLED: bool = Field(default=True, description="Track and expose query latency metrics")
```

- [ ] **Step 2: Verify config loads**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -c "from config import settings; print(settings.ARROW_BRIDGE_ENABLED, settings.PERFORMANCE_TRACKING_ENABLED)"
```

Expected: `True True`

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/config.py
git commit -m "config: add Arrow bridge and performance tracking feature flags"
```

---

## Task 4: PII Masking on Arrow RecordBatch

**Files:**
- Modify: `backend/pii_masking.py`
- Create: `backend/tests/test_pii_arrow.py`

- [ ] **Step 1: Write failing tests for mask_record_batch**

Create `backend/tests/test_pii_arrow.py`:

```python
"""Tests for PII masking on Arrow RecordBatches."""
import pytest
import pyarrow as pa


class TestMaskRecordBatch:
    def test_masks_sensitive_column_by_name(self):
        from pii_masking import mask_record_batch
        batch = pa.RecordBatch.from_pydict({
            "id": [1, 2],
            "email": ["alice@test.com", "bob@test.com"],
            "revenue": [100.0, 200.0],
        })
        masked = mask_record_batch(batch)
        assert masked.column("id").to_pylist() == [1, 2]
        assert masked.column("revenue").to_pylist() == [100.0, 200.0]
        # email column should be masked
        emails = masked.column("email").to_pylist()
        assert emails[0] != "alice@test.com"
        assert "***" in emails[0] or emails[0].startswith("*")

    def test_masks_compound_sensitive_name(self):
        from pii_masking import mask_record_batch
        batch = pa.RecordBatch.from_pydict({
            "employee_ssn": ["123-45-6789", "987-65-4321"],
            "department": ["Sales", "Eng"],
        })
        masked = mask_record_batch(batch)
        ssns = masked.column("employee_ssn").to_pylist()
        assert ssns[0] != "123-45-6789"

    def test_empty_batch_returns_empty(self):
        from pii_masking import mask_record_batch
        batch = pa.RecordBatch.from_pydict({"id": [], "ssn": []})
        masked = mask_record_batch(batch)
        assert masked.num_rows == 0

    def test_no_sensitive_columns_unchanged(self):
        from pii_masking import mask_record_batch
        batch = pa.RecordBatch.from_pydict({
            "id": [1, 2],
            "product": ["Widget", "Gadget"],
        })
        masked = mask_record_batch(batch)
        assert masked.column("product").to_pylist() == ["Widget", "Gadget"]

    def test_preserves_schema_types(self):
        from pii_masking import mask_record_batch
        batch = pa.RecordBatch.from_pydict({
            "id": pa.array([1, 2], type=pa.int64()),
            "phone": pa.array(["555-1234", "555-5678"], type=pa.string()),
        })
        masked = mask_record_batch(batch)
        assert masked.schema.field("id").type == pa.int64()
        assert masked.schema.field("phone").type == pa.string()

    def test_unicode_normalized_before_match(self):
        """Fullwidth characters should be normalized before PII pattern matching."""
        from pii_masking import mask_record_batch
        # \uff45\uff4d\uff41\uff49\uff4c = fullwidth 'email'
        batch = pa.RecordBatch.from_pydict({
            "\uff45\uff4d\uff41\uff49\uff4c": ["test@test.com", "x@y.com"],
        })
        masked = mask_record_batch(batch)
        col_name = masked.schema.names[0]
        vals = masked.column(0).to_pylist()
        # Should be masked after NFKC normalization
        assert vals[0] != "test@test.com"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_pii_arrow.py -v
```

Expected: FAIL with `ImportError: cannot import name 'mask_record_batch' from 'pii_masking'`

- [ ] **Step 3: Implement mask_record_batch in pii_masking.py**

Add the following function to `backend/pii_masking.py` after the existing `mask_dataframe()` function:

```python
def mask_record_batch(batch: "pa.RecordBatch", mask_char: str = "*", conn_id: str = None) -> "pa.RecordBatch":
    """Mask PII in an Arrow RecordBatch. Arrow-native path — avoids pandas conversion.

    Uses same column-name pattern matching and value scanning as mask_dataframe().
    Falls back to pandas path if Arrow operations fail.
    """
    import pyarrow as pa
    import unicodedata

    if batch is None or batch.num_rows == 0:
        return batch

    arrays = []
    for col_idx in range(batch.num_columns):
        field = batch.schema.field(col_idx)
        col_name = unicodedata.normalize("NFKC", field.name).lower()
        column = batch.column(col_idx)

        # Check if column name matches sensitive patterns (substring-based)
        is_sensitive = _is_sensitive_column_name(col_name)

        if is_sensitive and pa.types.is_string(field.type):
            # Mask entire column values
            masked_values = []
            for val in column.to_pylist():
                if val is None:
                    masked_values.append(None)
                else:
                    masked_values.append(_mask_value(str(val), mask_char))
            arrays.append(pa.array(masked_values, type=pa.string()))
        elif is_sensitive:
            # Non-string sensitive column — mask as string representation
            masked_values = []
            for val in column.to_pylist():
                if val is None:
                    masked_values.append(None)
                else:
                    masked_values.append(_mask_value(str(val), mask_char))
            arrays.append(pa.array(masked_values, type=pa.string()))
        elif pa.types.is_string(field.type):
            # Non-sensitive string column — scan values for PII patterns
            scanned_values = []
            for val in column.to_pylist():
                if val is None:
                    scanned_values.append(None)
                else:
                    scanned_values.append(_scan_and_mask_value(str(val), mask_char))
            arrays.append(pa.array(scanned_values, type=pa.string()))
        else:
            # Non-sensitive, non-string — pass through unchanged
            arrays.append(column)

    # Rebuild schema (sensitive non-string columns become string type after masking)
    new_fields = []
    for col_idx in range(batch.num_columns):
        field = batch.schema.field(col_idx)
        col_name = unicodedata.normalize("NFKC", field.name).lower()
        if _is_sensitive_column_name(col_name) and not pa.types.is_string(field.type):
            new_fields.append(pa.field(field.name, pa.string()))
        else:
            new_fields.append(field)

    return pa.RecordBatch.from_arrays(arrays, schema=pa.schema(new_fields))
```

Also add this helper if `_is_sensitive_column_name` doesn't already exist (check the existing `SENSITIVE_COLUMN_PATTERNS` and how `mask_dataframe` matches):

```python
def _is_sensitive_column_name(col_name_lower: str) -> bool:
    """Check if column name matches any sensitive PII pattern (substring-based)."""
    for pattern in SENSITIVE_COLUMN_PATTERNS:
        if pattern in col_name_lower:
            return True
    return False
```

And add `_scan_and_mask_value` if not present (wraps the existing regex value scan for a single string):

```python
def _scan_and_mask_value(value: str, mask_char: str = "*") -> str:
    """Scan a single string value for PII patterns and mask matches."""
    result = value
    for pattern_name, pattern in PII_PATTERNS.items():
        result = pattern.sub(lambda m: mask_char * len(m.group()), result)
    return result
```

Note: These helpers may already exist with different names in the current `pii_masking.py`. Read the file first and reuse existing logic. The key requirement is that `mask_record_batch` uses the SAME patterns and logic as `mask_dataframe` — never a separate set.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_pii_arrow.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 5: Run existing PII tests to verify no regression**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -k "pii" -v
```

Expected: All existing PII tests still PASS

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/pii_masking.py backend/tests/test_pii_arrow.py
git commit -m "feat: add Arrow-native PII masking — mask_record_batch()"
```

---

## Task 5: DuckDB Twin Arrow Output

**Files:**
- Modify: `backend/duckdb_twin.py`

- [ ] **Step 1: Modify query_twin() to return Arrow RecordBatch**

In `backend/duckdb_twin.py`, find `query_twin()` (line ~513). Replace the data extraction section (lines ~560-582):

**Before (current code around lines 560-582):**
```python
result = con.execute(sql)
columns: List[str] = [desc[0] for desc in result.description]
rows: List[List[Any]] = result.fetchmany(self._MAX_RESULT_ROWS + 1)
truncated = len(rows) > self._MAX_RESULT_ROWS
if truncated:
    rows = rows[:self._MAX_RESULT_ROWS]
# ... return dict with columns, rows, row_count, query_ms, truncated
```

**After:**
```python
result = con.execute(sql)

# Arrow-native path (zero-copy)
if settings.ARROW_BRIDGE_ENABLED:
    try:
        arrow_table = result.fetch_arrow_table()
        if arrow_table.num_rows > self._MAX_RESULT_ROWS:
            arrow_table = arrow_table.slice(0, self._MAX_RESULT_ROWS)
            truncated = True
        else:
            truncated = False
        record_batch = arrow_table.to_batches()[0] if arrow_table.num_rows > 0 else pa.RecordBatch.from_pydict({
            field.name: [] for field in arrow_table.schema
        })
        elapsed = (time.time() - start) * 1000
        return {
            "record_batch": record_batch,
            "columns": [field.name for field in record_batch.schema],
            "rows": None,  # Legacy callers should use extract_columns_rows()
            "row_count": record_batch.num_rows,
            "query_ms": round(elapsed, 2),
            "truncated": truncated,
        }
    except Exception:
        if not settings.ARROW_FALLBACK_TO_PANDAS:
            raise
        # Fall through to legacy path

# Legacy path (Python lists)
columns: List[str] = [desc[0] for desc in result.description]
rows: List[List[Any]] = result.fetchmany(self._MAX_RESULT_ROWS + 1)
truncated = len(rows) > self._MAX_RESULT_ROWS
if truncated:
    rows = rows[:self._MAX_RESULT_ROWS]
```

Also add imports at the top of `duckdb_twin.py`:
```python
import pyarrow as pa
from config import settings
```

- [ ] **Step 2: Run existing tests**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

Expected: All existing tests PASS (legacy path still works via fallback)

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/duckdb_twin.py
git commit -m "feat: DuckDB twin outputs Arrow RecordBatch via fetch_arrow_table()"
```

---

## Task 6: Waterfall Router Arrow Integration

**Files:**
- Modify: `backend/waterfall_router.py`

- [ ] **Step 1: Update BaseTier._apply_masking() to handle Arrow**

In `backend/waterfall_router.py`, find `_apply_masking()` (line ~155). Add Arrow path before the existing pandas path:

```python
@staticmethod
def _apply_masking(result: TierResult, conn_id: str = "") -> TierResult:
    if not result.hit or not result.data:
        return result

    # Write-time masking short-circuit (existing logic — keep as-is)
    if result.data.get("masked_at_write"):
        return result

    # Arrow path — mask RecordBatch directly
    if settings.ARROW_BRIDGE_ENABLED and "record_batch" in result.data and result.data["record_batch"] is not None:
        try:
            from pii_masking import mask_record_batch
            masked_batch = mask_record_batch(result.data["record_batch"], conn_id=conn_id)
            result.data["record_batch"] = masked_batch
            return result
        except Exception:
            if not settings.ARROW_FALLBACK_TO_PANDAS:
                # Masking failure is P0 — return miss to prevent PII leak
                return TierResult(hit=False, tier_name=result.tier_name,
                                  metadata={**result.metadata, "masking_error": True})
            # Fall through to pandas path

    # Existing pandas path (keep unchanged)
    # ... existing code ...
```

Add import at the top:
```python
from config import settings
```

- [ ] **Step 2: Update TurboTier._answer() to pass Arrow data through**

Find `TurboTier._answer()` (line ~496). Where it constructs TierResult from `query_twin()` result, pass the `record_batch` key through:

```python
# After twin_result = self._twin.query_twin(conn_id, sql)
data = {
    "answer": twin_result.get("answer", ""),
    "confidence": twin_result.get("confidence", 0.8),
    "source": "turbo_twin",
    "cache_age_seconds": cache_age,
    "columns": twin_result.get("columns", []),
    "rows": twin_result.get("rows"),
    "record_batch": twin_result.get("record_batch"),  # Arrow path
}
```

- [ ] **Step 3: Run existing tests**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/waterfall_router.py
git commit -m "feat: waterfall router supports Arrow RecordBatch in TierResult + masking"
```

---

## Task 7: API Boundary Serialization

**Files:**
- Modify: `backend/routers/query_routes.py`
- Modify: `backend/routers/agent_routes.py`
- Modify: `backend/agent_engine.py`

- [ ] **Step 1: Update query_routes.py /execute endpoint**

Find the `/execute` endpoint (line ~244). Where it returns `{columns, rows, ...}`, use `extract_columns_rows()`:

```python
from arrow_bridge import extract_columns_rows

# In /execute response construction:
columns, rows = extract_columns_rows(result_data)
return {
    "columns": columns,
    "rows": rows,
    "row_count": len(rows),
    # ... other fields
}
```

- [ ] **Step 2: Update agent_routes.py SSE serialization**

Find where TierResult data is serialized for SSE (line ~163). Use `extract_columns_rows()`:

```python
from arrow_bridge import extract_columns_rows

# When serializing tier_result.data for SSE:
if tier_result.data:
    serializable_data = {**tier_result.data}
    if "record_batch" in serializable_data:
        cols, rows = extract_columns_rows(serializable_data)
        serializable_data["columns"] = cols
        serializable_data["rows"] = rows
        del serializable_data["record_batch"]  # Not JSON-serializable
    yield AgentStep(type="tier_routing", content=...,
                    tool_result=json.dumps(serializable_data))
```

- [ ] **Step 3: Update agent_engine.py _tool_run_sql()**

Find `_tool_run_sql()` (line ~1795). Where it extracts `columns` and `rows` from results (lines ~1862-1864), add Arrow path:

```python
from arrow_bridge import extract_columns_rows

# After getting result (either from twin or live DB):
if isinstance(result, dict) and "record_batch" in result:
    columns, rows = extract_columns_rows(result)
else:
    columns = list(df.columns)
    rows = df.values.tolist()
```

- [ ] **Step 4: Run full test suite**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/routers/query_routes.py backend/routers/agent_routes.py backend/agent_engine.py
git commit -m "feat: Arrow-to-JSON serialization at API boundary only"
```

---

## Task 8: Performance Pill Frontend Component

**Files:**
- Create: `frontend/src/components/PerformancePill.jsx`
- Modify: `frontend/src/components/agent/AgentStepFeed.jsx`
- Modify: `frontend/src/store.js`

> **REQUIRED:** Use taste/impeccable/emil-design-eng skill for this frontend component.

- [ ] **Step 1: Add performanceMetrics to store.js**

In `frontend/src/store.js`, add to the agent slice (after `agentVerification` around line 189):

```javascript
performanceMetrics: {
  lastQueryMs: null,
  lastTierName: null,
  lastTransferMethod: null,
  lastRowsScanned: null,
},
setPerformanceMetrics: (metrics) => set({ performanceMetrics: metrics }),
```

- [ ] **Step 2: Create PerformancePill.jsx**

Create `frontend/src/components/PerformancePill.jsx`:

```jsx
import { motion } from 'framer-motion';

const TIER_COLORS = {
  schema: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa', label: 'Schema Cache' },
  memory: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', label: 'Query Memory' },
  turbo:  { bg: 'rgba(16,185,129,0.15)', text: '#34d399', label: 'Turbo Mode' },
  live:   { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', label: 'Live Query' },
};

export default function PerformancePill({ queryMs, tierName, rowsScanned, arrowEnabled }) {
  if (queryMs == null) return null;

  const tier = TIER_COLORS[tierName] || TIER_COLORS.live;
  const formattedMs = queryMs < 1000
    ? `${Math.round(queryMs)}ms`
    : `${(queryMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
      style={{ background: tier.bg, color: tier.text }}
    >
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6.5 1L2 7h3.5L5 11l5-6H6.5L7 1z" />
      </svg>
      <span>{formattedMs}</span>
      <span className="opacity-60">·</span>
      <span>{tier.label}</span>
      {arrowEnabled && (
        <>
          <span className="opacity-60">·</span>
          <span className="opacity-75">Arrow zero-copy</span>
        </>
      )}
      {rowsScanned != null && (
        <>
          <span className="opacity-60">·</span>
          <span className="opacity-75">{rowsScanned.toLocaleString()} rows</span>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Wire PerformancePill into AgentStepFeed.jsx**

In `frontend/src/components/agent/AgentStepFeed.jsx`, find where `result` type steps are rendered (around line 118-126). Add PerformancePill after the result content:

```jsx
import PerformancePill from '../PerformancePill';

// Inside the result step rendering block:
{step.type === 'result' && (
  <div>
    {/* existing result rendering */}
    <PerformancePill
      queryMs={step.elapsed_ms || step.metadata?.query_ms}
      tierName={step.metadata?.tier_name}
      rowsScanned={step.metadata?.row_count}
      arrowEnabled={step.metadata?.arrow_enabled}
    />
  </div>
)}
```

Also add PerformancePill to `tier_hit` steps (around line 157-164):

```jsx
{step.type === 'tier_hit' && (
  <div>
    {/* existing tier_hit rendering */}
    <PerformancePill
      queryMs={step.elapsed_ms}
      tierName={step.metadata?.tier_name}
      rowsScanned={step.metadata?.row_count}
      arrowEnabled={step.metadata?.arrow_enabled}
    />
  </div>
)}
```

- [ ] **Step 4: Verify frontend builds**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/components/PerformancePill.jsx frontend/src/components/agent/AgentStepFeed.jsx frontend/src/store.js
git commit -m "feat: add PerformancePill component — shows tier, latency, Arrow status"
```

---

## Task 9: Backend Performance Metadata in SSE Steps

**Files:**
- Modify: `backend/agent_engine.py`
- Modify: `backend/routers/agent_routes.py`

- [ ] **Step 1: Enrich tier_hit and result steps with performance metadata**

In `backend/agent_engine.py`, where `AgentStep` objects are created for tier results, add metadata:

```python
# When emitting tier_hit step:
yield AgentStep(
    type="tier_hit",
    content=f"Answered from {tier_result.tier_name}",
    tool_name="waterfall",
    tool_input=None,
    tool_result=None,
    elapsed_ms=int(tier_result.metadata.get("time_ms", 0)),
    metadata={
        "tier_name": tier_result.tier_name,
        "query_ms": tier_result.metadata.get("time_ms", 0),
        "row_count": tier_result.data.get("row_count") if tier_result.data else None,
        "arrow_enabled": settings.ARROW_BRIDGE_ENABLED,
        "tiers_checked": tier_result.metadata.get("tiers_checked", []),
    },
)
```

Note: Check the existing `AgentStep` dataclass — if `metadata` is not a field, add it as `metadata: Optional[dict] = None` to the dataclass definition.

- [ ] **Step 2: Ensure SSE serialization includes metadata**

In `backend/routers/agent_routes.py`, where steps are serialized to SSE JSON, ensure `metadata` field is included:

```python
# In the SSE event serialization:
step_dict = {
    "type": step.type,
    "content": step.content,
    # ... existing fields
    "metadata": step.metadata if hasattr(step, 'metadata') else None,
}
```

- [ ] **Step 3: Run full test suite**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py backend/routers/agent_routes.py
git commit -m "feat: enrich SSE steps with performance metadata for PerformancePill"
```

---

## Task 10: Integration Test — End-to-End Arrow Pipeline

**Files:**
- Create: `backend/tests/test_arrow_integration.py`

- [ ] **Step 1: Write integration test**

Create `backend/tests/test_arrow_integration.py`:

```python
"""Integration test: Arrow pipeline end-to-end — DuckDB → Arrow → PII mask → JSON."""
import pytest
import pyarrow as pa
import duckdb
import tempfile
import os


class TestArrowPipelineIntegration:
    def test_duckdb_to_arrow_to_masked_to_json(self):
        """Full pipeline: DuckDB query → Arrow → PII mask → JSON serialization."""
        from arrow_bridge import arrow_to_json, extract_columns_rows
        from pii_masking import mask_record_batch

        # Create in-memory DuckDB with test data
        con = duckdb.connect(":memory:")
        con.execute("""
            CREATE TABLE customers (
                id INTEGER, 
                name VARCHAR, 
                email VARCHAR, 
                revenue DOUBLE
            )
        """)
        con.execute("""
            INSERT INTO customers VALUES 
            (1, 'Alice', 'alice@test.com', 1500.50),
            (2, 'Bob', 'bob@test.com', 2300.75)
        """)

        # Step 1: DuckDB → Arrow (zero-copy)
        result = con.execute("SELECT * FROM customers")
        arrow_table = result.fetch_arrow_table()
        batch = arrow_table.to_batches()[0]

        assert isinstance(batch, pa.RecordBatch)
        assert batch.num_rows == 2
        assert batch.column("email").to_pylist() == ["alice@test.com", "bob@test.com"]

        # Step 2: PII masking on Arrow
        masked = mask_record_batch(batch)
        assert masked.num_rows == 2
        masked_emails = masked.column("email").to_pylist()
        assert masked_emails[0] != "alice@test.com"  # email should be masked
        assert masked.column("name").to_pylist() == ["Alice", "Bob"]  # name not masked
        assert masked.column("revenue").to_pylist() == [1500.50, 2300.75]  # revenue not masked

        # Step 3: Arrow → JSON (at API boundary)
        columns, rows = arrow_to_json(masked)
        assert columns == ["id", "name", "email", "revenue"]
        assert len(rows) == 2
        assert rows[0][1] == "Alice"  # name preserved
        assert rows[0][2] != "alice@test.com"  # email masked in JSON too

        # Step 4: extract_columns_rows with record_batch in data dict
        data = {"record_batch": masked, "answer": "test"}
        cols, rows2 = extract_columns_rows(data)
        assert cols == columns
        assert rows2 == rows

        con.close()

    def test_arrow_pipeline_with_turbo_twin_format(self):
        """Verify the format returned by query_twin() works through the pipeline."""
        from arrow_bridge import extract_columns_rows
        from pii_masking import mask_record_batch

        batch = pa.RecordBatch.from_pydict({
            "id": [1, 2, 3],
            "customer_ssn": ["123-45-6789", "987-65-4321", "555-12-3456"],
            "amount": [100.0, 200.0, 300.0],
        })

        # Simulate query_twin() return format
        twin_result = {
            "record_batch": batch,
            "columns": ["id", "customer_ssn", "amount"],
            "rows": None,
            "row_count": 3,
            "query_ms": 8.5,
            "truncated": False,
        }

        # Mask
        masked_batch = mask_record_batch(twin_result["record_batch"])
        twin_result["record_batch"] = masked_batch

        # Extract for JSON
        cols, rows = extract_columns_rows(twin_result)
        assert cols == ["id", "customer_ssn", "amount"]
        assert len(rows) == 3
        # SSN should be masked
        assert rows[0][1] != "123-45-6789"
        # Amount should be preserved
        assert rows[0][2] == 100.0
```

- [ ] **Step 2: Run integration test**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_arrow_integration.py -v
```

Expected: All 2 tests PASS

- [ ] **Step 3: Run full test suite to verify no regressions**

Run:
```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/tests/test_arrow_integration.py
git commit -m "test: add Arrow pipeline integration test — DuckDB → Arrow → mask → JSON"
```

---

## Task 11: Final Verification + Push

- [ ] **Step 1: Run lint on frontend**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run lint
```

Fix any lint errors.

- [ ] **Step 2: Run full backend test suite**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 3: Build frontend**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run build
```

- [ ] **Step 4: Push to remote**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git push origin askdb-global-comp
```
