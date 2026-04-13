# Celery + Redis Infrastructure + ML Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use ultraflow skills for building. Use taste/impeccable/emil-design-eng skills for ALL frontend components.

**Goal:** Add Celery + Redis task queue infrastructure, then build full AutoML engine (classification, regression, clustering, anomaly detection, time series, NLP) with agent-guided interface, training animations, and model management.

**Architecture:** `celery_app.py` configures Celery with Redis broker and two queues (ml_quick, ml_training). `ml_engine.py` orchestrates the pipeline. `ml_feature_engine.py` handles automated feature engineering. `ml_tasks.py` contains Celery tasks for long-running training. `ml_routes.py` exposes REST API. Agent tools (ml_*) plug into existing agent_engine.py dispatch. Frontend: new `/ml-engine` route with workspace + agent panel.

**Tech Stack:** Celery, Redis, Polars (from Plan 1), scikit-learn, XGBoost, LightGBM, Prophet, statsforecast, sentence-transformers, spaCy, joblib

**Spec:** `docs/superpowers/specs/2026-04-13-askdb-global-comp-design.md` — Phase 4

---

## File Structure

### New Files (Backend)
- `backend/celery_app.py` — Celery config with Redis broker
- `backend/celery_worker.py` — worker entry point
- `backend/ml_engine.py` — ML pipeline orchestrator
- `backend/ml_feature_engine.py` — automated feature engineering
- `backend/ml_models.py` — model catalog + training logic
- `backend/ml_tasks.py` — Celery training tasks
- `backend/routers/ml_routes.py` — ML API endpoints
- `backend/tests/test_ml_feature_engine.py` — feature engineering tests
- `backend/tests/test_ml_engine.py` — ML pipeline tests
- `backend/tests/test_celery_tasks.py` — Celery task tests

### New Files (Frontend)
- `frontend/src/pages/MLEngine.jsx` — ML Engine page
- `frontend/src/components/ml/MLWorkspace.jsx` — main workspace
- `frontend/src/components/ml/FeatureTable.jsx` — feature analysis view
- `frontend/src/components/ml/TrainingProgress.jsx` — training animation
- `frontend/src/components/ml/ModelComparison.jsx` — model results table + charts
- `frontend/src/components/ml/ModelCard.jsx` — individual model card

### Modified Files
- `backend/requirements.txt` — add ML dependencies + Celery
- `backend/config.py` — ML + Celery config flags
- `backend/main.py` — register ml_routes, Celery startup
- `backend/agent_engine.py` — add ML tools to dispatch
- `frontend/src/App.jsx` — add /ml-engine route
- `frontend/src/components/AppSidebar.jsx` — add ML Engine nav item
- `frontend/src/store.js` — add ML state slice
- `frontend/src/api.js` — add ML API functions

---

## Task 1: Add ML + Celery Dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add dependencies**

Add to `backend/requirements.txt`:

```
# ── Task Queue ──────────────────────────────────────────────
celery>=5.3.0
redis>=5.0                        # already present, keep

# ── ML Engine ───────────────────────────────────────────────
scikit-learn>=1.4
xgboost>=2.0
lightgbm>=4.0
prophet>=1.1
statsforecast>=1.7
sentence-transformers>=2.6
spacy>=3.7
joblib>=1.3                       # included with sklearn, pin for clarity
```

- [ ] **Step 2: Install**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
pip install "celery>=5.3.0" "scikit-learn>=1.4" "xgboost>=2.0" "lightgbm>=4.0" "prophet>=1.1" "statsforecast>=1.7" "sentence-transformers>=2.6" "spacy>=3.7"
python -m spacy download en_core_web_sm
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/requirements.txt
git commit -m "deps: add Celery, scikit-learn, XGBoost, LightGBM, Prophet, NLP libs for ML engine"
```

---

## Task 2: Celery + Redis Infrastructure

**Files:**
- Create: `backend/celery_app.py`
- Create: `backend/celery_worker.py`
- Modify: `backend/config.py`

- [ ] **Step 1: Add Celery config to config.py**

```python
    # Celery + Redis
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/1")

    # ML Engine
    ML_ENGINE_ENABLED: bool = Field(default=True)
    ML_MAX_MODELS_FREE: int = Field(default=3)
    ML_MAX_MODELS_PRO: int = Field(default=10)
    ML_TRAINING_TIMEOUT_SECONDS: int = Field(default=3600)
    ML_WORKER_MAX_MEMORY_MB: int = Field(default=512)
    ML_MAX_CONCURRENT_TRAINING_PER_USER: int = Field(default=2)
    ML_AUTO_EXCLUDE_PII: bool = Field(default=True)
    ML_MODELS_DIR: str = Field(default=".data/ml_models")
