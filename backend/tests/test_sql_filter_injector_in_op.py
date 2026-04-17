import pytest

from sql_filter_injector import (
    inject_additional_filters,
    FilterInjectionError,
)


class TestInOperator:
    def test_in_with_string_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "region", "op": "in", "values": ["East", "West"]}],
        )
        assert "_askdb_filtered" in out
        assert 'WHERE "region" IN (\'East\', \'West\')' in out

    def test_in_with_numeric_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "year", "op": "in", "values": [2024, 2025, 2026]}],
        )
        assert 'WHERE "year" IN (2024, 2025, 2026)' in out

    def test_in_with_mixed_values(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "code", "op": "in", "values": ["A", 1, "B"]}],
        )
        assert 'IN (\'A\', 1, \'B\')' in out

    def test_in_escapes_single_quotes(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "name", "op": "in", "values": ["O'Brien", "Smith"]}],
        )
        assert "'O''Brien'" in out

    def test_in_rejects_empty_values_list(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in", "values": []}],
            )

    def test_in_rejects_missing_values_key(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in"}],
            )

    def test_in_rejects_non_list_values(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in", "values": "East"}],
            )

    def test_in_rejects_nested_values(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "in", "values": [{"x": 1}]}],
            )

    def test_mix_of_eq_and_in(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [
                {"field": "region", "op": "in", "values": ["East", "West"]},
                {"field": "year", "op": "eq", "value": 2026},
            ],
        )
        assert 'IN (\'East\', \'West\')' in out
        assert '"year" = 2026' in out
        assert " AND " in out

    def test_in_rejects_invalid_identifier(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "bad field", "op": "in", "values": ["x"]}],
            )
