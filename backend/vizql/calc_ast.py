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


# ---------------------------------------------------------------------------
# Plan 8d T7 — minimal pretty-printer used by `/api/v1/calcs/evaluate` to
# re-serialise subtrees when building an AST trace. Kept deliberately small;
# covers every concrete node type. Round-trip is NOT guaranteed byte-exact
# (whitespace/case may differ from the original source), but `parse(to_formula(ast))`
# must yield a semantically equivalent AST.
# ---------------------------------------------------------------------------

def _fmt_literal(v: object, data_type: str) -> str:
    if v is None:
        return "NULL"
    if data_type == "string":
        return "'" + str(v).replace("'", "''") + "'"
    if data_type == "boolean":
        return "TRUE" if v else "FALSE"
    return str(v)


def to_formula(node: "CalcExpr") -> str:
    """Render a calc AST back to its source form.

    Used by Plan 8d's AST tracer. Not the canonical serialiser — callers that
    need exact source text should keep the original string.
    """
    if isinstance(node, Literal):
        return _fmt_literal(node.value, node.data_type)
    if isinstance(node, FieldRef):
        return f"[{node.field_name}]"
    if isinstance(node, ParamRef):
        return f"[Parameters].[{node.param_name}]"
    if isinstance(node, BinaryOp):
        return f"{to_formula(node.lhs)} {node.op} {to_formula(node.rhs)}"
    if isinstance(node, UnaryOp):
        sep = " " if node.op.isalpha() else ""
        return f"{node.op}{sep}{to_formula(node.operand)}"
    if isinstance(node, FnCall):
        args = ", ".join(to_formula(a) for a in node.args)
        return f"{node.name}({args})"
    if isinstance(node, IfExpr):
        parts = [f"IF {to_formula(node.cond)} THEN {to_formula(node.then_)}"]
        for c, b in node.elifs:
            parts.append(f"ELSEIF {to_formula(c)} THEN {to_formula(b)}")
        if node.else_ is not None:
            parts.append(f"ELSE {to_formula(node.else_)}")
        parts.append("END")
        return " ".join(parts)
    if isinstance(node, CaseExpr):
        head = "CASE"
        if node.scrutinee is not None:
            head += " " + to_formula(node.scrutinee)
        whens = " ".join(
            f"WHEN {to_formula(c)} THEN {to_formula(b)}" for c, b in node.whens
        )
        tail = f" ELSE {to_formula(node.else_)}" if node.else_ is not None else ""
        return f"{head} {whens}{tail} END"
    if isinstance(node, LodExpr):
        dims = ", ".join(to_formula(d) for d in node.dims)
        return "{" + f"{node.kind} {dims} : {to_formula(node.body)}" + "}"
    raise TypeError(f"to_formula: unhandled node {type(node).__name__}")


__all__ = [
    "Position", "Literal", "FieldRef", "ParamRef", "FnCall",
    "BinaryOp", "UnaryOp", "IfExpr", "CaseExpr", "LodExpr", "CalcExpr",
    "to_formula",
]
