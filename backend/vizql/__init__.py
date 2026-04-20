"""VizQL engine package.

Plan 7a introduces the VisualSpec IR. Plans 7b-7e add the logical-plan
port, SQL AST, dialect emitters, and query cache.
"""

from vizql.logical import (  # noqa: E402,F401
    DomainType, WindowFrameType, WindowFrameExclusion, SqlSetType,
    Field as LogicalField,
    Column, Literal, BinaryOp, FnCall,
    NamedExps, OrderBy, PartitionBys,
    FrameStart, FrameEnd, FrameSpec,
    AggExp,
)
from vizql.validator import LogicalPlanError, validate_logical_plan  # noqa: E402,F401
from vizql.compiler import compile_visual_spec  # noqa: E402,F401

# Plan 7c — SQL AST + optimiser + filter ordering
from vizql.logical_to_sql import compile_logical_to_sql  # noqa: E402,F401
from vizql.optimizer import optimize, OptimizerContext  # noqa: E402,F401
from vizql.filter_ordering import (  # noqa: E402,F401
    apply_filters_in_order, StagedFilter, FILTER_STAGES,
)
from vizql import sql_ast  # noqa: E402,F401

__all__ = [
    # Plan 7a/7b (pre-existing)
    "spec", "logical", "compiler", "validator",
    # Plan 7c
    "sql_ast", "compile_logical_to_sql", "optimize", "OptimizerContext",
    "apply_filters_in_order", "StagedFilter", "FILTER_STAGES",
]
