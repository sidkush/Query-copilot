import pytest
from backend.tests.fixtures.mock_anthropic_provider import MockAnthropicProvider


def test_mock_returns_canned_sql_for_known_question():
    mock = MockAnthropicProvider(responses={
        "what is the max trip date?": "SELECT MAX(started_at) FROM january_trips",
    })
    resp = mock.generate_sql("what is the max trip date?")
    assert resp == "SELECT MAX(started_at) FROM january_trips"


def test_mock_raises_on_unknown_question():
    mock = MockAnthropicProvider(responses={})
    with pytest.raises(KeyError, match="no canned response"):
        mock.generate_sql("unknown question")


def test_mock_version_tagged():
    mock = MockAnthropicProvider(responses={}, version="test-v1")
    assert mock.version == "test-v1"
