"""Tier 4 Routing V2 (2026-04-27, post model-distribution audit).

Audit on main_150_v3 found Haiku wrote SQL on 100% of 149 questions; Sonnet
was configured for plan_emit only and never wrote run_sql tool_input.
V2 routing has 3 layers — see config.FEATURE_MODEL_ROUTING_V2.

  Layer 1 — STATIC: Sonnet primary instead of Haiku
  Layer 2 — HARD-QUESTION: NL signals complexity → Opus on iter 0
  Layer 3 — ADAPTIVE STRUGGLE: 2+ run_sql errors / Gate-C / cascade → Opus

Build behind FEATURE_MODEL_ROUTING_V2 flag, default OFF, BENCHMARK_MODE coerces ON.
NO benchmark run yet — Sid signoff required for cost ($4 → $12-18 per main 150).
"""
from unittest.mock import MagicMock, patch


def _build_engine(routing_v2=False, benchmark=False):
    """Construct minimal AgentEngine with controlled flags + struggle counters."""
    from agent_engine import AgentEngine
    eng = AgentEngine.__new__(AgentEngine)
    eng.primary_model = "claude-haiku-4-5-20251001"
    eng.fallback_model = "claude-sonnet-4-6"
    eng._consecutive_logic_errors = 0
    eng._benchmark_gate_c_bypass_count = 0
    eng._benchmark_cascade_bypass_count = 0
    return eng


def _patch_settings(routing_v2=False, benchmark=False):
    """Return a context manager patching settings flags."""
    import agent_engine as ae
    p = patch.object(ae, "settings")
    return p


# ── Layer 1: STATIC routing ──────────────────────────────────


def test_v2_off_returns_primary_model():
    """When FEATURE_MODEL_ROUTING_V2=False AND BENCHMARK_MODE=False, the agent
    keeps its legacy primary_model (Haiku). Production must remain Haiku-primary."""
    eng = _build_engine()
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = False
        mock_s.BENCHMARK_MODE = False
        out = eng._select_model_for_iteration("Simple question", iteration_count=0)
    assert out == "claude-haiku-4-5-20251001"


def test_v2_on_returns_sonnet_primary_for_simple_question():
    """V2 ON + simple question (short NL, no link words) + no struggle →
    Sonnet primary. This is the core lift mechanism per audit finding."""
    eng = _build_engine()
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration("How many users", iteration_count=0)
    assert out == "claude-sonnet-4-6"


def test_benchmark_mode_coerces_v2_on():
    """BENCHMARK_MODE=True coerces Routing V2 ON via OR check, mirroring
    the established Wave 1/2/3 + Phase C coercion pattern."""
    eng = _build_engine()
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = False  # explicit feature flag off
        mock_s.BENCHMARK_MODE = True             # but benchmark coerces ON
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration("How many users", iteration_count=0)
    assert out == "claude-sonnet-4-6"


# ── Layer 2: HARD-QUESTION initial escalation ─────────────────


def test_long_question_escalates_to_opus_on_iter_0():
    """Layer 2: questions ≥ MODEL_ROUTING_V2_HARD_QUESTION_LEN chars escalate
    to Opus on iteration 0. Empirically, long BIRD questions correlate with
    multi-step requirements that benefit from Opus reasoning."""
    eng = _build_engine()
    import agent_engine as ae
    long_q = "x" * 250  # > 200 default threshold
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration(long_q, iteration_count=0)
    assert out == "claude-opus-4-7-1m-20260115"


def test_multi_entity_question_escalates_to_opus():
    """Layer 2: NL with ≥2 link words ('and', 'between', 'with', 'by',
    'for each', 'across') signals multi-table query → Opus."""
    eng = _build_engine()
    import agent_engine as ae
    multi_entity = "Which players and clubs participated between 2010 and 2015"
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration(multi_entity, iteration_count=0)
    assert out == "claude-opus-4-7-1m-20260115"


def test_layer_2_does_not_fire_after_iter_0():
    """Layer 2 (initial escalation) only applies to iteration 0. On later
    iterations, layer 1 (static Sonnet) takes over unless layer 3 struggle
    triggers fire."""
    eng = _build_engine()
    import agent_engine as ae
    long_q = "x" * 250  # would trigger layer 2 if iter==0
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out_iter5 = eng._select_model_for_iteration(long_q, iteration_count=5)
    assert out_iter5 == "claude-sonnet-4-6", (
        f"iter 5: layer 2 should not fire; got {out_iter5}"
    )


# ── Layer 3: ADAPTIVE STRUGGLE escalation ─────────────────────


def test_consecutive_errors_escalate_to_opus():
    """Layer 3: ≥ MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD consecutive
    run_sql errors → Opus. Catches sql_logic struggle in real time."""
    eng = _build_engine()
    eng._consecutive_logic_errors = 2  # at threshold
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration("any question", iteration_count=3)
    assert out == "claude-opus-4-7-1m-20260115"


def test_gate_c_bypass_escalates_to_opus_in_benchmark():
    """Layer 3: when BENCHMARK_MODE bypassed Gate-C (schema-entity-mismatch),
    escalate to Opus — bypass means agent committed without clarification,
    so heavier reasoning compensates for lost product safeguard."""
    eng = _build_engine()
    eng._benchmark_gate_c_bypass_count = 1
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = False  # not the trigger
        mock_s.BENCHMARK_MODE = True             # but benchmark bypass active
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration("any q", iteration_count=2)
    assert out == "claude-opus-4-7-1m-20260115"