```

- [ ] **Step 2: Create celery_app.py**

```python
"""Celery configuration for AskDB background tasks."""
from celery import Celery
from config import settings

celery_app = Celery("askdb")

celery_app.conf.update(
    broker_url=settings.CELERY_BROKER_URL,
    result_backend=settings.CELERY_RESULT_BACKEND,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_max_memory_per_child=settings.ML_WORKER_MAX_MEMORY_MB * 1000,  # KB
    task_routes={
        "ml_tasks.train_model": {"queue": "ml_training"},
        "ml_tasks.analyze_features": {"queue": "ml_quick"},
        "ml_tasks.prepare_data": {"queue": "ml_quick"},
    },
    task_default_queue="ml_quick",
    task_time_limit=settings.ML_TRAINING_TIMEOUT_SECONDS,
)
```

- [ ] **Step 3: Create celery_worker.py**

```python
"""Celery worker entry point.

Run: celery -A celery_worker worker --loglevel=info --queues=ml_quick,ml_training
"""
from celery_app import celery_app
import ml_tasks  # noqa: F401 — register tasks
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/celery_app.py backend/celery_worker.py backend/config.py
git commit -m "feat: add Celery + Redis task queue infrastructure"
```

---

## Task 3: ML Feature Engine

**Files:**
- Create: `backend/ml_feature_engine.py`
- Create: `backend/tests/test_ml_feature_engine.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_ml_feature_engine.py`:

```python
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
            "created_at": ["2024-01-01", "2024-01-02", "2024-01-03"],
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
        assert result["X_train"].shape[0] == 80
        assert result["X_test"].shape[0] == 20
        assert result["y_train"].shape[0] == 80
        assert result["y_test"].shape[0] == 20
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_ml_feature_engine.py -v
```

- [ ] **Step 3: Implement ml_feature_engine.py**

Create `backend/ml_feature_engine.py`:

```python
"""Automated feature engineering for ML pipeline.

Detects column types, excludes PII, handles missing values,
encodes categoricals, scales numerics, extracts date features.
"""
from typing import Any
import unicodedata

import polars as pl
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder

# Reuse PII patterns from pii_masking.py
_PII_SUBSTRINGS = [
    "ssn", "social_security", "passport", "driver_license",
    "credit_card", "card_number", "cvv", "pin",
    "email", "phone", "mobile", "fax",
    "address", "zip_code", "postal",
    "dob", "date_of_birth", "birth_date",
    "password", "secret", "token",
]


def _is_pii_column(name: str) -> bool:
    normalized = unicodedata.normalize("NFKC", name).lower()
    return any(p in normalized for p in _PII_SUBSTRINGS)


def detect_column_types(df: pl.DataFrame) -> dict[str, str]:
    """Detect column types: numeric, categorical, datetime, text, pii."""
    types = {}
    for col in df.columns:
        if _is_pii_column(col):
            types[col] = "pii"
            continue

        dtype = df[col].dtype
        if dtype in (pl.Float32, pl.Float64, pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64):
            types[col] = "numeric"
        elif dtype in (pl.Date, pl.Datetime, pl.Time, pl.Duration):
            types[col] = "datetime"
        elif dtype in (pl.Utf8, pl.String):
            unique_ratio = df[col].n_unique() / max(len(df), 1)
            if unique_ratio > 0.5 and len(df) > 20:
                avg_len = df[col].str.len_chars().mean()
                types[col] = "text" if avg_len and avg_len > 50 else "categorical"
            else:
                types[col] = "categorical"
        else:
            types[col] = "categorical"

    return types


