"""Automated feature engineering for ML pipeline.

Detects column types, excludes PII, handles missing values,
encodes categoricals, scales numerics, extracts date features.
"""
from typing import Any
import unicodedata

import polars as pl
import numpy as np

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
        if dtype in (pl.Float32, pl.Float64, pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                     pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64):
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
    """Analyze all features -- type, missing %, unique count, basic stats."""
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


def prepare_dataset(df: pl.DataFrame, target_column: str, test_size: float = 0.2,
                    exclude_columns: list[str] = None, schema_profile=None) -> dict:
    """Prepare dataset for ML training — pure Polars, no pandas.

    All feature engineering stays lazy/Polars until final .to_numpy() for sklearn.
    Train/test split uses deterministic hash-based splitting (no shuffle needed).
    """
    types = detect_column_types(df)
    exclude = set(exclude_columns or [])
    exclude.add(target_column)

    # Auto-exclude PII columns
    for col, col_type in types.items():
        if col_type == "pii":
            exclude.add(col)

    feature_cols = [c for c in df.columns if c not in exclude]

    # Select only needed columns (column pruning)
    df = df.select(feature_cols + [target_column])

    # --- Feature Engineering in pure Polars ---

    # 1. Handle missing values (Polars native)
    fill_exprs = []
    for col in feature_cols:
        if types.get(col) == "numeric":
            fill_exprs.append(pl.col(col).fill_null(pl.col(col).median()))
        else:
            fill_exprs.append(pl.col(col).fill_null(pl.col(col).mode().first()))
    if fill_exprs:
        df = df.with_columns(fill_exprs)

    # 2. Encode target column if categorical/string
    target_mapping = None
    if types.get(target_column) in ("categorical", "text") or df[target_column].dtype in (pl.Utf8, pl.String):
        # Build deterministic label mapping (sorted for consistency)
        unique_vals = sorted(df[target_column].unique().drop_nulls().to_list(), key=str)
        target_mapping = {val: idx for idx, val in enumerate(unique_vals)}
        df = df.with_columns(
            pl.col(target_column).cast(pl.String).replace_strict(
                {str(k): v for k, v in target_mapping.items()}
            ).cast(pl.Int64).alias(target_column)
        )

    # 3. Encode categorical features (label encoding in Polars)
    feature_mappings = {}
    for col in feature_cols:
        if types.get(col) in ("categorical", "text"):
            unique_vals = sorted(df[col].cast(pl.String).unique().drop_nulls().to_list(), key=str)
            mapping = {val: idx for idx, val in enumerate(unique_vals)}
            feature_mappings[col] = mapping
            df = df.with_columns(
                pl.col(col).cast(pl.String).replace_strict(
                    {str(k): v for k, v in mapping.items()}
                ).cast(pl.Float64).alias(col)
            )

    # 4. Scale numeric features (StandardScaler equivalent in Polars)
    scale_stats = {}
    for col in feature_cols:
        if types.get(col) == "numeric":
            mean_val = df[col].mean()
            std_val = df[col].std()
            if std_val and std_val > 0:
                scale_stats[col] = {"mean": mean_val, "std": std_val}
                df = df.with_columns(
                    ((pl.col(col) - mean_val) / std_val).alias(col)
                )

    # 5. Deterministic train/test split (hash-based, no shuffle needed)
    # Try primary key from schema_profile, fallback to struct hash
    pk_cols = []
    if schema_profile:
        for tp in getattr(schema_profile, 'tables', []):
            if hasattr(tp, 'primary_keys') and tp.primary_keys:
                pk_cols = [pk for pk in tp.primary_keys if pk in df.columns]
                break

    split_pct = int((1.0 - test_size) * 100)

    if pk_cols:
        # Hash on primary key
        pk_expr = pl.col(pk_cols[0]) if len(pk_cols) == 1 else pl.struct([pl.col(c) for c in pk_cols])
        train_df = df.filter(pk_expr.hash(seed=42) % 100 < split_pct)
        test_df = df.filter(pk_expr.hash(seed=42) % 100 >= split_pct)
    else:
        # Deduplicate then hash on all columns
        df = df.unique(maintain_order=False)
        train_df = df.filter(pl.struct(pl.all()).hash(seed=42) % 100 < split_pct)
        test_df = df.filter(pl.struct(pl.all()).hash(seed=42) % 100 >= split_pct)

    # 6. Final materialization to numpy — ONLY copy in entire pipeline
    X_train = train_df.select(feature_cols).to_numpy()
    X_test = test_df.select(feature_cols).to_numpy()
    y_train = train_df.select(target_column).to_numpy().ravel()
    y_test = test_df.select(target_column).to_numpy().ravel()

    return {
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "feature_names": feature_cols,
        "encoders": feature_mappings,  # Polars-native mappings, not sklearn LabelEncoder
        "scaler": scale_stats,  # dict of {col: {mean, std}}, not sklearn StandardScaler
        "target_encoder": target_mapping,  # {val: int} mapping
    }
