"""JoinTreeVirtualizer — §IV.4 + §II.2.

Drops joins to tables not referenced by the outer SELECT / WHERE /
GROUP BY / ORDER BY / HAVING projections. Mirrors Tableau's
"Relationships" model: joins are logical, materialised only for the
fields the viz actually touches.
"""
from __future__ import annotations
import dataclasses
from dataclasses import dataclass
from .. import sql_ast as sa


@dataclass(frozen=True)
class JoinTreeVirtualizerPass:
    referenced_tables: frozenset[str] | set[str]

    def run(self, qf: sa.SQLQueryFunction) -> sa.SQLQueryFunction:
        return dataclasses.replace(qf, from_=self._trim(qf.from_))

    def _trim(self, src: sa.FromSource) -> sa.FromSource:
        if isinstance(src, sa.TableRef): return src
        if isinstance(src, sa.SubqueryRef): return src
        if isinstance(src, sa.JoinNode):
            l = self._trim(src.left); r = self._trim(src.right)
            lref = _refs(l); rref = _refs(r)
            wanted = set(self.referenced_tables)
            if lref & wanted and not (rref & wanted): return l
            if rref & wanted and not (lref & wanted): return r
            return dataclasses.replace(src, left=l, right=r)
        return src


def _refs(src: sa.FromSource) -> set[str]:
    if isinstance(src, sa.TableRef): return {src.name}
    if isinstance(src, sa.JoinNode): return _refs(src.left) | _refs(src.right)
    if isinstance(src, sa.SubqueryRef): return {src.alias}
    return set()
