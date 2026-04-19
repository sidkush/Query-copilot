# backend/tests/test_preset_autogen_semantics.py
import uuid
from unittest.mock import patch, MagicMock

import preset_autogen
from preset_autogen import _heuristic_pick, _llm_pick_slot_binding, run_autogen


CITYBIKES_SCHEMA = {
    "columns": [
        {"name": "ride_id", "dtype": "VARCHAR", "semantic_type": None},
        {"name": "started_at", "dtype": "VARCHAR", "semantic_type": None,
         "sample_values": ["2023-05-01 10:00 UTC"]},
        {"name": "start_lat", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "start_lng", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "end_lat", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "end_lng", "dtype": "FLOAT", "semantic_type": "quantitative"},
        {"name": "start_station_name", "dtype": "VARCHAR", "cardinality": 620},
        {"name": "user_type", "dtype": "VARCHAR", "cardinality": 3},
    ]
}


def test_kpi_heuristic_refuses_to_sum_latitude():
    slot = {"id": "bp.kpi-0", "kind": "kpi"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    assert pick["column"] != "start_lat"
    assert pick["column"] != "start_lng"


def test_kpi_heuristic_falls_back_to_count_on_identifier():
    slot = {"id": "bp.kpi-0", "kind": "kpi"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    # When no safe numeric measure exists, pick COUNT(ride_id)
    assert pick["agg"].upper() in {"COUNT", "COUNT_DISTINCT"}
    assert pick["column"] == "ride_id"


def test_table_heuristic_uses_entity_name_not_geo():
    slot = {"id": "bp.accounts-list", "kind": "table"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    assert pick["dimension"] == "start_station_name"


def test_chart_heuristic_picks_string_temporal():
    slot = {"id": "bp.trend-chart", "kind": "chart"}
    pick = _heuristic_pick(slot, CITYBIKES_SCHEMA, semantic_tags={})
    assert pick["primary_date"] == "started_at"


class _CaptureProvider:
    """Captures kwargs to ``complete_with_tools`` so tests can assert on
    the system prompt sent to the LLM. Returns a benign tool_use block
    so ``_llm_pick_slot_binding`` resolves without raising."""

    provider_name = "capture"
    default_model = "fake-haiku"
    fallback_model = "fake-sonnet"

    def __init__(self):
        self.captured = None

    def complete_with_tools(self, *, model, system, messages, tools, max_tokens, **kwargs):
        self.captured = {
            "model": model,
            "system": system,
            "messages": messages,
            "tools": tools,
            "max_tokens": max_tokens,
        }
        from model_provider import ContentBlock, ProviderToolResponse
        return ProviderToolResponse(
            content_blocks=[ContentBlock(
                type="tool_use",
                tool_name=tools[0]["name"] if tools else "pick_slot_binding",
                tool_input={"column": "ride_id", "agg": "COUNT"},
                tool_use_id="toolu_test_" + uuid.uuid4().hex[:8],
            )],
            stop_reason="tool_use",
            usage={"input_tokens": 10, "output_tokens": 10},
        )


def test_llm_system_prompt_includes_semantic_rejection_rules():
    """The system prompt sent to the LLM must spell out the semantic
    rejection rules (never SUM lat/lng, never SUM identifiers, COUNT
    on activity intents, honor user_intent) AND render the user intent.
    """
    provider = _CaptureProvider()
    slot = {"id": "bp.kpi-0", "kind": "kpi", "hint": "headline metric"}
    semantic_tags = {
        "userIntent": "bikeshare rides dashboard",
        "primaryDate": "started_at",
    }
    _llm_pick_slot_binding(
        provider=provider,
        slot=slot,
        preset_id="board-pack",
        schema_profile=CITYBIKES_SCHEMA,
        semantic_tags=semantic_tags,
        model="fake-haiku",
    )
    assert provider.captured is not None, "provider.complete_with_tools was not called"
    system = provider.captured["system"]
    # Rejection rules are load-bearing — assertions ARE the spec.
    assert "DO NOT SUM" in system
    assert "identifier" in system
    assert "geo" in system
    assert "never pick latitude/longitude for sum or avg" in system.lower()
    # User intent must be rendered so the LLM can honor it.
    assert "bikeshare rides dashboard" in system


# ── T5: user_intent threading through run_autogen ────────────────────

def _run_autogen_with_capture(
    *, user_intent: str, semantic_tags: dict,
) -> tuple[dict, MagicMock]:
    """Invoke run_autogen with everything downstream narrowly mocked so
    we can assert on the tags the orchestrator ends up using and on
    whether the interpreter was called. Returns
    ``(merged_tags, infer_mock)``.
    """
    captured: dict = {}

    class _FakeEntry:
        schema_profile = None
        engine = MagicMock()

    def fake_resolve(email, conn_id):
        return _FakeEntry(), "ds.tbl"

    def fake_get_provider(email):
        return MagicMock()

    def fake_persist_state(*args, **kwargs):
        return None

    def fake_run_one_preset(**kw):
        # Capture the semantic_tags seen by the per-preset runner.
        captured["semantic_tags"] = kw.get("semantic_tags")
        return []

    with patch.object(preset_autogen, "resolve_connection_entry", side_effect=fake_resolve), \
         patch.object(preset_autogen, "get_provider", side_effect=fake_get_provider), \
         patch.object(preset_autogen, "_persist_state", side_effect=fake_persist_state), \
         patch.object(preset_autogen, "_run_one_preset", side_effect=fake_run_one_preset), \
         patch.object(preset_autogen, "infer_semantic_tags") as infer_mock:
        infer_mock.return_value = {
            "primaryDate": "started_at",
            "userIntent": user_intent,
        }
        # Drive the generator to completion.
        events = list(run_autogen(
            email="x@y.com",
            dashboard_id="dash-1",
            conn_id="conn-1",
            semantic_tags=semantic_tags,
            preset_ids=["board-pack"],
            skip_pinned=True,
            user_intent=user_intent,
        ))
    assert events, "run_autogen produced no events"
    return captured.get("semantic_tags") or {}, infer_mock


def test_run_autogen_calls_interpreter_when_tags_empty_and_intent_set():
    merged, infer_mock = _run_autogen_with_capture(
        user_intent="count rides",
        semantic_tags={},
    )
    assert infer_mock.call_count == 1, (
        "interpreter must be called exactly once when tags are empty and "
        "user_intent is supplied"
    )
    # Merged tags must carry userIntent for T3's prompt.
    assert merged.get("userIntent") == "count rides"


def test_run_autogen_skips_interpreter_when_primary_date_already_set():
    existing = {"primaryDate": "started_at", "revenueMetric": {"column": "amount", "agg": "SUM"}}
    merged, infer_mock = _run_autogen_with_capture(
        user_intent="count rides",
        semantic_tags=existing,
    )
    assert infer_mock.call_count == 0, (
        "interpreter must NOT be called when semantic_tags already carry "
        "primaryDate — existing tags win"
    )
    # Pre-existing values must survive AND userIntent must be populated.
    assert merged.get("primaryDate") == "started_at"
    assert merged.get("revenueMetric") == {"column": "amount", "agg": "SUM"}
    assert merged.get("userIntent") == "count rides"


def test_run_autogen_passthrough_when_user_intent_blank():
    existing = {"primaryDate": "started_at"}
    merged, infer_mock = _run_autogen_with_capture(
        user_intent="",
        semantic_tags=dict(existing),
    )
    assert infer_mock.call_count == 0, (
        "interpreter must NOT be called when user_intent is empty"
    )
    # Tags pass through untouched — no userIntent injected.
    assert merged == existing
