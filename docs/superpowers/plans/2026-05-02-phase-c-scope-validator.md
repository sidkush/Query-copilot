# Grounding Stack v6 — Phase C (Ring 3: ScopeValidator + H6/H9/H18) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Ring 3 server-side pre-exec validator — 10 deterministic `sqlglot`-AST rules that fire between SQL generation and execution, catch name-vs-data mismatches the LLM wrote despite Ring 2, and trigger at most one re-plan turn. Enforced uniformly at every waterfall tier (H18 tier universality). Fail-open on parser exceptions (H6). State-machine tracked (H9).

**Architecture:** One new module `backend/scope_validator.py` exposes `ScopeValidator.validate(sql, ctx) -> ValidatorResult`. Each rule is a pure function with signature `(ast, ctx) -> Optional[Violation]`. The validator reads `DataCoverageCard` (Phase B) + `ConnectionEntry.db_type` + user's original NL. A replan-budget tracker (H6) caps re-plans per query at 1. The validator is called from `agent_engine._tool_run_sql` before execution and from every waterfall tier (`Schema/Memory/Turbo/Live`) for H18.

**Tech Stack:** Python 3.10+, sqlglot (already pinned for SQL validator), Phase B `data_coverage.DataCoverageCard`, existing `SQLValidator` (6-layer), Phase A `trap_grader.py` extended with 3 new oracle types.

**Scope — Phase C covers vs defers:**
- ✅ Ring 3 validator with 10 rules (range-mismatch, fan-out, LIMIT-order, TZ-naive, soft-delete, negation-join, dialect-fallthrough, view-walker, conjunction-selectivity, expression-predicate)
- ✅ `ValidatorResult` + `Violation` dataclasses; structured warnings
- ✅ Fail-open on sqlglot parse exception (H6)
- ✅ Replan budget tracker — max 1 replan per query (H6)
- ✅ Feature-flag compatibility matrix — each rule independently toggleable (H6)
- ✅ State machine for validator lifecycle — `pending → running → passed | violated | failed` (H9)
- ✅ Integration into `agent_engine._tool_run_sql` (pre-execution hook)
- ✅ Tier universality — called from all 4 waterfall tiers (H18)
- ✅ 2 new trap suites: `trap_name_inference` (15 Qs) + `trap_join_scale` (15 Qs)
- ✅ 3 new trap grader oracle types: `must_trigger_validator_rule`, `must_accept_sql`, `must_request_replan`
- ✅ CI gate on both new trap suites
- ⛔ **Deferred:** IntentEcho UI (Phase D), locale parser (Phase D), famous-dataset detector (Phase D), ChromaDB seed pin + stable sort (Phase E, H9 extension), ProvenanceChip (Phase E), Sonnet-parity CI (Phase G).

---

## Prerequisites

- [ ] Branch `askdb-global-comp` at or after Phase B exit gate commit `dac0040`.
- [ ] `python -m pytest backend/tests/ -v` green (≥1500 pass, 1 skip).
- [ ] `backend/data_coverage.py` present and exports `DataCoverageCard`, `DateCoverage`, `CategoricalCoverage`.
- [ ] `backend/agent_engine.py` has `_build_data_coverage_block` method (from Phase B).
- [ ] `backend/tests/trap_grader.py` has `_HANDLERS` dict with the 3-arg signature pattern.
- [ ] Fixture DB present: `python -m backend.tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite`.
- [ ] Read `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` — Ring 3 section + H6 + H9 + H18 specs.

---

## File Structure

| Path | Create/Edit | Purpose |
|---|---|---|
| `backend/scope_validator.py` | Create | `ScopeValidator` class + 10 rule functions + `ValidatorResult` + `Violation` dataclasses + fail-open wrapper |
| `backend/replan_budget.py` | Create | Per-query replan-budget tracker (H6); 1-turn cap |
| `backend/validator_state.py` | Create | Validator-lifecycle state machine (H9) |
| `backend/tests/test_scope_validator_contracts.py` | Create | Dataclass contracts + `validate()` top-level behaviour |
| `backend/tests/test_scope_validator_rule_range.py` | Create | Rule 1: range mismatch |
| `backend/tests/test_scope_validator_rule_fanout.py` | Create | Rule 2: fan-out inflation |
| `backend/tests/test_scope_validator_rule_limit_order.py` | Create | Rule 3: LIMIT-before-ORDER |
| `backend/tests/test_scope_validator_rule_tz_naive.py` | Create | Rule 4: timezone-naive |
| `backend/tests/test_scope_validator_rule_soft_delete.py` | Create | Rule 5: soft-delete missing |
| `backend/tests/test_scope_validator_rule_negation_join.py` | Create | Rule 6: negation-as-JOIN |
| `backend/tests/test_scope_validator_rule_dialect.py` | Create | Rule 7: dialect fallthrough |
| `backend/tests/test_scope_validator_rule_view_walker.py` | Create | Rule 8: view walker |
| `backend/tests/test_scope_validator_rule_selectivity.py` | Create | Rule 9: conjunction selectivity |
| `backend/tests/test_scope_validator_rule_expr_pred.py` | Create | Rule 10: expression-predicate |
| `backend/tests/test_replan_budget.py` | Create | Budget + reset + cap |
| `backend/tests/test_validator_state.py` | Create | State machine transitions |
| `backend/tests/test_scope_validator_integration.py` | Create | End-to-end via `_tool_run_sql` + waterfall tier universality |
| `backend/tests/trap_name_inference.jsonl` | Create | 15 Qs: agent mis-trusts identifier names |
| `backend/tests/trap_join_scale.jsonl` | Create | 15 Qs: fan-out / selectivity traps |
| `.data/name_inference_baseline.json` | Create (committed, H13) | Baseline for `trap_name_inference` |
| `.data/join_scale_baseline.json` | Create (committed, H13) | Baseline for `trap_join_scale` |
| `backend/tests/trap_grader.py` | Modify | Add 3 new oracle types |
| `backend/tests/test_trap_grader_ring3.py` | Create | Unit tests for new oracles |
| `backend/config.py` | Modify | 13 new flags (10 per-rule + 3 validator-wide) |
| `backend/agent_engine.py` | Modify | Invoke `ScopeValidator.validate()` inside `_tool_run_sql` before execution |
| `backend/waterfall_router.py` | Modify | Invoke validator at every tier (H18 universality) |
| `.github/workflows/agent-traps.yml` | Modify | Gate both new trap suites |
| `docs/claude/config-defaults.md` | Modify | Record new constants under "Scope Validator (Phase C — Ring 3)" |

---

## Track C — Ring 3 ScopeValidator

### Task 0: Config flags + feature gates

**Files:**
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`

- [ ] **Step 1: Add config fields**

Open `backend/config.py`. Find the "Data Coverage (Phase B — Ring 1)" block (where `FEATURE_DATA_COVERAGE` is defined). Add immediately below it:

```python
    # ── Scope Validator (Phase C — Ring 3) ──
    FEATURE_SCOPE_VALIDATOR: bool = Field(default=True)
    SCOPE_VALIDATOR_FAIL_OPEN: bool = Field(default=True)     # H6 — never block on parse exception
    SCOPE_VALIDATOR_REPLAN_BUDGET: int = Field(default=1)     # H6 — 1 re-plan per query
    # Per-rule feature flags (H6 compat matrix)
    RULE_RANGE_MISMATCH: bool = Field(default=True)
    RULE_FANOUT_INFLATION: bool = Field(default=True)
    RULE_LIMIT_BEFORE_ORDER: bool = Field(default=True)
    RULE_TIMEZONE_NAIVE: bool = Field(default=True)
    RULE_SOFT_DELETE_MISSING: bool = Field(default=True)
    RULE_NEGATION_AS_JOIN: bool = Field(default=True)
    RULE_DIALECT_FALLTHROUGH: bool = Field(default=True)
    RULE_VIEW_WALKER: bool = Field(default=True)
    RULE_CONJUNCTION_SELECTIVITY: bool = Field(default=False)  # requires EXPLAIN; default off until Phase E
    RULE_EXPRESSION_PREDICATE: bool = Field(default=True)
```

- [ ] **Step 2: Update config-defaults.md**

Open `docs/claude/config-defaults.md`. Find "### Data Coverage (Phase B — Ring 1)" section. Add new section immediately below it:

```markdown
### Scope Validator (Phase C — Ring 3)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_SCOPE_VALIDATOR` | `True` | Master switch for Ring 3. Off → validator silent. |
| `SCOPE_VALIDATOR_FAIL_OPEN` | `True` | H6 — sqlglot parse exception logs warning, never blocks. |
| `SCOPE_VALIDATOR_REPLAN_BUDGET` | `1` | H6 — maximum re-plan turns per query on violation. |
| `RULE_RANGE_MISMATCH` | `True` | Rule 1 — WHERE narrows outside DataCoverageCard min/max. |
| `RULE_FANOUT_INFLATION` | `True` | Rule 2 — JOIN + COUNT(*) without DISTINCT. |
| `RULE_LIMIT_BEFORE_ORDER` | `True` | Rule 3 — LIMIT in subquery + ORDER BY outer. |
| `RULE_TIMEZONE_NAIVE` | `True` | Rule 4 — DATE on TIMESTAMP_TZ without AT TIME ZONE. |
| `RULE_SOFT_DELETE_MISSING` | `True` | Rule 5 — historical window + `deleted_at` col + no tombstone predicate. |
| `RULE_NEGATION_AS_JOIN` | `True` | Rule 6 — NL contains "never/no/without" + SQL is INNER JOIN. |
| `RULE_DIALECT_FALLTHROUGH` | `True` | Rule 7 — sqlglot transpile failure against connection db_type. |
| `RULE_VIEW_WALKER` | `True` | Rule 8 — recursive view resolution; card check at base. |
| `RULE_CONJUNCTION_SELECTIVITY` | `False` | Rule 9 — EXPLAIN-backed estimate; off until Phase E. |
| `RULE_EXPRESSION_PREDICATE` | `True` | Rule 10 — non-literal WHERE → mark unverified-scope. |
```

- [ ] **Step 3: Sanity check**

Run: `cd "QueryCopilot V1/backend" && python -c "from config import settings; print(settings.FEATURE_SCOPE_VALIDATOR, settings.RULE_VIEW_WALKER)"`
Expected: `True True`

- [ ] **Step 4: Commit**

```bash
git add backend/config.py docs/claude/config-defaults.md
git commit -m "feat(phase-c): config flags + feature gates for ScopeValidator"
```

---

### Task 1: ValidatorResult + Violation dataclasses + skeleton

**Files:**
- Create: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_contracts.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_contracts.py`:

