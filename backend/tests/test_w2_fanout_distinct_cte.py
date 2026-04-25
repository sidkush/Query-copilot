"""W2 Task 4 — DISTINCT CTE multi-column-join fan-out detector.

Covers fold checklist (T4-01..15). Tests are intentionally written
BEFORE the rule is extended; they encode the contract.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
import sqlglot

from scope_validator import (
    Violation,
    RuleId,
    ValidatorResult,
    ScopeValidator,
    _rule_fanout_inflation,
)


def _parse(sql, dialect="bigquery"):
    return sqlglot.parse_one(sql, read=dialect)


# ── Baseline (plan §1156-1204) ───────────────────────────────────────


def test_distinct_cte_with_two_col_join_is_flagged():
    sql = """
        WITH churned AS (
            SELECT DISTINCT start_station_id, start_station_name
            FROM trips GROUP BY start_station_id, start_station_name
            HAVING DATE_DIFF(CURRENT_DATE(), MAX(DATE(started_at)), DAY) > 30
        )
        SELECT t.*
        FROM trips t
        INNER JOIN churned c
          ON t.start_station_id = c.start_station_id
         AND t.start_station_name = c.start_station_name
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None
    assert "QUALIFY" in v.message or "DISTINCT" in v.message


def test_distinct_cte_with_single_col_join_is_clean():
    sql = """
        WITH churned AS (
            SELECT DISTINCT start_station_id FROM trips GROUP BY start_station_id
        )
        SELECT t.*
        FROM trips t
        INNER JOIN churned c ON t.start_station_id = c.start_station_id
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is None


def test_legacy_count_star_join_still_flagged():
    sql = "SELECT COUNT(*) FROM a INNER JOIN b ON a.id = b.aid"
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None
    assert "COUNT(*)" in v.message


def test_no_join_no_distinct_clean():
    sql = "SELECT id FROM trips WHERE casual = 'y' LIMIT 10"
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is None


# ── AMEND-W2-T4-10 — DISTINCT-only (no GROUP BY) ─────────────────────


def test_distinct_only_no_group_by_two_col_join_flagged():
    """DISTINCT alone (without GROUP BY) must trigger the rule.

    Baseline test redundantly uses both DISTINCT and GROUP BY; this test
    proves the DISTINCT branch fires by itself.
    """
    sql = """
        WITH dups AS (
            SELECT DISTINCT user_id, region_id FROM events
        )
        SELECT t.*
        FROM events t
        INNER JOIN dups d
          ON t.user_id = d.user_id AND t.region_id = d.region_id
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None


# ── AMEND-W2-T4-01 — alias rename in outer subquery ──────────────────


def test_distinct_cte_alias_rename_in_outer_subquery_warns_or_fires():
    """Outer subquery may alias-rename the CTE columns; rule should
    still detect the multi-column join (or at minimum emit
    `fanout_inflation_unverified_warning` telemetry — known limitation
    but never silent miss).
    """
    sql = """
        WITH churned AS (
            SELECT DISTINCT start_station_id AS sid, start_station_name AS sname
            FROM trips
        )
        SELECT t.*
        FROM trips t
        INNER JOIN churned c
          ON t.start_station_id = c.sid
         AND t.start_station_name = c.sname
    """
    ast = _parse(sql)
    events: list = []

    def _capture(**event):
        events.append(event)

    with patch("scope_validator._emit_telemetry", side_effect=_capture):
        v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")

    fired = v is not None
    warned = any(
        e.get("event") == "fanout_inflation_unverified_warning" for e in events
    )
    assert fired or warned, "rule must fire OR emit unverified-warning telemetry"


# ── AMEND-W2-T4-04 — JOIN ... USING walker ───────────────────────────


def test_join_using_two_distinct_ctes_flagged():
    """JOIN ... USING(col_a, col_b) with both CTEs DISTINCT on those
    cols. sqlglot leaves col.table == "" on USING columns; the rule
    must read `join.args.get("using")` directly.
    """
    sql = """
        WITH a AS (SELECT DISTINCT k1, k2 FROM x),
             b AS (SELECT DISTINCT k1, k2 FROM y)
        SELECT *
        FROM a INNER JOIN b USING (k1, k2)
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None


# ── AMEND-W2-T4-05 — GROUP BY equivalent dedup ───────────────────────


def test_group_by_cte_outer_join_fans_out():
    """A CTE with GROUP BY (no DISTINCT) on >=2 cols, joined on those
    same cols, is functionally equivalent to a DISTINCT CTE multi-col
    join and must trigger.
    """
    sql = """
        WITH summary AS (
            SELECT user_id, region_id, COUNT(*) AS n
            FROM events GROUP BY user_id, region_id
        )
        SELECT e.*
        FROM events e
        INNER JOIN summary s
          ON e.user_id = s.user_id AND e.region_id = s.region_id
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None


