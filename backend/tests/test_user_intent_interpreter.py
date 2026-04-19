import json
from unittest.mock import MagicMock
from user_intent_interpreter import infer_semantic_tags


CITYBIKES = {"columns": [
    {"name": "ride_id", "dtype": "VARCHAR"},
    {"name": "started_at", "dtype": "VARCHAR", "sample_values": ["2023-05-01 10:00 UTC"]},
    {"name": "start_station_name", "dtype": "VARCHAR", "cardinality": 620},
    {"name": "end_station_name", "dtype": "VARCHAR", "cardinality": 620},
    {"name": "user_type", "dtype": "VARCHAR", "cardinality": 3},
]}


def _provider_returning(tool_input):
    class FakeProvider:
        def complete_with_tools(self, **_kw):
            resp = MagicMock()
            block = MagicMock()
            block.type = "tool_use"
            block.tool_input = tool_input
            resp.content_blocks = [block]
            return resp
    return FakeProvider()


def test_infer_intent_populates_tags_from_city_bikes_question():
    provider = _provider_returning({
        "primaryDate": "started_at",
        "revenueMetric": {"column": "ride_id", "agg": "COUNT_DISTINCT"},
        "primaryDimension": "start_station_name",
        "entityName": "start_station_name",
        "timeGrain": "month",
    })
    tags = infer_semantic_tags(
        provider,
        "show monthly bike ride counts by station",
        CITYBIKES,
        model="claude-haiku-4-5-20251001",
    )
    assert tags["primaryDate"] == "started_at"
    assert tags["revenueMetric"]["column"] == "ride_id"
    assert tags["revenueMetric"]["agg"].upper() in {"COUNT", "COUNT_DISTINCT"}
    assert tags["timeGrain"] == "month"
    assert tags["userIntent"] == "show monthly bike ride counts by station"


def test_infer_intent_returns_empty_on_provider_failure():
    class Broken:
        def complete_with_tools(self, **_kw):
            raise RuntimeError("api down")
    tags = infer_semantic_tags(Broken(), "anything", CITYBIKES, model="m")
    # Must still carry through the userIntent so downstream LLM sees it.
    assert tags == {"userIntent": "anything"}
