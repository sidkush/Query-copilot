import pytest

from sql_filter_injector import inject_additional_filters, FilterInjectionError


class TestNotInOperator:
    def test_not_in_with_string_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "region", "op": "notIn", "values": ["East", "West"]}],
        )
        assert "_askdb_filtered" in out
        assert 'WHERE "region" NOT IN (\'East\', \'West\')' in out

    def test_not_in_with_numeric_values(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [{"field": "year", "op": "notIn", "values": [2024, 2025]}],
        )
        assert 'WHERE "year" NOT IN (2024, 2025)' in out

    def test_not_in_escapes_single_quotes(self):
        out = inject_additional_filters(
            "SELECT * FROM t",
            [{"field": "name", "op": "notIn", "values": ["O'Brien"]}],
        )
        assert "'O''Brien'" in out

    def test_not_in_rejects_empty_values(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "region", "op": "notIn", "values": []}],
            )

    def test_not_in_rejects_invalid_identifier(self):
        with pytest.raises(FilterInjectionError):
            inject_additional_filters(
                "SELECT * FROM t",
                [{"field": "bad field", "op": "notIn", "values": ["x"]}],
            )

    def test_mixed_in_and_not_in(self):
        out = inject_additional_filters(
            "SELECT * FROM sales",
            [
                {"field": "region", "op": "in", "values": ["East"]},
                {"field": "year", "op": "notIn", "values": [2024]},
            ],
        )
        assert 'IN (\'East\')' in out
        assert 'NOT IN (2024)' in out
        assert " AND " in out
