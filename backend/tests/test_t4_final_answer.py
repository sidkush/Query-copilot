"""T4 — _set_final_answer single-source-of-truth setter."""
import logging
import pytest


def _make_engine():
    from agent_engine import AgentEngine, AgentResult
    engine = AgentEngine.__new__(AgentEngine)
    engine._result = AgentResult()
    return engine


def test_set_final_answer_method_exists():
    from agent_engine import AgentEngine
    assert hasattr(AgentEngine, "_set_final_answer"), \
        "AgentEngine must expose _set_final_answer setter"


def test_set_final_answer_sets_result():
    engine = _make_engine()
    engine._set_final_answer("hello", source="test")
    assert engine._result.final_answer == "hello"


def test_set_final_answer_overwrite_with_same_value_ok():
    """Setting same content twice is fine — only DIFFERENT non-empty content
    is the wiring-bug signal."""
    engine = _make_engine()
    engine._set_final_answer("same", source="a")
    engine._set_final_answer("same", source="b")
    assert engine._result.final_answer == "same"


def test_set_final_answer_overwrite_with_empty_ok():
    """Clearing or replacing with empty does not log CRITICAL."""
    engine = _make_engine()
    engine._set_final_answer("first", source="a")
    engine._set_final_answer("", source="b")
    assert engine._result.final_answer == ""


def test_set_final_answer_duplicate_logs_critical(caplog):
    engine = _make_engine()
    with caplog.at_level(logging.CRITICAL, logger="agent_engine"):
        engine._set_final_answer("first answer", source="test_a")
        engine._set_final_answer("different answer", source="test_b")
    assert any("wiring bug" in r.message for r in caplog.records), \
        f"expected CRITICAL 'wiring bug' log, got: {[r.message for r in caplog.records]}"


def test_no_direct_content_assignments_to_final_answer():
    """All content-bearing assignments to self._result.final_answer must go through
    _set_final_answer. Two carve-outs:

    1. The setter itself contains exactly one assignment — `self._result.final_answer = text`.
    2. Empty-string clears (`self._result.final_answer = ""` and `= ''`) are intentional
       and don't carry content; they live on the exception-handler clear paths.
    """
    import pathlib
    src = pathlib.Path(__file__).resolve().parent.parent / "agent_engine.py"
    text = src.read_text(encoding="utf-8")
    bad = []
    for i, line in enumerate(text.split("\n"), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if "self._result.final_answer = " not in stripped:
            continue
        # Ignore the setter's own assignment.
        if stripped == "self._result.final_answer = text":
            continue
        # Ignore empty clears.
        # Strip any inline comment.
        no_comment = stripped.split("#", 1)[0].strip()
        if no_comment in (
            'self._result.final_answer = ""',
            "self._result.final_answer = ''",
        ):
            continue
        bad.append((i, stripped))
    assert bad == [], (
        "Found content-bearing direct assignments to self._result.final_answer "
        "outside the setter:\n" + "\n".join(f"  line {i}: {l}" for (i, l) in bad)
    )
