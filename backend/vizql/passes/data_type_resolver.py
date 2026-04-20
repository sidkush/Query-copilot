"""DataTypeResolver — bottom-up type inference + unknown-type guard."""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from .. import sql_ast as sa


_NUMERIC = {"int", "float", "number"}
_AGG_NUMERIC = {"SUM", "AVG", "COUNT", "COUNTD", "MIN", "MAX", "MEDIAN",
                 "STDEV", "STDEVP", "VAR", "VARP", "PERCENTILE"}


@dataclass(frozen=True)
class DataTypeResolverPass:
    strict: bool = False

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        new_projs = tuple(dataclasses.replace(
            p, expression=self._resolve(p.expression)) for p in qf.projections)
        return dataclasses.replace(qf, projections=new_projs)

    def _resolve(self, e: sa.SQLQueryExpression) -> sa.SQLQueryExpression:
        if isinstance(e, sa.Column): return e
        if isinstance(e, sa.Literal): return e
        if isinstance(e, sa.BinaryOp):
            l = self._resolve(e.left); r = self._resolve(e.right)
            rt = _merge(_t(l), _t(r), e.op)
            return dataclasses.replace(e, left=l, right=r, resolved_type=rt)
        if isinstance(e, sa.FnCall):
            args = tuple(self._resolve(a) for a in e.args)
            rt = "number" if e.name.upper() in _AGG_NUMERIC else _t(args[0]) if args else "unknown"
            return dataclasses.replace(e, args=args, resolved_type=rt)
        if isinstance(e, sa.Case):
            whens = tuple((self._resolve(c), self._resolve(v)) for c, v in e.whens)
            els = self._resolve(e.else_) if e.else_ is not None else None
            # branch type = merge of value branches
            rt = "unknown"
            for _, v in whens:
                rt = _t(v) if rt == "unknown" else rt
            return dataclasses.replace(e, whens=whens, else_=els, resolved_type=rt)
        if isinstance(e, sa.Cast):
            inner = self._resolve(e.expr)
            if self.strict and _t(inner) == "unknown":
                raise ValueError(
                    f"cannot CAST expression of unknown type to {e.target_type}")
            return dataclasses.replace(e, expr=inner)
        if isinstance(e, sa.Window):
            return dataclasses.replace(e, expr=self._resolve(e.expr),
                                       resolved_type=_t(self._resolve(e.expr)))
        return e


def _t(e: sa.SQLQueryExpression) -> str:
    return getattr(e, "resolved_type", "unknown")


def _merge(a: str, b: str, op: str) -> str:
    if op in {"=", "<", ">", "<=", ">=", "!=", "AND", "OR"}:
        return "bool"
    if a in _NUMERIC and b in _NUMERIC:
        if "float" in (a, b): return "float"
        return "int" if a == b == "int" else "number"
    return "unknown"
