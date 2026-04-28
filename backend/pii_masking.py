"""
PII Masking — Detect and redact sensitive data in query results.
"""

import json
import re
import threading
import unicodedata
from pathlib import Path
from typing import Set

SENSITIVE_COLUMN_PATTERNS = {
    "email", "e_mail", "email_address",
    "phone", "phone_number", "mobile", "cell",
    "ssn", "social_security", "tax_id", "sin",
    "credit_card", "card_number", "cc_number",
    "password", "passwd", "secret", "token", "api_key",
    "salary", "compensation", "wage", "income",
    "address", "street_address", "home_address",
    "dob", "date_of_birth", "birth_date", "birthday",
    "bank_account", "routing_number", "iban",
    "passport", "drivers_license", "license_number",
    "ip_address", "ip_addr",
}

PII_PATTERNS = {
    "email": re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
    "phone_us": re.compile(r'\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'),
    "ssn": re.compile(r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'),
    "credit_card": re.compile(r'\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b'),
    "ip_address": re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b'),
}


# ── PII Suppression Registry ───────────────────────────────────────
# Admin-flagged columns that are always redacted, regardless of pattern matching.

_suppression_lock = threading.Lock()
_SUPPRESSION_FILE = Path(__file__).resolve().parent / ".data" / "pii_suppressions.json"


def _load_suppressions() -> dict:
    """Load {conn_id: [col1, col2, ...]} mapping."""
    if _SUPPRESSION_FILE.exists():
        try:
            return json.loads(_SUPPRESSION_FILE.read_text("utf-8"))
        except Exception:
            return {}
    return {}


def _save_suppressions(data: dict):
    _SUPPRESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _SUPPRESSION_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), "utf-8")
    tmp.replace(_SUPPRESSION_FILE)


def add_suppressed_column(conn_id: str, column: str):
    """Admin: flag a column as always-redacted for a connection."""
    with _suppression_lock:
        data = _load_suppressions()
        cols = data.setdefault(conn_id, [])
        col_lower = column.lower().strip()
        if col_lower not in cols:
            cols.append(col_lower)
        _save_suppressions(data)


def remove_suppressed_column(conn_id: str, column: str):
    """Admin: unflag a column."""
    with _suppression_lock:
        data = _load_suppressions()
        cols = data.get(conn_id, [])
        col_lower = column.lower().strip()
        if col_lower in cols:
            cols.remove(col_lower)
            if not cols:
                del data[conn_id]
            _save_suppressions(data)


def list_suppressed_columns(conn_id: str = None) -> dict:
    """List suppressed columns, optionally filtered by conn_id."""
    data = _load_suppressions()
    if conn_id:
        return {conn_id: data.get(conn_id, [])}
    return data


def get_suppressed_set(conn_id: str = None) -> Set[str]:
    """Get all suppressed column names (global + per-connection) as a set."""
    data = _load_suppressions()
    result = set(data.get("_global", []))
    if conn_id and conn_id in data:
        result.update(data[conn_id])
    return result


def mask_dataframe(df, mask_char: str = "*", extra_columns: Set[str] = None, conn_id: str = None):
    import pandas as pd  # Lazy import: avoids native DLL conflict with ChromaDB on Windows
    if df is None or df.empty:
        return df

    masked = df.copy()
    extra = extra_columns or set()
    # Merge admin-suppressed columns
    extra = extra | get_suppressed_set(conn_id)
    columns_to_mask = set()

    for col in masked.columns:
        col_lower = unicodedata.normalize("NFKC", col).lower().replace(" ", "_")
        if any(p in col_lower for p in SENSITIVE_COLUMN_PATTERNS) or col_lower in extra:
            columns_to_mask.add(col)

    for col in columns_to_mask:
        masked[col] = masked[col].apply(lambda x: _mask_value(str(x), mask_char))

    for col in masked.columns:
        if col in columns_to_mask:
            continue
        if masked[col].dtype == "object":
            masked[col] = masked[col].apply(
                lambda x: _scan_and_mask(str(x), mask_char) if pd.notna(x) else x
            )

    return masked


def _mask_value(value: str, mask_char: str) -> str:
    if len(value) <= 4:
        return mask_char * len(value)
    return value[0] + mask_char * (len(value) - 2) + value[-1]