def analyze_features(df: pl.DataFrame) -> list[dict[str, Any]]:
    """Analyze all features — type, missing %, unique count, basic stats."""
    types = detect_column_types(df)
    report = []
    for col in df.columns:
        col_type = types[col]
        null_count = df[col].null_count()
        missing_pct = (null_count / len(df)) * 100 if len(df) > 0 else 0

        entry = {
            "name": col,
            "type": col_type,
            "missing_pct": round(missing_pct, 1),
            "null_count": null_count,
            "unique_count": df[col].n_unique(),
        }

        if col_type == "numeric":
            numeric_col = df[col].drop_nulls().cast(pl.Float64)
            if len(numeric_col) > 0:
                entry["mean"] = float(numeric_col.mean())
                entry["std"] = float(numeric_col.std())
                entry["min"] = float(numeric_col.min())
                entry["max"] = float(numeric_col.max())

        report.append(entry)

    return report


def prepare_dataset(
    df: pl.DataFrame,
    target_column: str,
    test_size: float = 0.2,
    exclude_columns: list[str] = None,
) -> dict:
    """Prepare dataset for ML training.
    
    - Excludes PII columns automatically
    - Handles missing values (median for numeric, mode for categorical)
    - Encodes categoricals (label encoding)
    - Scales numerics (StandardScaler)
    - Splits into train/test
    
    Returns dict with X_train, X_test, y_train, y_test, feature_names, encoders, scaler.
    """
    types = detect_column_types(df)
    exclude = set(exclude_columns or [])
    exclude.add(target_column)

    # Auto-exclude PII
    for col, col_type in types.items():
        if col_type == "pii":
            exclude.add(col)

    feature_cols = [c for c in df.columns if c not in exclude]

    # Convert to pandas for sklearn compatibility
    pdf = df.select(feature_cols + [target_column]).to_pandas()

    # Handle missing values
    for col in feature_cols:
        if types.get(col) == "numeric":
            pdf[col] = pdf[col].fillna(pdf[col].median())
        else:
            pdf[col] = pdf[col].fillna(pdf[col].mode().iloc[0] if not pdf[col].mode().empty else "unknown")

    # Encode categoricals
    encoders = {}
    for col in feature_cols:
        if types.get(col) in ("categorical", "text"):
            le = LabelEncoder()
            pdf[col] = le.fit_transform(pdf[col].astype(str))
            encoders[col] = le

    # Split
    X = pdf[feature_cols].values
    y = pdf[target_column].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y if len(set(y)) < 20 else None
    )

    # Scale
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    return {
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "feature_names": feature_cols,
        "encoders": encoders,
        "scaler": scaler,
    }
```

- [ ] **Step 4: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_ml_feature_engine.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/ml_feature_engine.py backend/tests/test_ml_feature_engine.py
git commit -m "feat: add ML feature engine — auto type detection, PII exclusion, data preparation"
```

---

## Task 4: ML Models Catalog

**Files:**
- Create: `backend/ml_models.py`

- [ ] **Step 1: Create ml_models.py**

