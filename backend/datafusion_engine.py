"""DataFusion Query Planner — federated pushdown and parallel execution.

Replaces query_decomposer.py for query optimization. Does NOT replace
waterfall routing. Feature-flagged via DATAFUSION_ENABLED.
"""
from typing import Optional
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
        self._registered_tables: set[str] = set()

    def register_arrow_table(self, name: str, table: pa.Table):
        """Register an Arrow table as a DataFusion table source."""
        self.ctx.register_record_batches(name, [table.to_batches()])
        self._registered_tables.add(name)

    def register_duckdb_twin(self, conn_id: str, twin_path: str):
        """Register all tables from a DuckDB twin file as DataFusion sources."""
        import duckdb
        con = duckdb.connect(twin_path, read_only=True)
        try:
            tables = con.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='main' AND table_name NOT LIKE '\\_%' ESCAPE '\\'"
            ).fetchall()
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
                # Return empty batch preserving schema
                schema = df.schema()
                return pa.RecordBatch.from_pydict(
                    {field.name: [] for field in schema},
                    schema=schema,
                )
            # Combine all batches into a single RecordBatch
            table = pa.Table.from_batches(batches)
            combined = table.combine_chunks().to_batches()
            if not combined:
                return pa.RecordBatch.from_pydict({})
            return combined[0]
        except Exception as e:
            logger.error(f"DataFusion execute failed: {e}")
            return None

    def reset(self):
        """Clear all registered tables. Create fresh context."""
        import datafusion
        self.ctx = datafusion.SessionContext()
        self._registered_tables.clear()
