"""Ring 4 — IntentEcho card + SSE payload.

The card emerges between SQL generation and answer streaming. It surfaces:
  - the operational definition the agent chose (cohort, baseline, metric),
  - unmapped clauses from the user's NL,
  - optional alternative interpretations (mandatory-choice mode).

Firing modes:
  AUTO_PROCEED     — ambiguity <= ECHO_AMBIGUITY_AUTO_PROCEED_MAX
  PROCEED_BUTTON   — between the two thresholds
  MANDATORY_CHOICE — ambiguity >= ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class EchoMode(Enum):
    AUTO_PROCEED = "auto_proceed"
    PROCEED_BUTTON = "proceed_button"
    MANDATORY_CHOICE = "mandatory_choice"


class InteractionMode(Enum):
    INTERACTIVE = "interactive"
    VOICE = "voice"
    SCHEDULED = "scheduled"
    BULK = "bulk"
    EMBEDDED = "embedded"


@dataclass(frozen=True)
class Interpretation:
    id: str
    text: str
    details: dict = field(default_factory=dict)


@dataclass(frozen=True)
class IntentEchoCard:
    mode: EchoMode
    ambiguity: float
    operational_definition: str
    interpretations: list
    warnings: list
    clause_inventory: list
    tables_touched: list
    banner: str | None = None
    tts_readback: bool = False


def _resolve_mode(ambiguity: float) -> EchoMode:
    try:
        from config import settings
        lo = settings.ECHO_AMBIGUITY_AUTO_PROCEED_MAX
        hi = settings.ECHO_AMBIGUITY_MANDATORY_CHOICE_MIN
    except Exception:
        lo, hi = 0.3, 0.7
    if ambiguity <= lo:
        return EchoMode.AUTO_PROCEED
    if ambiguity >= hi:
        return EchoMode.MANDATORY_CHOICE
    return EchoMode.PROCEED_BUTTON


def _canonical_interpretations(clauses: list) -> list:
    """Produce 2-3 alternative interpretations for mandatory-choice mode."""
    out = []
    for c in clauses:
        if c.kind == "metric" and ("churn" in c.text.lower() or "retention" in c.text.lower()):
            out.extend([
                Interpretation(id="churn_30", text="Churn = no activity within 30 days", details={"window_days": 30}),
                Interpretation(id="churn_60", text="Churn = no activity within 60 days", details={"window_days": 60}),
                Interpretation(id="churn_90", text="Churn = no activity within 90 days", details={"window_days": 90}),
            ])
            break
    if not out:
        out = [
            Interpretation(id="default", text="Use the default interpretation"),
            Interpretation(id="strict",  text="Require exact NL terms to match SQL"),
        ]
    return out


def build_echo(
    nl: str,
    sql: str,
    ambiguity: float,
    clauses: list,
    unmapped: list,
    tables_touched: list,
    interaction_mode: InteractionMode = InteractionMode.INTERACTIVE,
) -> IntentEchoCard:
    mode = _resolve_mode(ambiguity)
    warnings = [f"Clause '{c.text}' had no SQL counterpart" for c in unmapped]

    banner = None
    tts_readback = False

    if interaction_mode in {InteractionMode.SCHEDULED, InteractionMode.BULK, InteractionMode.EMBEDDED}:
        if mode is not EchoMode.AUTO_PROCEED:
            banner = (
                f"Interpretation unconfirmed (ambiguity={ambiguity:.2f}). "
                f"Running with widest defensible scope because this path is non-interactive."
            )
            mode = EchoMode.AUTO_PROCEED

    if interaction_mode is InteractionMode.VOICE:
        try:
            from config import settings
            threshold = settings.VOICE_MODE_READBACK_AMBIGUITY_MIN
        except Exception:
            threshold = 0.5
        tts_readback = ambiguity >= threshold

    if mode is EchoMode.MANDATORY_CHOICE:
        interpretations = _canonical_interpretations(clauses)
    elif mode is EchoMode.PROCEED_BUTTON:
        interpretations = [Interpretation(id="proceed", text="Proceed with current interpretation")]
    else:
        interpretations = []

    op_def_bits = [f"{c.kind}={c.text}" for c in clauses]
    operational_definition = "; ".join(op_def_bits) or f"SELECT from {', '.join(tables_touched) or 'schema'}"

    return IntentEchoCard(
        mode=mode,
        ambiguity=round(ambiguity, 3),
        operational_definition=operational_definition,
        interpretations=interpretations,
        warnings=warnings,
        clause_inventory=list(clauses),
        tables_touched=list(tables_touched),
        banner=banner,
        tts_readback=tts_readback,
    )


def echo_to_sse_payload(card: IntentEchoCard) -> dict:
    """Serializer for the agent SSE stream. SSE event type: 'intent_echo'"""
    return {
        "mode": card.mode.value,
        "ambiguity": card.ambiguity,
        "operational_definition": card.operational_definition,
        "interpretations": [
            {"id": i.id, "text": i.text, "details": i.details} for i in card.interpretations
        ],
        "warnings": list(card.warnings),
        "tables_touched": list(card.tables_touched),
        "banner": card.banner,
        "tts_readback": card.tts_readback,
    }
