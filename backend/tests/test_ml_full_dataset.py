"""Tests for full-dataset ML training path."""
import pytest


class TestFullDatasetTraining:
    def test_config_has_full_dataset_settings(self):
        from config import settings
        assert hasattr(settings, 'ML_FULL_DATASET_ENABLED')
        assert hasattr(settings, 'ML_MAX_TRAINING_ROWS')
        assert hasattr(settings, 'ML_DEFAULT_SAMPLE_SIZE')
        assert settings.ML_MAX_TRAINING_ROWS == 10_000_000
        assert settings.ML_DEFAULT_SAMPLE_SIZE == 500_000

    def test_ml_engine_has_ingest_from_source(self):
        from ml_engine import MLEngine
        engine = MLEngine()
        assert hasattr(engine, 'ingest_from_source')

    def test_ingest_from_source_with_mock_connector(self):
        from ml_engine import MLEngine
        from unittest.mock import MagicMock
        import polars as pl
        import pyarrow as pa

        engine = MLEngine()
        mock_connector = MagicMock()
        # Mock execute_query_arrow to return an Arrow table
        mock_table = pa.table({"col1": [1, 2, 3], "col2": ["a", "b", "c"]})
        mock_connector.execute_query_arrow.return_value = mock_table

        result = engine.ingest_from_source(mock_connector, ["test_table"])
        assert isinstance(result, pl.DataFrame)
        assert len(result) == 3
        mock_connector.execute_query_arrow.assert_called_once()

    def test_ingest_from_source_with_sample(self):
        from ml_engine import MLEngine
        from unittest.mock import MagicMock
        import pyarrow as pa

        engine = MLEngine()
        mock_connector = MagicMock()
        mock_table = pa.table({"x": list(range(100))})
        mock_connector.execute_query_arrow.return_value = mock_table

        result = engine.ingest_from_source(mock_connector, ["t"], sample_size=50)
        # Verify the SQL had LIMIT
        call_sql = mock_connector.execute_query_arrow.call_args[0][0]
        assert "LIMIT 50" in call_sql
        assert "RANDOM()" in call_sql
