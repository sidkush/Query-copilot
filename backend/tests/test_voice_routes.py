"""Tests for voice WebSocket endpoint."""
import pytest


class TestVoiceMessageParsing:
    def test_parse_transcript(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "transcript", "text": "show me revenue", "is_interim": False}
        result = parse_voice_message(msg)
        assert result["type"] == "transcript"
        assert result["text"] == "show me revenue"
        assert result["is_interim"] is False

    def test_parse_interim_transcript(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "transcript", "text": "show me reven...", "is_interim": True}
        result = parse_voice_message(msg)
        assert result["is_interim"] is True

    def test_parse_cancel(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "cancel"}
        result = parse_voice_message(msg)
        assert result["type"] == "cancel"

    def test_parse_voice_config(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "voice_config", "tts_provider": "openai_tts", "stt_provider": "whisper"}
        result = parse_voice_message(msg)
        assert result["type"] == "voice_config"
        assert result["tts_provider"] == "openai_tts"

    def test_parse_invalid_type(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "unknown_type"}
        result = parse_voice_message(msg)
        assert result is None

    def test_parse_empty_transcript_stripped(self):
        from routers.voice_routes import parse_voice_message
        msg = {"type": "transcript", "text": "   ", "is_interim": False}
        result = parse_voice_message(msg)
        assert result["text"] == ""
