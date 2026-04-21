"""Named Excel-style number format defaults surfaced by the inspector UI.

Plan 10b T7 — companion data module for `vizql.number_format`. Pure data,
no logic; mirrored on the frontend in `numberFormatDefaults.ts`.
"""
from __future__ import annotations

from typing import List, TypedDict


class NumberFormatDefault(TypedDict):
    name: str
    pattern: str
    description: str


DEFAULT_NUMBER_FORMATS: List[NumberFormatDefault] = [
    {
        "name": "Number (Standard)",
        "pattern": "#,##0",
        "description": "Integer with thousands separator",
    },
    {
        "name": "Number (Decimal)",
        "pattern": "#,##0.00",
        "description": "Two fixed decimals with thousands separator",
    },
    {
        "name": "Currency (Standard)",
        "pattern": "$#,##0.00;($#,##0.00)",
        "description": "USD with parenthesised negatives",
    },
    {
        "name": "Currency (Custom)",
        "pattern": "[USD]#,##0.00",
        "description": "Bracketed ISO code prefix",
    },
    {
        "name": "Scientific",
        "pattern": "0.##E+00",
        "description": "Scientific notation",
    },
    {
        "name": "Percentage",
        "pattern": "0.0%",
        "description": "One-decimal percentage",
    },
]
