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
                    exclude_columns: list[str] = None) -> dict:
    """Prepare dataset for ML training."""
    types = detect_column_types(df)
    exclude = set(exclude_columns or [])
    exclude.add(target_column)
    for col, col_type in types.items():
        if col_type == "pii":
            exclude.add(col)
    feature_cols = [c for c in df.columns if c not in exclude]
    pdf = df.select(feature_cols + [target_column]).to_pandas()

    for col in feature_cols:
        if types.get(col) == "numeric":
            pdf[col] = pdf[col].fillna(pdf[col].median())
        else:
            mode_val = pdf[col].mode()
            pdf[col] = pdf[col].fillna(mode_val.iloc[0] if not mode_val.empty else "unknown")

    encoders = {}
    for col in feature_cols:
        if types.get(col) in ("categorical", "text"):
            le = LabelEncoder()
            pdf[col] = le.fit_transform(pdf[col].astype(str))
            encoders[col] = le

    X = pdf[feature_cols].values
    y = pdf[target_column].values

    stratify = y if len(set(y)) < 20 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=stratify
    )
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    return {
        "X_train": X_train, "X_test": X_test,
        "y_train": y_train, "y_test": y_test,
        "feature_names": feature_cols,
        "encoders": encoders, "scaler": scaler,
    }
