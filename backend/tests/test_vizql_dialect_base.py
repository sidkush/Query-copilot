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


from vizql import sql_ast as sa


class _StubDialect(BaseDialect):
    """Only the minimum hooks needed for test_emit_walks_full_ast."""
    name = "stub"
    def format_select(self, qf): return f"<SELECT n={len(qf.projections)}>"
    def format_join(self, j): return f"<JOIN {j.kind}>"
    def format_case(self, c): return f"<CASE n={len(c.whens)}>"
    def format_simple_case(self, c): return f"<SCASE n={len(c.whens)}>"
    def format_aggregate(self, f): return f"<AGG {f.name}>"
    def format_window(self, w): return "<WIN>"
    def format_cast(self, c): return f"<CAST {c.target_type}>"
    def format_drop_column(self, t, c): return f"ALTER TABLE {t} DROP {c}"
    def format_table_dee(self): return "(SELECT 1)"
    def format_default_from_clause(self): return ""
    def format_set_isolation_level(self, level): return f"SET TX {level}"
    def format_boolean_attribute(self, v): return "TRUE" if v else "FALSE"
    def format_float_attribute(self, v): return repr(float(v))
    def format_integer_attribute(self, v): return str(int(v))
    def format_int64_attribute(self, v): return str(int(v))
    def format_top_clause(self, n): return f"LIMIT {n}"
    def format_offset_clause(self, n): return f"OFFSET {n}"
    def format_string_literal(self, v): return "'" + v.replace("'", "''") + "'"
    def format_identifier(self, i): return '"' + i.replace('"', '""') + '"'
    def format_date_trunc(self, p, e): return f"DATE_TRUNC('{p}', {e})"
    def format_datediff(self, p, a, b): return f"DATEDIFF('{p}', {a}, {b})"
    def format_extract(self, p, e): return f"EXTRACT({p} FROM {e})"
    def format_current_timestamp(self): return "CURRENT_TIMESTAMP"
    def format_interval(self, p, n): return f"INTERVAL '{n}' {p}"


def test_emit_walks_full_ast() -> None:
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="c", expression=sa.Column(name="c", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
    )
    out = _StubDialect().emit(qf)
    assert isinstance(out, str) and out.startswith("<SELECT ")


def test_emit_is_idempotent() -> None:
    qf = sa.SQLQueryFunction(
        projections=(sa.Projection(alias="c", expression=sa.Column(name="c", table_alias="t")),),
        from_=sa.TableRef(name="t", alias="t"),
    )
    a, b = _StubDialect().emit(qf), _StubDialect().emit(qf)
    assert a == b
