"""Test for AgentEngine core + SessionMemory (Task 1)."""

def test_task1():
    from agent_engine import AgentEngine, TOOL_DEFINITIONS, SessionMemory

    # 6 tools defined
    assert len(TOOL_DEFINITIONS) == 6, f"Expected 6 tools, got {len(TOOL_DEFINITIONS)}"
    tool_names = {t["name"] for t in TOOL_DEFINITIONS}
    expected = {"find_relevant_tables", "inspect_schema", "run_sql",
                "suggest_chart", "ask_user", "summarize_results"}
    assert tool_names == expected, f"Tool mismatch: {tool_names}"

    # SessionMemory basics
    m = SessionMemory("test-chat-id")
    assert m.chat_id == "test-chat-id"
    m.add_turn("user", "hello")
    msgs = m.get_messages()
    assert len(msgs) == 1
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == "hello"

    m.add_turn("assistant", "hi there")
    assert len(m.get_messages()) == 2

    # AgentEngine has required attributes
    assert hasattr(AgentEngine, "run")

    # Each tool definition has required fields
    for td in TOOL_DEFINITIONS:
        assert "name" in td
        assert "description" in td
        assert "input_schema" in td

    print("ALL TESTS PASSED")


if __name__ == "__main__":
    test_task1()
