import pytest

from param_substitution import (
    substitute_param_tokens,
    UnknownParameterError,
    InvalidParameterError,
    MAX_SUBSTITUTED_SQL_LEN,
)


def _p(name, ptype, value):
    return {"id": f"p_{name}", "name": name, "type": ptype, "value": value}


class TestSubstituteParamTokens:
    def test_empty_sql_passthrough(self):
        assert substitute_param_tokens("", []) == ""

    def test_no_tokens_passthrough(self):
        sql = "SELECT * FROM t"
        assert substitute_param_tokens(sql, []) == sql

    def test_string_substitution_quotes_and_escapes(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE region = {{region}}",
            [_p("region", "string", "West")],
        )
        assert out == "SELECT * FROM t WHERE region = 'West'"

    def test_number_substitution(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE year = {{year}}",
            [_p("year", "number", 2026)],
        )
        assert out == "SELECT * FROM t WHERE year = 2026"

    def test_boolean_substitution(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE flag = {{f}}",
            [_p("f", "boolean", True)],
        )
        assert out == "SELECT * FROM t WHERE flag = TRUE"

    def test_date_substitution(self):
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE d = {{d}}",
            [_p("d", "date", "2026-04-16")],
        )
        assert out == "SELECT * FROM t WHERE d = '2026-04-16'"

    def test_whitespace_inside_token(self):
        out = substitute_param_tokens(
            "SELECT {{  region  }} FROM t",
            [_p("region", "string", "West")],
        )
        assert out == "SELECT 'West' FROM t"

    def test_multiple_occurrences(self):
        out = substitute_param_tokens(
            "SELECT {{region}} AS a, {{region}} AS b",
            [_p("region", "string", "West")],
        )
        assert out == "SELECT 'West' AS a, 'West' AS b"

    def test_unknown_token_raises(self):
        with pytest.raises(UnknownParameterError):
            substitute_param_tokens(
                "SELECT {{ghost}} FROM t",
                [_p("region", "string", "West")],
            )

    def test_injection_attempt_renders_as_quoted_literal(self):
        bad = "'; DROP TABLE users--"
        out = substitute_param_tokens(
            "SELECT * FROM t WHERE x = {{n}}",
            [_p("n", "string", bad)],
        )
        # Inner ' is doubled, the whole thing stays inside ' … '.
        assert out == "SELECT * FROM t WHERE x = '''; DROP TABLE users--'"

    def test_nonfinite_number_rejected(self):
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(
                "SELECT {{x}} FROM t",
                [_p("x", "number", float("inf"))],
            )

    def test_invalid_date_rejected(self):
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(
                "SELECT {{d}} FROM t",
                [_p("d", "date", "not-a-date")],
            )

    def test_invalid_name_in_parameters_list_is_skipped_then_token_unknown(self):
        # A parameter whose name is not a valid identifier is ignored; a
        # token referencing it therefore resolves as unknown.
        with pytest.raises(UnknownParameterError):
            substitute_param_tokens(
                "SELECT {{region}} FROM t",
                [_p("bad name", "string", "West")],
            )

    def test_length_cap_enforced(self):
        huge = "x" * (MAX_SUBSTITUTED_SQL_LEN + 10)
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(
                "SELECT {{n}} FROM t",
                [_p("n", "string", huge)],
            )

    def test_non_string_sql_rejected(self):
        with pytest.raises(InvalidParameterError):
            substitute_param_tokens(None, [])  # type: ignore[arg-type]

    def test_parameters_dict_form_accepted(self):
        # We also accept a dict {name: param_dict} for convenience — the
        # query route sends this shape.
        out = substitute_param_tokens(
            "SELECT {{n}} FROM t",
            {"n": {"id": "p1", "name": "n", "type": "number", "value": 5}},
        )
        assert out == "SELECT 5 FROM t"
