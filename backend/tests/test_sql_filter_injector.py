import pytest

from sql_filter_injector import (
    inject_additional_filters,
    FilterInjectionError,
)


class TestInjectAdditionalFilters:
    def test_empty_filters_returns_sql_unchanged(self):
        sql = "SELECT a, b FROM t"
        assert inject_additional_filters(sql, []) == sql

    def test_none_filters_returns_sql_unchanged(self):
        sql = "SELECT a, b FROM t"
        assert inject_additional_filters(sql, None) == sql

    def test_single_string_filter(self):
        out = inject_additional_filters(
            "SELECT region, total FROM sales",
            [{"field": "region", "op": "eq", "value": "West"}],
        )
        assert out == (
            'SELECT * FROM (SELECT region, total FROM sales) '
            'AS _askdb_filtered WHERE "region" = \'West\''
        )

    def test_multiple_filters_joined_with_and(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [
                {"field": "region", "op": "eq", "value": "West"},
                {"field": "year", "op": "eq", "value": 2026},
            ],
        )
        assert out.endswith(
            'WHERE "region" = \'West\' AND "year" = 2026'
        )

    def test_null_value_translates_to_is_null(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "status", "op": "eq", "value": None}],
        )
        assert out.endswith('WHERE "status" IS NULL')

    def test_string_escapes_single_quotes(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "name", "op": "eq", "value": "O'Brien"}],
        )
        assert "'O''Brien'" in out

    def test_strips_trailing_semicolon_from_base_sql(self):
        out = inject_additional_filters(
            "SELECT * FROM t  ;  ",
            [{"field": "a", "op": "eq", "value": 1}],
        )
        assert "; ) " not in out
        assert "(SELECT * FROM t)" in out

    def test_rejects_invalid_identifier(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "bad field", "op": "eq", "value": 1}],
            )

    def test_rejects_unsupported_op(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "a", "op": "gt", "value": 1}],
            )

    def test_rejects_unsupported_value_type(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "a", "op": "eq", "value": {"nested": True}}],
            )

    def test_boolean_value_renders_as_literal(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "active", "op": "eq", "value": True}],
        )
        assert out.endswith('WHERE "active" = TRUE')
