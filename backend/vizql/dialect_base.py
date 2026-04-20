"""BaseDialect — visitor that walks SQLQueryFunction and calls format_*
hooks. Dialect-specific subclasses live in backend/vizql/dialects/.

Mirrors Tableau's BaseDialect / SQLDialect (Build_Tableau.md §IV.5).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from . import sql_ast as sa


class BaseDialect(ABC):
    """Abstract dialect. Override format_* methods in subclasses."""

    name: str = "base"

    # ---- Emit (shared across dialects) ----
    def emit(self, qf: sa.SQLQueryFunction) -> str:
        """Walk ``qf`` and render dialect SQL. Pure string building.

        Order: CTEs (WITH), SELECT (via format_select), FROM, WHERE, GROUP BY
        / ROLLUP / CUBE / GROUPING SETS, HAVING, ORDER BY, LIMIT/OFFSET, set
        ops. client_side_filters are NOT emitted (§IV.7 step 8 is client-side).
        """
        qf.validate_structure()
        parts: list[str] = []
        if qf.ctes:
            parts.append(self._emit_ctes(qf.ctes))
        parts.append(self.format_select(qf))
        parts.append("FROM " + self._emit_from(qf.from_))
        if qf.where is not None:
            parts.append("WHERE " + self._emit_expr(qf.where))
        if qf.group_by:
            parts.append("GROUP BY " + ", ".join(self._emit_expr(e) for e in qf.group_by))
        if qf.rollup:
            parts.append("GROUP BY ROLLUP (" + ", ".join(self._emit_expr(e) for e in qf.rollup) + ")")
        if qf.cube:
            parts.append("GROUP BY CUBE (" + ", ".join(self._emit_expr(e) for e in qf.cube) + ")")
        if qf.grouping_sets:
            sets = ", ".join(
                "(" + ", ".join(self._emit_expr(e) for e in s) + ")"
                for s in qf.grouping_sets
            )
            parts.append("GROUP BY GROUPING SETS (" + sets + ")")
        if qf.having is not None:
            parts.append("HAVING " + self._emit_expr(qf.having))
        if qf.order_by:
            parts.append("ORDER BY " + ", ".join(
                f"{self._emit_expr(e)} {'ASC' if asc else 'DESC'}" for e, asc in qf.order_by))
        if qf.limit is not None:
            parts.append(self.format_top_clause(qf.limit))
        body = " ".join(parts)
        if qf.set_op is not None:
            so = qf.set_op
            kind = so.kind + (" ALL" if so.all else "")
            body = f"({body}) {kind} ({self.emit(so.right)})"
        return body

    # ---- Helpers ----
    def _emit_ctes(self, ctes: tuple[sa.CTE, ...]) -> str:
        head = "WITH RECURSIVE " if any(c.recursive for c in ctes) else "WITH "
        return head + ", ".join(
            f"{self.format_identifier(c.name)} AS ({self.emit(c.query)})" for c in ctes
        )

    def _emit_from(self, src: sa.FromSource) -> str:
        if isinstance(src, sa.TableRef):
            qualified = self.format_identifier(src.name) if not src.schema else (
                self.format_identifier(src.schema) + "." + self.format_identifier(src.name))
            alias = (" " + self.format_identifier(src.alias)) if src.alias else ""
            return qualified + alias
        if isinstance(src, sa.JoinNode):
            return self.format_join(src)
        if isinstance(src, sa.SubqueryRef):
            lat = "LATERAL " if src.lateral else ""
            return f"{lat}({self.emit(src.query)}) {self.format_identifier(src.alias)}"
        raise TypeError(f"unknown FromSource: {type(src).__name__}")

    def _emit_expr(self, e: sa.SQLQueryExpression) -> str:
        if isinstance(e, sa.Column):
            tbl = (self.format_identifier(e.table_alias) + ".") if e.table_alias else ""
            ident = "*" if e.name == "*" else self.format_identifier(e.name)
            return tbl + ident
        if isinstance(e, sa.Literal):
            return self._emit_literal(e)
        if isinstance(e, sa.BinaryOp):
            return f"({self._emit_expr(e.left)} {e.op} {self._emit_expr(e.right)})"
        if isinstance(e, sa.FnCall):
            return self._emit_fncall(e)
        if isinstance(e, sa.Case):
            return self.format_case(e)
        if isinstance(e, sa.Cast):
            return self.format_cast(e)
        if isinstance(e, sa.Window):
            return self.format_window(e)
        if isinstance(e, sa.Subquery):
            return f"({self.emit(e.query)})"
        raise TypeError(f"unknown expr: {type(e).__name__}")

    def _emit_literal(self, lit: sa.Literal) -> str:
        v = lit.value
        if v is None:
            return "NULL"
        if isinstance(v, bool):
            return self.format_boolean_attribute(v)
        if isinstance(v, int):
            return self.format_int64_attribute(v) if lit.data_type == "int64" \
                else self.format_integer_attribute(v)
        if isinstance(v, float):
            return self.format_float_attribute(v)
        return self.format_string_literal(str(v))

    def _emit_fncall(self, f: sa.FnCall) -> str:
        # Special-case SQL constructs that aren't ordinary function calls.
        if f.name.upper() == "IN":
            left = self._emit_expr(f.args[0])
            rhs = ", ".join(self._emit_expr(a) for a in f.args[1:])
            return f"{left} IN ({rhs})"
        if f.name.upper() == "INTERVAL" and len(f.args) == 2:
            part = f.args[0]
            n = f.args[1]
            assert isinstance(part, sa.Literal) and isinstance(n, sa.Literal)
            return self.format_interval(str(part.value), int(n.value))  # type: ignore[arg-type]
        if f.name.upper() == "CURRENT_TIMESTAMP" and not f.args:
            return self.format_current_timestamp()
        if f.name.upper() == "DATE_TRUNC" and len(f.args) == 2:
            part = f.args[0]
            assert isinstance(part, sa.Literal)
            return self.format_date_trunc(str(part.value), self._emit_expr(f.args[1]))
        AGGS = {"SUM","AVG","COUNT","COUNTD","MIN","MAX","MEDIAN","STDEV",
                "STDEVP","VAR","VARP","PERCENTILE","ATTR","COLLECT"}
        if f.name.upper() in AGGS:
            return self.format_aggregate(f)
        args = ", ".join(self._emit_expr(a) for a in f.args)
        return f"{f.name}({args})"

    # ---- §IV.5 format catalogue — abstract on the base, overridable per dialect ----
    @abstractmethod
    def format_select(self, qf: sa.SQLQueryFunction) -> str: ...
    @abstractmethod
    def format_join(self, j: sa.JoinNode) -> str: ...
    @abstractmethod
    def format_case(self, c: sa.Case) -> str: ...
    @abstractmethod
    def format_simple_case(self, c: sa.Case) -> str: ...
    @abstractmethod
    def format_aggregate(self, f: sa.FnCall) -> str: ...
    @abstractmethod
    def format_window(self, w: sa.Window) -> str: ...
    @abstractmethod
    def format_cast(self, c: sa.Cast) -> str: ...
    @abstractmethod
    def format_drop_column(self, table: str, column: str) -> str: ...
    @abstractmethod
    def format_table_dee(self) -> str: ...
    @abstractmethod
    def format_default_from_clause(self) -> str: ...
    @abstractmethod
    def format_set_isolation_level(self, level: str) -> str: ...
    @abstractmethod
    def format_boolean_attribute(self, v: bool) -> str: ...
    @abstractmethod
    def format_float_attribute(self, v: float) -> str: ...
    @abstractmethod
    def format_integer_attribute(self, v: int) -> str: ...
    @abstractmethod
    def format_int64_attribute(self, v: int) -> str: ...
    @abstractmethod
    def format_top_clause(self, n: int) -> str: ...
    @abstractmethod
    def format_offset_clause(self, n: int) -> str: ...
    @abstractmethod
    def format_string_literal(self, v: str) -> str: ...
    @abstractmethod
    def format_identifier(self, ident: str) -> str: ...
    @abstractmethod
    def format_date_trunc(self, part: str, expr: str) -> str: ...
    @abstractmethod
    def format_datediff(self, part: str, a: str, b: str) -> str: ...
    @abstractmethod
    def format_extract(self, part: str, expr: str) -> str: ...
    @abstractmethod
    def format_current_timestamp(self) -> str: ...
    @abstractmethod
    def format_interval(self, part: str, n: int) -> str: ...


__all__ = ["BaseDialect"]
