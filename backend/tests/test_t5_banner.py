"""T5 — banner in finally / no mid-loop synthesizing or banner yields.

These are static-source checks: scan agent_engine.py to assert the
mid-loop banner-and-synthesizing emission was removed by T5.
"""
import pathlib

_AE = pathlib.Path(__file__).resolve().parent.parent / "agent_engine.py"


def test_no_synthesizing_step_in_any_iteration():
    """Agent run must never yield a 'synthesizing' AgentStep mid-loop."""
    src = _AE.read_text(encoding="utf-8")
    # The synth_step had: AgentStep(type="synthesizing", content="Synthesizing analysis…")
    # After T5 it must be gone (or commented as REMOVED).
    forbidden = 'type="synthesizing"'
    if forbidden in src:
        # Allow it only in a comment marked REMOVED
        for line in src.split("\n"):
            if forbidden in line and "REMOVED" not in line and not line.lstrip().startswith("#"):
                raise AssertionError(
                    "synthesizing step still emitted mid-loop: %r" % line
                )


def test_no_mid_loop_banner_yield():
    """[Note] No verified rows banner must not appear as mid-loop message_delta yield.

    The pre-T5 mid-loop pattern was:
        banner = AgentStep(type="message_delta", content="[Note] No verified rows ...")
        yield banner

    After T5 this must be gone — the empty-boundset banner is applied at end-of-run
    via _apply_empty_boundset_banner, not yielded as a mid-loop message_delta.
    """
    src = _AE.read_text(encoding="utf-8")
    # The literal text appears in two places legitimately:
    #   - inside _apply_empty_boundset_banner (constant or builder)
    #   - inside _EMPTY_BOUNDSET_BANNER constant
    # It MUST NOT appear inside an AgentStep(type="message_delta", ...) construction
    # that's then yielded mid-loop.
    if "yield banner" in src:
        # If `banner` variable is constructed with the [Note] No verified rows text
        # nearby, fail.
        lines = src.split("\n")
        for i, l in enumerate(lines):
            if "yield banner" in l:
                window = "\n".join(lines[max(0, i - 15):i])
                if "No verified rows" in window:
                    raise AssertionError(
                        "Mid-loop banner yield with 'No verified rows' content "
                        f"still present near line {i + 1}"
                    )
