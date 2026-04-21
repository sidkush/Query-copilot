"""Plan 10b — Excel-style number format grammar.

Parses Excel-derived format strings into a `NumberFormatAST` and formats
numeric values through it. Pure stdlib (decimal + enum + dataclasses).

References:
    - Build_Tableau.md §XIV.2 (Excel grammar, AUTHORITATIVE).
    - Build_Tableau.md §XIV.1 (consumed via FormatResolver `StyleProp.NUMBER_FORMAT`).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple


class TokenKind(Enum):
    DIGIT_OPTIONAL = "#"
    DIGIT_REQUIRED = "0"
    THOUSANDS_SEP = ","
    DECIMAL_POINT = "."
    PERCENT = "%"
    PER_MILLE = "\u2030"
    EXPONENT = "E"
    LITERAL = "literal"
    QUOTED_LITERAL = "quoted"
    CURRENCY = "currency"
    BRACKETED_CURRENCY = "bracketed_currency"
    SECTION_SEP = ";"


@dataclass(frozen=True)
class Literal:
    text: str


@dataclass(frozen=True)
class IntegerSpec:
    min_digits: int
    thousands_separator: bool


@dataclass(frozen=True)
class DecimalSpec:
    min_digits: int
    max_digits: int


@dataclass(frozen=True)
class ExponentSpec:
    min_digits: int
    plus_sign: bool


@dataclass(frozen=True)
class FormatSection:
    integer_part: IntegerSpec
    decimal_part: Optional[DecimalSpec]
    exponent_part: Optional[ExponentSpec]
    prefix: Tuple[Literal, ...]
    suffix: Tuple[Literal, ...]
    scale: float
    negative_style: str  # "minus" | "parens"


@dataclass(frozen=True)
class NumberFormatAST:
    sections: Tuple[FormatSection, ...]


class NumberFormatError(ValueError):
    """Raised on invalid number format string. Carries 1-based column number."""

    def __init__(self, message: str, column: int) -> None:
        super().__init__(f"{message} (at column {column})")
        self.column = column


# --- Parser ------------------------------------------------------------

_CURRENCY_CHARS = {"$", "\u20ac", "\u00a5", "\u00a3"}  # $, €, ¥, £


def parse_number_format(spec: str) -> NumberFormatAST:
    """Recursive-descent parse. Raises NumberFormatError with 1-based column."""
    if spec == "":
        raise NumberFormatError("empty format string", column=1)
    raw_sections = _split_sections(spec)
    if len(raw_sections) > 4:
        raise NumberFormatError("too many sections (max 4)", column=spec.find(";") + 1)
    sections = tuple(
        _parse_section(text, base_col, idx)
        for idx, (text, base_col) in enumerate(raw_sections)
    )
    return NumberFormatAST(sections=sections)


def _split_sections(spec: str) -> list[tuple[str, int]]:
    """Split on `;` respecting quoted literals and `\\` escapes. Returns
    list of (section_text, 1-based column where this section starts)."""
    out: list[tuple[str, int]] = []
    buf: list[str] = []
    start = 1
    i = 0
    in_quote = False
    while i < len(spec):
        c = spec[i]
        if c == "\\" and i + 1 < len(spec):
            buf.append(spec[i : i + 2])
            i += 2
            continue
        if c == '"':
            in_quote = not in_quote
            buf.append(c)
            i += 1
            continue
        if c == ";" and not in_quote:
            out.append(("".join(buf), start))
            buf = []
            start = i + 2
            i += 1
            continue
        buf.append(c)
        i += 1
    if in_quote:
        raise NumberFormatError("unmatched quote", column=spec.rfind('"') + 1)
    out.append(("".join(buf), start))
    return out


def _parse_section(text: str, base_col: int, section_index: int) -> FormatSection:
    """Parse a single section. `base_col` is the column in the original spec
    where `text` starts (1-based)."""
    prefix: list[Literal] = []
    suffix: list[Literal] = []
    int_digits_optional = 0
    int_digits_required = 0
    thousands = False
    decimal_min = 0
    decimal_max = 0
    in_decimal = False
    exp_digits = 0
    exp_plus = False
    have_exp = False
    scale = 1.0
    negative_style = "minus"
    seen_digit = False

    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        col = base_col + i

        if c == "\\" and i + 1 < n:
            (prefix if not seen_digit else suffix).append(Literal(text[i + 1]))
            i += 2
            continue

        if c == '"':
            end = text.find('"', i + 1)
            if end == -1:
                raise NumberFormatError("unmatched quote", column=col)
            literal = text[i + 1 : end]
            (prefix if not seen_digit else suffix).append(Literal(literal))
            i = end + 1
            continue

        if c == "[":
            end = text.find("]", i + 1)
            if end == -1:
                raise NumberFormatError("unmatched bracket", column=col)
            bracket_body = text[i + 1 : end]
            prefix.append(Literal(bracket_body))
            i = end + 1
            continue

        if c in _CURRENCY_CHARS:
            (prefix if not seen_digit else suffix).append(Literal(c))
            i += 1
            continue

        if c == "#":
            if not in_decimal:
                int_digits_optional += 1
            else:
                decimal_max += 1
            seen_digit = True
            i += 1
            continue

        if c == "0":
            if not in_decimal:
                int_digits_required += 1
                int_digits_optional += 1
            else:
                decimal_min += 1
                decimal_max += 1
            seen_digit = True
            i += 1
            continue

        if c == ",":
            if seen_digit and not in_decimal:
                thousands = True
                i += 1
                continue
            (prefix if not seen_digit else suffix).append(Literal(","))
            i += 1
            continue

        if c == ".":
            if in_decimal:
                raise NumberFormatError("multiple decimal points", column=col)
            in_decimal = True
            i += 1
            continue

        if c == "%":
            scale *= 100.0
            suffix.append(Literal("%"))
            i += 1
            continue

        if c == "\u2030":
            scale *= 1000.0
            suffix.append(Literal("\u2030"))
            i += 1
            continue

        if c == "E":
            if i + 1 >= n or text[i + 1] not in "+-":
                raise NumberFormatError(
                    "scientific exponent must be E+ or E-", column=col
                )
            exp_plus = text[i + 1] == "+"
            j = i + 2
            digits = 0
            while j < n and text[j] == "0":
                digits += 1
                j += 1
            if digits == 0:
                raise NumberFormatError(
                    "scientific exponent needs at least one 0", column=base_col + j
                )
            exp_digits = digits
            have_exp = True
            i = j
            continue

        if c == "(" and section_index == 1:
            negative_style = "parens"
            prefix.append(Literal("("))
            i += 1
            continue
        if c == ")" and section_index == 1 and negative_style == "parens":
            suffix.append(Literal(")"))
            i += 1
            continue

        if c == "@":
            suffix.append(Literal("@"))
            i += 1
            continue

        if c == " " or c.isprintable():
            (prefix if not seen_digit else suffix).append(Literal(c))
            i += 1
            continue

        raise NumberFormatError(f"unexpected character {c!r}", column=col)

    if not seen_digit and section_index < 2:
        raise NumberFormatError(
            "section must contain at least one digit placeholder", column=base_col
        )

    min_int = max(int_digits_required, 1) if seen_digit else 0
    integer_spec = IntegerSpec(min_digits=min_int, thousands_separator=thousands)
    decimal_spec = (
        DecimalSpec(min_digits=decimal_min, max_digits=decimal_max) if in_decimal else None
    )
    exponent_spec = (
        ExponentSpec(min_digits=exp_digits, plus_sign=exp_plus) if have_exp else None
    )

    return FormatSection(
        integer_part=integer_spec,
        decimal_part=decimal_spec,
        exponent_part=exponent_spec,
        prefix=tuple(prefix),
        suffix=tuple(suffix),
        scale=scale,
        negative_style=negative_style,
    )