```python
"""ML model catalog — maps task types to candidate models with configs."""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ModelConfig:
    name: str
    task_type: str  # classification, regression, clustering, anomaly, timeseries, nlp
    library: str    # sklearn, xgboost, lightgbm, prophet, statsforecast, transformers
    class_path: str # e.g. "sklearn.ensemble.RandomForestClassifier"
    default_params: dict = field(default_factory=dict)
    description: str = ""


CLASSIFICATION_MODELS = [
    ModelConfig("XGBoost", "classification", "xgboost", "xgboost.XGBClassifier",
                {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1, "use_label_encoder": False, "eval_metric": "logloss"},
                "Gradient boosting — best for structured/tabular data"),
    ModelConfig("LightGBM", "classification", "lightgbm", "lightgbm.LGBMClassifier",
                {"n_estimators": 100, "max_depth": -1, "learning_rate": 0.1, "verbose": -1},
                "Fast gradient boosting — good with categoricals"),
    ModelConfig("Random Forest", "classification", "sklearn", "sklearn.ensemble.RandomForestClassifier",
                {"n_estimators": 100, "max_depth": None, "random_state": 42},
                "Ensemble — interpretable, robust baseline"),
    ModelConfig("Logistic Regression", "classification", "sklearn", "sklearn.linear_model.LogisticRegression",
                {"max_iter": 1000, "random_state": 42},
                "Linear — fast, interpretable, good baseline"),
]

REGRESSION_MODELS = [
    ModelConfig("XGBoost", "regression", "xgboost", "xgboost.XGBRegressor",
                {"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1},
                "Gradient boosting regressor"),
    ModelConfig("LightGBM", "regression", "lightgbm", "lightgbm.LGBMRegressor",
                {"n_estimators": 100, "learning_rate": 0.1, "verbose": -1},
                "Fast gradient boosting regressor"),
    ModelConfig("Random Forest", "regression", "sklearn", "sklearn.ensemble.RandomForestRegressor",
                {"n_estimators": 100, "random_state": 42},
                "Ensemble regressor"),
    ModelConfig("Linear Regression", "regression", "sklearn", "sklearn.linear_model.LinearRegression",
                {}, "Linear baseline"),
]

CLUSTERING_MODELS = [
    ModelConfig("KMeans", "clustering", "sklearn", "sklearn.cluster.KMeans",
                {"n_clusters": 5, "random_state": 42, "n_init": 10},
                "Centroid-based clustering"),
    ModelConfig("DBSCAN", "clustering", "sklearn", "sklearn.cluster.DBSCAN",
                {"eps": 0.5, "min_samples": 5},
                "Density-based — finds arbitrary shapes"),
]

ANOMALY_MODELS = [
    ModelConfig("Isolation Forest", "anomaly", "sklearn", "sklearn.ensemble.IsolationForest",
                {"n_estimators": 100, "contamination": 0.1, "random_state": 42},
                "Tree-based anomaly detector"),
    ModelConfig("Local Outlier Factor", "anomaly", "sklearn", "sklearn.neighbors.LocalOutlierFactor",
                {"n_neighbors": 20, "contamination": 0.1},
                "Distance-based outlier detection"),
]

MODEL_CATALOG = {
    "classification": CLASSIFICATION_MODELS,
    "regression": REGRESSION_MODELS,
    "clustering": CLUSTERING_MODELS,
    "anomaly": ANOMALY_MODELS,
}


def get_models_for_task(task_type: str) -> list[ModelConfig]:
    """Get candidate models for a task type."""
    return MODEL_CATALOG.get(task_type, [])


def instantiate_model(config: ModelConfig, params: dict = None) -> Any:
    """Instantiate a model from its config."""
    import importlib
    parts = config.class_path.rsplit(".", 1)
    module = importlib.import_module(parts[0])
    cls = getattr(module, parts[1])
    merged_params = {**config.default_params, **(params or {})}
    return cls(**merged_params)
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/ml_models.py
git commit -m "feat: add ML model catalog — classification, regression, clustering, anomaly"
```

---

## Task 5: ML Engine Orchestrator

**Files:**
- Create: `backend/ml_engine.py`
- Create: `backend/tests/test_ml_engine.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_ml_engine.py`:

```python
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
```

- [ ] **Step 2: Implement ml_engine.py**

Create `backend/ml_engine.py`:

