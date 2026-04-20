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


def test_string_functions_complete_per_v_1():
    from vizql.calc_functions import FUNCTIONS, Category

    expected = {
        "LEN", "LEFT", "RIGHT", "MID", "REPLACE", "UPPER", "LOWER",
        "LTRIM", "RTRIM", "TRIM", "STARTSWITH", "ENDSWITH", "CONTAINS",
        "SPLIT", "FIND", "REGEXP_EXTRACT", "REGEXP_MATCH", "REGEXP_REPLACE",
    }
    for name in expected:
        assert FUNCTIONS[name].category is Category.STRING, name


def test_date_functions_complete_per_v_1():
    from vizql.calc_functions import FUNCTIONS, Category

    expected = {
        "DATEDIFF", "DATETRUNC", "DATEPART", "DATEADD", "DATENAME",
        "MAKEDATE", "MAKEDATETIME", "MAKETIME",
        "NOW", "TODAY",
        "YEAR", "QUARTER", "MONTH", "WEEK", "DAY",
        "HOUR", "MINUTE", "SECOND", "WEEKDAY",
    }
    for name in expected:
        assert FUNCTIONS[name].category is Category.DATE, name


def test_user_spatial_passthrough_analytics_ext_present():
    from vizql.calc_functions import FUNCTIONS, Category

    for name in ("USERNAME", "FULLNAME", "USERDOMAIN", "ISFULLNAME", "ISUSERNAME", "ISMEMBEROF", "USER"):
        assert FUNCTIONS[name].category is Category.USER

    for name in ("MAKEPOINT", "MAKELINE", "DISTANCE", "BUFFER", "AREA",
                 "INTERSECTS", "OVERLAPS", "DIFFERENCE", "UNION"):
        assert FUNCTIONS[name].category is Category.SPATIAL

    for name in ("RAWSQL_BOOL", "RAWSQL_INT", "RAWSQL_REAL", "RAWSQL_STR",
                 "RAWSQL_DATE", "RAWSQL_DATETIME"):
        assert FUNCTIONS[name].category is Category.PASSTHROUGH

    for name in ("SCRIPT_REAL", "SCRIPT_STR", "SCRIPT_INT", "SCRIPT_BOOL"):
        assert FUNCTIONS[name].category is Category.ANALYTICS_EXT


def test_table_calc_names_registered_with_table_calc_flag():
    from vizql.calc_functions import FUNCTIONS

    for name in ("RUNNING_SUM", "RUNNING_AVG", "WINDOW_SUM", "WINDOW_AVG",
                 "INDEX", "FIRST", "LAST", "SIZE", "LOOKUP", "PREVIOUS_VALUE",
                 "RANK", "RANK_DENSE", "RANK_MODIFIED", "RANK_UNIQUE", "RANK_PERCENTILE",
                 "TOTAL", "PCT_TOTAL", "DIFF"):
        assert FUNCTIONS[name].is_table_calc is True


def test_feature_rawsql_enabled_default_false():
    from config import settings

    assert settings.FEATURE_RAWSQL_ENABLED is False
