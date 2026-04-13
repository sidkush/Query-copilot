"""Tests for ML engine orchestrator."""
import pytest
import polars as pl


class TestMLEngine:
    def test_ingest_from_polars(self):
        from ml_engine import MLEngine
        engine = MLEngine()
        df = pl.DataFrame({"x": [1, 2, 3], "y": [10, 20, 30]})
        result = engine.ingest_dataframe(df)
        assert isinstance(result, pl.LazyFrame)
        assert result.collect().shape == (3, 2)

    def test_detect_task_type_binary(self):
        from ml_engine import MLEngine
        engine = MLEngine()
        df = pl.DataFrame({"target": [0, 1, 0, 1, 0, 1]})
        task = engine.detect_task_type(df, "target")
        assert task == "classification"

    def test_detect_task_type_regression(self):
        from ml_engine import MLEngine
        engine = MLEngine()
        df = pl.DataFrame({"target": [1.5, 2.3, 3.1, 4.7, 5.2]})
        task = engine.detect_task_type(df, "target")
        assert task == "regression"

    def test_train_returns_metrics(self):
        from ml_engine import MLEngine
        engine = MLEngine()
        df = pl.DataFrame({
            "f1": list(range(100)),
            "f2": [float(x) * 0.5 for x in range(100)],
            "target": [0] * 50 + [1] * 50,
        })
        result = engine.train_sync(df, "target", ["XGBoost"])
        assert "models" in result
        assert len(result["models"]) == 1
        assert "accuracy" in result["models"][0]["metrics"]

    def test_train_multiple_models(self):
        from ml_engine import MLEngine
        engine = MLEngine()
        df = pl.DataFrame({
            "f1": list(range(100)),
            "f2": [float(x) * 0.5 for x in range(100)],
            "target": [0] * 50 + [1] * 50,
        })
        result = engine.train_sync(df, "target", ["XGBoost", "Random Forest"])
        assert len(result["models"]) == 2

    def test_save_and_load_model(self):
        import os
        import tempfile
        from ml_engine import MLEngine
        engine = MLEngine()
        df = pl.DataFrame({
            "f1": list(range(50)),
            "target": [0] * 25 + [1] * 25,
        })
        result = engine.train_sync(df, "target", ["Logistic Regression"])
        model_result = result["models"][0]

        # Save to temp dir
        with tempfile.TemporaryDirectory() as tmpdir:
            import config
            original_dir = config.settings.ML_MODELS_DIR
            config.settings.ML_MODELS_DIR = tmpdir
            try:
                model_id = engine.save_model(model_result, "test_user")
                assert model_id == model_result["model_id"]
                # Check files exist
                model_dir = os.path.join(tmpdir, "test_user", model_id)
                assert os.path.exists(os.path.join(model_dir, "model.joblib"))
                assert os.path.exists(os.path.join(model_dir, "metadata.json"))
            finally:
                config.settings.ML_MODELS_DIR = original_dir
