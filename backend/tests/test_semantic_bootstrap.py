"""
Tests for semantic_bootstrap.py — Haiku-powered linguistic model generation.

Five tests:
  1. test_returns_linguistic_model_from_haiku_response — valid JSON → full model
  2. test_provider_is_called — verifies provider.complete is invoked
  3. test_handles_malformed_response — non-JSON → empty model returned
  4. test_all_entries_have_suggested_status — every phrasing + question has status='suggested'
  5. test_empty_schema_returns_empty_model — no tables → empty model
"""

import json
import sys
import os
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# Path setup — tests run from backend/tests/ but imports live in backend/
# ---------------------------------------------------------------------------
_BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from schema_intelligence import SchemaProfile, TableProfile
from semantic_bootstrap import bootstrap_linguistic, _empty_model

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

VALID_LLM_JSON = {
    "table_synonyms": {
        "orders": ["purchases", "transactions", "sales"],
        "customers": ["clients", "buyers", "accounts"],
    },
    "column_synonyms": {
        "orders.total_amount": ["order value", "purchase price"],
        "customers.email": ["email address", "contact email"],
        "orders.status": ["order state", "fulfillment status"],
    },
    "value_synonyms": {
        "orders.status.completed": ["done", "fulfilled"],
    },
    "phrasings": [
        {
            "type": "aggregation",
            "template": "what is the total {metric} by {dimension}?",
            "entities": ["metric", "dimension"],
            "joinPath": ["orders"],
        },
        {
            "type": "filter",
            "template": "show {entity} where {condition}",
            "entities": ["entity", "condition"],
            "joinPath": ["orders", "customers"],
        },
        {
            "type": "trend",
            "template": "how has {metric} changed over {time_period}?",
            "entities": ["metric", "time_period"],
            "joinPath": ["orders"],
        },
    ],
    "sample_questions": [
        {"table": "orders", "question": "How many orders were placed last month?"},
        {"table": "orders", "question": "What is the average order value by region?"},
        {"table": "customers", "question": "Which customers have not placed an order in 90 days?"},
        {"table": "orders", "question": "Show me the top 10 orders by total amount."},
    ],
}


def _make_schema_profile() -> SchemaProfile:
    """Create a realistic two-table SchemaProfile (orders + customers)."""
    orders = TableProfile(
        name="orders",
        row_count_estimate=125_000,
        columns=[
            {"name": "order_id", "type": "INTEGER", "nullable": False},
            {"name": "customer_id", "type": "INTEGER", "nullable": False},
            {"name": "total_amount", "type": "DECIMAL(10,2)", "nullable": False},
            {"name": "status", "type": "VARCHAR(32)", "nullable": False},
            {"name": "created_at", "type": "TIMESTAMP", "nullable": False},
        ],
        indexes=[],
        partitions=[],
        primary_keys=["order_id"],
        foreign_keys=[
            {
                "constrained_columns": ["customer_id"],
                "referred_table": "customers",
                "referred_columns": ["customer_id"],
            }
        ],
    )
    customers = TableProfile(
        name="customers",
        row_count_estimate=8_400,
        columns=[
            {"name": "customer_id", "type": "INTEGER", "nullable": False},
            {"name": "email", "type": "VARCHAR(255)", "nullable": False},
            {"name": "full_name", "type": "VARCHAR(255)", "nullable": True},
            {"name": "signup_date", "type": "DATE", "nullable": False},
            {"name": "region", "type": "VARCHAR(64)", "nullable": True},
        ],
        indexes=[],
        partitions=[],
        primary_keys=["customer_id"],
        foreign_keys=[],
    )
    return SchemaProfile(
        conn_id="test-conn-abc123",
        schema_hash="aabbcc112233",
        cached_at=datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc),
        tables=[orders, customers],
    )


def _make_provider(json_payload: dict | str | None = None) -> MagicMock:
    """Return a mock provider whose .complete() returns the given payload."""
    provider = MagicMock()
    if json_payload is None:
        json_payload = VALID_LLM_JSON
    if isinstance(json_payload, dict):
        content_str = json.dumps(json_payload)
    else:
        content_str = json_payload  # raw string (e.g. malformed)
    mock_response = MagicMock()
    mock_response.text = content_str
    mock_response.content = content_str  # guard both attribute names
    provider.complete.return_value = mock_response
    return provider


