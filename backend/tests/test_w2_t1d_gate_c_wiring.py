"""W2 Task 1d — Ring 4 Gate C wiring unit tests.

Covers the helper methods added to `AgentEngine`:
  * `_flatten_schema_columns` reads from `connection_entry.schema_profile`.
  * `_should_fire_schema_mismatch_checkpoint` honours
    `W2_SCHEMA_MISMATCH_GATE_ENFORCE` (AMEND-W2-37), `_schema_mismatch_decided`
    consent persistence (AMEND-W2-08), and fail-closed empty schema
    (AMEND-W2-06).
  * `_build_schema_mismatch_step` returns a typed `AgentStep` carrying the
    park_id, options, proxy_suggestion, and DisclosureBuilder text.

These tests exercise the helpers directly — full SSE integration is covered
by the broader run-loop tests once the wiring lands.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from agent_engine import AgentEngine
from schema_entity_mismatch import EntityMismatch


def _make_engine(columns: list[str] | None) -> AgentEngine:
    eng = AgentEngine.__new__(AgentEngine)
    if columns is None:
        eng.connection_entry = SimpleNamespace(schema_profile=None)
    else:
        tbl = SimpleNamespace(
            name="t",
            columns=[{"name": c} for c in columns],
        )
        eng.connection_entry = SimpleNamespace(
            schema_profile=SimpleNamespace(tables=[tbl])
        )
    eng.memory = SimpleNamespace(_schema_mismatch_decided=None)
    return eng


def test_flatten_schema_columns_reads_table_profile():
    eng = _make_engine(["ride_id", "started_at", "member_casual"])
    assert eng._flatten_schema_columns() == ["ride_id", "started_at", "member_casual"]


def test_flatten_schema_columns_empty_when_no_profile():
    eng = _make_engine(None)
    assert eng._flatten_schema_columns() == []


def test_should_fire_when_entity_mentioned_and_no_id_column():
    eng = _make_engine(["ride_id", "started_at", "member_casual"])
    with patch("agent_engine.settings") as s:
        s.W2_SCHEMA_MISMATCH_GATE_ENFORCE = True
        result = eng._should_fire_schema_mismatch_checkpoint(
            "why are casual riders churning?"
        )
    assert result is not None
    assert isinstance(result, EntityMismatch)
    assert result.canonical == "rider"


def test_should_not_fire_when_id_column_present():
    eng = _make_engine(["rider_id", "started_at", "member_casual"])
    with patch("agent_engine.settings") as s:
        s.W2_SCHEMA_MISMATCH_GATE_ENFORCE = True
        result = eng._should_fire_schema_mismatch_checkpoint(
            "why are casual riders churning?"
        )
    assert result is None


def test_should_not_fire_when_flag_off():
    """AMEND-W2-37 — master gate must fully suppress detection."""
    eng = _make_engine(["ride_id", "started_at", "member_casual"])
    with patch("agent_engine.settings") as s:
        s.W2_SCHEMA_MISMATCH_GATE_ENFORCE = False
        result = eng._should_fire_schema_mismatch_checkpoint(
            "why are casual riders churning?"
        )
    assert result is None


def test_should_not_fire_when_consent_already_decided():
    """AMEND-W2-08 — once user resolved gate for canonical entity, suppress."""
    eng = _make_engine(["ride_id", "started_at"])
    eng.memory._schema_mismatch_decided = {"rider"}
    with patch("agent_engine.settings") as s:
        s.W2_SCHEMA_MISMATCH_GATE_ENFORCE = True
        result = eng._should_fire_schema_mismatch_checkpoint(
            "show me rider churn"
        )
    assert result is None


def test_should_fire_closed_on_empty_schema_with_entity():
    """AMEND-W2-06 — empty schema MUST still fire when entity term present.
    Fail-closed: the agent cannot silently invent an answer."""
    eng = _make_engine([])
    with patch("agent_engine.settings") as s:
        s.W2_SCHEMA_MISMATCH_GATE_ENFORCE = True
        result = eng._should_fire_schema_mismatch_checkpoint(
            "show me rider churn"
        )
    assert result is not None
    assert result.canonical == "rider"


def test_build_step_returns_agent_checkpoint_with_park_id():
    eng = _make_engine(["ride_id", "started_at", "member_casual"])
    mismatch = EntityMismatch(
        has_mismatch=True,
        entity_term="riders",
        canonical="rider",
        proxy_suggestions=("member_casual",),
    )
    step = eng._build_schema_mismatch_step(mismatch, park_id="gate_c_abc123")
    assert step.type == "agent_checkpoint"
    assert step.tool_input["kind"] == "schema_entity_mismatch"
    assert step.tool_input["park_id"] == "gate_c_abc123"
    assert step.tool_input["options"] == ["station_proxy", "abort"]
    assert step.tool_input["canonical"] == "rider"
    # AMEND-W2-01: raw column names must NOT appear in user-facing text
    assert "member_casual" not in step.content
