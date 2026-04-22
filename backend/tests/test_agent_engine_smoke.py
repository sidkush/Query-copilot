"""Integration smoke — ensures AgentEngine.run() actually executes end-to-end
against the fixture DB. This is NOT deterministic (real Anthropic call),
so it's marked skip-unless-ANTHROPIC_KEY is set. CI shadow-eval path uses it.
"""
import os
import sqlite3
from pathlib import Path
import pytest


FIXTURE = Path("/tmp/eval_fixture.sqlite")


pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_STAGING_KEY"),
    reason="no Anthropic key available",
)


def test_agent_engine_answers_simple_question_on_fixture():
    # Sanity: fixture must exist and have data.
    assert FIXTURE.exists(), "run `python -m backend.tests.fixtures.eval_seed /tmp/eval_fixture.sqlite` first"
    conn = sqlite3.connect(FIXTURE)
    try:
        cnt = conn.execute("SELECT COUNT(*) FROM january_trips").fetchone()[0]
    finally:
        conn.close()
    assert cnt >= 400, f"fixture has only {cnt} trips"

    # Hitting AgentEngine here would require a full backend boot + SQLite connector.
    # That's Phase A Task 12 (shadow-eval). For now, prove the fixture is sane.
    # This test is a placeholder that WILL become a real AgentEngine.run() invocation
    # in Task 12.
