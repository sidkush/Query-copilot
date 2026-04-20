# Plan 8a T7/T8 — function catalogue tests.
# Import paths adapted from the plan: backend/pytest.ini sets pythonpath=.,
# so tests import via `vizql.calc_functions` + `config`, not `backend.vizql.*`.
import pytest


def test_function_registry_contains_every_aggregate_name():
    from vizql.calc_functions import FUNCTIONS

    aggregates = {
        "SUM", "AVG", "COUNT", "COUNTD", "MIN", "MAX", "MEDIAN", "ATTR",
        "STDEV", "STDEVP", "VAR", "VARP", "PERCENTILE",
        "KURTOSIS", "SKEWNESS", "COLLECT",
    }
    missing = aggregates - set(FUNCTIONS)
    assert not missing, f"missing aggregates: {sorted(missing)}"
    for name in aggregates:
        assert FUNCTIONS[name].is_aggregate is True


def test_logical_functions_present_with_correct_arities():
    from vizql.calc_functions import FUNCTIONS

    for name in ("IF", "CASE", "IIF", "IFNULL", "ZN", "ISNULL", "NOT", "IN"):
        assert name in FUNCTIONS

    assert FUNCTIONS["IIF"].min_args == 3
    assert FUNCTIONS["IIF"].max_args == 3
    assert FUNCTIONS["ZN"].min_args == 1
    assert FUNCTIONS["ZN"].max_args == 1


def test_type_conversion_functions_have_correct_return_types():
    from vizql.calc_functions import FUNCTIONS, TypeKind

    expected = {
        "STR": TypeKind.STRING,
        "INT": TypeKind.INTEGER,
        "FLOAT": TypeKind.NUMBER,
        "BOOL": TypeKind.BOOLEAN,
        "DATE": TypeKind.DATE,
        "DATETIME": TypeKind.DATETIME,
    }
    for name, expected_kind in expected.items():
        ret = FUNCTIONS[name].return_type
        assert ret.kind == expected_kind


def test_unknown_function_lookup_returns_none():
    from vizql.calc_functions import FUNCTIONS

    assert FUNCTIONS.get("STARTS_WITH") is None  # canonical is STARTSWITH
