"""
Tests for join_graph.JoinGraph — BFS path finder and SQL JOIN generation.

FK dict format used throughout (mirrors db_connector.py SQLAlchemy inspector output)::

    {"columns": ["<src_col>"], "referred_table": "<tgt_table>",
     "referred_columns": ["<tgt_col>"]}
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone

from schema_intelligence import SchemaProfile, TableProfile
from join_graph import JoinGraph


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _make_profile(tables: list[TableProfile]) -> SchemaProfile:
    return SchemaProfile(
        tables=tables,
        schema_hash="test-hash",
        cached_at=_utcnow(),
        conn_id="test-conn",
    )


def _table(name: str, fks: list[dict]) -> TableProfile:
    return TableProfile(
        name=name,
        row_count_estimate=-1,
        columns=[],
        indexes=[],
        partitions=[],
        primary_keys=["id"],
        foreign_keys=fks,
    )


def _fk(columns: list[str], referred_table: str, referred_columns: list[str]) -> dict:
    """Build a FK dict in the db_connector.py format."""
    return {
        "columns": columns,
        "referred_table": referred_table,
        "referred_columns": referred_columns,
    }


# ---------------------------------------------------------------------------
# Schema fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def simple_profile() -> SchemaProfile:
    """orders → customers (direct single-hop FK)."""
    orders = _table("orders", [_fk(["customer_id"], "customers", ["id"])])
    customers = _table("customers", [])
    return _make_profile([orders, customers])


@pytest.fixture()
def three_hop_profile() -> SchemaProfile:
    """order_items → orders → customers (two-hop path)."""
    order_items = _table("order_items", [_fk(["order_id"], "orders", ["id"])])
    orders = _table("orders", [_fk(["customer_id"], "customers", ["id"])])
    customers = _table("customers", [])
    return _make_profile([order_items, orders, customers])


@pytest.fixture()
def unconnected_profile() -> SchemaProfile:
    """orders and products have no FK relationship."""
    orders = _table("orders", [_fk(["customer_id"], "customers", ["id"])])
    customers = _table("customers", [])
    products = _table("products", [])
    return _make_profile([orders, customers, products])


@pytest.fixture()
def self_referential_profile() -> SchemaProfile:
    """employees.manager_id → employees.id (self-referential FK)."""
    employees = _table(
        "employees",
        [_fk(["manager_id"], "employees", ["id"])],
    )
    return _make_profile([employees])


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFindDirectFkPath:
    """Test 1: orders → customers via customer_id FK."""

    def test_finds_direct_fk_path(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        path = graph.find_join_path("orders", "customers")

        assert path is not None, "Expected a path but got None"
        assert len(path) == 1, f"Expected 1 hop, got {len(path)}"

        step = path[0]
        assert step["from_table"] == "orders"
        assert step["from_column"] == "customer_id"
        assert step["to_table"] == "customers"
        assert step["to_column"] == "id"
        assert step["join_type"] == "LEFT JOIN"

    def test_reverse_direction_also_works(self, simple_profile: SchemaProfile):
        """Graph is undirected — customers → orders should resolve too."""
        graph = JoinGraph(simple_profile)
        path = graph.find_join_path("customers", "orders")

        assert path is not None
        assert len(path) == 1
        assert path[0]["from_table"] == "customers"
        assert path[0]["to_table"] == "orders"

    def test_same_table_returns_empty_list(self, simple_profile: SchemaProfile):
        """A table joined to itself is a zero-hop path — empty list, not None."""
        graph = JoinGraph(simple_profile)
        path = graph.find_join_path("orders", "orders")

        assert path is not None
        assert path == []


class TestFindMultiHopPath:
    """Test 2: order_items → customers via orders (2-hop)."""

    def test_finds_multi_hop_path(self, three_hop_profile: SchemaProfile):
        graph = JoinGraph(three_hop_profile)
        path = graph.find_join_path("order_items", "customers")

        assert path is not None, "Expected a 2-hop path but got None"
        assert len(path) == 2, f"Expected 2 hops, got {len(path)}"

        # First hop: order_items → orders
        assert path[0]["from_table"] == "order_items"
        assert path[0]["from_column"] == "order_id"
        assert path[0]["to_table"] == "orders"
        assert path[0]["to_column"] == "id"

        # Second hop: orders → customers
        assert path[1]["from_table"] == "orders"
        assert path[1]["from_column"] == "customer_id"
        assert path[1]["to_table"] == "customers"
        assert path[1]["to_column"] == "id"

    def test_shortest_path_preferred(self, three_hop_profile: SchemaProfile):
        """Direct hop is preferred over longer route when both exist."""
        graph = JoinGraph(three_hop_profile)
        # order_items → orders is 1 hop (directly via FK)
        path = graph.find_join_path("order_items", "orders")
        assert path is not None
        assert len(path) == 1


class TestReturnsNoneForUnconnected:
    """Test 3: no path between tables without a FK chain."""

    def test_returns_none_for_unconnected(self, unconnected_profile: SchemaProfile):
        graph = JoinGraph(unconnected_profile)
        path = graph.find_join_path("orders", "products")

        assert path is None, "Expected None for unconnected tables"

    def test_returns_none_for_unknown_source(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        path = graph.find_join_path("nonexistent_table", "customers")

        assert path is None

    def test_returns_none_for_unknown_target(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        path = graph.find_join_path("orders", "nonexistent_table")

        assert path is None


class TestGeneratesJoinSql:
    """Test 4: verify SQL output format."""

    def test_generates_single_hop_join_sql(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        sql = graph.get_join_sql("orders", "customers")

        assert sql is not None
        assert "LEFT JOIN" in sql
        assert "customers" in sql
        assert "orders.customer_id" in sql
        assert "customers.id" in sql
        # Exact expected format:
        assert sql == "LEFT JOIN customers ON orders.customer_id = customers.id"

    def test_generates_multi_hop_join_sql(self, three_hop_profile: SchemaProfile):
        graph = JoinGraph(three_hop_profile)
        sql = graph.get_join_sql("order_items", "customers")

        assert sql is not None
        lines = sql.splitlines()
        assert len(lines) == 2
        assert lines[0] == "LEFT JOIN orders ON order_items.order_id = orders.id"
        assert lines[1] == "LEFT JOIN customers ON orders.customer_id = customers.id"

    def test_returns_none_for_unconnected_tables(self, unconnected_profile: SchemaProfile):
        graph = JoinGraph(unconnected_profile)
        sql = graph.get_join_sql("orders", "products")

        assert sql is None

    def test_returns_empty_string_for_same_table(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        sql = graph.get_join_sql("orders", "orders")

        assert sql == ""


class TestHandlesSelfReferentialFk:
    """Test 5: employees.manager_id → employees.id (self-referential FK)."""

    def test_self_referential_fk_node_in_graph(self, self_referential_profile: SchemaProfile):
        graph = JoinGraph(self_referential_profile)

        assert "employees" in graph.all_tables()

    def test_self_referential_fk_neighbors_not_empty(self, self_referential_profile: SchemaProfile):
        """Self-referential FK should create at least one neighbor entry."""
        graph = JoinGraph(self_referential_profile)
        nbrs = graph.neighbors("employees")

        # The graph should record the self-referential edge
        assert len(nbrs) > 0

    def test_self_referential_same_table_path(self, self_referential_profile: SchemaProfile):
        """Same table → same table is the zero-hop case, returns empty list."""
        graph = JoinGraph(self_referential_profile)
        path = graph.find_join_path("employees", "employees")

        assert path is not None
        assert path == []


class TestAllTablesAndNeighbors:
    """Unit tests for all_tables() and neighbors() helpers."""

    def test_all_tables_returns_every_table(self, three_hop_profile: SchemaProfile):
        graph = JoinGraph(three_hop_profile)
        tables = graph.all_tables()

        assert set(tables) == {"order_items", "orders", "customers"}

    def test_neighbors_returns_edge_dicts(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        nbrs = graph.neighbors("orders")

        assert len(nbrs) >= 1
        nbr = nbrs[0]
        assert "from_table" in nbr
        assert "from_column" in nbr
        assert "to_table" in nbr
        assert "to_column" in nbr
        assert "join_type" in nbr

    def test_neighbors_unknown_table_returns_empty(self, simple_profile: SchemaProfile):
        graph = JoinGraph(simple_profile)
        assert graph.neighbors("ghost_table") == []


class TestAlternateFkFormats:
    """Ensure FK normalisation handles constrained_columns / from+to variants."""

    def test_constrained_columns_format(self):
        """Older SQLAlchemy / alternate paths may emit constrained_columns."""
        orders = TableProfile(
            name="orders",
            row_count_estimate=-1,
            columns=[],
            indexes=[],
            partitions=[],
            primary_keys=["id"],
            foreign_keys=[
                {
                    "constrained_columns": ["customer_id"],
                    "referred_table": "customers",
                    "referred_columns": ["id"],
                }
            ],
        )
        customers = _table("customers", [])
        profile = _make_profile([orders, customers])
        graph = JoinGraph(profile)
        path = graph.find_join_path("orders", "customers")

        assert path is not None
        assert len(path) == 1
        assert path[0]["from_column"] == "customer_id"

    def test_malformed_fk_skipped_gracefully(self):
        """A FK dict missing required fields should be silently skipped."""
        orders = TableProfile(
            name="orders",
            row_count_estimate=-1,
            columns=[],
            indexes=[],
            partitions=[],
            primary_keys=["id"],
            foreign_keys=[
                {},  # completely empty — should not crash
                {"columns": [], "referred_table": "", "referred_columns": []},  # empty cols
            ],
        )
        profile = _make_profile([orders])
        # Should not raise
        graph = JoinGraph(profile)
        assert "orders" in graph.all_tables()
