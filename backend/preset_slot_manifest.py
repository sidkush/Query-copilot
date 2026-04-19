"""Python mirror of ``frontend/src/components/dashboard/modes/presets/slots.ts``.

Typed-Seeking-Spring Phase 2. The orchestrator walks this registry to
know which slots each themed preset exposes and what hint to feed the
LLM when picking a field. **Keep in sync with the frontend file** —
slot IDs, kinds, and hints are contracts the UI and backend both honour.

Connection-aware rewrite (Plan TSS2 T6): labels are generic — no
hard-coded industry labels. Label text derives from bound field context
at render time. Previously-hardcoded chrome regions (kicker / topbar /
footer / metadata / legend) are now declared here so autogen can fill
them instead of the JSX baking in placeholder strings.

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
        "id": "bp.kicker", "kind": "narrative", "label": "Kicker",
        "hint": (
            "Short uppercase kicker. Format: \"<DATASET> · BOARD PACK\" using "
            "the connection or dashboard label."
        ),
    },
    {
        "id": "bp.topbar-0", "kind": "kpi", "label": "Topbar metric 1",
        "hint": (
            "Top-bar compact metric #1 — any primary quantitative measure or "
            "COUNT(identifier). Label derives from field context."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.topbar-1", "kind": "kpi", "label": "Topbar metric 2",
        "hint": "Top-bar compact metric #2.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.topbar-2", "kind": "kpi", "label": "Topbar metric 3",
        "hint": "Top-bar compact metric #3.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.topbar-3", "kind": "kpi", "label": "Topbar metric 4",
        "hint": "Top-bar compact metric #4.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.topbar-4", "kind": "kpi", "label": "Topbar metric 5",
        "hint": "Top-bar compact metric #5.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.topbar-5", "kind": "kpi", "label": "Topbar metric 6",
        "hint": "Top-bar compact metric #6 (may be a COUNT).",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.hero-number", "kind": "kpi", "label": "Hero number",
        "hint": (
            "Primary headline KPI from the bound connection. A single dominant "
            "metric with a sign-aware delta."
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
        "id": "bp.kpi-0", "kind": "kpi", "label": "KPI 1",
        "hint": (
            "Primary summary metric from the bound connection. Label derives "
            "from field."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-1", "kind": "kpi", "label": "KPI 2",
        "hint": "Secondary summary metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-2", "kind": "kpi", "label": "KPI 3",
        "hint": (
            "Tertiary summary metric (often a rate or percent). Label derives "
            "from field."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-3", "kind": "kpi", "label": "KPI 4",
        "hint": "Ratio or composite metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.kpi-4", "kind": "kpi", "label": "KPI 5",
        "hint": "Duration or efficiency metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.trend-chart", "kind": "chart", "label": "Primary trend",
        "hint": (
            "12-period line trend of the primary quantitative metric with an "
            "optional forecast tail. One event dot in-series + one at the "
            "latest actual point."
        ),
        "chart_type": "line",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "bp.accounts-list", "kind": "table", "label": "Top entities",
        "hint": (
            "Top 5 entities (primary nominal dimension) ordered by the primary "
            "quantitative metric desc. Show name, value, and delta-vs-prior."
        ),
        "accept": ("nominal", "quantitative"),
    },
    {
        "id": "bp.strip-churn", "kind": "chart", "label": "Distribution strip",
        "hint": (
            "Histogram over the primary quantitative metric or a risk/score "
            "column, with the top bucket highlighted."
        ),
        "chart_type": "histogram",
        "accept": ("quantitative",),
    },
    {
        "id": "bp.strip-cohort", "kind": "chart", "label": "Cohort strip",
        "hint": (
            "Period-over-period retention or activity strip for the most "
            "recent cohort."
        ),
        "chart_type": "bar",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "bp.strip-insight", "kind": "narrative", "label": "Bottom-strip insight",
        "hint": (
            "One-paragraph insight tying the trend + top-entities list + "
            "distribution strip. End with a recommended next action."
        ),
    },
]

# ──────────────────────────────────────────────────────────────────
# Operator Console (CRT phosphor, wireframe 2)
# ──────────────────────────────────────────────────────────────────
OPERATOR_CONSOLE_SLOTS: List[SlotDescriptor] = [
    {
        "id": "oc.ch1a", "kind": "kpi", "label": "CH.1A",
        "hint": (
            "Primary quantitative metric rendered with unit suffix derived "
            "from field. Label derives from field."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "oc.ch1b", "kind": "kpi", "label": "CH.1B",
        "hint": "Secondary quantitative metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.ch1c", "kind": "kpi", "label": "CH.1C",
        "hint": (
            "Rate / percent metric. Negative deltas render amber. Label "
            "derives from field."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "oc.ch1d", "kind": "kpi", "label": "CH.1D",
        "hint": (
            "Duration or efficiency metric. WATCH footer when regressing. "
            "Label derives from field."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "oc.trace", "kind": "chart", "label": "CH.2 — Trace",
        "hint": (
            "12-period phosphor-green trace of the primary quantitative "
            "metric. Pass timeGrain=day/week if available for smooth line."
        ),
        "chart_type": "line",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "oc.trace-anomaly-callout", "kind": "narrative",
        "label": "Anomaly callout",
        "hint": (
            "Short red-framed callout tied to the largest period-over-period "
            "change in the trace. Three lines: \"ANOMALY · T+<delta>\", a "
            "sigma value, and a correlation hint."
        ),
    },
    {
        "id": "oc.histogram", "kind": "chart", "label": "CH.3 — Histogram",
        "hint": (
            "Gradient-green histogram over the primary quantitative range; "
            "top bins render red."
        ),
        "chart_type": "histogram",
        "accept": ("quantitative",),
    },
    {
        "id": "oc.event-log", "kind": "table", "label": "CH.4 — Event log",
        "hint": (
            "Last 8 material events (entity changes, threshold breaches, "
            "anomalies). Each row must carry one of OK / WARN / ERR."
        ),
        "accept": ("temporal", "nominal"),
    },
    {
        "id": "oc.footer", "kind": "narrative", "label": "Footer",
        "hint": (
            "Single compact line at the bottom of the console — status "
            "string such as \"UPLINK · OK\" and a last-refresh timestamp. "
            "Derive from runtime state."
        ),
    },
    {
        "id": "oc.metadata", "kind": "narrative", "label": "Metadata block",
        "hint": (
            "Top-right metadata block — rows such as \"CONN · <name>\", "
            "\"DATASET · <id>\", \"ROWS · <count>\". Derive from the bound "
            "connection."
        ),
    },
]

# ──────────────────────────────────────────────────────────────────
# Signal (modern dark SaaS, wireframe 3)
# ──────────────────────────────────────────────────────────────────
SIGNAL_SLOTS: List[SlotDescriptor] = [
    {
        "id": "sg.kpi-0", "kind": "kpi", "label": "KPI 1",
        "hint": (
            "Primary quantitative metric with a teal sparkline tracing the "
            "last 12 periods. Label derives from field."
        ),
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.kpi-1", "kind": "kpi", "label": "KPI 2",
        "hint": (
            "Secondary quantitative metric with an orange sparkline. Label "
            "derives from field."
        ),
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.kpi-2", "kind": "kpi", "label": "KPI 3",
        "hint": (
            "Rate / percent metric; rose sparkline; red delta pill when "
            "unfavourable. Label derives from field."
        ),
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.kpi-3", "kind": "kpi", "label": "KPI 4",
        "hint": (
            "Ratio or composite metric with an indigo sparkline. Label "
            "derives from field."
        ),
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "sg.stream-chart", "kind": "chart",
        "label": "Composition stream",
        "hint": (
            "Stacked-area chart of the primary quantitative metric broken "
            "down by the primary nominal dimension. 12 periods, "
            "daily-to-monthly grain as fits."
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
        "id": "sg.accounts", "kind": "table", "label": "Top entities",
        "hint": (
            "Top 5 entities by the primary quantitative metric. Each row has "
            "rank, entity name, category/segment subtitle, and value."
        ),
        "accept": ("nominal", "quantitative"),
    },
    {
        "id": "sg.legend-0", "kind": "kpi", "label": "Legend 1",
        "hint": (
            "Stream-chart legend item #1 — category name + current-period "
            "value for the first nominal slice."
        ),
        "accept": ("quantitative", "nominal"),
    },
    {
        "id": "sg.legend-1", "kind": "kpi", "label": "Legend 2",
        "hint": "Stream-chart legend item #2.",
        "accept": ("quantitative", "nominal"),
    },
    {
        "id": "sg.legend-2", "kind": "kpi", "label": "Legend 3",
        "hint": "Stream-chart legend item #3.",
        "accept": ("quantitative", "nominal"),
    },
    {
        "id": "sg.legend-3", "kind": "kpi", "label": "Legend 4",
        "hint": (
            "Stream-chart legend item #4 — may be an aggregated \"other\" "
            "bucket."
        ),
        "accept": ("quantitative", "nominal"),
    },
]

# ──────────────────────────────────────────────────────────────────
# Editorial Brief (magazine cream, wireframe 4)
# ──────────────────────────────────────────────────────────────────
EDITORIAL_BRIEF_SLOTS: List[SlotDescriptor] = [
    {
        "id": "eb.kicker", "kind": "narrative", "label": "Kicker",
        "hint": (
            "Short uppercase kicker. Format: \"<DATASET> · EDITORIAL BRIEF\" "
            "using the connection or dashboard label."
        ),
    },
    {
        "id": "eb.topbar-0", "kind": "kpi", "label": "Topbar metric 1",
        "hint": "Top-bar compact metric #1. Label derives from field context.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.topbar-1", "kind": "kpi", "label": "Topbar metric 2",
        "hint": "Top-bar compact metric #2.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.topbar-2", "kind": "kpi", "label": "Topbar metric 3",
        "hint": "Top-bar compact metric #3.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.topbar-3", "kind": "kpi", "label": "Topbar metric 4",
        "hint": "Top-bar compact metric #4.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.topbar-4", "kind": "kpi", "label": "Topbar metric 5",
        "hint": "Top-bar compact metric #5.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.topbar-5", "kind": "kpi", "label": "Topbar metric 6",
        "hint": "Top-bar compact metric #6 (may be a COUNT).",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.headline-topic", "kind": "narrative", "label": "Article headline",
        "hint": (
            "A period-summary headline in the magazine voice. Format: "
            "\"The [Period] [italic amber phrase] in [Timeframe]\". Italic "
            "phrase must reference the dominant story derived from the bound "
            "data (expansion / retention / acquisition / volume / efficiency)."
        ),
    },
    {
        "id": "eb.byline", "kind": "narrative", "label": "Byline",
        "hint": (
            "Author + reviewer line with a last-refresh timestamp. Derive "
            "author from connection owner and timestamp from runtime."
        ),
    },
    {
        "id": "eb.summary", "kind": "narrative", "label": "Summary paragraph",
        "hint": (
            "Two short paragraphs. First summarises the primary quantitative "
            "metrics. Second flags outliers with amber highlights on every "
            "figure."
        ),
    },
    {
        "id": "eb.kpi-0", "kind": "kpi", "label": "KPI 1",
        "hint": (
            "Primary quantitative metric, large serif numeral. Label derives "
            "from field."
        ),
        "accept": ("quantitative",),
    },
    {
        "id": "eb.kpi-1", "kind": "kpi", "label": "KPI 2",
        "hint": "Secondary quantitative metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.kpi-2", "kind": "kpi", "label": "KPI 3",
        "hint": "Rate / percent metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.kpi-3", "kind": "kpi", "label": "KPI 4",
        "hint": "Ratio or composite metric. Label derives from field.",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.trend", "kind": "chart", "label": "Primary trace",
        "hint": (
            "Line chart with amber event markers on the two most notable "
            "period-over-period changes + a dashed forecast tail."
        ),
        "chart_type": "line",
        "accept": ("temporal", "quantitative"),
    },
    {
        "id": "eb.accounts", "kind": "table", "label": "Top entities table",
        "hint": (
            "Top 8 entities by the primary quantitative metric with rank / "
            "name / value / delta columns."
        ),
        "accept": ("nominal", "quantitative"),
    },
    {
        "id": "eb.histogram", "kind": "chart", "label": "Distribution",
        "hint": (
            "Near-black histogram across the primary quantitative range, "
            "with amber bars on the high tail."
        ),
        "chart_type": "histogram",
        "accept": ("quantitative",),
    },
    {
        "id": "eb.commentary", "kind": "narrative", "label": "Analyst commentary",
        "hint": (
            "Two magazine-voice paragraphs. First paragraph starts with a "
            "drop-cap letter and covers the dominant story with amber inline "
            "highlights on figures. Second paragraph covers risk or outliers. "
            "Close with a small-caps \"RECOMMENDED NEXT:\" line listing 3 "
            "next actions."
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
