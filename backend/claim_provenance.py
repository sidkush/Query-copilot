"""Phase L — ClaimProvenance. Binds numeric claims in synthesis to tool-results.

Hardening (S3, 2026-04-24 adversarial):
- NFKC-normalize synthesis text before regex so fullwidth digits / superscripts
  cannot bypass provenance check.
- `match_claim` accepts optional `allowed_query_ids` so the agent loop can
  restrict matching to the rowsets produced in the current synthesis turn,
  preventing a foreign-rowset value from counting as verification.
- `bind()` caps the number of spans checked per synthesis
  (`CLAIM_PROVENANCE_MAX_SPANS_PER_SYNTH`). Extra spans render unverified
  by default — eliminates adversarial DoS via 1000-number prompt.
"""
from __future__ import annotations
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Optional

_NUMBER_RE = re.compile(r"(?P<value>\d+(?:\.\d+)?)(?P<suffix>%?)")
_YEAR_RE = re.compile(r"^(19|20)\d{2}$")

_DEFAULT_MAX_SPANS = 50


def _nfkc(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "")


@dataclass(frozen=True)
class NumericSpan:
    value: str
    suffix: str
    start: int
    end: int


def extract_numeric_spans(text: str) -> list:
    norm = _nfkc(text)
    spans = []
    for m in _NUMBER_RE.finditer(norm):
        val = m.group("value")
        if "." not in val and _YEAR_RE.match(val):
            continue
        spans.append(NumericSpan(value=val, suffix=m.group("suffix") or "", start=m.start(), end=m.end()))
    return spans


def match_claim(
    value: str,
    recent_rowsets: list,
    allowed_query_ids: Optional[Iterable[str]] = None,
) -> Optional[str]:
    try:
        target_int = int(value)
    except ValueError:
        try:
            target_float = float(value)
            target_int = None
        except ValueError:
            return None
    else:
        target_float = float(target_int)
    allow = set(allowed_query_ids) if allowed_query_ids is not None else None
    for rowset in recent_rowsets:
        qid = rowset.get("query_id")
        if allow is not None and qid not in allow:
            continue
        for row in rowset.get("rows", []):
            for cell in row:
                try:
                    if target_int is not None and int(cell) == target_int:
                        return qid
                except (ValueError, TypeError):
                    pass
                try:
                    if abs(float(cell) - target_float) < 1e-6:
                        return qid
                except (ValueError, TypeError):
                    pass
    return None


class ClaimProvenance:
    def __init__(
        self,
        unverified_marker: str = "[unverified]",
        max_spans: int = _DEFAULT_MAX_SPANS,
    ):
        self._marker = unverified_marker
        self._max_spans = max(1, int(max_spans))

    def bind(
        self,
        synthesis_text: str,
        recent_rowsets: list,
        allowed_query_ids: Optional[Iterable[str]] = None,
    ) -> str:
        normalized = _nfkc(synthesis_text)
        spans = extract_numeric_spans(normalized)
        if not spans:
            return normalized
        out = []
        cursor = 0
        for i, span in enumerate(spans):
            out.append(normalized[cursor:span.end])
            if i < self._max_spans:
                qid = match_claim(
                    span.value,
                    recent_rowsets,
                    allowed_query_ids=allowed_query_ids,
                )
            else:
                qid = None  # past the cap, auto-unverified
            if qid is None:
                out.append(" " + self._marker)
            cursor = span.end
        out.append(normalized[cursor:])
        return "".join(out)
