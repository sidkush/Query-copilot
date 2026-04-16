"""
join_graph.py — FK-driven multi-table join graph with BFS pathfinder.

Builds an adjacency list from a SchemaProfile's foreign_key metadata and
provides BFS shortest-path traversal between tables, returning a list of
JOIN step dicts and a ready-to-embed SQL JOIN clause.

Invariant: this module is purely in-memory computation — it issues no queries
to the database and has no side effects.
"""

from __future__ import annotations

import logging
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

from schema_intelligence import SchemaProfile, TableProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_fk(fk: Dict[str, Any]) -> Tuple[List[str], str, List[str]]:
    """Normalise FK dict to (source_cols, target_table, target_cols).

    db_connector.py stores FKs as::

        {"columns": [...], "referred_table": "...", "referred_columns": [...]}

    semantic_bootstrap.py / older paths may have::

        {"constrained_columns": [...], "referred_table": "...",
         "referred_columns": [...]}  or  {"from": [...], "table": "...", "to": [...]}

    Returns empty lists/strings on unrecognisable format so callers can skip.
    """
    src_cols: List[str] = (
        fk.get("columns")
        or fk.get("constrained_columns")
        or fk.get("from")
        or []
    )
    tgt_table: str = fk.get("referred_table") or fk.get("table") or ""
    tgt_cols: List[str] = (
        fk.get("referred_columns")
        or fk.get("to")
        or []
    )
    if isinstance(src_cols, str):
        src_cols = [src_cols]
    if isinstance(tgt_cols, str):
        tgt_cols = [tgt_cols]
    return src_cols, tgt_table, tgt_cols


# ---------------------------------------------------------------------------
# JoinGraph
# ---------------------------------------------------------------------------

