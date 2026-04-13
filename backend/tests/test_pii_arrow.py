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
        from pii_masking import mask_record_batch
        batch = pa.RecordBatch.from_pydict({
            "\uff45\uff4d\uff41\uff49\uff4c": ["test@test.com", "x@y.com"],
        })
        masked = mask_record_batch(batch)
        vals = masked.column(0).to_pylist()
        assert vals[0] != "test@test.com"