# ── AMEND-W2-T4-06 — tenant invariant: never read coverage_cards ─────


def test_rule_fanout_inflation_does_not_read_coverage_cards():
    """Rule 2 must NOT consume ctx['coverage_cards']. Inject sentinel
    that would raise if dereferenced; rule output must be unchanged
    versus empty ctx.
    """

    class _Boom:
        def __getattr__(self, _):
            raise AssertionError("rule must not read coverage_cards")

        def __iter__(self):
            raise AssertionError("rule must not iterate coverage_cards")

    sql = "SELECT COUNT(*) FROM a INNER JOIN b ON a.id = b.aid"
    ast = _parse(sql)
    v_clean = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    v_sentinel = _rule_fanout_inflation(
        ast, sql, ctx={"coverage_cards": _Boom()}, dialect="bigquery"
    )
    assert (v_clean is None) == (v_sentinel is None)


# ── AMEND-W2-T4-11 — fail-open through validate() on raise ──────────


def test_fanout_rule_through_validate_fail_open_on_raise():
    """Monkey-patch the rule to raise; ScopeValidator.validate must
    NOT propagate, must emit `scope_validator_rule_failed` telemetry,
    and must return ValidatorResult with parse_failed=False (no rule
    can poison the whole result).
    """
    sql = "SELECT 1"
    events: list = []

    def _capture(**event):
        events.append(event)

    def _raising_rule(ast, sql, ctx, dialect):
        raise RuntimeError("forced failure")

    _raising_rule._flag_name = "RULE_FANOUT_INFLATION"

    import scope_validator as sv

    original_rules = list(sv._RULES)
    new_rules = [
        r if getattr(r, "__name__", "") != "_rule_fanout_inflation" else _raising_rule
        for r in original_rules
    ]
    try:
        sv._RULES.clear()
        sv._RULES.extend(new_rules)
        with patch.object(sv, "_emit_telemetry", side_effect=_capture):
            validator = sv.ScopeValidator(dialect="sqlite")
            result = validator.validate(sql=sql, ctx={})
    finally:
        sv._RULES.clear()
        sv._RULES.extend(original_rules)

    assert isinstance(result, ValidatorResult)
    assert result.parse_failed is False
    assert any(e.get("event") == "scope_validator_rule_failed" for e in events)


# ── AMEND-W2-T4-03 — dialect-branched dedup suggestion ──────────────


@pytest.mark.parametrize(
    "dialect, expected_substr",
    [
        ("bigquery", "QUALIFY"),
        ("snowflake", "QUALIFY"),
        ("databricks", "QUALIFY"),
        ("duckdb", "QUALIFY"),
        ("clickhouse", "QUALIFY"),
        ("postgres", "DISTINCT ON"),
        ("mysql", "ROW_NUMBER"),
        ("mariadb", "ROW_NUMBER"),
        ("sqlite", "ROW_NUMBER"),
        ("mssql", "ROW_NUMBER"),
        ("oracle", "ROW_NUMBER"),
    ],
)
def test_dedup_suggestion_for_dialect(dialect, expected_substr):
    """Helper must return dialect-appropriate dedup syntax."""
    from scope_validator import _dedup_suggestion_for_dialect

    suggestion = _dedup_suggestion_for_dialect(dialect, pk_hint="user_id")
    assert expected_substr in suggestion


def test_dedup_suggestion_injected_into_violation_message():
    """When the DISTINCT-CTE branch fires, the Violation message must
    include the dialect-appropriate dedup suggestion.
    """
    sql = """
        WITH churned AS (
            SELECT DISTINCT user_id, region_id FROM events
        )
        SELECT t.*
        FROM events t
        INNER JOIN churned c
          ON t.user_id = c.user_id AND t.region_id = c.region_id
    """
    # bigquery → QUALIFY
    ast = _parse(sql, dialect="bigquery")
    v_bq = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v_bq is not None and "QUALIFY" in v_bq.message

    # mysql → ROW_NUMBER subquery wrapper
    ast2 = _parse(sql, dialect="mysql")
    v_my = _rule_fanout_inflation(ast2, sql, ctx={}, dialect="mysql")
    assert v_my is not None and "ROW_NUMBER" in v_my.message

    # postgres → DISTINCT ON
    ast3 = _parse(sql, dialect="postgres")
    v_pg = _rule_fanout_inflation(ast3, sql, ctx={}, dialect="postgres")
    assert v_pg is not None and "DISTINCT ON" in v_pg.message


# ── AMEND-W2-T4-02 — replan budget exhaustion does not silently exec ─


