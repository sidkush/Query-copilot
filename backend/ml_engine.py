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

    def ingest_from_source(self, connector, tables: list[str],
                           max_rows: int = None, sample_size: int = None,
                           stratify_column: str = None,
                           columns: list[str] = None) -> pl.DataFrame:
        """Query source database directly — bypasses twin sampling limits.

        Args:
            connector: DatabaseConnector with live connection
            tables: table names to query
            max_rows: absolute row cap (None = config default)
            sample_size: if set, take stratified random sample
            stratify_column: column for stratified sampling
        """
        import pyarrow as pa
        from sqlalchemy import inspect as sa_inspect

        if max_rows is None:
            max_rows = settings.ML_MAX_TRAINING_ROWS

        # Auto-discover tables if none specified
        if not tables:
            try:
                inspector = sa_inspect(connector._engine)
                tables = inspector.get_table_names()
                logger.info(f"Auto-discovered {len(tables)} tables from source DB")
            except Exception as e:
                logger.warning(f"Table auto-discovery failed: {e}")
                tables = []

        # Detect BigQuery for dialect-specific SQL
        db_type = getattr(connector, 'db_type', None)
        db_type_str = (db_type.value if hasattr(db_type, 'value') else str(db_type)).lower()
        is_bigquery = 'bigquery' in db_type_str
        is_mysql = 'mysql' in db_type_str or 'mariadb' in db_type_str

        # Quote character: backtick for BigQuery/MySQL, double-quote for others
        q = '`' if (is_bigquery or is_mysql) else '"'
        # Random function: RAND() for BigQuery/MySQL, RANDOM() for others
        rand_fn = 'RAND()' if (is_bigquery or is_mysql) else 'RANDOM()'

        # Column pruning: SELECT specific columns instead of SELECT *
        col_clause = '*'
        if columns:
            col_clause = ', '.join(f'{q}{c}{q}' for c in columns)

        frames = []
        for table in tables:
            if sample_size:
                sql = f'SELECT {col_clause} FROM {q}{table}{q} ORDER BY {rand_fn} LIMIT {sample_size}'
            elif max_rows and max_rows < 10_000_000:
                sql = f'SELECT {col_clause} FROM {q}{table}{q} LIMIT {max_rows}'
            else:
                sql = f'SELECT {col_clause} FROM {q}{table}{q}'

            try:
                arrow_table = connector.execute_query_arrow(
                    sql, timeout=settings.ML_TRAINING_QUERY_TIMEOUT
                )
                frames.append(pl.from_arrow(arrow_table))
            except Exception as e:
                logger.warning(f"Arrow query failed for {table}, falling back to pandas: {e}")
                # Fallback to regular execute_query
                df_pandas = connector.execute_query(sql)
                frames.append(pl.from_pandas(df_pandas))

        if not frames:
            raise ValueError("No tables to ingest")
        return frames[0] if len(frames) == 1 else pl.concat(frames)

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

            # Extract per-model params if params_override is keyed by model name
            model_params = None
            if params_override:
                if model_name in params_override and isinstance(params_override[model_name], dict):
                    model_params = params_override[model_name]
                elif not any(isinstance(v, dict) for v in params_override.values()):
                    model_params = params_override  # Flat dict — apply to all
            model = instantiate_model(config, model_params)
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