def _scan_and_mask(value: str, mask_char: str) -> str:
    result = value
    for pattern in PII_PATTERNS.values():
        result = pattern.sub(lambda m: _mask_value(m.group(), mask_char), result)
    return result


def _is_sensitive_column_name(col_name_lower: str) -> bool:
    """Check if a normalized-lowercase column name matches any sensitive pattern (substring)."""
    return any(p in col_name_lower for p in SENSITIVE_COLUMN_PATTERNS)


def is_sensitive_column_name(col_name: str) -> bool:
    """Public wrapper: NFKC-normalize + lowercase + space-to-underscore +
    substring match against SENSITIVE_COLUMN_PATTERNS. Used by enrichment
    paths (query_engine.py) to drop sensitive columns from long-lived
    storage (ChromaDB schema docs) before SELECT runs.
    """
    if not col_name:
        return False
    col_lower = unicodedata.normalize("NFKC", col_name).lower().replace(" ", "_")
    return _is_sensitive_column_name(col_lower)


def redact_pii_value(value: str) -> str:
    """If value matches any PII regex (email/phone/ssn/cc/ip), replace the
    entire value with '[REDACTED]'; else return unchanged. Differs from
    _scan_and_mask: full-value replacement, not partial mask. Used by
    enrichment paths storing values into ChromaDB schema docs — full
    replacement avoids partial-info leak (e.g. domain in s***k@gmail.com).
    """
    if not isinstance(value, str) or not value:
        return value
    for pattern in PII_PATTERNS.values():
        if pattern.search(value):
            return "[REDACTED]"
    return value


def mask_record_batch(batch, mask_char: str = "*", conn_id: str = None):
    """Mask PII in an Arrow RecordBatch. Same logic as mask_dataframe but Arrow-native.

    - Sensitive columns (by name pattern): mask all values via _mask_value()
    - Non-sensitive string columns: scan values for PII regex patterns
    - Non-sensitive non-string columns: pass through unchanged
    - Nulls preserved as None
    """
    import pyarrow as pa  # Lazy import like pandas in mask_dataframe

    if batch is None or batch.num_rows == 0:
        return batch

    suppressed = get_suppressed_set(conn_id)
    new_columns = []

    for i in range(batch.num_columns):
        field = batch.schema.field(i)
        col = batch.column(i)
        col_lower = unicodedata.normalize("NFKC", field.name).lower().replace(" ", "_")
        is_sensitive = _is_sensitive_column_name(col_lower) or col_lower in suppressed

        if is_sensitive:
            # Mask entire column values
            if pa.types.is_string(field.type) or pa.types.is_large_string(field.type):
                masked_vals = [
                    _mask_value(v.as_py(), mask_char) if v.is_valid else None
                    for v in col
                ]
            else:
                # Non-string sensitive column: convert to string then mask
                masked_vals = [
                    _mask_value(str(v.as_py()), mask_char) if v.is_valid else None
                    for v in col
                ]
            new_columns.append(pa.array(masked_vals, type=pa.string()))
        elif pa.types.is_string(field.type) or pa.types.is_large_string(field.type):
            # Non-sensitive string column: scan for PII patterns in values
            scanned_vals = [
                _scan_and_mask(v.as_py(), mask_char) if v.is_valid else None
                for v in col
            ]
            new_columns.append(pa.array(scanned_vals, type=field.type))
        else:
            # Non-sensitive, non-string: pass through
            new_columns.append(col)

    # Build new schema: sensitive non-string columns become string type
    new_fields = []
    for i in range(batch.num_columns):
        field = batch.schema.field(i)
        col_lower = unicodedata.normalize("NFKC", field.name).lower().replace(" ", "_")
        is_sensitive = _is_sensitive_column_name(col_lower) or col_lower in suppressed
        if is_sensitive and not (pa.types.is_string(field.type) or pa.types.is_large_string(field.type)):
            new_fields.append(pa.field(field.name, pa.string()))
        else:
            new_fields.append(field)

    new_schema = pa.schema(new_fields)
    return pa.RecordBatch.from_arrays(new_columns, schema=new_schema)
