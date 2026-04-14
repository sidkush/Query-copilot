"""Tests for ML feature engineering."""
import pytest
import polars as pl


class TestFeatureEngine:
    def test_detect_column_types(self):
        from ml_feature_engine import detect_column_types
        df = pl.DataFrame({
            "id": [1, 2, 3],
            "name": ["Alice", "Bob", "Charlie"],
            "email": ["a@test.com", "b@test.com", "c@test.com"],
            "revenue": [100.5, 200.3, 300.1],
            "category": ["A", "B", "A"],
        })
        types = detect_column_types(df)
        assert types["id"] == "numeric"
        assert types["name"] == "categorical"
        assert types["email"] == "pii"
        assert types["revenue"] == "numeric"
        assert types["category"] == "categorical"

    def test_pii_columns_excluded(self):
        from ml_feature_engine import detect_column_types
        df = pl.DataFrame({
            "customer_ssn": ["123-45-6789"],
            "phone_number": ["555-1234"],
            "user_email": ["test@test.com"],
            "revenue": [100.0],
        })
        types = detect_column_types(df)
        assert types["customer_ssn"] == "pii"
        assert types["phone_number"] == "pii"
        assert types["user_email"] == "pii"
        assert types["revenue"] == "numeric"

    def test_analyze_features_report(self):
        from ml_feature_engine import analyze_features
        df = pl.DataFrame({
            "age": [25, 30, None, 40, 35],
            "salary": [50000.0, 60000.0, 70000.0, None, 55000.0],
            "department": ["Eng", "Sales", "Eng", "Sales", "Eng"],
        })
        report = analyze_features(df)
        assert len(report) == 3
        age_report = next(r for r in report if r["name"] == "age")
        assert age_report["type"] == "numeric"
        assert age_report["missing_pct"] == pytest.approx(20.0, abs=1)
        dept_report = next(r for r in report if r["name"] == "department")
        assert dept_report["type"] == "categorical"
        assert dept_report["unique_count"] == 2

    def test_prepare_dataset_splits(self):
        from ml_feature_engine import prepare_dataset
        df = pl.DataFrame({
            "feature1": list(range(100)),
            "feature2": [float(x) * 0.5 for x in range(100)],
            "target": [0] * 50 + [1] * 50,
        })
        result = prepare_dataset(df, target_column="target", test_size=0.2)
        total = result["X_train"].shape[0] + result["X_test"].shape[0]
        assert total == 100
        # Hash-based split is approximately 80/20 (not exact like sklearn)
        assert result["X_train"].shape[0] == pytest.approx(80, abs=10)
        assert result["X_test"].shape[0] == pytest.approx(20, abs=10)
        assert result["y_train"].shape[0] == result["X_train"].shape[0]
        assert result["y_test"].shape[0] == result["X_test"].shape[0]

    def test_prepare_dataset_encodes_string_target(self):
        from ml_feature_engine import prepare_dataset
        import numpy as np
        df = pl.DataFrame({
            "feature1": list(range(100)),
            "target": ["member"] * 50 + ["casual"] * 50,
        })
        result = prepare_dataset(df, target_column="target", test_size=0.2)
        # Target should be numeric (0 or 1), not strings
        assert result["y_train"].dtype in (np.int32, np.int64, np.intp)
        assert set(result["y_train"]).issubset({0, 1})
        assert result["target_encoder"] is not None
        # target_encoder is now a dict, not sklearn LabelEncoder
        assert isinstance(result["target_encoder"], dict)
        assert "member" in result["target_encoder"]
        assert "casual" in result["target_encoder"]

    def test_prepare_dataset_returns_numpy_not_pandas(self):
        from ml_feature_engine import prepare_dataset
        import numpy as np
        df = pl.DataFrame({
            "f1": list(range(100)),
            "f2": [float(x) for x in range(100)],
            "target": [0] * 50 + [1] * 50,
        })
        result = prepare_dataset(df, target_column="target", test_size=0.2)
        assert isinstance(result["X_train"], np.ndarray)
        assert isinstance(result["y_train"], np.ndarray)
        # Verify no pandas objects
        import pandas as pd
        for key, val in result.items():
            assert not isinstance(val, pd.DataFrame), f"{key} should not be pandas DataFrame"
            assert not isinstance(val, pd.Series), f"{key} should not be pandas Series"

    def test_prepare_dataset_target_encoder_is_dict(self):
        from ml_feature_engine import prepare_dataset
        df = pl.DataFrame({
            "f1": list(range(100)),
            "target": ["member"] * 50 + ["casual"] * 50,
        })
        result = prepare_dataset(df, target_column="target", test_size=0.2)
        assert isinstance(result["target_encoder"], dict)
        assert "member" in result["target_encoder"]
        assert "casual" in result["target_encoder"]