```python
"""ML Engine orchestrator — manages the full AutoML pipeline.

Ingests data from DuckDB twin via Arrow/Polars, runs feature engineering,
trains models (sync or Celery), evaluates, and stores results.
"""
import os
import json
import uuid
import logging
from typing import Any, Optional
from datetime import datetime

import polars as pl
import numpy as np
import joblib
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, mean_squared_error, r2_score

from config import settings
from ml_feature_engine import detect_column_types, analyze_features, prepare_dataset
from ml_models import get_models_for_task, instantiate_model, ModelConfig

logger = logging.getLogger(__name__)


class MLEngine:
    """Full AutoML pipeline orchestrator."""

    def ingest_dataframe(self, df: pl.DataFrame) -> pl.LazyFrame:
        """Wrap DataFrame as LazyFrame for lazy evaluation."""
        return df.lazy()

    def ingest_from_twin(self, conn_id: str, tables: list[str]) -> pl.DataFrame:
        """Pull data from DuckDB twin into Polars via Arrow (zero-copy)."""
        import duckdb
        import pyarrow as pa

        twin_path = os.path.join(settings.TURBO_TWIN_DIR, f"{conn_id}.duckdb")
        if not os.path.exists(twin_path):
            raise FileNotFoundError(f"No twin for connection {conn_id}")

        con = duckdb.connect(twin_path, read_only=True)
        try:
            frames = []
            for table in tables:
                arrow_table = con.execute(f'SELECT * FROM "{table}"').fetch_arrow_table()
                frames.append(pl.from_arrow(arrow_table))
            return frames[0] if len(frames) == 1 else frames
        finally:
            con.close()

    def detect_task_type(self, df: pl.DataFrame, target_column: str) -> str:
        """Auto-detect ML task type from target column."""
        col = df[target_column]
        dtype = col.dtype

        if dtype in (pl.Float32, pl.Float64):
            unique_ratio = col.n_unique() / max(len(df), 1)
            return "regression" if unique_ratio > 0.1 else "classification"
        elif dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64):
            n_unique = col.n_unique()
            return "classification" if n_unique <= 20 else "regression"
        else:
            return "classification"

    def train_sync(
        self,
        df: pl.DataFrame,
        target_column: str,
        model_names: list[str],
        task_type: str = None,
        params_override: dict = None,
    ) -> dict:
        """Train models synchronously (for small datasets or testing).
        
        For production, use train_async() which submits Celery tasks.
        """
        if task_type is None:
            task_type = self.detect_task_type(df, target_column)

        # Prepare data
        prepared = prepare_dataset(df, target_column)
        X_train, X_test = prepared["X_train"], prepared["X_test"]
        y_train, y_test = prepared["y_train"], prepared["y_test"]

        catalog = get_models_for_task(task_type)
        results = []

        for model_name in model_names:
            config = next((m for m in catalog if m.name == model_name), None)
            if not config:
                logger.warning(f"Model {model_name} not found for task {task_type}")
                continue

            model = instantiate_model(config, params_override)
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)

            if task_type == "classification":
                avg = "binary" if len(set(y_test)) == 2 else "weighted"
                metrics = {
                    "accuracy": float(accuracy_score(y_test, y_pred)),
                    "precision": float(precision_score(y_test, y_pred, average=avg, zero_division=0)),
                    "recall": float(recall_score(y_test, y_pred, average=avg, zero_division=0)),
                    "f1": float(f1_score(y_test, y_pred, average=avg, zero_division=0)),
                }
            else:
                metrics = {
                    "mse": float(mean_squared_error(y_test, y_pred)),
                    "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
                    "r2": float(r2_score(y_test, y_pred)),
                }

            model_id = uuid.uuid4().hex[:12]
            results.append({
                "model_id": model_id,
                "model_name": model_name,
                "task_type": task_type,
                "metrics": metrics,
                "feature_names": prepared["feature_names"],
                "trained_model": model,
                "scaler": prepared["scaler"],
                "encoders": prepared["encoders"],
            })

        return {"models": results, "task_type": task_type}

    def save_model(self, result: dict, user_hash: str) -> str:
        """Save trained model to disk."""
        model_id = result["model_id"]
        model_dir = os.path.join(settings.ML_MODELS_DIR, user_hash, model_id)
        os.makedirs(model_dir, exist_ok=True)

        joblib.dump(result["trained_model"], os.path.join(model_dir, "model.joblib"))
        joblib.dump(result["scaler"], os.path.join(model_dir, "scaler.joblib"))
        joblib.dump(result["encoders"], os.path.join(model_dir, "encoders.joblib"))

        metadata = {
            "model_id": model_id,
            "model_name": result["model_name"],
            "task_type": result["task_type"],
            "metrics": result["metrics"],
            "feature_names": result["feature_names"],
            "created_at": datetime.utcnow().isoformat(),
        }
        with open(os.path.join(model_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f, indent=2)

        # Set file permissions (owner-only)
        for fpath in [os.path.join(model_dir, fname) for fname in os.listdir(model_dir)]:
            try:
                os.chmod(fpath, 0o600)
            except OSError:
                pass  # Windows may not support chmod

        return model_id
```

- [ ] **Step 3: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/test_ml_engine.py -v
```

Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/ml_engine.py backend/tests/test_ml_engine.py
git commit -m "feat: add ML engine orchestrator — ingest, detect task type, train, save"
```

---

## Task 6: ML Celery Tasks