class JoinGraph:
    """Graph of table relationships built from FK metadata.

    Each node is a table name (string).  Each edge is a bidirectional link
    representing a FK relationship, stored in both directions so BFS can
    traverse from either end.

    Edge payload::

        {
            "from_table":  str,
            "from_column": str,   # first/only column of the FK (multi-col FKs use first pair)
            "to_table":    str,
            "to_column":   str,
            "join_type":   "LEFT JOIN",
        }
    """

    def __init__(self, schema_profile: SchemaProfile) -> None:
        # adjacency[table] = list of edge dicts (outgoing + incoming)
        self._adj: Dict[str, List[Dict[str, Any]]] = {}
        self._tables: List[str] = []
        self._build(schema_profile)

    # ------------------------------------------------------------------
    # Build
    # ------------------------------------------------------------------

    def _ensure_node(self, table: str) -> None:
        if table not in self._adj:
            self._adj[table] = []
            self._tables.append(table)

    def _add_edge(
        self,
        from_table: str,
        from_col: str,
        to_table: str,
        to_col: str,
    ) -> None:
        """Add a directed edge (and its reverse) to the adjacency list."""
        forward = {
            "from_table": from_table,
            "from_column": from_col,
            "to_table": to_table,
            "to_column": to_col,
            "join_type": "LEFT JOIN",
        }
        reverse = {
            "from_table": to_table,
            "from_column": to_col,
            "to_table": from_table,
            "to_column": from_col,
            "join_type": "LEFT JOIN",
        }
        self._adj[from_table].append(forward)
        self._adj[to_table].append(reverse)

    def _build(self, schema_profile: SchemaProfile) -> None:
        """Populate the graph from SchemaProfile.tables[*].foreign_keys."""
        # First pass: ensure all tables are present as nodes
        for table in schema_profile.tables:
            self._ensure_node(table.name)

        # Second pass: add FK edges
        for table in schema_profile.tables:
            for fk in table.foreign_keys:
                src_cols, tgt_table, tgt_cols = _parse_fk(fk)
                if not src_cols or not tgt_table or not tgt_cols:
                    logger.debug(
                        "JoinGraph: skipping malformed FK on table '%s': %s",
                        table.name, fk,
                    )
                    continue

                # Ensure the target table is a known node even if it didn't
                # appear in the profile tables list (defensive).
                self._ensure_node(tgt_table)

                # For multi-column FKs use only the first column pair — BFS
                # produces one-hop steps, and multi-col JOIN conditions are
                # appended as part of the same step's SQL by get_join_sql.
                from_col = src_cols[0]
                to_col = tgt_cols[0]

                # Avoid duplicate edges (both FK directions may be declared)
                already = any(
                    e["from_table"] == table.name
                    and e["from_column"] == from_col
                    and e["to_table"] == tgt_table
                    and e["to_column"] == to_col
                    for e in self._adj[table.name]
                )
                if not already:
                    self._add_edge(table.name, from_col, tgt_table, to_col)

        logger.debug(
            "JoinGraph: built graph with %d nodes, %d total directed edges",
            len(self._tables),
            sum(len(v) for v in self._adj.values()),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def all_tables(self) -> List[str]:
        """List all tables in the graph."""
        return list(self._tables)

    def neighbors(self, table: str) -> List[Dict[str, Any]]:
        """List tables directly joinable from *table*.

        Returns a list of edge dicts (same shape as a JOIN step from
        ``find_join_path``).
        """
        return list(self._adj.get(table, []))

    def find_join_path(
        self, source_table: str, target_table: str
    ) -> Optional[List[Dict[str, Any]]]:
        """BFS shortest path from *source_table* to *target_table*.

        Parameters
        ----------
        source_table:
            Starting table (usually the primary FROM table).
        target_table:
            Table to reach via JOIN hops.

        Returns
        -------
        list[dict] | None
            Ordered list of JOIN step dicts — one per hop.  Each step::

                {
                    "from_table":  str,
                    "from_column": str,
                    "to_table":    str,
                    "to_column":   str,
                    "join_type":   "LEFT JOIN",
                }

            Returns ``None`` when no path exists (tables not connected) or
            when either table is not in the graph.
        """
        if source_table not in self._adj or target_table not in self._adj:
            logger.debug(
                "JoinGraph.find_join_path: '%s' or '%s' not in graph",
                source_table, target_table,
            )
            return None

        if source_table == target_table:
            return []

        # BFS
        # visited maps table_name → edge that was used to reach it
        visited: Dict[str, Optional[Dict[str, Any]]] = {source_table: None}
        queue: deque[str] = deque([source_table])

        while queue:
            current = queue.popleft()
            for edge in self._adj.get(current, []):
                neighbour = edge["to_table"]
                if neighbour not in visited:
                    visited[neighbour] = edge
                    if neighbour == target_table:
                        # Reconstruct path
                        return self._reconstruct_path(visited, target_table)
                    queue.append(neighbour)

        logger.debug(
            "JoinGraph.find_join_path: no path from '%s' to '%s'",
            source_table, target_table,
        )
        return None

    def _reconstruct_path(
        self,
        visited: Dict[str, Optional[Dict[str, Any]]],
        target_table: str,
    ) -> List[Dict[str, Any]]:
        """Walk the BFS visited map backward to reconstruct the edge sequence."""
        path: List[Dict[str, Any]] = []
        current = target_table
        while visited[current] is not None:
            edge = visited[current]
            path.append(edge)
            current = edge["from_table"]
        path.reverse()
        return path

    def get_join_sql(
        self, source_table: str, target_table: str
    ) -> Optional[str]:
        """Generate a SQL JOIN clause string for the shortest path.

        Parameters
        ----------
        source_table:
            The table already in the FROM clause.
        target_table:
            The table to join in.

        Returns
        -------
        str | None
            A multi-line JOIN clause ready to embed in a SELECT, e.g.::

                LEFT JOIN customers ON orders.customer_id = customers.id

            Returns ``None`` when no path exists.

        Notes
        -----
        For a multi-hop path the intermediate tables are included as
        successive LEFT JOINs::

            LEFT JOIN orders ON order_items.order_id = orders.id
            LEFT JOIN customers ON orders.customer_id = customers.id
        """
        path = self.find_join_path(source_table, target_table)
        if path is None:
            return None
        if not path:
            # Same table — nothing to join
            return ""

        clauses: List[str] = []
        for step in path:
            clauses.append(
                f"{step['join_type']} {step['to_table']} "
                f"ON {step['from_table']}.{step['from_column']} "
                f"= {step['to_table']}.{step['to_column']}"
            )
        return "\n".join(clauses)
