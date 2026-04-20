"""Pipeline composition — fixed order, idempotent, terminating.

Order (§IV.4):
  InputSchemaProver → SchemaAndTypeDeriver → DataTypeResolver →
  JoinTreeVirtualizer → EqualityProver → AggregatePushdown →
  CommonSubexpElim.

The pipeline is run up to ``max_iterations`` times; it is idempotent by
construction (each pass is a fixed-point; re-running produces the same
AST). We run twice by default so downstream passes can see upstream
rewrites.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Mapping
from . import sql_ast as sa
from .passes.input_schema_prover import InputSchemaProverPass
from .passes.logical_op_schema_and_type_deriver import SchemaAndTypeDeriverPass
from .passes.data_type_resolver import DataTypeResolverPass
from .passes.join_tree_virtualizer import JoinTreeVirtualizerPass
from .passes.equality_prover import EqualityProverPass
from .passes.aggregate_pushdown import AggregatePushdownPass
from .passes.common_subexp_elimination import CommonSubexpElimPass


@dataclass(frozen=True)
class OptimizerContext:
    schemas: Mapping[str, Mapping[str, str]] = field(default_factory=dict)
    referenced_tables: frozenset[str] | set[str] = field(default_factory=set)
    strict_types: bool = False
    max_iterations: int = 2


def optimize(qf: sa.SQLQueryFunction, ctx: OptimizerContext) -> sa.SQLQueryFunction:
    current = qf
    for _ in range(ctx.max_iterations):
        InputSchemaProverPass(ctx.schemas).run(current)
        current = SchemaAndTypeDeriverPass(ctx.schemas).run(current)
        current = DataTypeResolverPass(strict=ctx.strict_types).run(current)
        current = JoinTreeVirtualizerPass(ctx.referenced_tables).run(current)
        EqualityProverPass().run(current)
        current = AggregatePushdownPass().run(current)
        current = CommonSubexpElimPass().run(current)
    return current


__all__ = ["OptimizerContext", "optimize"]
