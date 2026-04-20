"""Bottom-up type inference + validation. Plan 8a.

Walks a CalcExpr emitted by `calc_parser.parse()`, resolves FieldRef types
via the supplied schema mapping, dispatches FnCall via FUNCTIONS, and
rejects: unknown functions, arg arity mismatches, type mismatches, and
aggregate / non-aggregate mixing at the same scope.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from . import calc_ast as ca
from .calc_functions import FUNCTIONS, TypeConstraint, TypeKind, Category


class TypeError(ValueError):  # noqa: A001 — module-scoped, not the builtin
    pass


@dataclass(frozen=True, slots=True)
class InferredType:
    kind: TypeKind
    is_aggregate: bool = False  # True if value is the result of an aggregate at this scope


_NUMERIC_KINDS = {TypeKind.NUMBER, TypeKind.INTEGER}
_TEMPORAL_KINDS = {TypeKind.DATE, TypeKind.DATETIME}


def typecheck(expr: ca.CalcExpr, schema: Mapping[str, str]) -> InferredType:
    """Top-level entry. Schema maps field_name → type kind string
    ("number", "integer", "string", "date", "datetime", "boolean", "spatial").
    Raises TypeError on any violation; returns InferredType on success.
    """
    return _walk(expr, schema)


def _walk(expr: ca.CalcExpr, schema: Mapping[str, str]) -> InferredType:
    if isinstance(expr, ca.Literal):
        return InferredType(_kind_from_literal_type(expr.data_type))

    if isinstance(expr, ca.FieldRef):
        kind_str = schema.get(expr.field_name)
        if kind_str is None:
            raise TypeError(f"unknown field [{expr.field_name}]")
        return InferredType(_kind_from_str(kind_str))

    if isinstance(expr, ca.ParamRef):
        # Parameters are typed at substitution time (Task 11 endpoint receives
        # parameter types in the request body). Default ANY in pure parser tests.
        return InferredType(TypeKind.ANY)

    if isinstance(expr, ca.FnCall):
        return _check_fn_call(expr, schema)

    if isinstance(expr, ca.BinaryOp):
        return _check_binary(expr, schema)

    if isinstance(expr, ca.UnaryOp):
        operand = _walk(expr.operand, schema)
        if expr.op == "NOT" and operand.kind is not TypeKind.BOOLEAN:
            raise TypeError(f"NOT requires boolean, got {operand.kind.value}")
        if expr.op == "-" and operand.kind not in _NUMERIC_KINDS:
            raise TypeError(f"unary minus requires numeric, got {operand.kind.value}")
        return operand

    if isinstance(expr, ca.IfExpr):
        return _check_if(expr, schema)

    if isinstance(expr, ca.CaseExpr):
        return _check_case(expr, schema)

    if isinstance(expr, ca.LodExpr):
        body = _walk(expr.body, schema)
        # LOD wraps an aggregate; outer scope sees a row-level value.
        if expr.kind in ("INCLUDE", "EXCLUDE") and not expr.dims:
            raise TypeError(f"{expr.kind} LOD requires at least one dim")
        return InferredType(body.kind, is_aggregate=False)

    raise TypeError(f"unhandled node {type(expr).__name__}")


def _kind_from_literal_type(t: str) -> TypeKind:
    return {
        "string": TypeKind.STRING, "integer": TypeKind.INTEGER, "real": TypeKind.NUMBER,
        "boolean": TypeKind.BOOLEAN, "date": TypeKind.DATE, "datetime": TypeKind.DATETIME,
        "null": TypeKind.ANY,
    }[t]


def _kind_from_str(s: str) -> TypeKind:
    table = {
        "string": TypeKind.STRING, "integer": TypeKind.INTEGER, "number": TypeKind.NUMBER,
        "real": TypeKind.NUMBER, "float": TypeKind.NUMBER, "double": TypeKind.NUMBER,
        "boolean": TypeKind.BOOLEAN, "bool": TypeKind.BOOLEAN,
        "date": TypeKind.DATE, "datetime": TypeKind.DATETIME, "timestamp": TypeKind.DATETIME,
        "spatial": TypeKind.SPATIAL, "geometry": TypeKind.SPATIAL,
    }
    return table.get(s.lower(), TypeKind.ANY)


def _compat(actual: TypeKind, required: TypeKind) -> bool:
    if required is TypeKind.ANY or actual is TypeKind.ANY:
        return True
    if required is TypeKind.NUMBER and actual in _NUMERIC_KINDS:
        return True
    if required is TypeKind.INTEGER and actual is TypeKind.INTEGER:
        return True
    if required is TypeKind.DATETIME and actual in _TEMPORAL_KINDS:
        return True
    return actual is required


def _check_fn_call(expr: ca.FnCall, schema: Mapping[str, str]) -> InferredType:
    if expr.name == "__TUPLE__":
        # Internal IN-list marker; arms are expressions with mixed types — return ANY.
        for a in expr.args:
            _walk(a, schema)
        return InferredType(TypeKind.ANY)

    fn = FUNCTIONS.get(expr.name)
    if fn is None:
        raise TypeError(f"unknown function {expr.name}")

    arg_types = tuple(_walk(a, schema) for a in expr.args)

    if len(arg_types) < fn.min_args or (fn.max_args >= 0 and len(arg_types) > fn.max_args):
        raise TypeError(
            f"{fn.name} expects {fn.min_args}..{fn.max_args} args, got {len(arg_types)}"
        )

    # Aggregate-of-aggregate forbidden unless wrapped in LOD (LOD walks reset
    # is_aggregate to False at the outer scope).
    if fn.is_aggregate and any(a.is_aggregate for a in arg_types):
        raise TypeError(f"{fn.name} cannot be applied to an aggregate expression")

    # Type-match each declared arg position.
    for i, declared in enumerate(fn.arg_types):
        if i >= len(arg_types):
            break
        if declared.kind is TypeKind.SAME_AS:
            continue  # checked at return-type resolution
        if not _compat(arg_types[i].kind, declared.kind):
            raise TypeError(
                f"{fn.name} arg {i + 1}: expected {declared.kind.value}, got {arg_types[i].kind.value}"
            )

    # Resolve return type.
    if isinstance(fn.return_type, TypeConstraint):
        ret = fn.return_type
        if ret.kind is TypeKind.SAME_AS and 0 <= ret.arg_index < len(arg_types):
            return InferredType(arg_types[ret.arg_index].kind, is_aggregate=fn.is_aggregate)
        return InferredType(ret.kind, is_aggregate=fn.is_aggregate)
    resolved = fn.return_type(tuple(TypeConstraint(a.kind) for a in arg_types))
    return InferredType(resolved.kind, is_aggregate=fn.is_aggregate)


def _check_binary(expr: ca.BinaryOp, schema: Mapping[str, str]) -> InferredType:
    lhs = _walk(expr.lhs, schema)
    rhs = _walk(expr.rhs, schema)
    if lhs.is_aggregate != rhs.is_aggregate:
        raise TypeError("cannot mix aggregate and non-aggregate operands")

    op = expr.op
    if op in ("+", "-", "*", "/"):
        if not (lhs.kind in _NUMERIC_KINDS and rhs.kind in _NUMERIC_KINDS):
            raise TypeError(f"arithmetic {op} requires numeric operands")
        return InferredType(TypeKind.NUMBER, is_aggregate=lhs.is_aggregate)
    if op in ("=", "<>", "<", "<=", ">", ">="):
        return InferredType(TypeKind.BOOLEAN, is_aggregate=lhs.is_aggregate)
    if op in ("AND", "OR"):
        if lhs.kind is not TypeKind.BOOLEAN or rhs.kind is not TypeKind.BOOLEAN:
            raise TypeError(f"{op} requires boolean operands")
        return InferredType(TypeKind.BOOLEAN, is_aggregate=lhs.is_aggregate)
    if op == "IN":
        return InferredType(TypeKind.BOOLEAN, is_aggregate=lhs.is_aggregate)
    raise TypeError(f"unknown operator {op}")


def _check_if(expr: ca.IfExpr, schema: Mapping[str, str]) -> InferredType:
    cond = _walk(expr.cond, schema)
    if cond.kind is not TypeKind.BOOLEAN:
        raise TypeError("IF condition must be boolean")
    branches = [_walk(expr.then_, schema)]
    for c, b in expr.elifs:
        if _walk(c, schema).kind is not TypeKind.BOOLEAN:
            raise TypeError("ELSEIF condition must be boolean")
        branches.append(_walk(b, schema))
    if expr.else_ is not None:
        branches.append(_walk(expr.else_, schema))
    return _join_branches(branches)


def _check_case(expr: ca.CaseExpr, schema: Mapping[str, str]) -> InferredType:
    branches: list[InferredType] = []
    for cond, branch in expr.whens:
        _walk(cond, schema)
        branches.append(_walk(branch, schema))
    if expr.else_ is not None:
        branches.append(_walk(expr.else_, schema))
    if expr.scrutinee is not None:
        _walk(expr.scrutinee, schema)
    return _join_branches(branches)


def _join_branches(branches: list[InferredType]) -> InferredType:
    kinds = {b.kind for b in branches if b.kind is not TypeKind.ANY}
    if len(kinds) > 1 and not kinds.issubset(_NUMERIC_KINDS):
        raise TypeError(f"branch types differ: {sorted(k.value for k in kinds)}")
    is_agg = any(b.is_aggregate for b in branches)
    if is_agg and not all(b.is_aggregate for b in branches):
        raise TypeError("CASE/IF branches mix aggregate and non-aggregate")
    head = next(iter(kinds), TypeKind.ANY)
    return InferredType(head, is_aggregate=is_agg)


__all__ = ["TypeError", "InferredType", "TypeKind", "typecheck"]