**Files:**
- Create: `backend/ml_tasks.py`

- [ ] **Step 1: Create ml_tasks.py**

```python
"""Celery tasks for long-running ML operations."""
import json
import logging
from celery_app import celery_app
from ml_engine import MLEngine
from ml_feature_engine import analyze_features
import polars as pl

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, queue="ml_training", name="ml_tasks.train_model")
def train_model(self, dataset_path: str, target_column: str, model_names: list, task_type: str, user_hash: str):
    """Long-running model training task.
    
    Streams progress via self.update_state().
    Saves model on completion.
    """
    engine = MLEngine()

    self.update_state(state="PROGRESS", meta={"stage": "loading", "progress": 0})

    # Load data
    df = pl.read_parquet(dataset_path)
    self.update_state(state="PROGRESS", meta={"stage": "preparing", "progress": 10})

    # Train
    total = len(model_names)
    results = []
    for i, model_name in enumerate(model_names):
        self.update_state(state="PROGRESS", meta={
            "stage": "training",
            "current_model": model_name,
            "model_index": i,
            "total_models": total,
            "progress": 10 + int((i / total) * 80),
        })

        result = engine.train_sync(df, target_column, [model_name], task_type)
        if result["models"]:
            model_result = result["models"][0]
            model_id = engine.save_model(model_result, user_hash)
            results.append({
                "model_id": model_id,
                "model_name": model_name,
                "metrics": model_result["metrics"],
            })

    self.update_state(state="PROGRESS", meta={"stage": "complete", "progress": 100})

    return {"models": results, "task_type": task_type}


@celery_app.task(queue="ml_quick", name="ml_tasks.analyze_features")
def analyze_features_task(dataset_path: str):
    """Quick feature analysis task."""
    df = pl.read_parquet(dataset_path)
    return analyze_features(df)
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/ml_tasks.py
git commit -m "feat: add Celery ML tasks — train_model with progress streaming"
```

---

## Task 7: ML API Routes

**Files:**
- Create: `backend/routers/ml_routes.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create ml_routes.py**

```python
"""ML Engine API routes."""
import os
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import settings
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ml", tags=["ml"])


class TrainRequest(BaseModel):
    conn_id: str
    tables: list[str]
    target_column: str
    model_names: list[str] = []
    task_type: Optional[str] = None


class PredictRequest(BaseModel):
    model_id: str
    data: dict  # column_name -> values


@router.post("/train")
async def train_models(req: TrainRequest, user=Depends(get_current_user)):
    """Submit ML training job. Returns task_id for progress polling."""
    if not settings.ML_ENGINE_ENABLED:
        raise HTTPException(503, "ML Engine is not enabled")

    from ml_engine import MLEngine
    engine = MLEngine()

    # Ingest data from twin
    df = engine.ingest_from_twin(req.conn_id, req.tables)
    if isinstance(df, list):
        df = df[0]  # Use first table for now

    # Save to parquet for Celery worker
    import hashlib
    user_hash = hashlib.sha256(user["email"].encode()).hexdigest()[:8]
    dataset_dir = os.path.join(settings.ML_MODELS_DIR, user_hash)
    os.makedirs(dataset_dir, exist_ok=True)
    dataset_path = os.path.join(dataset_dir, "dataset.parquet")
    df.write_parquet(dataset_path)

    # Auto-detect task type if not provided
    task_type = req.task_type or engine.detect_task_type(df, req.target_column)

    # Select models if not specified
    model_names = req.model_names
    if not model_names:
        from ml_models import get_models_for_task
        model_names = [m.name for m in get_models_for_task(task_type)]

    # Submit Celery task
    from ml_tasks import train_model
    task = train_model.delay(dataset_path, req.target_column, model_names, task_type, user_hash)

    return {"task_id": task.id, "task_type": task_type, "model_names": model_names}


@router.get("/status/{task_id}")
async def training_status(task_id: str, user=Depends(get_current_user)):
    """Poll training progress."""
    from celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "state": result.state,
        "meta": result.info if isinstance(result.info, dict) else {},
    }


