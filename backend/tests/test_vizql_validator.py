"""Plan 7b - logical plan validator."""

from __future__ import annotations

import pytest

from vizql.logical import (
    AggExp, Column, DomainType, Field, Literal, BinaryOp,
    LogicalOpAggregate, LogicalOpDomain, LogicalOpRelation, LogicalOpSelect,
    LogicalOpUnion,
)
from vizql.validator import LogicalPlanError, validate_logical_plan


def _region() -> Field:
    return Field(id="orders.region", data_type="string", role="dimension",
                 aggregation="none", semantic_role="", is_disagg=False)


def test_validator_accepts_valid_aggregate_plan():
    base = LogicalOpRelation(table="orders", schema="public")
    pred = BinaryOp(op=">", left=Column(field_id="orders.total"),
                    right=Literal(value=0, data_type="int"))
    sel = LogicalOpSelect(input=base, predicate=pred, filter_stage="dimension")
    agg = LogicalOpAggregate(
        input=sel,
        group_bys=(_region(),),
        aggregations=(AggExp(name="t", agg="sum",
                             expr=Column(field_id="orders.total")),),
    )
    validate_logical_plan(agg)  # no raise


def test_validator_rejects_aggregate_with_empty_grain_and_no_aggs():
    base = LogicalOpRelation(table="orders", schema="public")
    agg = LogicalOpAggregate(input=base, group_bys=(), aggregations=())
    with pytest.raises(LogicalPlanError, match="aggregation"):
        validate_logical_plan(agg)


def test_validator_rejects_union_with_none_branch():
    base = LogicalOpRelation(table="orders", schema="public")
    # Forge a broken plan via object.__setattr__ bypassing frozen=True.
    bad = LogicalOpUnion(left=base, right=base)
    object.__setattr__(bad, "right", None)
    with pytest.raises(LogicalPlanError, match="missing input"):
        validate_logical_plan(bad)


def test_validator_rejects_cycle():
    base = LogicalOpRelation(table="orders", schema="public")
    dom = LogicalOpDomain(input=base, domain=DomainType.SEPARATE)
    # Force a cycle: make dom.input point back to itself.
    object.__setattr__(dom, "input", dom)
    with pytest.raises(LogicalPlanError, match="cycle"):
        validate_logical_plan(dom)


def test_validator_accepts_relation_leaf():
    base = LogicalOpRelation(table="orders", schema="public")
    validate_logical_plan(base)
