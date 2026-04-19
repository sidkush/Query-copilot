"""Python mirror of ``frontend/src/components/dashboard/modes/presets/slots.ts``.

Typed-Seeking-Spring Phase 2. The orchestrator walks this registry to
know which slots each themed preset exposes and what hint to feed the
LLM when picking a field. **Keep in sync with the frontend file** —
slot IDs, kinds, and hints are contracts the UI and backend both honour.

The Analyst Pro preset intentionally has no slot manifest; its autogen
reuses the existing DASHBOARD_PROMPT flow, not a fixed slot contract.
"""
from __future__ import annotations

from typing import Dict, List, Tuple, Optional, TypedDict


class SlotDescriptor(TypedDict, total=False):
    id: str
    kind: str              # 'kpi' | 'chart' | 'table' | 'narrative'
    label: str
    hint: str
    chart_type: Optional[str]   # 'line' | 'bar' | 'area' | 'stream' | 'histogram' | 'stacked-area'
    accept: Optional[Tuple[str, ...]]  # ('quantitative','temporal','nominal')


# ──────────────────────────────────────────────────────────────────
# Board Pack (cream editorial tearsheet, wireframe 1)
# ──────────────────────────────────────────────────────────────────
BOARD_PACK_SLOTS: List[SlotDescriptor] = [
    {
        "id": "bp.hero-number", "kind": "kpi", "label": "Hero number",
        "hint": (
            "Primary headline KPI. A single dominant metric with a sign-aware delta "
            "(e.g. net new MRR for the quarter)."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.hero-narrative", "kind": "narrative", "label": "Hero narrative",
        "hint": (
            "Two or three sentences explaining the hero number. Use {bp.hero-number}, "
            "{bp.accounts-list}, {bp.kpi-0} etc. as variables. End with a `Watch:` "
            "call-out for the primary risk."
        ),
    },
    {
        "id": "bp.kpi-0", "kind": "kpi", "label": "KPI 1 (MRR)",
        "hint": (
            "Monthly recurring revenue — SUM of primary revenue metric over the "
            "current month."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-1", "kind": "kpi", "label": "KPI 2 (ARR)",
        "hint": (
            "Annual recurring revenue — SUM of revenue metric over the last 12 months."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-2", "kind": "kpi", "label": "KPI 3 (Churn)",
        "hint": (
            "A churn or attrition metric rendered as a percent. Lower = better; "
            "delta in pp."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-3", "kind": "kpi", "label": "KPI 4 (LTV:CAC)",
        "hint": (
            "A ratio metric (LTV/CAC, or any ratio you want on this row). Render "
            "with `×` suffix."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-4", "kind": "kpi", "label": "KPI 5 (Payback)",
        "hint": (
            "A duration metric (months to payback or similar). Red delta when "
            "direction is unfavourable."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.trend-chart", "kind": "chart", "label": "Revenue trend",
        "hint": (
            "12-month line trend of the revenue metric with a forecast tail. One "
            "event dot in-series + one at the latest actual point."
        ),
        "chart_type": "line",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "bp.accounts-list", "kind": "table", "label": "Top accounts",
        "hint": (
            "Top 5 accounts (entity_name) ordered by primary revenue metric desc. "
            "Show name, value, and delta-vs-prior."
        ),
        "accept": ("nominal", "quantitative"),
    },
    {
        "id": "bp.strip-churn", "kind": "chart", "label": "Churn distribution",
        "hint": (
            "Risk-score histogram across the account base, with red bars for the "
            "top risk bucket."
        ),
        "chart_type": "histogram",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.strip-cohort", "kind": "chart", "label": "Cohort retention",
        "hint": "Monthly retention strip for the most recent cohort.",
        "chart_type": "bar",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "bp.strip-insight", "kind": "narrative", "label": "Bottom-strip insight",
        "hint": (
            "One-paragraph business insight tying the trend + accounts list + churn "
            "histogram. End with a recommended next action."
        ),
    },
]

# ──────────────────────────────────────────────────────────────────
# Operator Console (CRT phosphor, wireframe 2)
# ──────────────────────────────────────────────────────────────────
OPERATOR_CONSOLE_SLOTS: List[SlotDescriptor] = [
    {
        "id": "oc.ch1a", "kind": "kpi", "label": "CH.1A — MRR channel",
        "hint": "Primary revenue metric rendered with unit suffix (M$, K, etc.).",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.ch1b", "kind": "kpi", "label": "CH.1B — ARR channel",
        "hint": "Annualised revenue metric.",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.ch1c", "kind": "kpi", "label": "CH.1C — Churn channel",
        "hint": "Percent churn / attrition. Negative deltas render amber.",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.ch1d", "kind": "kpi", "label": "CH.1D — Payback channel",
        "hint": "A time-to-recovery metric (months). WATCH footer when regressing.",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.trace", "kind": "chart", "label": "CH.2 — Revenue trace",
        "hint": (
            "12-month phosphor-green trace of the revenue metric. Pass "
            "timeGrain=day/week if available for smooth line."
        ),
        "chart_type": "line",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "oc.trace-anomaly-callout", "kind": "narrative",
        "label": "Anomaly callout",
        "hint": (
            "Short red-framed callout tied to the largest week-over-week change "
            "in the trace. Three lines: \"ANOMALY · T+<delta>\", the sigma value, "
            "and a correlation hint."
        ),
    },
    {
        "id": "oc.histogram", "kind": "chart", "label": "CH.3 — Risk histogram",
        "hint": (
            "Gradient-green histogram over the 0–95+ risk-score range; top bins "
            "render red."
        ),
        "chart_type": "histogram",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.event-log", "kind": "table", "label": "CH.4 — Event log",
        "hint": (
            "Last 8 material events (account expansions, churn warnings, pipeline "
            "anomalies). Each row must carry one of OK / WARN / ERR."
        ),
        "accept": ("temporal", "nominal"),
    },
]

# ──────────────────────────────────────────────────────────────────
# Signal (modern dark SaaS, wireframe 3)
# ──────────────────────────────────────────────────────────────────
SIGNAL_SLOTS: List[SlotDescriptor] = [
    {
        "id": "sg.kpi-0", "kind": "kpi", "label": "KPI 1 (MRR, teal)",
        "hint": "Primary MRR metric with a teal sparkline tracing the last 12 periods.",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.kpi-1", "kind": "kpi", "label": "KPI 2 (ARR, orange)",
        "hint": "Annualised revenue metric with an orange sparkline.",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.kpi-2", "kind": "kpi", "label": "KPI 3 (Churn, rose)",
        "hint": "Churn percent; rose sparkline; red delta pill.",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.kpi-3", "kind": "kpi", "label": "KPI 4 (LTV:CAC, indigo)",
        "hint": "A ratio metric with an indigo sparkline.",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.stream-chart", "kind": "chart",
        "label": "Revenue composition stream",
        "hint": (
            "Stacked-area chart of revenue broken down by primary dimension "
            "(segment/plan/region). 12 months, daily-to-monthly grain as fits."
        ),
        "chart_type": "stacked-area",
        "accept": ("temporal", "quantitative", "nominal"),
    },
    {
        "id": "sg.signal-card", "kind": "narrative", "label": "Signal Detected card",
        "hint": (
            "A 'SIGNAL DETECTED · <minutes> AGO' card highlighting the single most "
            "notable change across the dashboard. Two sentences + a teal "
            "recommendation."
        ),
    },
    {
        "id": "sg.accounts", "kind": "table", "label": "Top accounts",
        "hint": (
            "Top 5 accounts by primary revenue metric. Each row has rank, entity "
            "name, industry/segment subtitle, and value."
        ),
        "accept": ("nominal", "quantitative"),
    },
]

# ──────────────────────────────────────────────────────────────────
# Editorial Brief (magazine cream, wireframe 4)
# ──────────────────────────────────────────────────────────────────
EDITORIAL_BRIEF_SLOTS: List[SlotDescriptor] = [
    {
        "id": "eb.headline-topic", "kind": "narrative", "label": "Article headline",
        "hint": (
            "A quarter-summary headline in the magazine voice. Format: "
            "\"The Quarter [italic amber phrase] in [Month]\". Italic phrase must "
            "reference the quarter's dominant story (expansion / retention / acquisition)."
        ),
    },
    {
        "id": "eb.byline", "kind": "narrative", "label": "Byline",
        "hint": "Author + reviewer line with a last-refresh timestamp.",
    },
    {
        "id": "eb.summary", "kind": "narrative", "label": "Summary paragraph",
        "hint": (
            "Two short paragraphs. First summarises revenue + NRR + GM. Second "
            "flags risk accounts with amber highlights on every figure."
        ),
    },
    {
        "id": "eb.kpi-0", "kind": "kpi", "label": "KPI 1 (MRR)",
        "hint": "Primary revenue metric, large serif numeral.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.kpi-1", "kind": "kpi", "label": "KPI 2 (ARR)",
        "hint": "Annualised revenue.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.kpi-2", "kind": "kpi", "label": "KPI 3 (Gross churn)",
        "hint": "Gross churn percent.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.kpi-3", "kind": "kpi", "label": "KPI 4 (LTV:CAC)",
        "hint": "Ratio metric.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.trend", "kind": "chart", "label": "Revenue 12-month trace",
        "hint": (
            "Line chart with amber event markers on the two most notable "
            "month-over-month changes + a dashed forecast tail."
        ),
        "chart_type": "line",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "eb.accounts", "kind": "table", "label": "Top accounts table",
        "hint": "Top 8 accounts by revenue with # / name / MRR / Δ QoQ columns.",
        "accept": ("nominal", "quantitative"),
    },
    {
        "id": "eb.histogram", "kind": "chart", "label": "Churn risk distribution",
        "hint": (
            "Near-black histogram across account churn-risk bins, with amber bars "
            "on the high-risk tail (85+/90+/95+)."
        ),
        "chart_type": "histogram",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.commentary", "kind": "narrative", "label": "Analyst commentary",
        "hint": (
            "Two magazine-voice paragraphs. First paragraph starts with a drop-cap "
            "letter and covers the quarter's expansion story with amber inline "
            "highlights on figures. Second paragraph covers risk. Close with a "
            "small-caps \"RECOMMENDED NEXT:\" line listing 3 next actions."
        ),
    },
]

# ──────────────────────────────────────────────────────────────────
# Registry
# ──────────────────────────────────────────────────────────────────
PRESET_SLOTS: Dict[str, List[SlotDescriptor]] = {
    "analyst-pro": [],
    "board-pack": BOARD_PACK_SLOTS,
    "operator-console": OPERATOR_CONSOLE_SLOTS,
    "signal": SIGNAL_SLOTS,
    "editorial-brief": EDITORIAL_BRIEF_SLOTS,
}

THEMED_PRESET_IDS: Tuple[str, ...] = (
    "board-pack", "operator-console", "signal", "editorial-brief",
)


def get_slots_for_preset(preset_id: str) -> List[SlotDescriptor]:
    return PRESET_SLOTS.get(preset_id, [])


def get_slot_descriptor(preset_id: str, slot_id: str) -> Optional[SlotDescriptor]:
    for s in get_slots_for_preset(preset_id):
        if s["id"] == slot_id:
            return s
    return None


__all__ = [
    "SlotDescriptor",
    "PRESET_SLOTS",
    "THEMED_PRESET_IDS",
    "get_slots_for_preset",
    "get_slot_descriptor",
]
