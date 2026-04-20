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

# Plan 7d — dialect emitters + validator gate
from config import DBType  # noqa: E402
from sql_validator import SQLValidator  # noqa: E402

from .dialect_base import BaseDialect  # noqa: E402,F401
from .dialects import get_dialect  # noqa: E402,F401


class DialectValidationError(RuntimeError):
    """Raised when the emitted SQL fails SQLValidator.validate().

    This is a security invariant — never catch-and-run this."""


_VALIDATORS: dict[str, SQLValidator] = {}


def _validator(db_type: DBType) -> SQLValidator:
    key = db_type.value
    v = _VALIDATORS.get(key)
    if v is None:
        v = SQLValidator(dialect=key)
        _VALIDATORS[key] = v
    return v


def emit_validated(db_type: DBType, qf: sql_ast.SQLQueryFunction) -> str:
    sql = get_dialect(db_type).emit(qf)
    ok, _cleaned, message = _validator(db_type).validate(sql)
    if not ok:
        raise DialectValidationError(
            f"VizQL {db_type.value} emission failed sql_validator: {message}")
    return sql


__all__ = [
    # Plan 7a/7b (pre-existing)
    "spec", "logical", "compiler", "validator",
    # Plan 7c
    "sql_ast", "compile_logical_to_sql", "optimize", "OptimizerContext",
    "apply_filters_in_order", "StagedFilter", "FILTER_STAGES",
    # Plan 7d
    "BaseDialect", "get_dialect", "emit_validated", "DialectValidationError",
]

# Plan 7e — query cache + batch + telemetry
from .cache import (  # noqa: E402,F401
    AbstractQueryCacheKey,
    OrderByKey,
    LRUQueryCachePolicy,
    InProcessLogicalQueryCache,
    ExternalLogicalQueryCache,
    HistoryTrackingCache,
    InvalidationRecord,
)
from .batch import QueryBatch, BatchResult  # noqa: E402,F401
from .telemetry import QueryCategory  # noqa: E402,F401

# Plan 8a — calc-language AST
from . import calc_ast as calc_ast  # noqa: E402,F401

# Plan 8b — LOD compiler (FIXED/INCLUDE/EXCLUDE → sa.Subquery / sa.Window)
from . import lod_compiler as lod_compiler  # noqa: E402,F401

__all__ += [
    # Plan 7e
    "AbstractQueryCacheKey", "OrderByKey",
    "LRUQueryCachePolicy", "InProcessLogicalQueryCache",
    "ExternalLogicalQueryCache", "HistoryTrackingCache", "InvalidationRecord",
    "QueryBatch", "BatchResult", "QueryCategory",
]
