"""Surface tests for BaseDialect. Ensures the abstract contract matches
Build_Tableau.md §IV.5 FormatXxx catalogue."""
from __future__ import annotations

import inspect
import pytest

from vizql.dialect_base import BaseDialect


EXPECTED_FORMAT_METHODS = {
    "format_select", "format_join", "format_case", "format_simple_case",
    "format_aggregate", "format_window", "format_cast", "format_drop_column",
    "format_table_dee", "format_default_from_clause",
    "format_set_isolation_level",
    "format_boolean_attribute", "format_float_attribute",
    "format_integer_attribute", "format_int64_attribute",
    "format_top_clause", "format_offset_clause",
    "format_string_literal", "format_identifier",
    "format_date_trunc", "format_datediff", "format_extract",
    "format_current_timestamp", "format_interval",
}


def test_base_dialect_is_abstract() -> None:
    with pytest.raises(TypeError):
        BaseDialect()  # type: ignore[abstract]


def test_format_method_catalogue_matches_build_tableau() -> None:
    missing = EXPECTED_FORMAT_METHODS - {
        name for name, _ in inspect.getmembers(BaseDialect, predicate=inspect.isfunction)
    }
    assert not missing, f"BaseDialect is missing hooks: {sorted(missing)}"


def test_emit_entry_point_signature() -> None:
    sig = inspect.signature(BaseDialect.emit)
    params = list(sig.parameters)
    assert params[:2] == ["self", "qf"], sig
