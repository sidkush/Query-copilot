"""Plan 10b T7 — named default number-format catalogue tests."""
from vizql.number_format import format_number, parse_number_format
from vizql.number_format_defaults import DEFAULT_NUMBER_FORMATS


def test_catalogue_has_required_names():
    names = {d["name"] for d in DEFAULT_NUMBER_FORMATS}
    assert names == {
        "Number (Standard)",
        "Number (Decimal)",
        "Currency (Standard)",
        "Currency (Custom)",
        "Scientific",
        "Percentage",
    }


def test_every_default_parses_and_formats():
    for default in DEFAULT_NUMBER_FORMATS:
        ast = parse_number_format(default["pattern"])
        out = format_number(1234.5, ast)
        assert isinstance(out, str) and out  # non-empty


def test_standard_pattern():
    standard = next(d for d in DEFAULT_NUMBER_FORMATS if d["name"] == "Number (Standard)")
    assert standard["pattern"] == "#,##0"


def test_percentage_pattern():
    pct = next(d for d in DEFAULT_NUMBER_FORMATS if d["name"] == "Percentage")
    assert "%" in pct["pattern"]
