"""Turn a natural-language dashboard intent into a SemanticTags dict.

One Haiku call with tool-use. On any failure the caller still gets
`{"userIntent": intent}` so the slot-picker downstream can make use of
the raw text even when the interpreter is unavailable.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from schema_semantics import digest_with_semantics

logger = logging.getLogger(__name__)

_TOOL_SCHEMA = {
    "name": "infer_semantic_tags",
    "description": (
        "Given a user's free-text dashboard intent and a schema listing "
        "annotated with semantic roles, return the SemanticTags dict the "
        "autogen orchestrator will use to populate every preset slot. "
        "Respect the rejection rules in the system prompt."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "primaryDate": {"type": ["string", "null"]},
            "revenueMetric": {
                "type": ["object", "null"],
                "properties": {
                    "column": {"type": "string"},
                    "agg": {"type": "string",
                            "enum": ["SUM", "AVG", "COUNT", "COUNT_DISTINCT", "MIN", "MAX"]},
                },
            },
            "primaryDimension": {"type": ["string", "null"]},
            "entityName": {"type": ["string", "null"]},
            "timeGrain": {"type": ["string", "null"],
                           "enum": ["day", "week", "month", "quarter", None]},
        },
    },
}


def infer_semantic_tags(
    provider,
    intent: str,
    schema_profile: Dict[str, Any],
    model: str,
) -> Dict[str, Any]:
    system = (
        "You translate a user's free-text dashboard description into a "
        "SemanticTags dict. The schema is annotated with roles and "
        "rejection rules — follow them strictly.\n\n"
        "  - Never pick a geo column (tagged `geo`) as a revenue metric.\n"
        "  - Prefer COUNT_DISTINCT on an identifier column when the user "
        "asks about rides, visits, events, trips, orders, signups.\n"
        "  - Pick a temporal column (string or date) for `primaryDate`.\n"
        "  - Pick an entity_name column when the user talks about "
        "stations, customers, accounts, products.\n"
        "  - Time grain defaults to `month` unless the user says hour/day/week.\n\n"
        f"Schema:\n{digest_with_semantics(schema_profile)}"
    )
    try:
        resp = provider.complete_with_tools(
            model=model,
            system=system,
            messages=[{"role": "user", "content": intent}],
            tools=[_TOOL_SCHEMA],
            max_tokens=400,
        )
    except Exception as e:
        logger.warning("intent interpreter failed: %s", e)
        return {"userIntent": intent}

    for block in resp.content_blocks:
        if getattr(block, "type", "") == "tool_use" and block.tool_input is not None:
            tags = dict(block.tool_input)
            tags["userIntent"] = intent
            return tags
    return {"userIntent": intent}
