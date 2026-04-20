"""EqualityProver — §IV.4. Tracks equality / non-equality assertions for
downstream predicate pushdown. Read-only over AST (idempotent)."""
from __future__ import annotations
from dataclasses import dataclass, field
from .. import sql_ast as sa


@dataclass
class Assertions:
    equalities: set[tuple[str, str]] = field(default_factory=set)
    inequalities: set[tuple[str, str]] = field(default_factory=set)


class EqualityProverPass:
    def __init__(self) -> None:
        self._by_scope: dict[str, Assertions] = {}

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        scope = "root"
        self._by_scope.setdefault(scope, Assertions())
        if qf.where is not None: self._collect(qf.where, self._by_scope[scope])
        return qf

    def assertions_for_scope(self, name: str) -> Assertions:
        return self._by_scope.get(name, Assertions())

    def _collect(self, e: sa.SQLQueryExpression, out: Assertions) -> None:
        if isinstance(e, sa.BinaryOp):
            if e.op == "AND":
                self._collect(e.left, out); self._collect(e.right, out); return
            if e.op == "=":
                out.equalities.add((_show(e.left), _show(e.right))); return
            if e.op == "!=":
                out.inequalities.add((_show(e.left), _show(e.right))); return


def _show(e: sa.SQLQueryExpression) -> str:
    if isinstance(e, sa.Column):
        return f"{e.table_alias}.{e.name}" if e.table_alias else e.name
    if isinstance(e, sa.Literal):
        return str(e.value)
    return repr(e)
