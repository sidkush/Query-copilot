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

        tmp_path = os.path.join(tempfile.gettempdir(), "test_datafusion_twin.duckdb")
        # Ensure clean file for DuckDB
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        try:
            con = duckdb.connect(tmp_path)
            con.execute("CREATE TABLE products (id INT, name VARCHAR, price DOUBLE)")
            con.execute("INSERT INTO products VALUES (1, 'Widget', 9.99), (2, 'Gadget', 19.99)")
            con.close()

            engine.register_duckdb_twin("test_conn", tmp_path)
            result = engine.execute_sql("SELECT name, price FROM products WHERE price > 10")

            assert isinstance(result, pa.RecordBatch)
            assert result.num_rows == 1
            assert result.column("name").to_pylist() == ["Gadget"]
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def test_plan_query_returns_plan_info(self):
        """plan_query should return optimization info without executing."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        batch = pa.RecordBatch.from_pydict({"x": [1, 2, 3], "y": [10, 20, 30]})
        engine.register_arrow_table("test", pa.Table.from_batches([batch]))

        plan = engine.plan_query("SELECT x, SUM(y) FROM test GROUP BY x")
        assert plan is not None
        assert plan.is_optimizable is True

    def test_fallback_on_invalid_sql(self):
        """Invalid SQL should return None plan, not crash."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        plan = engine.plan_query("SELCT INVALID SYNTAX FROM nowhere")
        assert plan is None

    def test_execute_empty_result(self):
        """Query returning no rows should return empty RecordBatch."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        batch = pa.RecordBatch.from_pydict({"x": [1, 2, 3]})
        engine.register_arrow_table("test", pa.Table.from_batches([batch]))

        result = engine.execute_sql("SELECT x FROM test WHERE x > 100")
        assert result is not None
        assert result.num_rows == 0

    def test_reset_clears_tables(self):
        """reset() should clear all registered tables."""
        from datafusion_engine import DataFusionEngine
        engine = DataFusionEngine()

        batch = pa.RecordBatch.from_pydict({"x": [1]})
        engine.register_arrow_table("test", pa.Table.from_batches([batch]))
        engine.reset()

        # Should fail because table was cleared
        result = engine.execute_sql("SELECT * FROM test")
        assert result is None  # execute_sql returns None on error
