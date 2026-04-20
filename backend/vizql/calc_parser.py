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
                # Also handle `>=` multi-char op before single `>`.
                if self._peek(1) == "=":
                    yield self._emit(TokenKind.OP, ">="); self._advance(2)
                else:
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


class ParseError(ValueError):
    def __init__(self, msg: str, line: int, column: int):
        super().__init__(f"{msg} at line {line} col {column}")
        self.line = line
        self.column = column


class CalcParser:
    """Recursive-descent parser. One pass over the token stream."""

    def __init__(self, src: str, max_depth: int = 32) -> None:
        self.tokens: list[Token] = list(CalcLexer(src).tokens())
        self.pos = 0
        self.max_depth = max_depth
        self.depth = 0

    def parse(self) -> ca.CalcExpr:
        expr = self._parse_expr()
        self._expect(TokenKind.EOF)
        return expr

    # ---- precedence climbing ----
    # Precedence table (low -> high). Right-associative entries set assoc="right".
    _PRECEDENCE: dict[str, tuple[int, str]] = {
        "OR":  (1, "left"),
        "AND": (2, "left"),
        "IN":  (3, "left"),
        "=":   (4, "left"),
        "<>":  (4, "left"),
        "<":   (4, "left"),
        "<=":  (4, "left"),
        ">":   (4, "left"),
        ">=":  (4, "left"),
        "+":   (5, "left"),
        "-":   (5, "left"),
        "*":   (6, "left"),
        "/":   (6, "left"),
    }

    def _parse_expr(self, min_prec: int = 0) -> ca.CalcExpr:
        lhs = self._parse_unary()
        while True:
            op = self._peek_binop()
            if op is None:
                break
            prec, assoc = self._PRECEDENCE[op]
            if prec < min_prec:
                break
            op_tok = self._next()
            next_min = prec + (1 if assoc == "left" else 0)
            if op == "IN":
                rhs = self._parse_in_tuple(op_tok)
            else:
                rhs = self._parse_expr(next_min)
            lhs = ca.BinaryOp(op=op, lhs=lhs, rhs=rhs, pos=ca.Position(op_tok.line, op_tok.column))
        return lhs

    def _peek_binop(self) -> Optional[str]:
        t = self._peek()
        if t.kind == TokenKind.OP and t.value in self._PRECEDENCE:
            return str(t.value)
        if t.kind == TokenKind.KEYWORD and t.value in ("AND", "OR", "IN"):
            return str(t.value)
        return None

    def _parse_unary(self) -> ca.CalcExpr:
        t = self._peek()
        if t.kind == TokenKind.OP and t.value == "-":
            self._next()
            operand = self._parse_unary()
            return ca.UnaryOp(op="-", operand=operand, pos=ca.Position(t.line, t.column))
        if t.kind == TokenKind.KEYWORD and t.value == "NOT":
            self._next()
            # NOT binds looser than comparison (=, <>, <, >, etc.) but tighter
            # than AND/OR. Parse operand at min_prec = IN+1 = 3 so `NOT x <> y`
            # groups as `NOT (x <> y)` per Tableau semantics.
            operand = self._parse_expr(3)
            return ca.UnaryOp(op="NOT", operand=operand, pos=ca.Position(t.line, t.column))
        return self._parse_primary()

    def _parse_in_tuple(self, op_tok: Token) -> ca.CalcExpr:
        # IN expects a parenthesised list. Represented as FnCall("__TUPLE__", args=…).
        self._expect(TokenKind.LPAREN)
        items: list[ca.CalcExpr] = [self._parse_expr()]
        while self._peek().kind == TokenKind.COMMA:
            self._next()
            items.append(self._parse_expr())
        self._expect(TokenKind.RPAREN)
        return ca.FnCall(name="__TUPLE__", args=tuple(items),
                         pos=ca.Position(op_tok.line, op_tok.column))

    def _parse_primary(self) -> ca.CalcExpr:
        if self.depth >= self.max_depth:
            t = self._peek()
            raise ParseError("max calc nesting depth exceeded", t.line, t.column)
        self.depth += 1
        try:
            return self._parse_primary_inner()
        finally:
            self.depth -= 1

    def _parse_primary_inner(self) -> ca.CalcExpr:
        t = self._peek()
        pos = ca.Position(t.line, t.column)

        if t.kind == TokenKind.NUMBER:
            self._next()
            kind = "integer" if isinstance(t.value, int) else "real"
            return ca.Literal(t.value, kind, pos=pos)

        if t.kind == TokenKind.STRING:
            self._next()
            return ca.Literal(t.value, "string", pos=pos)

        if t.kind == TokenKind.KEYWORD and t.value in ("TRUE", "FALSE"):
            self._next()
            return ca.Literal(t.value == "TRUE", "boolean", pos=pos)

        if t.kind == TokenKind.KEYWORD and t.value == "NULL":
            self._next()
            return ca.Literal(None, "null", pos=pos)

        if t.kind == TokenKind.LBRACKET:
            return self._parse_bracketed_ref(pos)

        if t.kind == TokenKind.LANGLE_PARAM:
            return self._parse_angle_param(pos)

        if t.kind == TokenKind.LBRACE:
            return self._parse_lod(pos)

        if t.kind == TokenKind.KEYWORD and t.value == "IF":
            return self._parse_if(pos)

        if t.kind == TokenKind.KEYWORD and t.value == "CASE":
            return self._parse_case(pos)

        if t.kind == TokenKind.IDENT:
            return self._parse_ident_or_call(pos)

        if t.kind == TokenKind.LPAREN:
            self._next()
            inner = self._parse_expr()
            self._expect(TokenKind.RPAREN)
            return inner

        raise ParseError(f"unexpected token {t.kind.value} {t.value!r}", t.line, t.column)

    def _parse_bracketed_ref(self, pos: ca.Position) -> ca.CalcExpr:
        # Two grammars share `[`:
        #   [Field Name]              -> FieldRef
        #   [Parameters].[ParamName]  -> ParamRef
        # Inside brackets, any IDENT/KEYWORD/NUMBER/etc. is part of the name.
        self._expect(TokenKind.LBRACKET)
        name_parts: list[str] = []
        while self._peek().kind != TokenKind.RBRACKET:
            tok = self._next()
            if tok.kind == TokenKind.EOF:
                raise ParseError("unterminated bracketed name", tok.line, tok.column)
            name_parts.append(str(tok.value))
        if not name_parts:
            t = self._peek()
            raise ParseError("empty bracketed name", t.line, t.column)
        self._expect(TokenKind.RBRACKET)
        name = " ".join(name_parts)
        if name == "Parameters" and self._peek().kind == TokenKind.DOT:
            self._next()
            self._expect(TokenKind.LBRACKET)
            param_parts: list[str] = []
            while self._peek().kind != TokenKind.RBRACKET:
                tok = self._next()
                if tok.kind == TokenKind.EOF:
                    raise ParseError("unterminated bracketed param name", tok.line, tok.column)
                param_parts.append(str(tok.value))
            self._expect(TokenKind.RBRACKET)
            return ca.ParamRef(param_name=" ".join(param_parts), pos=pos)
        return ca.FieldRef(field_name=name, pos=pos)

    def _parse_angle_param(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect(TokenKind.LANGLE_PARAM)
        ident = self._expect(TokenKind.IDENT)
        # Closer is the operator-style `>` token emitted by the lexer.
        closer = self._next()
        if not (closer.kind == TokenKind.OP and closer.value == ">"):
            raise ParseError("expected '>' to close <Parameters.…>", closer.line, closer.column)
        return ca.ParamRef(param_name=str(ident.value), pos=pos)

    def _parse_lod(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect(TokenKind.LBRACE)
        kw = self._peek()
        if not (kw.kind == TokenKind.KEYWORD and kw.value in ("FIXED", "INCLUDE", "EXCLUDE")):
            raise ParseError("LOD must start with FIXED|INCLUDE|EXCLUDE", kw.line, kw.column)
        kind_value = kw.value
        assert kind_value in ("FIXED", "INCLUDE", "EXCLUDE")
        self._next()
        dims: list[ca.FieldRef] = []
        if self._peek().kind != TokenKind.COLON:
            dims.append(self._parse_lod_dim())
            while self._peek().kind == TokenKind.COMMA:
                self._next()
                dims.append(self._parse_lod_dim())
        self._expect(TokenKind.COLON)
        body = self._parse_expr()
        self._expect(TokenKind.RBRACE)
        return ca.LodExpr(kind=kind_value, dims=tuple(dims), body=body, pos=pos)

    def _parse_lod_dim(self) -> ca.FieldRef:
        t = self._peek()
        node = self._parse_primary()
        if not isinstance(node, ca.FieldRef):
            raise ParseError("LOD dim must be a [FieldRef]", t.line, t.column)
        return node

    def _parse_if(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect_keyword("IF")
        cond = self._parse_expr()
        self._expect_keyword("THEN")
        then_ = self._parse_expr()
        elifs: list[tuple[ca.CalcExpr, ca.CalcExpr]] = []
        while self._peek_keyword("ELSEIF"):
            self._next()
            ec = self._parse_expr()
            self._expect_keyword("THEN")
            eb = self._parse_expr()
            elifs.append((ec, eb))
        else_: Optional[ca.CalcExpr] = None
        if self._peek_keyword("ELSE"):
            self._next()
            else_ = self._parse_expr()
        self._expect_keyword("END")
        return ca.IfExpr(cond=cond, then_=then_, elifs=tuple(elifs), else_=else_, pos=pos)

    def _parse_case(self, pos: ca.Position) -> ca.CalcExpr:
        self._expect_keyword("CASE")
        # Scrutinee absent => searched CASE; else simple CASE.
        scrutinee: Optional[ca.CalcExpr] = None
        if not self._peek_keyword("WHEN"):
            scrutinee = self._parse_expr()
        whens: list[tuple[ca.CalcExpr, ca.CalcExpr]] = []
        while self._peek_keyword("WHEN"):
            self._next()
            wcond = self._parse_expr()
            self._expect_keyword("THEN")
            wbranch = self._parse_expr()
            whens.append((wcond, wbranch))
        else_: Optional[ca.CalcExpr] = None
        if self._peek_keyword("ELSE"):
            self._next()
            else_ = self._parse_expr()
        self._expect_keyword("END")
        return ca.CaseExpr(scrutinee=scrutinee, whens=tuple(whens), else_=else_, pos=pos)

    def _peek_keyword(self, kw: str) -> bool:
        t = self._peek()
        return t.kind == TokenKind.KEYWORD and t.value == kw

    def _expect_keyword(self, kw: str) -> Token:
        t = self._peek()
        if not (t.kind == TokenKind.KEYWORD and t.value == kw):
            raise ParseError(f"expected keyword {kw} got {t.value!r}", t.line, t.column)
        return self._next()

    def _parse_ident_or_call(self, pos: ca.Position) -> ca.CalcExpr:
        ident = self._next()
        name = str(ident.value).upper()
        if self._peek().kind != TokenKind.LPAREN:
            # Bare identifier — treat as field ref shorthand for autocomplete-friendly syntax.
            return ca.FieldRef(field_name=str(ident.value), pos=pos)
        self._expect(TokenKind.LPAREN)
        args: list[ca.CalcExpr] = []
        if self._peek().kind != TokenKind.RPAREN:
            args.append(self._parse_expr())
            while self._peek().kind == TokenKind.COMMA:
                self._next()
                args.append(self._parse_expr())
        self._expect(TokenKind.RPAREN)
        return ca.FnCall(name=name, args=tuple(args), pos=pos)

    # ---- token stream helpers ----
    def _peek(self) -> Token:
        return self.tokens[self.pos]

    def _next(self) -> Token:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def _expect(self, kind: TokenKind) -> Token:
        t = self._peek()
        if t.kind != kind:
            raise ParseError(f"expected {kind.value} got {t.kind.value}", t.line, t.column)
        return self._next()


def parse(formula: str, max_depth: int = 32) -> ca.CalcExpr:
    return CalcParser(formula, max_depth=max_depth).parse()


__all__ = ["CalcLexer", "CalcParser", "Token", "TokenKind", "LexError", "ParseError", "parse"]
