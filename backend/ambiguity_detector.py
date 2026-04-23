"""Ring 4 — deterministic AmbiguityDetector.

Deterministic first. LLM second opinion (Phase D+) gated on gray zone.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


_FUZZY_TERMS = {
    "churn", "retention", "engagement", "engaged", "loyalty",
    "lifetime value", "ltv", "cohort", "funnel", "conversion",
    "attrition", "dropout", "revenue recognition", "arr", "mrr",
}

_MULTI_MEANING_VERBS = {
    "active", "running", "closed", "open", "completed",
    "pending", "approved", "resolved", "stale", "expired",
}

_TEMPORAL_HINTS = {
    "today", "yesterday", "this week", "last week", "this month",
    "last month", "this quarter", "last quarter", "this year",
    "last year", "ytd", "mtd", "qtd", "recent", "recently",
}

_EXPLICIT_DATE_RE = re.compile(
    r"\b(20\d{2}[-/]?\d{0,2}[-/]?\d{0,2}|q[1-4]\s?20\d{2}|\d{1,2}\s(days?|weeks?|months?|years?))\b",
    re.IGNORECASE,
)

_COMPARATIVE_WORDS = {"better", "worse", "faster", "slower", "more", "fewer", "higher", "lower"}


@dataclass(frozen=True)
class AmbiguityFeatures:
    has_fuzzy_term: bool
    missing_temporal: bool
    multi_meaning_verb: bool
    cohort_implicit: bool
    baseline_implicit: bool


def _extract_features(nl: str, sql: str, tables_touched) -> AmbiguityFeatures:
    lc = nl.lower()
    has_fuzzy = any(term in lc for term in _FUZZY_TERMS)
    has_temporal_hint = any(h in lc for h in _TEMPORAL_HINTS) or bool(_EXPLICIT_DATE_RE.search(lc))
    has_multi_verb = any(v in lc.split() for v in _MULTI_MEANING_VERBS)
    cohort_implicit = (" users who " in lc or " customers who " in lc) and not has_temporal_hint
    baseline_implicit = any(w in lc.split() for w in _COMPARATIVE_WORDS) and "than" not in lc
    return AmbiguityFeatures(
        has_fuzzy_term=has_fuzzy,
        missing_temporal=(not has_temporal_hint and any(
            tk in lc for tk in ("recent", "latest", "recently")
        )),
        multi_meaning_verb=has_multi_verb,
        cohort_implicit=cohort_implicit,
        baseline_implicit=baseline_implicit,
    )


_WEIGHTS = {
    "has_fuzzy_term":     0.45,
    "missing_temporal":   0.30,
    "multi_meaning_verb": 0.20,
    "cohort_implicit":    0.25,
    "baseline_implicit":  0.20,
}


def _deterministic_score(f: AmbiguityFeatures) -> float:
    raw = 0.0
    for name, weight in _WEIGHTS.items():
        if getattr(f, name):
            raw += weight
    return max(0.0, min(1.0, raw))


def score_ambiguity(nl: str, sql: str, tables_touched) -> float:
    """Return a value in [0, 1]. Higher is more ambiguous."""
    features = _extract_features(nl, sql, tables_touched or [])
    return _deterministic_score(features)