```python
"""ScopeValidator top-level contracts."""
from scope_validator import (
    ScopeValidator, ValidatorResult, Violation, RuleId,
)


def test_validator_result_empty_on_valid_sql():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT 1", ctx={})
    assert isinstance(r, ValidatorResult)
    assert r.violations == []
    assert r.passed is True
    assert r.replan_requested is False


def test_validator_fails_open_on_malformed_sql():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql="SELECT ))) FROM (((", ctx={})
    assert r.passed is True     # fail-open
    assert r.parse_failed is True
    assert r.violations == []


def test_violation_has_rule_id_and_message():
    vio = Violation(
        rule_id=RuleId.RANGE_MISMATCH,
        message="WHERE started_at < '2023-01-01' outside card range",
        severity="warn",
    )
    assert vio.rule_id is RuleId.RANGE_MISMATCH
    assert "started_at" in vio.message


def test_rule_id_enum_has_ten_members():
    assert len(list(RuleId)) == 10
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_contracts.py -v`
Expected: FAIL — `ModuleNotFoundError: scope_validator`

- [ ] **Step 3: Implement skeleton**

Create `backend/scope_validator.py`:

```python
"""Ring 3 — ScopeValidator.

Pre-execution deterministic check between SQL generation and execution.
Catches name-vs-data mismatches the LLM wrote despite Ring 2 (prior invariant).
Fails open on sqlglot parse exception (H6). Each rule independently toggleable.

Ten rules:
  1. Range mismatch          — WHERE narrows outside card min/max
  2. Fan-out inflation       — multi-table JOIN + COUNT(*) without DISTINCT
  3. LIMIT-before-ORDER      — LIMIT in subquery + ORDER BY outer
  4. Timezone-naive          — DATE/DATE_TRUNC on TIMESTAMP_TZ without AT TIME ZONE
  5. Soft-delete missing     — historical window + deleted_at col + no tombstone
  6. Negation-as-JOIN        — NL has "never/no/without" AND SQL is INNER JOIN
  7. Dialect fallthrough     — sqlglot transpile failure vs connection.db_type
  8. View walker             — recursive view resolution; card check at base
  9. Conjunction selectivity — EXPLAIN row estimate < 0.1% of card rows
 10. Expression-predicate    — non-literal WHERE → mark unverified-scope

Action on fire: structured warning → one re-plan turn (replan budget).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class RuleId(Enum):
    RANGE_MISMATCH = "range_mismatch"
    FANOUT_INFLATION = "fanout_inflation"
    LIMIT_BEFORE_ORDER = "limit_before_order"
    TIMEZONE_NAIVE = "timezone_naive"
    SOFT_DELETE_MISSING = "soft_delete_missing"
    NEGATION_AS_JOIN = "negation_as_join"
    DIALECT_FALLTHROUGH = "dialect_fallthrough"
    VIEW_WALKER = "view_walker"
    CONJUNCTION_SELECTIVITY = "conjunction_selectivity"
    EXPRESSION_PREDICATE = "expression_predicate"


@dataclass(frozen=True)
class Violation:
    rule_id: RuleId
    message: str
    severity: str = "warn"       # "warn" or "block"
    evidence: dict = field(default_factory=dict)


@dataclass
class ValidatorResult:
    violations: list
    parse_failed: bool = False
    replan_requested: bool = False

    @property
    def passed(self) -> bool:
        # Fail-open: parse failure never blocks.
        return self.parse_failed or not any(v.severity == "block" for v in self.violations)


class ScopeValidator:
    def __init__(self, dialect: str = "sqlite"):
        self.dialect = dialect.lower()

    def validate(self, sql: str, ctx: dict) -> ValidatorResult:
        """Run all enabled rules over `sql` against `ctx`.

        ctx keys (all optional):
          - coverage_cards: list[DataCoverageCard]
          - nl_question:    str
          - db_type:         str   (dialect hint)
          - connector:      object (for EXPLAIN — rule 9 only)
          - schema_profile: SchemaProfile (for soft-delete detection — rule 5)
        """
        try:
            import sqlglot
            ast = sqlglot.parse_one(sql, dialect=self.dialect)
        except Exception:
            return ValidatorResult(violations=[], parse_failed=True)

        violations: list = []
        for rule_fn in _enabled_rules():
            try:
                vio = rule_fn(ast, sql, ctx, self.dialect)
                if vio is not None:
                    violations.append(vio)
            except Exception:
                # Rule-level crash = treat as no-fire. Ring 7 trap suite
                # catches silent regressions; we never block user queries.
                continue

        return ValidatorResult(violations=violations)


# ── Rule registry ─────────────────────────────────────────────────────
# Each rule function: (ast, sql, ctx, dialect) -> Optional[Violation]

_RULES: list = []


def _register(flag_name: str):
    """Decorator: register a rule, gated by settings flag."""
    def wrap(fn):
        fn._flag_name = flag_name
        _RULES.append(fn)
        return fn
    return wrap


def _enabled_rules() -> list:
    """Return only rules whose feature flag is ON."""
    try:
        from config import settings
    except Exception:
        return _RULES
    return [fn for fn in _RULES if getattr(settings, fn._flag_name, True)]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_contracts.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_contracts.py
git commit -m "feat(phase-c): ScopeValidator skeleton + ValidatorResult + RuleId enum"
```

---

### Task 2: Rule 1 — Range mismatch

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_range.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_range.py`:

```python
"""Rule 1 — Range mismatch: WHERE narrows outside card min/max."""
from datetime import datetime, timezone

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import ScopeValidator, RuleId


def _card():
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def test_fires_when_where_before_card_min():
    """Agent writes 'WHERE started_at < 2020-01-01' despite card min=2023-12-01."""
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(
        sql="SELECT * FROM january_trips WHERE started_at < '2020-01-01'",
        ctx={"coverage_cards": [_card()]},
    )
    assert any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)


def test_fires_when_where_after_card_max():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(
        sql="SELECT * FROM january_trips WHERE started_at > '2099-01-01'",
        ctx={"coverage_cards": [_card()]},
    )
    assert any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)


def test_does_not_fire_when_where_within_card_range():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(
        sql="SELECT * FROM january_trips WHERE started_at >= '2024-06-01'",
        ctx={"coverage_cards": [_card()]},
    )
    assert not any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)


def test_does_not_fire_when_no_card_for_table():
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(
        sql="SELECT * FROM unknown_table WHERE started_at < '1900-01-01'",
        ctx={"coverage_cards": [_card()]},
    )
    assert not any(vio.rule_id is RuleId.RANGE_MISMATCH for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_range.py -v`
Expected: FAIL — all 4 pass (no violation fires because no rule registered).

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 1 — Range mismatch ──────────────────────────────────────────


@_register("RULE_RANGE_MISMATCH")
def _rule_range_mismatch(ast, sql: str, ctx: dict, dialect: str):
    """Fire when a WHERE literal lies outside the DataCoverageCard date range
    for that column.
    """
    import sqlglot.expressions as exp

    cards = ctx.get("coverage_cards") or []
    if not cards:
        return None

    # Build {table_name: {col_name: (min_value, max_value)}}
    ranges: dict = {}
    for card in cards:
        col_map: dict = {}
        for dc in card.date_columns:
            if dc.min_value and dc.max_value:
                col_map[dc.column.lower()] = (dc.min_value, dc.max_value)
        if col_map:
            ranges[card.table_name.lower()] = col_map

    if not ranges:
        return None

    # Walk AST. For each WHERE comparison where LHS is a column and RHS is
    # a date literal, check if the literal sits outside the card range.
    for where in ast.find_all(exp.Where):
        for cmp in where.find_all(exp.LT, exp.GT, exp.LTE, exp.GTE, exp.EQ):
            col = cmp.args.get("this")
            lit = cmp.args.get("expression")
            if not isinstance(col, exp.Column) or not isinstance(lit, exp.Literal):
                continue
            col_name = (col.name or "").lower()
            lit_val = lit.this  # raw literal text

            # Locate any card that has a range for this column.
            for tbl_name, col_map in ranges.items():
                if col_name not in col_map:
                    continue
                # Require the query to reference this table.
                if tbl_name not in sql.lower():
                    continue
                mn, mx = col_map[col_name]
                op = cmp.key  # 'lt','gt','lte','gte','eq'
                if op in {"lt", "lte"} and lit_val < mn:
                    return Violation(
                        rule_id=RuleId.RANGE_MISMATCH,
                        message=(
                            f"WHERE {col_name} {cmp.key} {lit_val!r} narrows below "
                            f"observed min {mn!r} in {tbl_name}"
                        ),
                        evidence={"column": col_name, "literal": lit_val, "card_min": mn, "card_max": mx},
                    )
                if op in {"gt", "gte"} and lit_val > mx:
                    return Violation(
                        rule_id=RuleId.RANGE_MISMATCH,
                        message=(
                            f"WHERE {col_name} {cmp.key} {lit_val!r} narrows above "
                            f"observed max {mx!r} in {tbl_name}"
                        ),
                        evidence={"column": col_name, "literal": lit_val, "card_min": mn, "card_max": mx},
                    )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_range.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_range.py
git commit -m "feat(phase-c): Rule 1 range mismatch (card min/max vs WHERE literal)"
```

---

### Task 3: Rule 2 — Fan-out inflation

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_fanout.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_fanout.py`:

```python
"""Rule 2 — Fan-out inflation: multi-table JOIN + COUNT(*) without DISTINCT."""
from scope_validator import ScopeValidator, RuleId


def test_fires_on_join_count_star_without_distinct():
    sql = """
    SELECT COUNT(*) FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    """
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)


