"""Integration test: Arrow pipeline end-to-end -- DuckDB -> Arrow -> PII mask -> JSON."""
import pytest
import pyarrow as pa
import duckdb


class TestArrowPipelineIntegration:
    def test_duckdb_to_arrow_to_masked_to_json(self):
        """Full pipeline: DuckDB query -> Arrow -> PII mask -> JSON serialization."""
        from arrow_bridge import arrow_to_json, extract_columns_rows
        from pii_masking import mask_record_batch

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

        # Step 1: DuckDB -> Arrow (zero-copy)
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
        assert masked_emails[0] != "alice@test.com"
        assert masked.column("name").to_pylist() == ["Alice", "Bob"]
        assert masked.column("revenue").to_pylist() == [1500.50, 2300.75]

        # Step 3: Arrow -> JSON (at API boundary)
        columns, rows = arrow_to_json(masked)
        assert columns == ["id", "name", "email", "revenue"]
        assert len(rows) == 2
        assert rows[0][1] == "Alice"
        assert rows[0][2] != "alice@test.com"

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

        twin_result = {
            "record_batch": batch,
            "columns": ["id", "customer_ssn", "amount"],
            "rows": None,
            "row_count": 3,
            "query_ms": 8.5,
            "truncated": False,
        }

        masked_batch = mask_record_batch(twin_result["record_batch"])
        twin_result["record_batch"] = masked_batch

        cols, rows = extract_columns_rows(twin_result)
        assert cols == ["id", "customer_ssn", "amount"]
        assert len(rows) == 3
        assert rows[0][1] != "123-45-6789"
        assert rows[0][2] == 100.0

    def test_arrow_pipeline_with_nulls(self):
        """Verify null handling through the full pipeline."""
        from arrow_bridge import extract_columns_rows
        from pii_masking import mask_record_batch

        batch = pa.RecordBatch.from_pydict({
            "id": [1, 2],
            "email": ["test@example.com", None],
            "score": [95.5, None],
        })

        masked = mask_record_batch(batch)
        assert masked.num_rows == 2
        emails = masked.column("email").to_pylist()
        assert emails[0] != "test@example.com"
        assert emails[1] is None
        scores = masked.column("score").to_pylist()
        assert scores[0] == 95.5
        assert scores[1] is None

        cols, rows = extract_columns_rows({"record_batch": masked})
        assert rows[1][1] is None
        assert rows[1][2] is None

    def test_arrow_pipeline_empty_result(self):
        """Verify empty result set flows through pipeline."""
        from arrow_bridge import extract_columns_rows
        from pii_masking import mask_record_batch

        batch = pa.RecordBatch.from_pydict({
            "id": pa.array([], type=pa.int64()),
            "email": pa.array([], type=pa.string()),
        })

        masked = mask_record_batch(batch)
        assert masked.num_rows == 0

        cols, rows = extract_columns_rows({"record_batch": masked})
        assert cols == ["id", "email"]
        assert rows == []

    def test_legacy_format_still_works(self):
        """Verify legacy dict format (no record_batch) still works through extract_columns_rows."""
        from arrow_bridge import extract_columns_rows

        legacy_data = {
            "columns": ["id", "name"],
            "rows": [[1, "Alice"], [2, "Bob"]],
            "answer": "test",
        }

        cols, rows = extract_columns_rows(legacy_data)
        assert cols == ["id", "name"]
        assert rows == [[1, "Alice"], [2, "Bob"]]

        # None data
        cols2, rows2 = extract_columns_rows(None)
        assert cols2 == []
        assert rows2 == []
