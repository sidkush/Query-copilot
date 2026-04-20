"""Golden-file round-trip tests for SnowflakeDialect.

Contract:
  1. Emit each scenario via SnowflakeDialect().emit(qf).
  2. Strip whitespace runs to a single space.
  3. Compare against backend/tests/golden/vizql/snowflake/<stem>.sql.

Snowflake-specific asserts verify:
  - DATEDIFF uses an unquoted part as the first argument.
  - All-lowercase identifiers emit a WARNING log once per distinct name.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import pytest

from vizql.dialects.snowflake import SnowflakeDialect
from tests.vizql._fixtures import SCENARIOS


GOLDEN = Path(__file__).parent / "golden" / "vizql" / "snowflake"


def _norm(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


@pytest.mark.parametrize("stem", sorted(SCENARIOS))
def test_snowflake_golden_roundtrip(stem):
    qf = SCENARIOS[stem]()
    emitted = SnowflakeDialect().emit(qf)
    gold_path = GOLDEN / f"{stem}.sql"
    assert gold_path.exists(), f"missing golden: {gold_path}"
    assert _norm(emitted) == _norm(gold_path.read_text(encoding="utf-8"))


def test_snowflake_datediff_uses_unquoted_part():
    sql = SnowflakeDialect().format_datediff("day", '"a"', '"b"')
    assert sql == 'DATEDIFF(DAY, "a", "b")'


# NOTE: SnowflakeDialect dedupes the "all-lowercase identifier" warning via the
# module-level ``_warned_idents`` set so noisy repeat queries don't spam logs.
# We therefore use a unique identifier name ("some_unseen_col_xyz") that no
# other test in this file (or sibling suites) is expected to touch, so caplog
# reliably sees the warning on the first — and only — emission.
def test_snowflake_warns_on_all_lowercase_identifier(caplog):
    with caplog.at_level(logging.WARNING, logger="vizql.dialects.snowflake"):
        SnowflakeDialect().format_identifier("some_unseen_col_xyz")
    assert any("case-sensitive" in m.lower() for m in caplog.messages)