def test_does_not_fire_on_count_distinct_pk():
    sql = """
    SELECT COUNT(DISTINCT o.id) FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    """
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)


def test_does_not_fire_on_single_table_count_star():
    sql = "SELECT COUNT(*) FROM orders"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)


def test_does_not_fire_on_three_way_join_with_distinct():
    sql = """
    SELECT COUNT(DISTINCT u.id)
    FROM users u
    JOIN orders o ON o.user_id = u.id
    JOIN order_items oi ON oi.order_id = o.id
    """
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.FANOUT_INFLATION for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_fanout.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 2 — Fan-out inflation ───────────────────────────────────────


@_register("RULE_FANOUT_INFLATION")
def _rule_fanout_inflation(ast, sql: str, ctx: dict, dialect: str):
    """Fire when a multi-table JOIN contains COUNT(*) without DISTINCT."""
    import sqlglot.expressions as exp

    # Detect JOINs.
    joins = list(ast.find_all(exp.Join))
    if not joins:
        return None

    # Detect COUNT(*) aggregates.
    for count in ast.find_all(exp.Count):
        inner = count.args.get("this")
        # COUNT(*) has inner = Star; COUNT(DISTINCT x) has this set with `distinct` flag.
        is_star = isinstance(inner, exp.Star)
        is_distinct = bool(count.args.get("distinct"))
        if is_star and not is_distinct:
            return Violation(
                rule_id=RuleId.FANOUT_INFLATION,
                message=(
                    "COUNT(*) across JOIN may inflate due to one-to-many row "
                    "fan-out; use COUNT(DISTINCT <pk>) to count unique entities."
                ),
                evidence={"join_count": len(joins)},
            )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_fanout.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_fanout.py
git commit -m "feat(phase-c): Rule 2 fan-out inflation (JOIN + COUNT* without DISTINCT)"
```

---

### Task 4: Rule 3 — LIMIT-before-ORDER

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_limit_order.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_limit_order.py`:

```python
"""Rule 3 — LIMIT in subquery + ORDER BY outer."""
from scope_validator import ScopeValidator, RuleId


def test_fires_on_limit_inside_subquery_order_outside():
    sql = """
    SELECT * FROM (SELECT * FROM trips LIMIT 100) t
    ORDER BY t.started_at DESC
    """
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert any(vio.rule_id is RuleId.LIMIT_BEFORE_ORDER for vio in r.violations)


def test_does_not_fire_on_order_then_limit():
    sql = "SELECT * FROM trips ORDER BY started_at DESC LIMIT 100"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.LIMIT_BEFORE_ORDER for vio in r.violations)


def test_does_not_fire_without_outer_order():
    sql = "SELECT * FROM (SELECT * FROM trips LIMIT 100) t"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.LIMIT_BEFORE_ORDER for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_limit_order.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 3 — LIMIT-before-ORDER ──────────────────────────────────────


@_register("RULE_LIMIT_BEFORE_ORDER")
def _rule_limit_before_order(ast, sql: str, ctx: dict, dialect: str):
    """Fire when a subquery has LIMIT but the outer query has ORDER BY."""
    import sqlglot.expressions as exp

    # Outer ORDER BY must be at the top-level Select.
    outer = ast if isinstance(ast, exp.Select) else ast.find(exp.Select)
    if outer is None:
        return None
    outer_order = outer.args.get("order")
    if not outer_order:
        return None

    # Find LIMIT inside any nested Subquery.
    for sub in ast.find_all(exp.Subquery):
        sub_select = sub.find(exp.Select)
        if sub_select is None:
            continue
        if sub_select is outer:
            continue
        if sub_select.args.get("limit"):
            return Violation(
                rule_id=RuleId.LIMIT_BEFORE_ORDER,
                message=(
                    "Subquery LIMIT applied BEFORE outer ORDER BY; outer ordering "
                    "only sorts the already-truncated subset, not the full table."
                ),
            )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_limit_order.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_limit_order.py
git commit -m "feat(phase-c): Rule 3 LIMIT in subquery before ORDER BY outer"
```

---

### Task 5: Rule 4 — Timezone-naive

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_tz_naive.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_tz_naive.py`:

```python
"""Rule 4 — DATE or DATE_TRUNC on TIMESTAMP_TZ without AT TIME ZONE."""
from datetime import datetime, timezone

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import ScopeValidator, RuleId


def _card_with_tz_col():
    return DataCoverageCard(
        table_name="events",
        row_count=100,
        date_columns=[DateCoverage("occurred_at", "2024-01-01T00:00:00Z", "2025-10-28T00:00:00Z", 22, 670)],
        categorical_columns=[],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="postgresql",
    )


def test_fires_on_date_trunc_tz_col_without_at_time_zone():
    sql = "SELECT DATE_TRUNC('day', occurred_at) FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={
        "coverage_cards": [_card_with_tz_col()],
        "tz_aware_columns": {"events": ["occurred_at"]},
    })
    assert any(vio.rule_id is RuleId.TIMEZONE_NAIVE for vio in r.violations)


def test_does_not_fire_with_at_time_zone():
    sql = "SELECT DATE_TRUNC('day', occurred_at AT TIME ZONE 'UTC') FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={
        "tz_aware_columns": {"events": ["occurred_at"]},
    })
    assert not any(vio.rule_id is RuleId.TIMEZONE_NAIVE for vio in r.violations)


def test_does_not_fire_on_non_tz_column():
    sql = "SELECT DATE_TRUNC('day', created_at) FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={
        "tz_aware_columns": {"events": []},
    })
    assert not any(vio.rule_id is RuleId.TIMEZONE_NAIVE for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_tz_naive.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 4 — Timezone-naive ──────────────────────────────────────────


@_register("RULE_TIMEZONE_NAIVE")
def _rule_timezone_naive(ast, sql: str, ctx: dict, dialect: str):
    """Fire when DATE() / DATE_TRUNC() is applied to a TIMESTAMP_TZ column
    without AT TIME ZONE.

    ctx may include `tz_aware_columns: {table: [col, ...]}` listing columns
    known to be TZ-aware from schema profile.
    """
    import sqlglot.expressions as exp

    tz_cols_map = ctx.get("tz_aware_columns") or {}
    all_tz_cols: set = set()
    for cols in tz_cols_map.values():
        for c in cols:
            all_tz_cols.add(c.lower())
    if not all_tz_cols:
        return None

    lc = sql.lower()
    if "at time zone" in lc:
        return None

    for func in ast.find_all(exp.DateTrunc, exp.Date):
        # Find any Column child whose name matches a tz-aware col.
        for col in func.find_all(exp.Column):
            if (col.name or "").lower() in all_tz_cols:
                return Violation(
                    rule_id=RuleId.TIMEZONE_NAIVE,
                    message=(
                        f"{func.key.upper()}() applied to tz-aware column "
                        f"{col.name!r} without AT TIME ZONE — results collapse "
                        f"UTC instants by local-server time, silently shifting "
                        f"day boundaries."
                    ),
                    evidence={"column": col.name, "function": func.key},
                )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_tz_naive.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_tz_naive.py
git commit -m "feat(phase-c): Rule 4 timezone-naive DATE_TRUNC on TIMESTAMP_TZ"
```

---

### Task 6: Rule 5 — Soft-delete missing

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_soft_delete.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_soft_delete.py`:

```python
"""Rule 5 — Historical window + table has `deleted_at` + no tombstone predicate."""
from scope_validator import ScopeValidator, RuleId


def test_fires_when_deleted_at_col_present_but_no_filter():
    sql = "SELECT * FROM users WHERE signup_date > '2024-01-01'"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={
        "soft_delete_columns": {"users": "deleted_at"},
    })
    assert any(vio.rule_id is RuleId.SOFT_DELETE_MISSING for vio in r.violations)


def test_does_not_fire_when_deleted_at_in_where():
    sql = "SELECT * FROM users WHERE signup_date > '2024-01-01' AND deleted_at IS NULL"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={
        "soft_delete_columns": {"users": "deleted_at"},
    })
    assert not any(vio.rule_id is RuleId.SOFT_DELETE_MISSING for vio in r.violations)


def test_does_not_fire_when_no_soft_delete_on_table():
    sql = "SELECT * FROM events"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={
        "soft_delete_columns": {},
    })
    assert not any(vio.rule_id is RuleId.SOFT_DELETE_MISSING for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_soft_delete.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 5 — Soft-delete missing ─────────────────────────────────────


@_register("RULE_SOFT_DELETE_MISSING")
def _rule_soft_delete_missing(ast, sql: str, ctx: dict, dialect: str):
    """Fire when a table with a known soft-delete column (e.g. `deleted_at`)
    is queried without a tombstone predicate.
    """
    import sqlglot.expressions as exp

    sd_map = ctx.get("soft_delete_columns") or {}
    if not sd_map:
        return None
    lc = sql.lower()

    for table_name, sd_col in sd_map.items():
        # Only trigger if this table actually appears in the query.
        if table_name.lower() not in lc:
            continue
        # Check if the soft-delete column appears anywhere in the WHERE clause.
        if sd_col.lower() in lc:
            continue
        return Violation(
            rule_id=RuleId.SOFT_DELETE_MISSING,
            message=(
                f"Table {table_name!r} has soft-delete column {sd_col!r}, "
                f"but no WHERE predicate filters tombstoned rows. "
                f"Add `{sd_col} IS NULL` or `{sd_col} > <date>` as needed."
            ),
            evidence={"table": table_name, "column": sd_col},
        )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_soft_delete.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_soft_delete.py
git commit -m "feat(phase-c): Rule 5 soft-delete missing (deleted_at without tombstone)"
```

---

### Task 7: Rule 6 — Negation-as-JOIN

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_negation_join.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_negation_join.py`:

```python
"""Rule 6 — NL contains 'never/no/without' AND SQL is INNER JOIN."""
from scope_validator import ScopeValidator, RuleId


def test_fires_when_nl_says_never_and_sql_has_inner_join():
    sql = """
    SELECT u.id FROM users u
    INNER JOIN orders o ON o.user_id = u.id
    """
    nl = "show me users who have never placed an order"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"nl_question": nl})
    assert any(vio.rule_id is RuleId.NEGATION_AS_JOIN for vio in r.violations)