def test_fanout_replan_budget_exhausted_does_not_execute():
    """ReplanController.on_violation returns None on budget exhaustion.
    _handle_scope_violations_with_replan MUST distinguish that from
    'no violation' and signal the caller to NOT execute the bad SQL.

    Contract: when budget exhausted + violations present, the handler
    must return a sentinel dict with `tier="unverified"` (or similar
    block flag) instead of bare None.
    """
    from agent_engine import AgentEngine
    from replan_budget import ReplanBudget

    sql = """
        WITH dups AS (SELECT DISTINCT user_id, region_id FROM events)
        SELECT e.* FROM events e
        INNER JOIN dups d
          ON e.user_id = d.user_id AND e.region_id = d.region_id
    """

    e = AgentEngine.__new__(AgentEngine)

    class _Conn:
        db_type = "bigquery"
        coverage_cards = []

    e.connection_entry = _Conn()
    e._replan_budget = ReplanBudget(max_replans=1)
    from replan_controller import ReplanController

    e._replan_controller = ReplanController(budget=e._replan_budget)

    # Burn the budget.
    e._replan_budget.consume("fanout_inflation")

    result = e._handle_scope_violations_with_replan(sql, "join events")
    # Caller must be able to tell "budget exhausted" from "no violation".
    # Acceptable sentinels: dict with tier == "unverified", or raises a
    # known exception, or returns dict with explicit
    # `budget_exhausted=True` key. Bare None is the bug.
    assert result is not None, (
        "budget-exhausted path must NOT return bare None — caller cannot "
        "distinguish from 'no violation' and would silently execute."
    )
    assert isinstance(result, dict)
    assert result.get("budget_exhausted") is True or result.get("tier") == "unverified"


# ── AMEND-W2-T4-08 — recursive CTE (Union) skipped, telemetry only ───


def test_recursive_cte_is_skipped_with_telemetry():
    """Recursive CTE: cte.this is exp.Union. Rule must skip it and
    emit `fanout_inflation_skip_recursive_cte` rather than crash or
    falsely flag.
    """
    sql = """
        WITH RECURSIVE chain AS (
            SELECT id, parent_id FROM tree WHERE parent_id IS NULL
            UNION ALL
            SELECT t.id, t.parent_id FROM tree t INNER JOIN chain c ON t.parent_id = c.id
        )
        SELECT * FROM tree t INNER JOIN chain c ON t.id = c.id AND t.parent_id = c.parent_id
    """
    ast = _parse(sql, dialect="postgres")
    events: list = []

    def _capture(**event):
        events.append(event)

    with patch("scope_validator._emit_telemetry", side_effect=_capture):
        # Must not raise; recursive CTE silently skipped (no false flag from inside it).
        try:
            _rule_fanout_inflation(ast, sql, ctx={}, dialect="postgres")
        except Exception as exc:
            pytest.fail(f"recursive CTE must not crash rule: {exc}")

    assert any(
        e.get("event") == "fanout_inflation_skip_recursive_cte" for e in events
    )


# ── AMEND-W2-T4-14 — telemetry on every fire path ────────────────────


def test_fire_path_telemetry_emitted():
    """Each fire path must emit fanout_inflation_fired with branch
    discriminator for the residual-risk dashboard.
    """
    sql = """
        WITH dups AS (SELECT DISTINCT a, b FROM x)
        SELECT t.* FROM x t INNER JOIN dups d ON t.a = d.a AND t.b = d.b
    """
    ast = _parse(sql)
    events: list = []

    def _capture(**event):
        events.append(event)

    with patch("scope_validator._emit_telemetry", side_effect=_capture):
        v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")

    assert v is not None
    fired = [e for e in events if e.get("event") == "fanout_inflation_fired"]
    assert fired, "fire path must emit fanout_inflation_fired telemetry"
    assert fired[0].get("branch") in {
        "legacy_count_star",
        "distinct_cte_multi_col",
        "using_multi_col",
        "group_by_cte",
    }


# ── AMEND-W2-T4-13 — anonymous-CTE skip ──────────────────────────────


def test_anonymous_cte_skipped_no_collision():
    """If a CTE has no alias (alias_or_name == ""), skip it to avoid
    poisoning the distinct_cte_cols dict with empty-string key.
    """
    # sqlglot won't parse a CTE without alias — simulate via crafted SQL
    # with one named + an inline-aliased subquery to verify the named
    # path still works without dict collision.
    sql = """
        WITH named AS (SELECT DISTINCT a, b FROM x)
        SELECT t.* FROM x t INNER JOIN named n ON t.a = n.a AND t.b = n.b
    """
    ast = _parse(sql)
    v = _rule_fanout_inflation(ast, sql, ctx={}, dialect="bigquery")
    assert v is not None  # named CTE still works, no collision crash
