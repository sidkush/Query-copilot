"""SSE event schema includes Phase L events."""
def test_sse_event_types_include_phase_l_events():
    from routers.agent_routes import KNOWN_SSE_EVENT_TYPES
    required = {"step_detail", "claim_chip", "result_preview", "cancel_ack"}
    assert required.issubset(KNOWN_SSE_EVENT_TYPES), f"missing: {required - KNOWN_SSE_EVENT_TYPES}"
