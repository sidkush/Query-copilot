"""SSE event schema includes Phase K event types."""
import pytest


def test_sse_event_types_include_phase_k_events():
    from routers.agent_routes import KNOWN_SSE_EVENT_TYPES
    required = {"plan_artifact", "step_phase", "step_detail", "safe_abort"}
    assert required.issubset(KNOWN_SSE_EVENT_TYPES), \
        f"missing SSE event types: {required - KNOWN_SSE_EVENT_TYPES}"


def test_plan_artifact_schema_has_required_fields():
    from routers.agent_routes import PLAN_ARTIFACT_SCHEMA
    assert "plan_id" in PLAN_ARTIFACT_SCHEMA["required"]
    assert "ctes" in PLAN_ARTIFACT_SCHEMA["required"]
    assert "fallback" in PLAN_ARTIFACT_SCHEMA["required"]
