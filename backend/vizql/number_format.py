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
