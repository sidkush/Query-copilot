"""ML Engine orchestrator — manages the full AutoML pipeline."""
import os
import json
import uuid
import logging
from typing import Any, Optional
from datetime import datetime

import polars as pl
import numpy as np
import joblib
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_squared_error, r2_score
)

from config import settings
from ml_feature_engine import detect_column_types, analyze_features, prepare_dataset
from ml_models import get_models_for_task, instantiate_model

logger = logging.getLogger(__name__)


class MLEngine:
    """Full AutoML pipeline orchestrator."""

    def ingest_dataframe(self, df: pl.DataFrame) -> pl.LazyFrame:
        return df.lazy()

    def ingest_from_twin(self, conn_id: str, tables: list[str]) -> pl.DataFrame:
        """Pull data from DuckDB twin into Polars via Arrow (zero-copy)."""
        import duckdb
        twin_path = os.path.join(settings.TURBO_TWIN_DIR, f"{conn_id}.duckdb")
        if not os.path.exists(twin_path):
            raise FileNotFoundError(f"No twin for connection {conn_id}")
        con = duckdb.connect(twin_path, read_only=True)
        try:
            if not tables:
                # Get all non-internal tables
                all_tables = con.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='main' AND table_name NOT LIKE '\\_%' ESCAPE '\\'"
                ).fetchall()
                tables = [t[0] for t in all_tables]
            frames = []
            for table in tables:
                arrow_table = con.execute(f'SELECT * FROM "{table}"').fetch_arrow_table()
                frames.append(pl.from_arrow(arrow_table))
            return frames[0] if len(frames) == 1 else frames
        finally:
            con.close()

    def detect_task_type(self, df: pl.DataFrame, target_column: str) -> str:
        col = df[target_column]
        dtype = col.dtype
        if dtype in (pl.Float32, pl.Float64):
            unique_ratio = col.n_unique() / max(len(df), 1)
            return "regression" if unique_ratio > 0.1 else "classification"
        elif dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64):
            return "classification" if col.n_unique() <= 20 else "regression"
        else:
            return "classification"

    def train_sync(self, df: pl.DataFrame, target_column: str,
                   model_names: list[str], task_type: str = None,
                   params_override: dict = None) -> dict:
        """Train models synchronously."""
        if task_type is None:
            task_type = self.detect_task_type(df, target_column)

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
            "created_at": datetime.now(tz=None).astimezone().isoformat(),
        }
        with open(os.path.join(model_dir, "metadata.json"), "w") as f:
            json.dump(metadata, f, indent=2)

        for fname in os.listdir(model_dir):
            fpath = os.path.join(model_dir, fname)
            try:
                os.chmod(fpath, 0o600)
            except OSError:
                pass

        return model_id