def test_cascade_bypass_escalates_to_opus():
    """Layer 3: cascade bypass (run_sql error cascade resolved 'summarize')
    → Opus next iteration. The cascade is a strong struggle signal."""
    eng = _build_engine()
    eng._benchmark_cascade_bypass_count = 1
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7-1m-20260115"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        # Opus enabled by default in tests that need to verify L2/L3 logic.
        # Tests for the "Opus disabled" path override this explicitly.
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = True
        out = eng._select_model_for_iteration("q", iteration_count=4)
    assert out == "claude-opus-4-7-1m-20260115"


# ── Multi-entity heuristic edge cases ─────────────────────────


def test_single_link_word_does_not_escalate():
    """Layer 2 multi-entity heuristic requires ≥2 link words. Single 'and'
    is too noisy a signal to fire on its own."""
    from agent_engine import AgentEngine
    eng = AgentEngine.__new__(AgentEngine)
    assert eng._is_multi_entity_question("x and y") is False
    assert eng._is_multi_entity_question("between x and y") is True  # 2 link words
    assert eng._is_multi_entity_question("x with y by z") is True   # 2 link words


def test_empty_question_no_escalation():
    """Defensive: empty/None question shouldn't crash heuristic."""
    from agent_engine import AgentEngine
    eng = AgentEngine.__new__(AgentEngine)
    assert eng._is_multi_entity_question("") is False
    assert eng._is_multi_entity_question(None) is False


# ── Integration check: run() loop wiring ──────────────────────


def test_opus_disabled_keeps_sonnet_even_with_struggle_signals():
    """Post main_150_routing_v2 (2026-04-27): Opus 4.7 1M ID returned 404,
    cascading 57 questions to no_sql. MODEL_ROUTING_V2_OPUS_ENABLED defaults
    to False to disable Layer 2 + Layer 3 entirely until Opus model ID is
    verified valid. With opus_enabled=False, even loud struggle signals
    (errors, Gate-C, cascade) should keep Sonnet primary, not escalate."""
    eng = _build_engine()
    eng._consecutive_logic_errors = 5  # would normally trigger L3
    eng._benchmark_gate_c_bypass_count = 3
    eng._benchmark_cascade_bypass_count = 2
    import agent_engine as ae
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = True
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = False  # Opus gated OFF
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        out = eng._select_model_for_iteration("any q", iteration_count=4)
    assert out == "claude-sonnet-4-6", (
        f"opus_enabled=False must keep Sonnet primary regardless of struggle; "
        f"got {out}"
    )


def test_opus_disabled_keeps_sonnet_for_long_question():
    """opus_enabled=False: long question (Layer 2 trigger) stays Sonnet primary."""
    eng = _build_engine()
    import agent_engine as ae
    long_q = "x" * 250  # > 200 default — would trigger Layer 2
    with patch.object(ae, "settings") as mock_s:
        mock_s.FEATURE_MODEL_ROUTING_V2 = True
        mock_s.BENCHMARK_MODE = False
        mock_s.MODEL_ROUTING_V2_OPUS_ENABLED = False
        mock_s.MODEL_ROUTING_V2_PRIMARY = "claude-sonnet-4-6"
        mock_s.MODEL_ROUTING_V2_HARD = "claude-opus-4-7"
        mock_s.MODEL_ROUTING_V2_HARD_QUESTION_LEN = 200
        mock_s.MODEL_ROUTING_V2_STRUGGLE_ERROR_THRESHOLD = 2
        out = eng._select_model_for_iteration(long_q, iteration_count=0)
    assert out == "claude-sonnet-4-6"


def test_default_opus_model_id_is_standard_not_1m():
    """Sid's correction (2026-04-27): MODEL_ROUTING_V2_HARD must be standard
    Opus 4.7, NOT the 1M context variant. The 1M variant returned 404 on
    every escalation attempt during main_150_routing_v2."""
    from config import settings
    assert "1m" not in settings.MODEL_ROUTING_V2_HARD.lower(), (
        f"MODEL_ROUTING_V2_HARD must not be the 1M variant; "
        f"got {settings.MODEL_ROUTING_V2_HARD!r}"
    )
    assert "opus" in settings.MODEL_ROUTING_V2_HARD.lower()


def test_run_loop_uses_select_model_helper():
    """Source-level check: the run() loop calls _select_model_for_iteration
    instead of `model = self.primary_model`. Pre-fix, primary_model was a
    static Haiku binding (audit found 100% Haiku). V2 wiring must replace
    that line with the helper call."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # The static binding must NOT be the only path
    assert "model = self._select_model_for_iteration(" in src
    # And iteration counter must be tracked
    assert "_routing_iteration" in src


def test_run_loop_re_selects_per_iteration():
    """Source-level check: per-iteration re-selection is wired so that
    layer 3 (adaptive struggle) can escalate mid-question."""
    import agent_engine as ae
    src = open(ae.__file__, encoding="utf-8").read()
    # Per-iteration re-selection guard
    assert "if _routing_iteration > 0:" in src
    # Re-selection call inside while loop
    assert "Routing V2: iteration=%d model %s -> %s" in src