# ---------------------------------------------------------------------------
# Test 1 — Valid JSON → full model with correct structure
# ---------------------------------------------------------------------------

def test_returns_linguistic_model_from_haiku_response():
    schema = _make_schema_profile()
    provider = _make_provider(VALID_LLM_JSON)

    result = bootstrap_linguistic(schema, provider)

    # Top-level structure
    assert result["version"] == 1
    assert "synonyms" in result
    assert "phrasings" in result
    assert "sampleQuestions" in result

    # Table synonyms present
    assert "orders" in result["synonyms"]["tables"]
    assert "customers" in result["synonyms"]["tables"]
    assert isinstance(result["synonyms"]["tables"]["orders"], list)
    assert len(result["synonyms"]["tables"]["orders"]) > 0

    # Column synonyms present
    assert "orders.total_amount" in result["synonyms"]["columns"]

    # Phrasings have expected fields
    assert len(result["phrasings"]) == 3
    p = result["phrasings"][0]
    assert "id" in p
    assert "type" in p
    assert "template" in p
    assert "entities" in p
    assert "joinPath" in p
    assert "status" in p

    # Sample questions have expected fields
    assert len(result["sampleQuestions"]) == 4
    q = result["sampleQuestions"][0]
    assert "id" in q
    assert "table" in q
    assert "question" in q
    assert "status" in q


# ---------------------------------------------------------------------------
# Test 2 — provider.complete is called
# ---------------------------------------------------------------------------

def test_provider_is_called():
    schema = _make_schema_profile()
    provider = _make_provider(VALID_LLM_JSON)

    bootstrap_linguistic(schema, provider)

    provider.complete.assert_called_once()

    # Verify messages arg is present in the call (positional or keyword)
    call_kwargs = provider.complete.call_args.kwargs
    assert "messages" in call_kwargs
    messages = call_kwargs["messages"]
    assert isinstance(messages, list)
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    # Prompt should reference both tables
    assert "orders" in messages[0]["content"]
    assert "customers" in messages[0]["content"]


# ---------------------------------------------------------------------------
# Test 3 — Malformed LLM response → empty model (no crash)
# ---------------------------------------------------------------------------

def test_handles_malformed_response():
    schema = _make_schema_profile()
    provider = _make_provider("not valid json {{{{ garbage %%%%")

    result = bootstrap_linguistic(schema, provider)

    # Must return a valid empty model — never crash
    assert result == _empty_model()
    assert result["version"] == 1
    assert result["phrasings"] == []
    assert result["sampleQuestions"] == []


# ---------------------------------------------------------------------------
# Test 4 — Every phrasing and sample question has status='suggested'
# ---------------------------------------------------------------------------

def test_all_entries_have_suggested_status():
    schema = _make_schema_profile()
    provider = _make_provider(VALID_LLM_JSON)

    result = bootstrap_linguistic(schema, provider)

    for phrasing in result["phrasings"]:
        assert phrasing["status"] == "suggested", (
            f"Phrasing missing 'suggested' status: {phrasing}"
        )

    for question in result["sampleQuestions"]:
        assert question["status"] == "suggested", (
            f"Sample question missing 'suggested' status: {question}"
        )


# ---------------------------------------------------------------------------
# Test 5 — Empty schema (no tables) → empty model immediately
# ---------------------------------------------------------------------------

def test_empty_schema_returns_empty_model():
    empty_schema = SchemaProfile(
        conn_id="test-empty-conn",
        schema_hash="",
        cached_at=datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc),
        tables=[],
    )
    provider = MagicMock()

    result = bootstrap_linguistic(empty_schema, provider)

    assert result == _empty_model()
    assert result["phrasings"] == []
    assert result["sampleQuestions"] == []
    # Provider should not have been called — no tables to prompt about
    provider.complete.assert_not_called()
