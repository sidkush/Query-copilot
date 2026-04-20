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
