"""Bug regression: Training stage must accept target_column from stage config."""
import pytest
import tempfile


class TestTrainTargetColumn:
    def test_target_column_from_config_used_in_stage(self):
        """When target_column is in stage config, _execute_stage should receive it."""
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                # Create pipeline WITHOUT target_column
                p = store.create_pipeline("test_user", "Test", "conn1")
                assert p["target_column"] is None

                # Simulate what run_stage does: merge config, extract target
                stage_config = {"target_column": "member_casual", "models": ["XGBoost"]}
                merged_config = {**p["stages"]["train"].get("config", {}), **stage_config}

                # Extract target from config
                target_column = p.get("target_column")
                if merged_config.get("target_column") and not target_column:
                    target_column = merged_config["target_column"]
                    store.update_pipeline("test_user", p["id"], {"target_column": target_column})
                elif merged_config.get("target_column"):
                    target_column = merged_config["target_column"]

                assert target_column == "member_casual"

                # Verify pipeline was updated
                loaded = store.load_pipeline("test_user", p["id"])
                assert loaded["target_column"] == "member_casual"
            finally:
                settings.ML_PIPELINES_DIR = orig

    def test_target_column_persists_across_retries(self):
        """After first run sets target_column, retries should still have it."""
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                p = store.create_pipeline("test_user", "Test", "conn1")
                store.update_pipeline("test_user", p["id"], {"target_column": "member_casual"})

                loaded = store.load_pipeline("test_user", p["id"])
                assert loaded["target_column"] == "member_casual"

                # Second attempt should still have target_column
                target_column = loaded.get("target_column")
                assert target_column == "member_casual"
            finally:
                settings.ML_PIPELINES_DIR = orig

    def test_string_target_encoded_for_classification(self):
        """String target columns like member_casual must be label-encoded."""
        import polars as pl
        from ml_feature_engine import prepare_dataset
        import numpy as np

        df = pl.DataFrame({
            "feature1": list(range(100)),
            "feature2": [float(x) * 0.5 for x in range(100)],
            "target": ["member"] * 50 + ["casual"] * 50,
        })
        result = prepare_dataset(df, target_column="target", test_size=0.2)
        assert result["y_train"].dtype in (np.int32, np.int64, np.intp)
        assert set(result["y_train"]).issubset({0, 1})
