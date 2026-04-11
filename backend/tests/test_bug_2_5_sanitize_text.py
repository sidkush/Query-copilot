"""
Test for Bug 2.5: _sanitize_text incomplete HTML sanitization.

The bug: _sanitize_text only strips <tag> patterns using regex.
It misses HTML entities (&#60;script&#62;), javascript: URIs,
and encoded variations.

The fix: Use html.escape() for output encoding, and strip
dangerous URI schemes.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from auth import _sanitize_text


def test_strips_basic_html_tags():
    """Basic <script> tags should be stripped."""
    assert "<script>" not in _sanitize_text("<script>alert(1)</script>")


def test_strips_html_entities():
    """HTML entities that decode to tags should be neutralized."""
    result = _sanitize_text("&#60;script&#62;alert(1)&#60;/script&#62;")
    # After sanitization, the result should not contain characters that
    # could be interpreted as HTML when rendered
    assert "<script>" not in result
    assert "&#60;" not in result or "&amp;" in result  # Either stripped or double-escaped


def test_strips_javascript_uri():
    """javascript: URIs should be stripped."""
    result = _sanitize_text("javascript:alert(1)")
    assert "javascript:" not in result.lower()


def test_strips_data_uri():
    """data: URIs with text/html should be stripped."""
    result = _sanitize_text("data:text/html,<script>alert(1)</script>")
    assert "data:text/html" not in result.lower()


def test_strips_vbscript_uri():
    """vbscript: URIs should be stripped."""
    result = _sanitize_text("vbscript:MsgBox")
    assert "vbscript:" not in result.lower()


def test_preserves_normal_text():
    """Normal text without HTML should pass through."""
    assert _sanitize_text("Hello World") == "Hello World"
    assert _sanitize_text("John O'Brien") == "John O'Brien"


def test_preserves_email_addresses():
    """Email addresses should not be mangled."""
    result = _sanitize_text("user@example.com")
    assert "user@example.com" in result


def test_strips_event_handlers():
    """Event handler attributes should not remain if tags are stripped."""
    result = _sanitize_text('<img onerror="alert(1)" src=x>')
    assert "onerror" not in result
    assert "alert" not in result


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
