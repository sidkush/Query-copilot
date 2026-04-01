"""
PII Masking — Detect and redact sensitive data in query results.
"""

import re
import pandas as pd
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


def mask_dataframe(df: pd.DataFrame, mask_char: str = "*", extra_columns: Set[str] = None) -> pd.DataFrame:
    if df is None or df.empty:
        return df

    masked = df.copy()
    extra = extra_columns or set()
    columns_to_mask = set()

    for col in masked.columns:
        col_lower = col.lower().replace(" ", "_")
        if col_lower in SENSITIVE_COLUMN_PATTERNS or col_lower in extra:
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
