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


# --- Formatter ---------------------------------------------------------

import math
from decimal import Decimal, ROUND_HALF_UP


# Minimal locale registry. We do NOT depend on babel/icu — hand-roll a tiny
# table. Unknown locales fall through to en-US.
_LOCALE_SEPS: dict[str, tuple[str, str]] = {
    "en-US": (",", "."),
    "en-GB": (",", "."),
    "de-DE": (".", ","),
    "fr-FR": ("\u202f", ","),  # narrow no-break space
    "es-ES": (".", ","),
    "ja-JP": (",", "."),
    "zh-CN": (",", "."),
}


def _seps(locale: str) -> tuple[str, str]:
    return _LOCALE_SEPS.get(locale, _LOCALE_SEPS["en-US"])


def _pick_section(ast: NumberFormatAST, value) -> tuple[FormatSection, bool]:
    """Returns (section, should_negate_sign). `should_negate_sign=True`
    means the formatter must emit a leading `-` (the section was chosen
    for a negative but doesn't carry its own minus/parens)."""
    sections = ast.sections
    n = len(sections)
    if isinstance(value, Decimal):
        is_nan = value.is_nan()
        is_neg = (not is_nan) and value < 0
        is_zero = (not is_nan) and value == 0
    else:
        fv = float(value)
        is_nan = math.isnan(fv)
        is_neg = (not is_nan) and fv < 0
        is_zero = (not is_nan) and fv == 0.0

    if is_nan:
        return sections[0], False
    if n == 1:
        return sections[0], is_neg
    if n == 2:
        if is_neg:
            return sections[1], False
        return sections[0], False
    if n == 3:
        if is_zero:
            return sections[2], False
        if is_neg:
            return sections[1], False
        return sections[0], False
    # n == 4
    if is_zero:
        return sections[2], False
    if is_neg:
        return sections[1], False
    return sections[0], False


def _format_integer_part(abs_int_str: str, spec: IntegerSpec, locale: str) -> str:
    thousands, _decimal = _seps(locale)
    padded = abs_int_str.lstrip("0") or "0"
    if len(padded) < spec.min_digits:
        padded = padded.rjust(spec.min_digits, "0")
    if not spec.thousands_separator:
        return padded
    # group from right
    rev = padded[::-1]
    groups = [rev[i : i + 3] for i in range(0, len(rev), 3)]
    return thousands.join(groups)[::-1]


def format_number(
    value,
    ast: NumberFormatAST,
    locale: str = "en-US",
) -> str:
    """Format `value` per `ast`. Locale controls output separators only."""
    if isinstance(value, float) and math.isnan(value):
        return "NaN"
    if isinstance(value, float) and math.isinf(value):
        return "-Infinity" if value < 0 else "Infinity"

    section, needs_minus_prefix = _pick_section(ast, value)

    # Apply scale. Keep Decimal path exact where possible.
    if isinstance(value, Decimal):
        dv = value * Decimal(str(section.scale))
    else:
        dv = Decimal(str(float(value) * section.scale))

    abs_dv = abs(dv)

    _thousands, decimal_sep = _seps(locale)

    out_core: str

    # Pure-literal section (e.g. zero-section `"zero"` or text section with no
    # digit placeholders): emit literals only, skip numeric rendering.
    if (
        section.integer_part.min_digits == 0
        and section.decimal_part is None
        and section.exponent_part is None
    ):
        prefix = "".join(lit.text for lit in section.prefix)
        suffix = "".join(lit.text for lit in section.suffix)
        result = prefix + suffix
        if needs_minus_prefix:
            result = "-" + result
        return result

    if section.exponent_part is not None:
        out_core = _format_scientific(abs_dv, section, decimal_sep)
    else:
        # Round to decimal_part.max_digits (or 0).
        max_dec = section.decimal_part.max_digits if section.decimal_part else 0
        quant = Decimal(1).scaleb(-max_dec) if max_dec > 0 else Decimal(1)
        rounded = abs_dv.quantize(quant, rounding=ROUND_HALF_UP) if max_dec >= 0 else abs_dv

        sign, digits, exponent = rounded.as_tuple()
        digit_str = "".join(str(d) for d in digits)
        if exponent < 0:
            split = len(digit_str) + exponent  # exponent negative
            if split <= 0:
                int_part = "0"
                frac_part = ("0" * -split) + digit_str
            else:
                int_part = digit_str[:split]
                frac_part = digit_str[split:]
        else:
            int_part = digit_str + ("0" * exponent)
            frac_part = ""

        int_rendered = _format_integer_part(int_part, section.integer_part, locale)

        if section.decimal_part is not None:
            min_d = section.decimal_part.min_digits
            frac_part = frac_part[:max_dec]  # already quantized, but safety
            if len(frac_part) < min_d:
                frac_part = frac_part.ljust(min_d, "0")
            # trim trailing beyond min_d up to max_dec only if using `#`
            if max_dec > min_d:
                frac_part = frac_part.rstrip("0")
                if len(frac_part) < min_d:
                    frac_part = frac_part.ljust(min_d, "0")
            if frac_part:
                out_core = int_rendered + decimal_sep + frac_part
            else:
                out_core = int_rendered
        else:
            out_core = int_rendered

    prefix = "".join(lit.text for lit in section.prefix)
    suffix = "".join(lit.text for lit in section.suffix)
    result = prefix + out_core + suffix
    if needs_minus_prefix:
        result = "-" + result
    return result


def _format_scientific(abs_dv: Decimal, section: FormatSection, decimal_sep: str) -> str:
    """Render `abs_dv` in scientific notation per section spec."""
    assert section.exponent_part is not None
    if abs_dv == 0:
        exp = 0
        mantissa = Decimal(0)
    else:
        # Normalise to `d.dddd * 10^n` where 1 <= d < 10.
        s = f"{abs_dv:E}"  # e.g. "1.234500E+04" or "1E+4"
        m_str, e_str = s.split("E")
        mantissa = Decimal(m_str)
        exp = int(e_str)

    max_dec = section.decimal_part.max_digits if section.decimal_part else 0
    min_dec = section.decimal_part.min_digits if section.decimal_part else 0
    quant = Decimal(1).scaleb(-max_dec) if max_dec > 0 else Decimal(1)
    mantissa = mantissa.quantize(quant, rounding=ROUND_HALF_UP)

    m_str = format(mantissa, "f")
    if "." in m_str:
        int_part, frac_part = m_str.split(".")
    else:
        int_part, frac_part = m_str, ""
    if max_dec > min_dec:
        frac_part = frac_part.rstrip("0")
        if len(frac_part) < min_dec:
            frac_part = frac_part.ljust(min_dec, "0")
    elif len(frac_part) < min_dec:
        frac_part = frac_part.ljust(min_dec, "0")

    body = int_part + (decimal_sep + frac_part if frac_part else "")

    exp_digits = section.exponent_part.min_digits
    exp_sign = "+" if exp >= 0 else "-"
    if not section.exponent_part.plus_sign and exp >= 0:
        exp_sign = ""
    exp_body = f"{abs(exp):0{exp_digits}d}"
    return f"{body}E{exp_sign}{exp_body}"
