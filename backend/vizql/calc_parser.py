"""Calc-language lexer + recursive-descent parser. Plan 8a.

Hand-written so we control error positions for the Plan 8d Monaco editor
diagnostics. No external lexer/parser deps.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Iterator, Optional

from . import calc_ast as ca


_KEYWORDS = frozenset({
    "IF", "THEN", "ELSE", "ELSEIF", "END",
    "CASE", "WHEN",
    "AND", "OR", "NOT", "IN",
    "FIXED", "INCLUDE", "EXCLUDE",
    "TRUE", "FALSE", "NULL",
})


class TokenKind(enum.Enum):
    IDENT = "IDENT"
    KEYWORD = "KEYWORD"
    STRING = "STRING"
    NUMBER = "NUMBER"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    LBRACKET = "LBRACKET"
    RBRACKET = "RBRACKET"
    LBRACE = "LBRACE"
    RBRACE = "RBRACE"
    LANGLE_PARAM = "LANGLE_PARAM"  # `<Parameters.X>` form opener
    RANGLE_PARAM = "RANGLE_PARAM"
    COMMA = "COMMA"
    COLON = "COLON"
    DOT = "DOT"
    OP = "OP"
    EOF = "EOF"


@dataclass(frozen=True, slots=True)
class Token:
    kind: TokenKind
    value: object
    line: int
    column: int


class LexError(ValueError):
    def __init__(self, msg: str, line: int, column: int):
        super().__init__(f"{msg} at line {line} col {column}")
        self.line = line
        self.column = column


class CalcLexer:
    _MULTI_OPS = ("<>", "<=", ">=", "==")
    _SINGLE_OPS = "+-*/=<>"

    def __init__(self, src: str) -> None:
        self.src = src
        self.i = 0
        self.line = 1
        self.col = 1

    def tokens(self) -> Iterator[Token]:
        while self.i < len(self.src):
            ch = self.src[self.i]
            if ch in " \t\r":
                self._advance(1)
            elif ch == "\n":
                self._newline()
            elif ch == "/" and self._peek(1) == "/":
                self._skip_line_comment()
            elif ch == "-" and self._peek(1) == "-":
                self._skip_line_comment()
            elif ch in "\"'":
                yield self._read_string(ch)
            elif ch.isdigit() or (ch == "." and self._peek(1).isdigit()):
                yield self._read_number()
            elif ch == "[":
                yield self._emit(TokenKind.LBRACKET, "["); self._advance(1)
            elif ch == "]":
                yield self._emit(TokenKind.RBRACKET, "]"); self._advance(1)
            elif ch == "(":
                yield self._emit(TokenKind.LPAREN, "("); self._advance(1)
            elif ch == ")":
                yield self._emit(TokenKind.RPAREN, ")"); self._advance(1)
            elif ch == "{":
                yield self._emit(TokenKind.LBRACE, "{"); self._advance(1)
            elif ch == "}":
                yield self._emit(TokenKind.RBRACE, "}"); self._advance(1)
            elif ch == ",":
                yield self._emit(TokenKind.COMMA, ","); self._advance(1)
            elif ch == ":":
                yield self._emit(TokenKind.COLON, ":"); self._advance(1)
            elif ch == ".":
                yield self._emit(TokenKind.DOT, "."); self._advance(1)
            elif ch == "<":
                yield self._read_op_or_param_open()
            elif ch == ">":
                # `>` could close a <Parameters.X> form. The parser disambiguates.
                # Lex as RANGLE_PARAM only if a previous LANGLE_PARAM is unclosed —
                # tracked by the parser. Here we always emit `OP`; the parser
                # treats `>` after `<Parameters.X` as the closer.
                yield self._emit(TokenKind.OP, ">"); self._advance(1)
            elif ch in self._SINGLE_OPS:
                # Try multi-char first.
                two = self.src[self.i:self.i + 2]
                if two in self._MULTI_OPS:
                    yield self._emit(TokenKind.OP, two); self._advance(2)
                else:
                    yield self._emit(TokenKind.OP, ch); self._advance(1)
            elif ch.isalpha() or ch == "_":
                yield self._read_ident()
            else:
                raise LexError(f"unexpected character {ch!r}", self.line, self.col)
        yield Token(TokenKind.EOF, None, self.line, self.col)

    # ---- helpers ----
    def _peek(self, k: int) -> str:
        j = self.i + k
        return self.src[j] if j < len(self.src) else ""

    def _advance(self, n: int) -> None:
        self.i += n
        self.col += n

    def _newline(self) -> None:
        self.i += 1
        self.line += 1
        self.col = 1

    def _emit(self, kind: TokenKind, value: object) -> Token:
        return Token(kind, value, self.line, self.col)

    def _skip_line_comment(self) -> None:
        while self.i < len(self.src) and self.src[self.i] != "\n":
            self._advance(1)

    def _read_string(self, quote: str) -> Token:
        start_line, start_col = self.line, self.col
        self._advance(1)  # consume opening quote
        out = []
        while True:
            if self.i >= len(self.src):
                raise LexError("unterminated string", start_line, start_col)
            ch = self.src[self.i]
            if ch == "\\" and self._peek(1) in ('"', "'", "\\"):
                out.append(self._peek(1))
                self._advance(2)
            elif ch == quote:
                self._advance(1)
                return Token(TokenKind.STRING, "".join(out), start_line, start_col)
            elif ch == "\n":
                raise LexError("newline in string", start_line, start_col)
            else:
                out.append(ch)
                self._advance(1)

    def _read_number(self) -> Token:
        start_line, start_col = self.line, self.col
        start = self.i
        seen_dot = False
        while self.i < len(self.src) and (self.src[self.i].isdigit() or (self.src[self.i] == "." and not seen_dot)):
            if self.src[self.i] == ".":
                seen_dot = True
            self._advance(1)
        text = self.src[start:self.i]
        value: object = float(text) if seen_dot else int(text)
        return Token(TokenKind.NUMBER, value, start_line, start_col)

    def _read_ident(self) -> Token:
        start_line, start_col = self.line, self.col
        start = self.i
        while self.i < len(self.src) and (self.src[self.i].isalnum() or self.src[self.i] == "_"):
            self._advance(1)
        text = self.src[start:self.i]
        upper = text.upper()
        if upper in _KEYWORDS:
            return Token(TokenKind.KEYWORD, upper, start_line, start_col)
        return Token(TokenKind.IDENT, text, start_line, start_col)

    def _read_op_or_param_open(self) -> Token:
        # `<Parameters.` opens a parameter ref under §VIII.4. Otherwise `<` / `<=` / `<>`.
        start_line, start_col = self.line, self.col
        if self.src.startswith("<Parameters.", self.i):
            self._advance(len("<Parameters."))
            return Token(TokenKind.LANGLE_PARAM, "Parameters.", start_line, start_col)
        two = self.src[self.i:self.i + 2]
        if two in ("<=", "<>"):
            self._advance(2)
            return Token(TokenKind.OP, two, start_line, start_col)
        self._advance(1)
        return Token(TokenKind.OP, "<", start_line, start_col)
