"""Calc-language AST. Plan 8a (Build_Tableau.md §V).

Frozen dataclasses produced by `calc_parser.parse()`. Consumed by
`calc_typecheck.typecheck()` and `calc_to_expression.compile_calc()`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal as _Lit, Optional, Union


@dataclass(frozen=True, slots=True)
class Position:
    line: int
    column: int


@dataclass(frozen=True, slots=True)
class Literal:
    value: object
    data_type: str  # "string" | "integer" | "real" | "boolean" | "date" | "datetime" | "null"
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class FieldRef:
    field_name: str
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class ParamRef:
    param_name: str
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class FnCall:
    name: str  # canonical UPPERCASE
    args: tuple["CalcExpr", ...]
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class BinaryOp:
    op: str  # "+", "-", "*", "/", "=", "<>", "<=", ">=", "<", ">", "AND", "OR", "IN"
    lhs: "CalcExpr"
    rhs: "CalcExpr"
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class UnaryOp:
    op: str  # "-", "NOT"
    operand: "CalcExpr"
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class IfExpr:
    cond: "CalcExpr"
    then_: "CalcExpr"
    elifs: tuple[tuple["CalcExpr", "CalcExpr"], ...]  # (cond, branch) pairs
    else_: Optional["CalcExpr"]
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class CaseExpr:
    """`scrutinee=None` -> searched CASE; else simple CASE."""
    scrutinee: Optional["CalcExpr"]
    whens: tuple[tuple["CalcExpr", "CalcExpr"], ...]
    else_: Optional["CalcExpr"]
    pos: Optional[Position] = None


@dataclass(frozen=True, slots=True)
class LodExpr:
    kind: _Lit["FIXED", "INCLUDE", "EXCLUDE"]
    dims: tuple[FieldRef, ...]
    body: "CalcExpr"
    pos: Optional[Position] = None


CalcExpr = Union[Literal, FieldRef, ParamRef, FnCall, BinaryOp, UnaryOp, IfExpr, CaseExpr, LodExpr]


__all__ = [
    "Position", "Literal", "FieldRef", "ParamRef", "FnCall",
    "BinaryOp", "UnaryOp", "IfExpr", "CaseExpr", "LodExpr", "CalcExpr",
]
