"""Plan TSS2 T11 — SAFE.PARSE_TIMESTAMP wrap for VARCHAR date columns on BigQuery.

When the user's schema binds a VARCHAR/STRING column as `primary_date`,
``compile_chart_sql`` must wrap the column reference in
``SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S UTC', <col>)`` before feeding it
to ``DATE_TRUNC``. True TIMESTAMP columns pass through unchanged.
"""
from __future__ import annotations

import os
import sys

# Ensure backend/ (repo-local import path used throughout the test suite) is
# available when pytest is invoked from the backend directory.
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from preset_sql_compiler import compile_chart_sql  # noqa: E402


def test_date_trunc_wraps_varchar_with_parse_timestamp():
    schema = {"columns": [
        {"name": "started_at", "dtype": "VARCHAR",
         "sample_values": ["2023-05-01 10:00 UTC"]},
        {"name": "ride_id", "dtype": "VARCHAR"},
    ]}
    sql, _params = compile_chart_sql(
        binding={
            "primary_date": "started_at",
            "measure": {"column": "ride_id", "agg": "COUNT_DISTINCT"},
        },
        schema=schema,
        table_ref="bikes.citibike_trips",
        time_grain="month",
        dialect="bigquery",
    )
    assert "SAFE.PARSE_TIMESTAMP" in sql
    assert "DATE_TRUNC" in sql
    # The PARSE must wrap the column, not the bare date:
    assert "DATE_TRUNC(SAFE.PARSE_TIMESTAMP" in sql


def test_date_trunc_skips_wrap_for_true_timestamp():
    schema = {"columns": [{"name": "event_ts", "dtype": "TIMESTAMP"}]}
    sql, _params = compile_chart_sql(
        binding={
            "primary_date": "event_ts",
            "measure": {"column": "event_ts", "agg": "COUNT"},
        },
        schema=schema,
        table_ref="t",
        time_grain="month",
        dialect="bigquery",
    )
    assert "SAFE.PARSE_TIMESTAMP" not in sql
    assert "DATE_TRUNC" in sql
