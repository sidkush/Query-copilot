"""Non-interactive conservative mode (H5) + voice TTS readback."""
from intent_echo import (
    IntentEchoCard, build_echo, EchoMode, InteractionMode,
)


def test_scheduled_mode_forces_auto_proceed_with_banner():
    card = build_echo(
        nl="churn this quarter",
        sql="SELECT 1",
        ambiguity=0.85,
        clauses=[],
        unmapped=[],
        tables_touched=["trips"],
        interaction_mode=InteractionMode.SCHEDULED,
    )
    assert card.mode is EchoMode.AUTO_PROCEED
    assert card.banner is not None
    assert "unconfirmed" in card.banner.lower()


def test_voice_mode_sets_readback_flag_when_ambiguous():
    card = build_echo(
        nl="churn trend",
        sql="SELECT 1",
        ambiguity=0.6,
        clauses=[],
        unmapped=[],
        tables_touched=["trips"],
        interaction_mode=InteractionMode.VOICE,
    )
    assert card.tts_readback is True


def test_voice_mode_no_readback_when_score_below_threshold():
    card = build_echo(
        nl="count users",
        sql="SELECT 1",
        ambiguity=0.1,
        clauses=[],
        unmapped=[],
        tables_touched=["users"],
        interaction_mode=InteractionMode.VOICE,
    )
    assert card.tts_readback is False


def test_interactive_mode_has_no_banner_by_default():
    card = build_echo(
        nl="count users",
        sql="SELECT 1",
        ambiguity=0.1,
        clauses=[],
        unmapped=[],
        tables_touched=["users"],
        interaction_mode=InteractionMode.INTERACTIVE,
    )
    assert card.banner is None