def test_does_not_fire_when_sql_uses_left_join_with_is_null():
    sql = """
    SELECT u.id FROM users u
    LEFT JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL
    """
    nl = "users who never placed an order"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"nl_question": nl})
    assert not any(vio.rule_id is RuleId.NEGATION_AS_JOIN for vio in r.violations)


def test_does_not_fire_without_negation_in_nl():
    sql = "SELECT u.id FROM users u INNER JOIN orders o ON o.user_id = u.id"
    nl = "users who placed an order"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"nl_question": nl})
    assert not any(vio.rule_id is RuleId.NEGATION_AS_JOIN for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_negation_join.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 6 — Negation-as-JOIN ────────────────────────────────────────


_NEGATION_TOKENS = ("never", " no ", "without", "haven't", "hasn't", "didn't", "don't have")


@_register("RULE_NEGATION_AS_JOIN")
def _rule_negation_as_join(ast, sql: str, ctx: dict, dialect: str):
    """Fire when the NL question has negation semantics AND the SQL is an
    INNER JOIN (which cannot express anti-join; LEFT JOIN + IS NULL or
    NOT EXISTS is required).
    """
    import sqlglot.expressions as exp

    nl = (ctx.get("nl_question") or "").lower()
    if not any(tok in nl for tok in _NEGATION_TOKENS):
        return None

    # Check SQL for INNER JOIN without LEFT JOIN + IS NULL.
    has_inner = False
    for j in ast.find_all(exp.Join):
        side = (j.side or "").upper()
        kind = (j.kind or "").upper()
        if side == "" and kind in {"", "INNER"}:
            has_inner = True
        elif side == "LEFT":
            # LEFT JOIN present — check for IS NULL in WHERE.
            where = ast.find(exp.Where)
            if where and "is null" in sql.lower():
                return None

    # Also check for NOT EXISTS / NOT IN.
    if "not exists" in sql.lower() or "not in (" in sql.lower():
        return None

    if has_inner:
        return Violation(
            rule_id=RuleId.NEGATION_AS_JOIN,
            message=(
                "NL query contains negation ('never/no/without') but SQL uses "
                "INNER JOIN. Anti-join semantics require LEFT JOIN + IS NULL "
                "or NOT EXISTS."
            ),
            evidence={"nl_tokens_present": [t for t in _NEGATION_TOKENS if t in nl]},
        )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_negation_join.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_negation_join.py
git commit -m "feat(phase-c): Rule 6 negation-as-JOIN (NL 'never' + INNER JOIN)"
```

---

### Task 8: Rule 7 — Dialect fallthrough

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_dialect.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_dialect.py`:

```python
"""Rule 7 — sqlglot transpile failure against connection.db_type."""
from scope_validator import ScopeValidator, RuleId


def test_fires_when_sql_uses_postgres_feature_on_mysql_connection():
    # ILIKE is PostgreSQL; attempts to transpile to MySQL fail.
    sql = "SELECT * FROM users WHERE email ILIKE '%@example.com%'"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"db_type": "mysql"})
    assert any(vio.rule_id is RuleId.DIALECT_FALLTHROUGH for vio in r.violations)


def test_does_not_fire_when_sql_is_portable():
    sql = "SELECT id, name FROM users WHERE id > 100"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={"db_type": "mysql"})
    assert not any(vio.rule_id is RuleId.DIALECT_FALLTHROUGH for vio in r.violations)


def test_does_not_fire_without_db_type_in_ctx():
    sql = "SELECT * FROM users WHERE email ILIKE '%x%'"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.DIALECT_FALLTHROUGH for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_dialect.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 7 — Dialect fallthrough ─────────────────────────────────────


@_register("RULE_DIALECT_FALLTHROUGH")
def _rule_dialect_fallthrough(ast, sql: str, ctx: dict, dialect: str):
    """Fire when sqlglot cannot transpile to the connection's actual db_type."""
    import sqlglot

    target = (ctx.get("db_type") or "").lower()
    if not target or target == dialect:
        return None

    try:
        sqlglot.transpile(sql, read=dialect, write=target)
    except Exception as exc:
        return Violation(
            rule_id=RuleId.DIALECT_FALLTHROUGH,
            message=(
                f"SQL written in {dialect!r} cannot be transpiled to target "
                f"{target!r}: {type(exc).__name__}"
            ),
            evidence={"source_dialect": dialect, "target_dialect": target, "error": str(exc)[:200]},
        )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_dialect.py -v`
Expected: 3 PASS. **Note:** if sqlglot successfully transpiles ILIKE to MySQL LIKE (it may), replace the failing case with one that truly raises — e.g. `SELECT GENERATE_SERIES(1, 10)` on MySQL target. Adjust test accordingly.

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_dialect.py
git commit -m "feat(phase-c): Rule 7 dialect fallthrough (transpile exception)"
```

---

### Task 9: Rule 8 — View walker (H18)

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_view_walker.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_view_walker.py`:

```python
"""Rule 8 — Recursive view resolution; apply card check at base table."""
from datetime import datetime, timezone

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import ScopeValidator, RuleId


def _card():
    return DataCoverageCard(
        table_name="trips",   # base table underneath the view
        row_count=1000,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def test_fires_when_view_query_narrows_outside_base_card_range():
    """View `v_recent_trips` resolves to `trips`. Query asks < 2020 → violates card."""
    sql = "SELECT * FROM v_recent_trips WHERE started_at < '2020-01-01'"
    ctx = {
        "coverage_cards": [_card()],
        "view_definitions": {
            "v_recent_trips": "SELECT * FROM trips WHERE started_at > '2024-01-01'",
        },
    }
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx=ctx)
    assert any(vio.rule_id is RuleId.VIEW_WALKER for vio in r.violations)


def test_does_not_fire_on_direct_base_table_query():
    """No view involved → rule 8 doesn't apply (rule 1 handles base-table case)."""
    sql = "SELECT * FROM trips WHERE started_at < '2020-01-01'"
    v = ScopeValidator(dialect="sqlite")
    r = v.validate(sql=sql, ctx={"coverage_cards": [_card()], "view_definitions": {}})
    assert not any(vio.rule_id is RuleId.VIEW_WALKER for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_view_walker.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 8 — View walker (H18) ──────────────────────────────────────


@_register("RULE_VIEW_WALKER")
def _rule_view_walker(ast, sql: str, ctx: dict, dialect: str):
    """Fire when a SQL that queries a VIEW narrows outside the base-table
    DataCoverageCard range (post recursive resolution).

    ctx keys:
      - view_definitions: {view_name: view_sql}
      - coverage_cards:   [DataCoverageCard] — cards are for BASE tables
    """
    import sqlglot
    import sqlglot.expressions as exp

    views = ctx.get("view_definitions") or {}
    cards = ctx.get("coverage_cards") or []
    if not views or not cards:
        return None

    # Build base-card lookup.
    card_by_table: dict = {c.table_name.lower(): c for c in cards}

    # Identify tables referenced by the outer query.
    referenced: set = set()
    for tbl in ast.find_all(exp.Table):
        if tbl.name:
            referenced.add(tbl.name.lower())

    # For each referenced view, recursively resolve to base tables.
    for ref in referenced:
        if ref not in views:
            continue
        base = _resolve_view_base(ref, views, depth=0, max_depth=5)
        if not base:
            continue
        if base.lower() not in card_by_table:
            continue

        # Run rule 1 semantics on the outer WHERE against the base card.
        card = card_by_table[base.lower()]
        for dc in card.date_columns:
            if not (dc.min_value and dc.max_value):
                continue
            col_lc = dc.column.lower()
            for where in ast.find_all(exp.Where):
                for cmp in where.find_all(exp.LT, exp.GT, exp.LTE, exp.GTE):
                    col = cmp.args.get("this")
                    lit = cmp.args.get("expression")
                    if not isinstance(col, exp.Column) or not isinstance(lit, exp.Literal):
                        continue
                    if (col.name or "").lower() != col_lc:
                        continue
                    lit_val = lit.this
                    op = cmp.key
                    if op in {"lt", "lte"} and lit_val < dc.min_value:
                        return Violation(
                            rule_id=RuleId.VIEW_WALKER,
                            message=(
                                f"View {ref!r} resolves to base {base!r}; WHERE "
                                f"{col_lc} {op} {lit_val!r} outside base card "
                                f"min {dc.min_value!r}."
                            ),
                            evidence={"view": ref, "base": base, "column": col_lc, "literal": lit_val},
                        )
                    if op in {"gt", "gte"} and lit_val > dc.max_value:
                        return Violation(
                            rule_id=RuleId.VIEW_WALKER,
                            message=(
                                f"View {ref!r} resolves to base {base!r}; WHERE "
                                f"{col_lc} {op} {lit_val!r} outside base card "
                                f"max {dc.max_value!r}."
                            ),
                            evidence={"view": ref, "base": base, "column": col_lc, "literal": lit_val},
                        )
    return None


def _resolve_view_base(name: str, views: dict, depth: int, max_depth: int):
    """Recursively walk view definitions to the bottom-most base table."""
    import sqlglot
    import sqlglot.expressions as exp

    if depth >= max_depth:
        return None
    view_sql = views.get(name)
    if not view_sql:
        return name
    try:
        vast = sqlglot.parse_one(view_sql)
    except Exception:
        return None
    for tbl in vast.find_all(exp.Table):
        nm = (tbl.name or "").lower()
        if nm and nm != name.lower():
            if nm in views:
                return _resolve_view_base(nm, views, depth + 1, max_depth)
            return nm
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_view_walker.py -v`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_view_walker.py
git commit -m "feat(phase-c): Rule 8 view walker recursive (H18)"
```

---

### Task 10: Rule 9 — Conjunction selectivity

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_selectivity.py`

**Note:** Rule 9 requires EXPLAIN support and is default OFF (`RULE_CONJUNCTION_SELECTIVITY=False`). Enable only in tests via direct rule invocation.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_selectivity.py`:

```python
"""Rule 9 — EXPLAIN-backed row estimate < 0.1% of card rowcount."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from scope_validator import _rule_conjunction_selectivity, ScopeValidator, RuleId


def _card(rows=10_000_000):
    return DataCoverageCard(
        table_name="trips",
        row_count=rows,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="postgresql",
    )


def test_fires_when_explain_estimate_tiny_vs_card():
    sql = "SELECT * FROM trips WHERE rider_type = 'unicorn' AND started_at = '1900-01-01'"
    connector = MagicMock()
    connector.execute_query.return_value = [(42,)]  # EXPLAIN returns 42 rows
    import sqlglot
    ast = sqlglot.parse_one(sql)
    vio = _rule_conjunction_selectivity(
        ast, sql,
        ctx={"coverage_cards": [_card()], "connector": connector},
        dialect="postgresql",
    )
    assert vio is not None
    assert vio.rule_id is RuleId.CONJUNCTION_SELECTIVITY


def test_does_not_fire_when_estimate_substantial():
    sql = "SELECT * FROM trips WHERE rider_type = 'member'"
    connector = MagicMock()
    connector.execute_query.return_value = [(5_000_000,)]
    import sqlglot
    ast = sqlglot.parse_one(sql)
    vio = _rule_conjunction_selectivity(
        ast, sql,
        ctx={"coverage_cards": [_card()], "connector": connector},
        dialect="postgresql",
    )
    assert vio is None
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_selectivity.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 9 — Conjunction selectivity (H18) ───────────────────────────


@_register("RULE_CONJUNCTION_SELECTIVITY")
def _rule_conjunction_selectivity(ast, sql: str, ctx: dict, dialect: str):
    """Fire when EXPLAIN row estimate < 0.1% of the card's rowcount.

    Requires ctx['connector'] that can execute an EXPLAIN-style query and
    return a numeric row estimate.
    """
    import sqlglot.expressions as exp

    cards = ctx.get("coverage_cards") or []
    connector = ctx.get("connector")
    if not cards or connector is None:
        return None

    tables_in_query: set = set()
    for tbl in ast.find_all(exp.Table):
        if tbl.name:
            tables_in_query.add(tbl.name.lower())

    # Pick the largest card that matches any table in the query.
    candidate_card = None
    for card in cards:
        if card.table_name.lower() in tables_in_query:
            if candidate_card is None or card.row_count > candidate_card.row_count:
                candidate_card = card
    if not candidate_card or candidate_card.row_count <= 0:
        return None

    # Ask EXPLAIN for a row estimate. Caller provides a method that returns
    # list[tuple] where the first scalar is an integer row count.
    try:
        rows = connector.execute_query(f"EXPLAIN SELECT 1 FROM ({sql}) _")
        if not rows:
            return None
        estimate = int(rows[0][0])
    except Exception:
        return None

    threshold = max(int(candidate_card.row_count * 0.001), 1)
    if estimate < threshold:
        return Violation(
            rule_id=RuleId.CONJUNCTION_SELECTIVITY,
            message=(
                f"Estimated {estimate:,} rows is less than 0.1% of the "
                f"{candidate_card.row_count:,}-row base table — likely an "
                f"accidental empty intersection in WHERE clauses."
            ),
            evidence={"estimate": estimate, "threshold": threshold, "base_rows": candidate_card.row_count},
        )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_selectivity.py -v`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_selectivity.py
git commit -m "feat(phase-c): Rule 9 conjunction selectivity (EXPLAIN-backed, H18)"
```

---

### Task 11: Rule 10 — Expression-predicate

**Files:**
- Modify: `backend/scope_validator.py`
- Create: `backend/tests/test_scope_validator_rule_expr_pred.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_scope_validator_rule_expr_pred.py`:

```python
"""Rule 10 — Non-literal WHERE → mark unverified-scope."""
from scope_validator import ScopeValidator, RuleId


def test_fires_on_hash_mod_predicate():
    sql = "SELECT * FROM users WHERE HASH(id) % 1000 = 42"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert any(vio.rule_id is RuleId.EXPRESSION_PREDICATE for vio in r.violations)


def test_does_not_fire_on_simple_literal_predicate():
    sql = "SELECT * FROM users WHERE id = 42"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.EXPRESSION_PREDICATE for vio in r.violations)


def test_does_not_fire_on_simple_in_list():
    sql = "SELECT * FROM users WHERE id IN (1, 2, 3)"
    v = ScopeValidator(dialect="postgresql")
    r = v.validate(sql=sql, ctx={})
    assert not any(vio.rule_id is RuleId.EXPRESSION_PREDICATE for vio in r.violations)
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_expr_pred.py -v`
Expected: FAIL

- [ ] **Step 3: Implement rule**

Append to `backend/scope_validator.py`:

```python

# ── Rule 10 — Expression-predicate (H18) ─────────────────────────────


@_register("RULE_EXPRESSION_PREDICATE")
def _rule_expression_predicate(ast, sql: str, ctx: dict, dialect: str):
    """Fire when WHERE contains a function/operator call as LHS — row-count
    can't be validated against the card. Flag as 'unverified-scope' warning.
    """
    import sqlglot.expressions as exp

    for where in ast.find_all(exp.Where):
        for cmp in where.find_all(exp.LT, exp.GT, exp.LTE, exp.GTE, exp.EQ, exp.NEQ):
            lhs = cmp.args.get("this")
            # If LHS is anything other than a plain Column or Literal, flag it.
            if isinstance(lhs, (exp.Func, exp.Mod, exp.Add, exp.Sub, exp.Mul, exp.Div)):
                return Violation(
                    rule_id=RuleId.EXPRESSION_PREDICATE,
                    message=(
                        "WHERE clause contains a computed expression "
                        f"({type(lhs).__name__}); downstream scope cannot be "
                        f"validated against DataCoverageCard. Result will be "
                        f"marked 'unverified-scope' on the provenance chip."
                    ),
                    evidence={"lhs_type": type(lhs).__name__},
                )
    return None
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_rule_expr_pred.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scope_validator.py backend/tests/test_scope_validator_rule_expr_pred.py
git commit -m "feat(phase-c): Rule 10 expression-predicate (mark unverified-scope, H18)"
```

---

### Task 12: Replan budget tracker (H6)

**Files:**
- Create: `backend/replan_budget.py`
- Create: `backend/tests/test_replan_budget.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_replan_budget.py`:

```python
"""Replan budget — H6 cap of 1 re-plan per query."""
import pytest

from replan_budget import ReplanBudget, BudgetExceeded


def test_fresh_budget_allows_one_replan():
    b = ReplanBudget(max_replans=1)
    assert b.remaining() == 1
    b.consume("rule_fired:range_mismatch")
    assert b.remaining() == 0


def test_second_consume_raises():
    b = ReplanBudget(max_replans=1)
    b.consume("r1")
    with pytest.raises(BudgetExceeded):
        b.consume("r2")


def test_reset_restores_budget():
    b = ReplanBudget(max_replans=1)
    b.consume("x")
    b.reset()
    assert b.remaining() == 1


def test_history_tracks_reasons():
    b = ReplanBudget(max_replans=2)
    b.consume("rule_1")
    b.consume("rule_2")
    assert b.history == ["rule_1", "rule_2"]
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_replan_budget.py -v`
Expected: FAIL — `ModuleNotFoundError: replan_budget`

- [ ] **Step 3: Implement**

Create `backend/replan_budget.py`:

```python
"""Replan budget — H6. Caps how many times a single query can trigger
Ring-3 replan before the validator gives up and returns a warning without
blocking execution.
"""
from __future__ import annotations

from dataclasses import dataclass, field


class BudgetExceeded(RuntimeError):
    """Raised when .consume() is called past the cap."""


@dataclass
class ReplanBudget:
    max_replans: int = 1
    history: list = field(default_factory=list)

    def consume(self, reason: str) -> None:
        if len(self.history) >= self.max_replans:
            raise BudgetExceeded(
                f"Replan budget exhausted ({self.max_replans}); history={self.history}"
            )
        self.history.append(reason)

    def remaining(self) -> int:
        return max(0, self.max_replans - len(self.history))

    def reset(self) -> None:
        self.history = []
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_replan_budget.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/replan_budget.py backend/tests/test_replan_budget.py
git commit -m "feat(phase-c): ReplanBudget tracker (H6 — 1 replan per query cap)"
```

---

### Task 13: Validator state machine (H9)

**Files:**
- Create: `backend/validator_state.py`
- Create: `backend/tests/test_validator_state.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_validator_state.py`:

```python
"""Validator lifecycle state machine (H9)."""
import pytest

from validator_state import ValidatorState, InvalidTransition


def test_initial_state_is_pending():
    s = ValidatorState()
    assert s.state == "pending"


def test_legal_transition_pending_to_running():
    s = ValidatorState()
    s.transition("running")
    assert s.state == "running"


def test_legal_running_to_passed():
    s = ValidatorState()
    s.transition("running")
    s.transition("passed")
    assert s.state == "passed"


def test_legal_running_to_violated():
    s = ValidatorState()
    s.transition("running")
    s.transition("violated")
    assert s.state == "violated"


def test_legal_running_to_failed():
    s = ValidatorState()
    s.transition("running")
    s.transition("failed")
    assert s.state == "failed"


def test_illegal_pending_to_passed_raises():
    s = ValidatorState()
    with pytest.raises(InvalidTransition):
        s.transition("passed")


def test_illegal_passed_to_running_raises():
    s = ValidatorState()
    s.transition("running")
    s.transition("passed")
    with pytest.raises(InvalidTransition):
        s.transition("running")


def test_history_tracks_transitions():
    s = ValidatorState()
    s.transition("running")
    s.transition("passed")
    assert s.history == ["pending", "running", "passed"]
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_validator_state.py -v`
Expected: FAIL — `ModuleNotFoundError: validator_state`

- [ ] **Step 3: Implement**

Create `backend/validator_state.py`:

```python
"""Validator lifecycle state machine — H9.

States:
  pending   → (initial)
  running   → validator is executing rules
  passed    → all enabled rules returned no violations
  violated  → at least one rule returned Violation; replan path taken
  failed    → validator itself crashed (fail-open, but logged)

Legal transitions:
  pending → running
  running → passed | violated | failed
  (terminal states: passed, violated, failed)
"""
from __future__ import annotations

from dataclasses import dataclass, field


class InvalidTransition(RuntimeError):
    pass


_LEGAL_TRANSITIONS = {
    "pending": {"running"},
    "running": {"passed", "violated", "failed"},
    "passed": set(),
    "violated": set(),
    "failed": set(),
}


@dataclass
class ValidatorState:
    state: str = "pending"
    history: list = field(default_factory=lambda: ["pending"])

    def transition(self, new_state: str) -> None:
        allowed = _LEGAL_TRANSITIONS.get(self.state, set())
        if new_state not in allowed:
            raise InvalidTransition(
                f"Cannot move {self.state!r} → {new_state!r}; allowed: {sorted(allowed)}"
            )
        self.state = new_state
        self.history.append(new_state)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_validator_state.py -v`
Expected: 8 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/validator_state.py backend/tests/test_validator_state.py
git commit -m "feat(phase-c): validator lifecycle state machine (H9)"
```

---

### Task 14: Agent-engine integration hook

**Files:**
- Modify: `backend/agent_engine.py`
- Create: `backend/tests/test_scope_validator_integration.py`

- [ ] **Step 1: Inspect `_tool_run_sql`**

Run: `grep -n "_tool_run_sql\|def _tool_run_sql" "QueryCopilot V1/backend/agent_engine.py"`

Identify where SQL is validated and where it's executed. The validator must run BETWEEN them.

- [ ] **Step 2: Write failing integration test**

Create `backend/tests/test_scope_validator_integration.py`:

```python
"""End-to-end: agent-engine invokes ScopeValidator between SQL gen and exec."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

from data_coverage import DataCoverageCard, DateCoverage, CategoricalCoverage
from agent_engine import AgentEngine


def _card():
    return DataCoverageCard(
        table_name="january_trips",
        row_count=500,
        date_columns=[DateCoverage("started_at", "2023-12-01", "2025-10-28", 23, 698)],
        categorical_columns=[CategoricalCoverage("rider_type", 2, ["member", "casual"])],
        computed_at=datetime(2026, 5, 2, tzinfo=timezone.utc),
        dialect="sqlite",
    )


def _engine_with_card():
    engine = AgentEngine.__new__(AgentEngine)
    engine.connection_entry = MagicMock()
    engine.connection_entry.coverage_cards = [_card()]
    engine.connection_entry.db_type = "sqlite"
    engine.engine = None
    engine.email = "u@t"
    engine._persona = None
    engine._skill_library = None
    engine._skill_collection = None
    return engine


def test_validate_before_exec_returns_violations_for_out_of_range_where():
    engine = _engine_with_card()
    result = engine._run_scope_validator(
        sql="SELECT * FROM january_trips WHERE started_at < '1900-01-01'",
        nl_question="show me all trips",
    )
    assert result.violations
    assert any(v.rule_id.value == "range_mismatch" for v in result.violations)


def test_validate_passes_clean_sql():
    engine = _engine_with_card()
    result = engine._run_scope_validator(
        sql="SELECT * FROM january_trips WHERE started_at >= '2024-06-01'",
        nl_question="2024 trips",
    )
    assert result.passed
```

- [ ] **Step 3: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_integration.py -v`
Expected: FAIL — `AgentEngine` has no `_run_scope_validator`

- [ ] **Step 4: Implement in `agent_engine.py`**

Add this method to `AgentEngine` class (place near `_build_data_coverage_block` from Phase B):

```python
    def _run_scope_validator(self, sql: str, nl_question: str = ""):
        """Phase C — Ring 3 pre-exec check.

        Returns ValidatorResult. Fails open on any crash (H6).
        """
        try:
            from config import settings
            if not settings.FEATURE_SCOPE_VALIDATOR:
                from scope_validator import ValidatorResult
                return ValidatorResult(violations=[])
            from scope_validator import ScopeValidator
        except Exception:
            from scope_validator import ValidatorResult
            return ValidatorResult(violations=[])

        try:
            dialect = getattr(self.connection_entry, "db_type", None) or "sqlite"
            if hasattr(dialect, "value"):
                dialect = dialect.value
            validator = ScopeValidator(dialect=str(dialect).lower())
            ctx = {
                "coverage_cards": getattr(self.connection_entry, "coverage_cards", None) or [],
                "nl_question": nl_question,
                "db_type": str(dialect).lower(),
            }
            return validator.validate(sql=sql, ctx=ctx)
        except Exception:
            from scope_validator import ValidatorResult
            return ValidatorResult(violations=[], parse_failed=False)
```

Now wire the call inside `_tool_run_sql`. Find the method, locate the spot AFTER `SQLValidator` passes and BEFORE execution. Insert:

```python
            # Phase C — Ring 3 pre-exec validator.
            nl_q = getattr(self, "_current_nl_question", "") or ""
            scope_result = self._run_scope_validator(sql, nl_question=nl_q)
            if scope_result.violations:
                warnings = [
                    {"rule": v.rule_id.value, "message": v.message}
                    for v in scope_result.violations
                ]
                # Non-blocking: proceed but annotate result. Replan/block
                # logic lives in higher-level orchestration (Phase D).
                self._last_scope_warnings = warnings
```

- [ ] **Step 5: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_integration.py -v`
Expected: 2 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/agent_engine.py backend/tests/test_scope_validator_integration.py
git commit -m "feat(phase-c): invoke ScopeValidator before SQL execution in agent engine"
```

---

### Task 15: Waterfall tier universality (H18)

**Files:**
- Modify: `backend/waterfall_router.py`

- [ ] **Step 1: Inspect waterfall tiers**

Run: `grep -n "class .*Tier\|def try_answer\|def _run_tier" "QueryCopilot V1/backend/waterfall_router.py"`

Identify each tier's entry point. The validator must be called once per tier on the SQL returned by that tier (if any).

- [ ] **Step 2: Write failing integration test**

Append to `backend/tests/test_scope_validator_integration.py`:

```python
def test_waterfall_exposes_scope_validator_hook():
    """Smoke test: the waterfall router module exposes `validate_scope()`."""
    import waterfall_router
    assert hasattr(waterfall_router, "validate_scope")


def test_waterfall_validate_scope_returns_result_for_any_tier():
    from waterfall_router import validate_scope
    result = validate_scope(
        sql="SELECT 1",
        ctx={},
        dialect="sqlite",
    )
    assert result.passed is True
    assert result.violations == []
```

- [ ] **Step 3: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_integration.py -v`
Expected: FAIL — `waterfall_router` has no `validate_scope`

- [ ] **Step 4: Add helper in `waterfall_router.py`**

Near the top of `backend/waterfall_router.py`, add:

```python
def validate_scope(sql: str, ctx: dict, dialect: str = "sqlite"):
    """Tier-universal Ring-3 entry point (H18).

    Called from every tier after SQL is produced. Fail-open on any crash.
    """
    try:
        from config import settings
        if not settings.FEATURE_SCOPE_VALIDATOR:
            from scope_validator import ValidatorResult
            return ValidatorResult(violations=[])
        from scope_validator import ScopeValidator
        return ScopeValidator(dialect=dialect).validate(sql=sql, ctx=ctx)
    except Exception:
        from scope_validator import ValidatorResult
        return ValidatorResult(violations=[], parse_failed=False)
```

Now hook each tier's SQL-producing branch to call `validate_scope()` after the tier resolves SQL. Because tier SQL paths vary, the minimum required edit is: at the end of EACH tier method that returns SQL-bearing results (`_schema_tier_resolve`, `_memory_tier_resolve`, `_turbo_tier_resolve`, `_live_tier_resolve` or whatever names are in use), call:

```python
        # H18 — tier-universal Ring-3 check.
        try:
            _sr = validate_scope(
                sql=_sql_for_validation,
                ctx={
                    "coverage_cards": getattr(self.connection_entry, "coverage_cards", None) or [],
                    "db_type": getattr(self.connection_entry, "db_type", "sqlite"),
                },
                dialect=str(getattr(self.connection_entry, "db_type", "sqlite")).lower(),
            )
            if _sr.violations:
                logger.warning(
                    "Ring-3 violations at tier=%s: %s",
                    self.__class__.__name__,
                    [v.rule_id.value for v in _sr.violations],
                )
        except Exception as exc:
            logger.debug("validate_scope skipped: %s", exc)
```

Adjust `_sql_for_validation` to the local variable each tier actually uses (could be `sql`, `resolved.sql`, etc.). Verify by searching for `return .*[Rr]esolv` patterns in each tier.

- [ ] **Step 5: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_scope_validator_integration.py -v`
Expected: 4 PASS total (2 new + 2 prior)

- [ ] **Step 6: Commit**

```bash
git add backend/waterfall_router.py backend/tests/test_scope_validator_integration.py
git commit -m "feat(phase-c): tier-universal validate_scope() in waterfall (H18)"
```

---

### Task 16: Trap suite — `trap_name_inference.jsonl`

**Files:**
- Create: `backend/tests/trap_name_inference.jsonl`

- [ ] **Step 1: Write 15 trap questions**

Create `backend/tests/trap_name_inference.jsonl` with exactly these 15 lines:

```jsonl
{"id": "name-001", "nl": "how many january_trips are there?", "expected_sql_contains": ["COUNT", "january_trips"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "range_mismatch"}}
{"id": "name-002", "nl": "show all trips regardless of month name", "expected_sql_contains": ["january_trips"], "oracle": {"type": "must_not_claim_limited", "forbidden_phrases": ["only january", "january only"]}}
{"id": "name-003", "nl": "count unique riders across all 23 months", "expected_sql_contains": ["COUNT(DISTINCT", "january_trips"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "name-004", "nl": "total orders joined to users", "expected_sql_contains": ["JOIN", "COUNT(DISTINCT"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "name-005", "nl": "first trip date despite the january_trips name", "expected_sql_contains": ["MIN(started_at)", "january_trips"], "oracle": {"type": "must_not_refuse", "forbidden_phrases": ["only january"]}}
{"id": "name-006", "nl": "trips before year 2000 (expect empty)", "expected_sql_contains": ["january_trips", "2000"], "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"}}
{"id": "name-007", "nl": "give me top 10 riders ordered by trip count", "expected_sql_contains": ["ORDER BY", "LIMIT"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "limit_before_order"}}
{"id": "name-008", "nl": "users who never placed an order", "expected_sql_contains": ["LEFT JOIN", "IS NULL"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "negation_as_join"}}
{"id": "name-009", "nl": "quarterly trip counts", "expected_sql_contains": ["GROUP BY", "january_trips"], "oracle": {"type": "must_query_table", "table": "january_trips"}}
{"id": "name-010", "nl": "does `january_trips` name mean January only?", "expected_sql_contains": [], "oracle": {"type": "must_not_claim_limited", "forbidden_phrases": ["yes", "only january", "january only"]}}
{"id": "name-011", "nl": "count rows in january_trips where started_at is before 1900", "expected_sql_contains": ["1900", "january_trips"], "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"}}
{"id": "name-012", "nl": "count rows in january_trips where started_at is after 2099", "expected_sql_contains": ["2099", "january_trips"], "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"}}
{"id": "name-013", "nl": "monthly distinct months count", "expected_sql_contains": ["COUNT(DISTINCT", "january_trips"], "oracle": {"type": "distinct_months", "table": "january_trips", "column": "started_at", "expected_value": 23, "tolerance": 1}}
{"id": "name-014", "nl": "rider type distribution", "expected_sql_contains": ["rider_type", "GROUP BY"], "oracle": {"type": "must_query_table", "table": "january_trips"}}
{"id": "name-015", "nl": "full date range min max", "expected_sql_contains": ["MIN", "MAX"], "oracle": {"type": "must_mention_full_range", "table": "january_trips", "column": "started_at", "min_before": "2024-01-01", "max_after": "2025-01-01"}}
```

- [ ] **Step 2: Validate JSONL shape**

Run: `cd "QueryCopilot V1/backend" && python -c "import json; [json.loads(l) for l in open('tests/trap_name_inference.jsonl')]; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_name_inference.jsonl
git commit -m "feat(phase-c): trap_name_inference suite (15 identifier-mistrust Qs)"
```

---

### Task 17: Trap suite — `trap_join_scale.jsonl`

**Files:**
- Create: `backend/tests/trap_join_scale.jsonl`

- [ ] **Step 1: Write 15 trap questions**

Create `backend/tests/trap_join_scale.jsonl`:

```jsonl
{"id": "join-001", "nl": "how many distinct customers placed any order?", "expected_sql_contains": ["COUNT(DISTINCT", "customers", "orders"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "join-002", "nl": "total customers with at least one order (wrong way)", "expected_sql_contains": ["COUNT(*)", "JOIN"], "oracle": {"type": "must_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "join-003", "nl": "users with no orders", "expected_sql_contains": ["LEFT JOIN", "IS NULL"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "negation_as_join"}}
{"id": "join-004", "nl": "users who have never logged in", "expected_sql_contains": ["LEFT JOIN", "IS NULL"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "negation_as_join"}}
{"id": "join-005", "nl": "top 5 most recent trips per user", "expected_sql_contains": ["ROW_NUMBER", "ORDER BY"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "limit_before_order"}}
{"id": "join-006", "nl": "first 100 trips by age (wrong way — LIMIT in subquery)", "expected_sql_contains": ["LIMIT 100", "ORDER BY"], "oracle": {"type": "must_trigger_validator_rule", "rule": "limit_before_order"}}
{"id": "join-007", "nl": "total order line items", "expected_sql_contains": ["COUNT(*)", "order_items"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "join-008", "nl": "three-way distinct user count", "expected_sql_contains": ["COUNT(DISTINCT", "JOIN", "JOIN"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "join-009", "nl": "average order total per customer", "expected_sql_contains": ["AVG", "GROUP BY"], "oracle": {"type": "must_query_table", "table": "customers"}}
{"id": "join-010", "nl": "customers who didn't buy in 2025", "expected_sql_contains": ["LEFT JOIN", "IS NULL"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "negation_as_join"}}
{"id": "join-011", "nl": "customers with orders in both 2024 and 2025", "expected_sql_contains": ["INTERSECT", "2024", "2025"], "oracle": {"type": "must_query_table", "table": "customers"}}
{"id": "join-012", "nl": "users active across every quarter", "expected_sql_contains": ["GROUP BY", "HAVING"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "join-013", "nl": "pagination: 10 newest trips", "expected_sql_contains": ["ORDER BY", "LIMIT 10"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "limit_before_order"}}
{"id": "join-014", "nl": "monthly active users", "expected_sql_contains": ["COUNT(DISTINCT", "GROUP BY"], "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"}}
{"id": "join-015", "nl": "revenue by customer with order fan-out check", "expected_sql_contains": ["SUM", "GROUP BY"], "oracle": {"type": "must_query_table", "table": "orders"}}
```

- [ ] **Step 2: Validate JSONL shape**

Run: `cd "QueryCopilot V1/backend" && python -c "import json; [json.loads(l) for l in open('tests/trap_join_scale.jsonl')]; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_join_scale.jsonl
git commit -m "feat(phase-c): trap_join_scale suite (15 JOIN/fan-out/LIMIT Qs)"
```

---

### Task 18: Extend trap grader with Ring-3 oracle types

**Files:**
- Modify: `backend/tests/trap_grader.py`
- Create: `backend/tests/test_trap_grader_ring3.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_trap_grader_ring3.py`:

```python
"""Unit tests for the new Ring-3 oracle types."""
from pathlib import Path

from tests.trap_grader import grade_trap, _resolve_db_path


def _db():
    return _resolve_db_path(Path("/tmp/eval_fixture.sqlite"))


def test_must_trigger_validator_rule_passes_on_matching_rule_fire():
    trap = {
        "id": "r3-t1", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"},
    }
    sql = "-- validator fired: range_mismatch"
    result = grade_trap(trap, sql, _db())
    assert result.passed is True


def test_must_trigger_validator_rule_fails_on_non_matching_rule():
    trap = {
        "id": "r3-t2", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_trigger_validator_rule", "rule": "range_mismatch"},
    }
    sql = "SELECT * FROM trips"   # no validator annotation
    result = grade_trap(trap, sql, _db())
    assert result.passed is False


def test_must_not_trigger_validator_rule_passes_on_clean_sql():
    trap = {
        "id": "r3-t3", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"},
    }
    sql = "SELECT COUNT(DISTINCT u.id) FROM users u JOIN orders o ON o.user_id=u.id"
    result = grade_trap(trap, sql, _db())
    assert result.passed is True


def test_must_not_trigger_validator_rule_fails_when_rule_present():
    trap = {
        "id": "r3-t4", "nl": "",
        "expected_sql_contains": [],
        "oracle": {"type": "must_not_trigger_validator_rule", "rule": "fanout_inflation"},
    }
    sql = "-- validator fired: fanout_inflation\nSELECT COUNT(*) FROM orders o JOIN order_items oi ON oi.order_id=o.id"
    result = grade_trap(trap, sql, _db())
    assert result.passed is False
```

- [ ] **Step 2: Run to verify fail**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_ring3.py -v`
Expected: FAIL — unknown oracle types.

- [ ] **Step 3: Extend grader**

Open `backend/tests/trap_grader.py`. Add two handler functions above `_HANDLERS`:

```python
def _check_must_trigger_validator_rule(
    sql: str, oracle: dict
) -> tuple:
    """Pass when SQL contains a '-- validator fired: <rule>' annotation
    matching the oracle's `rule` field.
    """
    rule = oracle.get("rule", "")
    marker = f"validator fired: {rule}"
    if marker in sql.lower():
        return True, f"validator rule {rule!r} fired as expected"
    return False, f"validator rule {rule!r} expected but not present in SQL"


def _check_must_not_trigger_validator_rule(
    sql: str, oracle: dict
) -> tuple:
    """Pass when SQL does NOT contain a '-- validator fired: <rule>' marker
    for the specified rule.
    """
    rule = oracle.get("rule", "")
    marker = f"validator fired: {rule}"
    if marker in sql.lower():
        return False, f"validator rule {rule!r} fired but was expected clean"
    return True, f"validator rule {rule!r} not triggered (clean)"
```

Extend `_HANDLERS`:

```python
    # Phase C — Ring 3 oracles.
    "must_trigger_validator_rule": lambda sql, ora, _db: _check_must_trigger_validator_rule(sql, ora),
    "must_not_trigger_validator_rule": lambda sql, ora, _db: _check_must_not_trigger_validator_rule(sql, ora),
```

- [ ] **Step 4: Run to verify pass**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/test_trap_grader_ring3.py -v`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/trap_grader.py backend/tests/test_trap_grader_ring3.py
git commit -m "feat(phase-c): trap grader — Ring-3 oracle types (trigger/not-trigger)"
```

---

### Task 19: Generate baselines + regression check

**Files:**
- Create: `.data/name_inference_baseline.json`
- Create: `.data/join_scale_baseline.json`
- Modify: `.gitignore`

- [ ] **Step 1: Seed fixture + write baselines**

Run:

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_name_inference.jsonl ../.data/name_inference_baseline.json --write-baseline
python -m tests.run_traps tests/trap_join_scale.jsonl ../.data/join_scale_baseline.json --write-baseline
```

Expected: both `Wrote baseline: ...` lines.

- [ ] **Step 2: Re-run without --write-baseline**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_name_inference.jsonl ../.data/name_inference_baseline.json
python -m tests.run_traps tests/trap_join_scale.jsonl ../.data/join_scale_baseline.json
```

Expected: both suites report no regressions vs the just-written baseline.

- [ ] **Step 3: Confirm Phase A + Phase B suites still green**

```bash
cd "QueryCopilot V1/backend"
python -m tests.run_traps tests/trap_temporal_scope.jsonl ../.data/eval_baseline.json
python -m tests.run_traps tests/trap_coverage_grounding.jsonl ../.data/coverage_baseline.json
```

Expected: both 10/10.

- [ ] **Step 4: .gitignore negations**

Run: `grep -n "name_inference_baseline\|join_scale_baseline" "QueryCopilot V1/.gitignore" || echo "NOT_IGNORED"`

If `NOT_IGNORED`, append:

```
# Phase C trap baselines — committed per H13
!.data/name_inference_baseline.json
!.data/join_scale_baseline.json
```

- [ ] **Step 5: Commit**

```bash
git add .data/name_inference_baseline.json .data/join_scale_baseline.json .gitignore
git commit -m "feat(phase-c): Ring-3 trap baselines committed (name_inference + join_scale)"
```

---

### Task 20: CI gate — wire both new trap suites

**Files:**
- Modify: `.github/workflows/agent-traps.yml`

- [ ] **Step 1: Inspect workflow**

Run: `grep -n "run_traps" "QueryCopilot V1/.github/workflows/agent-traps.yml"`

Expected: two steps (temporal_scope + coverage_grounding, from Phases A and B).

- [ ] **Step 2: Add two coverage-suite steps to mock-suite job**

Open `.github/workflows/agent-traps.yml`. After the `coverage_grounding` step, append:

```yaml
      - name: Run Ring-3 name-inference trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_name_inference.jsonl \
            .data/name_inference_baseline.json \
            --db /tmp/eval_fixture.sqlite

      - name: Run Ring-3 join-scale trap suite against mock
        run: |
          python -m backend.tests.run_traps \
            backend/tests/trap_join_scale.jsonl \
            .data/join_scale_baseline.json \
            --db /tmp/eval_fixture.sqlite
```

- [ ] **Step 3: Validate YAML**

Run: `cd "QueryCopilot V1" && python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/agent-traps.yml
git commit -m "feat(phase-c): CI gates Ring-3 trap baselines (name_inference + join_scale)"
```

---

### Task 21: Phase C exit gate

- [ ] **Step 1: Full backend test suite**

Run: `cd "QueryCopilot V1/backend" && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: ~1540+ pass (Phase B's 1504 + ~36 Phase C tests), 1 skip.

- [ ] **Step 2: All four trap suites back-to-back**

```bash
cd "QueryCopilot V1/backend"
python -m tests.fixtures.eval_seed %TEMP%\eval_fixture.sqlite
python -m tests.run_traps tests/trap_temporal_scope.jsonl       ../.data/eval_baseline.json
python -m tests.run_traps tests/trap_coverage_grounding.jsonl   ../.data/coverage_baseline.json
python -m tests.run_traps tests/trap_name_inference.jsonl       ../.data/name_inference_baseline.json
python -m tests.run_traps tests/trap_join_scale.jsonl           ../.data/join_scale_baseline.json
```

Expected: all four report no regressions vs baseline.

- [ ] **Step 3: Validate CI workflow + PII scanner**

```bash
cd "QueryCopilot V1"
python -c "import yaml; yaml.safe_load(open('.github/workflows/agent-traps.yml')); yaml.safe_load(open('.github/workflows/pii-scan.yml')); print('CI OK')"
```

- [ ] **Step 4: Import health**

Run:

```bash
cd "QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from scope_validator import (
    ScopeValidator, ValidatorResult, Violation, RuleId,
)
from replan_budget import ReplanBudget, BudgetExceeded
from validator_state import ValidatorState, InvalidTransition
import agent_engine, waterfall_router
assert hasattr(agent_engine.AgentEngine, '_run_scope_validator')
assert hasattr(waterfall_router, 'validate_scope')
assert len(list(RuleId)) == 10
print('Phase C imports OK')
"
```

Expected: `Phase C imports OK`

- [ ] **Step 5: Frontend untouched**

Run: `cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5`
Expected: no new errors.

- [ ] **Step 6: Exit commit**

```bash
git commit --allow-empty -m "chore(phase-c): exit gate — T0-T20 shipped, Ring-3 traps committed, CI wired"
```

---

## Phase C exit criteria

- [ ] `backend/scope_validator.py` exposes: `ScopeValidator`, `ValidatorResult`, `Violation`, `RuleId` (10-member enum), all 10 rule functions.
- [ ] `backend/replan_budget.py` exposes: `ReplanBudget`, `BudgetExceeded`.
- [ ] `backend/validator_state.py` exposes: `ValidatorState`, `InvalidTransition`.
- [ ] `AgentEngine._run_scope_validator()` present and invoked inside `_tool_run_sql`.
- [ ] `waterfall_router.validate_scope()` present and called from every tier.
- [ ] `backend/tests/trap_name_inference.jsonl` (15 Qs) + `trap_join_scale.jsonl` (15 Qs).
- [ ] `.data/name_inference_baseline.json` + `.data/join_scale_baseline.json` committed.
- [ ] All four trap suites (Phase A + B + C×2) pass with no regressions.
- [ ] CI workflow `agent-traps.yml` gates all four suites.
- [ ] Full pytest suite: 1540+ pass, 1 skip.
- [ ] Fail-open behaviour verified: malformed SQL returns `ValidatorResult(passed=True, parse_failed=True)`.

---

## Risk notes & follow-ups

- **Rule 7 dialect fallthrough false negatives** — sqlglot transpile is permissive and may succeed where the target DB would error. Phase E ProvenanceChip will surface a "transpile-unchecked" trust stamp when the transpile produced warnings.
- **Rule 9 selectivity off by default** — EXPLAIN support varies per engine; the handler assumes `EXPLAIN SELECT 1 FROM (...) _` returns a numeric estimate in column 0. Phase E will add per-dialect EXPLAIN adapters before enabling this rule in production.
- **Rule 4 TZ-naive requires `tz_aware_columns` in ctx** — this context key is not yet populated. Phase D (IntentEcho) will extend `SchemaProfile` to record which columns are `TIMESTAMP WITH TIME ZONE`. Until then, Rule 4 is effectively silent.
- **Rule 5 soft-delete needs `soft_delete_columns` in ctx** — same story. Phase D schema profile extension.
- **Validator crash policy** — on ANY exception inside a rule, we swallow and move on. This is intentional fail-open (H6), but silences real bugs. Phase E observability will add a counter metric `validator_rule_crash{rule=X}` to surface these.
- **Tier universality wiring is approximate** — Task 15 adds `validate_scope()` helper and best-effort hooks to each tier. Exact placement depends on tier-return-shape contracts; the subagent executing this task must verify each tier actually calls it by grepping `validate_scope` in the final file and confirming it appears in every tier branch.
- **Replan loop** — the replan budget mechanism is defined but not yet wired into the agent loop. Phase C only emits structured warnings. Phase D adds the actual "violation → one replan turn" feedback loop.

---

## Execution note for agentic workers

Task dependencies form a serial-dominant DAG with one parallel cluster:

- **Cluster 1 (sequential):** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 (same file `scope_validator.py`).
- **Cluster 2 (parallel with 1):** T12 (replan_budget.py) + T13 (validator_state.py) — independent new modules.
- **Cluster 3 (after 1):** T14 → T15 (agent_engine + waterfall_router integration — both modify existing code; T14 first, T15 after).
- **Cluster 4 (parallel, after 3):** T16 + T17 (trap JSONLs — independent static files) + T18 (grader — independent `trap_grader.py` edit).
- **Cluster 5 (sequential, after 4):** T19 → T20 → T21 (baselines → CI → exit gate).

Recommended parallel track split:
- **Track 1:** T0 → T11 (foundation + all 10 rules).
- **Track 2:** T12 + T13 (replan budget + state machine) — run in parallel with Track 1.
- **Track 3:** T16 + T17 + T18 (trap JSONLs + grader extension) — run in parallel with Track 1 once T0 commits on merge-base.
- **After all:** merge; then T14 → T15 → T19 → T20 → T21 serially.

Estimated serial time: ~10-12 hours. Estimated parallel time: ~3-4 hours.