@router.get("/models")
async def list_models(user=Depends(get_current_user)):
    """List trained models for current user."""
    import hashlib
    user_hash = hashlib.sha256(user["email"].encode()).hexdigest()[:8]
    models_dir = os.path.join(settings.ML_MODELS_DIR, user_hash)

    if not os.path.exists(models_dir):
        return {"models": []}

    models = []
    for model_id in os.listdir(models_dir):
        meta_path = os.path.join(models_dir, model_id, "metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                models.append(json.load(f))

    return {"models": models}


@router.delete("/models/{model_id}")
async def delete_model(model_id: str, user=Depends(get_current_user)):
    """Delete a trained model."""
    import hashlib
    import shutil
    user_hash = hashlib.sha256(user["email"].encode()).hexdigest()[:8]
    model_dir = os.path.join(settings.ML_MODELS_DIR, user_hash, model_id)

    if not os.path.exists(model_dir):
        raise HTTPException(404, "Model not found")

    shutil.rmtree(model_dir)
    return {"deleted": model_id}
```

- [ ] **Step 2: Register in main.py**

In `backend/main.py`, add after existing router registrations:

```python
from routers import ml_routes
app.include_router(ml_routes.router)
```

- [ ] **Step 3: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/routers/ml_routes.py backend/main.py
git commit -m "feat: add ML API routes — train, status, models, delete"
```

---

## Task 8: Agent ML Tools

**Files:**
- Modify: `backend/agent_engine.py`

- [ ] **Step 1: Add ML tool definitions**

Read current `agent_engine.py`. Find `TOOL_DEFINITIONS` list (lines 25-149). Add ML tool definitions after the core tools:

```python
ML_TOOL_DEFINITIONS = [
    {
        "name": "ml_analyze_features",
        "description": "Analyze features in the dataset — auto-detect types, missing values, correlations, PII columns. Call this first before training.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tables": {"type": "array", "items": {"type": "string"}, "description": "Table names to analyze from connected database"},
            },
            "required": ["tables"],
        },
    },
    {
        "name": "ml_train",
        "description": "Train ML models on the dataset. Returns task_id for progress tracking.",
        "input_schema": {
            "type": "object",
            "properties": {
                "target_column": {"type": "string", "description": "Column to predict"},
                "model_names": {"type": "array", "items": {"type": "string"}, "description": "Model names to train. Leave empty for auto-selection."},
                "task_type": {"type": "string", "enum": ["classification", "regression", "clustering", "anomaly"], "description": "ML task type. Auto-detected if omitted."},
            },
            "required": ["target_column"],
        },
    },
    {
        "name": "ml_check_progress",
        "description": "Check training progress for a submitted training job.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task ID from ml_train"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "ml_evaluate",
        "description": "Get evaluation metrics and comparison for trained models.",
        "input_schema": {
            "type": "object",
            "properties": {
                "model_ids": {"type": "array", "items": {"type": "string"}, "description": "Model IDs to compare"},
            },
            "required": ["model_ids"],
        },
    },
]
```

- [ ] **Step 2: Add ML tool handlers to _dispatch_tool()**

In the dispatch dict (lines ~977-993), add:

```python
"ml_analyze_features": self._tool_ml_analyze_features,
"ml_train": self._tool_ml_train,
"ml_check_progress": self._tool_ml_check_progress,
"ml_evaluate": self._tool_ml_evaluate,
```

- [ ] **Step 3: Implement ML tool handler methods**

Add to `AgentEngine` class:

```python
def _tool_ml_analyze_features(self, tables: list) -> str:
    from ml_engine import MLEngine
    from ml_feature_engine import analyze_features
    engine = MLEngine()
    df = engine.ingest_from_twin(self._conn_id, tables)
    if isinstance(df, list):
        df = df[0]
    report = analyze_features(df)
    return json.dumps(report, indent=2)

def _tool_ml_train(self, target_column: str, model_names: list = None, task_type: str = None) -> str:
    from ml_engine import MLEngine
    engine = MLEngine()
    df = engine.ingest_from_twin(self._conn_id, [])  # Uses all twin tables
    result = engine.train_sync(df, target_column, model_names or [], task_type)
    # Save models
    import hashlib
    user_hash = hashlib.sha256(self._user_email.encode()).hexdigest()[:8]
    saved = []
    for model_result in result["models"]:
        model_id = engine.save_model(model_result, user_hash)
        saved.append({"model_id": model_id, "name": model_result["model_name"], "metrics": model_result["metrics"]})
    return json.dumps({"task_type": result["task_type"], "models": saved}, indent=2)

def _tool_ml_check_progress(self, task_id: str) -> str:
    from celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return json.dumps({"state": result.state, "meta": result.info if isinstance(result.info, dict) else {}})

def _tool_ml_evaluate(self, model_ids: list) -> str:
    import hashlib
    user_hash = hashlib.sha256(self._user_email.encode()).hexdigest()[:8]
    models = []
    for mid in model_ids:
        meta_path = os.path.join(settings.ML_MODELS_DIR, user_hash, mid, "metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                models.append(json.load(f))
    return json.dumps({"models": models}, indent=2)
```

- [ ] **Step 4: Include ML tools based on agent context**

Where tools are assembled for the agent (find where `TOOL_DEFINITIONS + DASHBOARD_TOOL_DEFINITIONS` is built), add:

```python
if agent_context == "ml" and settings.ML_ENGINE_ENABLED:
    tools.extend(ML_TOOL_DEFINITIONS)
```

- [ ] **Step 5: Run tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=30
```

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add backend/agent_engine.py
git commit -m "feat: add ML agent tools — analyze, train, check progress, evaluate"
```

---

## Task 9: Frontend — ML Engine Page + Components

**Files:**
- Create: `frontend/src/pages/MLEngine.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AppSidebar.jsx`
- Modify: `frontend/src/store.js`
- Modify: `frontend/src/api.js`

> **REQUIRED:** Invoke taste or impeccable or emil-design-eng skill for ALL these components.

- [ ] **Step 1: Add ML state to store.js**

In `frontend/src/store.js`, add to agent slice:

```javascript
mlModels: [],
mlTrainingTaskId: null,
mlTrainingProgress: null,
setMLModels: (models) => set({ mlModels: models }),
setMLTrainingTaskId: (id) => set({ mlTrainingTaskId: id }),
setMLTrainingProgress: (progress) => set({ mlTrainingProgress: progress }),
```

- [ ] **Step 2: Add ML API functions to api.js**

```javascript
// ML Engine
mlTrain: (connId, tables, targetColumn, modelNames, taskType) =>
  request("/v1/ml/train", {
    method: "POST",
    body: JSON.stringify({ conn_id: connId, tables, target_column: targetColumn, model_names: modelNames, task_type: taskType }),
  }),
mlStatus: (taskId) => request(`/v1/ml/status/${taskId}`),
mlModels: () => request("/v1/ml/models"),
mlDeleteModel: (modelId) => request(`/v1/ml/models/${modelId}`, { method: "DELETE" }),
```

- [ ] **Step 3: Create MLEngine.jsx page**

Create `frontend/src/pages/MLEngine.jsx` — layout with workspace (left) + agent panel (right, docked, ML context). Use taste/impeccable skill for design.

The page should:
- Show connection picker (existing DatabaseSwitcher)
- Require Turbo Mode enabled (show message if not)
- Set `agentContext: 'ml'` on mount
- Render `<AgentPanel connId={connId} defaultDock="right" />` for ML agent

- [ ] **Step 4: Add route to App.jsx**

```javascript
import { lazy } from 'react';
const MLEngine = lazy(() => import('./pages/MLEngine'));

// In routes, after /analytics:
<Route path="/ml-engine" element={<AppPage><MLEngine /></AppPage>} />
```

- [ ] **Step 5: Add nav item to AppSidebar.jsx**

In `NAV_ITEMS` array:

```javascript
{ id: "ml-engine", path: "/ml-engine", label: "ML Engine", icon: /* brain/beaker SVG */ },
```

- [ ] **Step 6: Build + lint**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/frontend"
npm run lint && npm run build
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1"
git add frontend/src/pages/MLEngine.jsx frontend/src/App.jsx frontend/src/components/AppSidebar.jsx frontend/src/store.js frontend/src/api.js
git commit -m "feat: add ML Engine page with agent panel integration"
```

---

## Task 10: Full Test Suite + Push

- [ ] **Step 1: Run all backend tests**

```bash
cd "C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/backend"
python -m pytest tests/ -v --timeout=60
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
