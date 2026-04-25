"""W2 Task 1b — sanitised disclosure builder for Ring 4 Gate C.

Translates an `EntityMismatch` into a typed `Interpretation` ready for
embedding in the `agent_checkpoint` SSE payload. The builder is the only
place where raw schema column names are converted to user-facing text;
downstream code MUST consume the typed `Interpretation` rather than build
prompts from raw columns directly.

Hardenings:
  * AMEND-W2-01 — column-name validator rejects identifiers that don't
                   match `^[A-Za-z_][A-Za-z0-9_]{0,63}$`, strips
                   control / bidi / format characters, caps length to 64,
                   and rejects the literal `</schema_mismatch_disclosure>`
                   marker.
  * AMEND-W2-38 — `Interpretation` is a typed dataclass with a `kind`
                   allowlist {schema_mismatch, budget_cap, unbound_claim}.
                   ValueError on unknown kind.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable, Optional

from schema_entity_mismatch import EntityMismatch


_VALID_KINDS: frozenset[str] = frozenset({
    "schema_mismatch",
    "budget_cap",
    "unbound_claim",
})

_VALID_OPTIONS_FOR_KIND: dict[str, tuple[str, ...]] = {
    "schema_mismatch": ("station_proxy", "abort"),
}

_COLUMN_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
_DISCLOSURE_TAG = "</schema_mismatch_disclosure>"


# Maps lowercased column name → human-readable phrase. Used to translate
# proxy column references into prose. Falls back to the column's category
# heuristic when the exact name is unknown.
_COLUMN_TO_PHRASE: dict[str, str] = {
    "member_casual": "user type (member vs casual)",
    "user_type":     "user type",
    "member_type":   "membership tier",
    "plan_type":     "subscription plan",
    "subscription_plan": "subscription plan",
    "account_type":  "account type",
    "customer_segment": "customer segment",
    "tier":          "customer tier",
}


@dataclass(frozen=True)
class Interpretation:
    """Typed wrapper for IntentEcho-card consent payloads (AMEND-W2-38).

    `kind` is validated against an allowlist on construction. Attempting to
    instantiate with an unknown kind raises ValueError so serializers and
    downstream consumers never see malformed records.
    """
    kind: str
    user_facing_text: str
    options: list[str] = field(default_factory=list)
    proxy_suggestion: Optional[str] = None

    def __post_init__(self) -> None:
        if self.kind not in _VALID_KINDS:
            raise ValueError(
                f"Interpretation.kind must be one of {sorted(_VALID_KINDS)}, "
                f"got {self.kind!r}"
            )
        expected = _VALID_OPTIONS_FOR_KIND.get(self.kind)
        if expected is not None and tuple(self.options) != expected:
            raise ValueError(
                f"Interpretation(kind={self.kind!r}) must have options "
                f"{list(expected)}, got {self.options!r}"
            )


# ---------------------------------------------------------------------------
# Column-name sanitisation (AMEND-W2-01)
# ---------------------------------------------------------------------------

def _strip_unsafe_chars(text: str) -> str:
    """Remove format/control/combining-mark characters used in homoglyph
    and bidi-override attacks."""
    return "".join(
        ch for ch in text
        if unicodedata.category(ch) not in ("Cf", "Cc", "Mn")
    )


def _is_safe_column_name(name: str) -> bool:
    if not isinstance(name, str):
        return False
    if not name or len(name) > 64:
        return False
    if _DISCLOSURE_TAG in name:
        return False
    cleaned = _strip_unsafe_chars(name)
    if cleaned != name:
        return False
    return bool(_COLUMN_NAME_RE.match(name))


def _safe_columns(columns: Iterable[str]) -> list[str]:
    return [c for c in columns if _is_safe_column_name(c)]


# ---------------------------------------------------------------------------
# Phrase translation
# ---------------------------------------------------------------------------

def _classify_column(col: str) -> str:
    """Map a safe column name to a generic human phrase when no exact entry
    exists in `_COLUMN_TO_PHRASE`."""
    cl = col.lower()
    if cl in _COLUMN_TO_PHRASE:
        return _COLUMN_TO_PHRASE[cl]
    if cl.startswith("start_station") or cl.startswith("end_station") or cl.endswith("station_id"):
        return "station-level grouping"
    if cl.endswith("_zip") or cl.endswith("_postal") or cl.endswith("_postcode"):
        return "postal-code grouping"
    if cl.endswith("_region") or cl.endswith("region_id"):
        return "regional grouping"
    if cl.endswith("_country") or cl.endswith("country_id"):
        return "country grouping"
    if cl.endswith("_city") or cl.endswith("city_id"):
        return "city-level grouping"
    if cl.endswith("_id"):
        return "aggregated grouping"
    return "aggregated grouping"


def _pick_proxy_phrase(safe_proxies: list[str]) -> Optional[str]:
    if not safe_proxies:
        return None
    # Prefer a categorical column over a fkey-id column for proxy phrasing.
    for col in safe_proxies:
        if col.lower() in _COLUMN_TO_PHRASE:
            return _classify_column(col)
    return _classify_column(safe_proxies[0])


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

class DisclosureBuilder:
    """Builds the consent-card `Interpretation` from an `EntityMismatch`.

    Stateless — instantiate once per process or per call; either is fine.
    """

    def build(
        self,
        mismatch: EntityMismatch,
        schema_columns: Iterable[str],
    ) -> Interpretation:
        # AMEND-W2-01: discard any column name that fails the validator before
        # it ever reaches user-facing text.
        safe_proxies_from_mismatch = _safe_columns(mismatch.proxy_suggestions)
        safe_schema = _safe_columns(schema_columns)

        # Proxy preference order: explicit suggestions from the detector,
        # then fall back to schema-wide candidates.
        candidates: list[str] = []
        for col in safe_proxies_from_mismatch + safe_schema:
            if col not in candidates:
                candidates.append(col)
        # Drop ID columns that would be the entity's own id (already known
        # absent) — but keep station/region/account fkeys.
        candidates = [c for c in candidates if not c.lower().endswith(
            ("ride_id", "trip_id", "event_id", "order_id", "transaction_id")
        )]
        # Restrict to proxy-shaped columns: foreign-key id columns or known
        # categorical phrase columns. Plain measure columns like `started_at`
        # are not proxies and must not produce "aggregated grouping" fallback.
        candidates = [
            c for c in candidates
            if c.lower().endswith("_id") or c.lower() in _COLUMN_TO_PHRASE
        ]

        proxy_phrase = _pick_proxy_phrase(candidates)

        canonical = mismatch.canonical
        if proxy_phrase:
            text = (
                f"This schema has no individual {canonical} identifier, so "
                f"per-{canonical} analysis isn't possible. We can fall back "
                f"to {proxy_phrase} as a proxy, or stop and let you "
                f"reconnect a schema with the right id column."
            )
        else:
            text = (
                f"This schema has no individual {canonical} identifier and "
                f"no clear group-by proxy. Continuing would require the "
                f"agent to invent a substitution — recommend aborting."
            )

        return Interpretation(
            kind="schema_mismatch",
            user_facing_text=text,
            options=["station_proxy", "abort"],
            proxy_suggestion=proxy_phrase,
        )
