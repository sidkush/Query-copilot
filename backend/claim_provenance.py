"""Phase L — ClaimProvenance. Binds numeric claims in synthesis to tool-results."""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Optional

_NUMBER_RE = re.compile(r"(?P<value>\d+(?:\.\d+)?)(?P<suffix>%?)")
_YEAR_RE = re.compile(r"^(19|20)\d{2}$")

@dataclass(frozen=True)
class NumericSpan:
    value: str
    suffix: str
    start: int
    end: int

def extract_numeric_spans(text: str) -> list:
    spans = []
    for m in _NUMBER_RE.finditer(text):
        val = m.group("value")
        if "." not in val and _YEAR_RE.match(val):
            continue
        spans.append(NumericSpan(value=val, suffix=m.group("suffix") or "", start=m.start(), end=m.end()))
    return spans

def match_claim(value: str, recent_rowsets: list) -> Optional[str]:
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
    for rowset in recent_rowsets:
        for row in rowset.get("rows", []):
            for cell in row:
                try:
                    if target_int is not None and int(cell) == target_int:
                        return rowset.get("query_id")
                except (ValueError, TypeError):
                    pass
                try:
                    if abs(float(cell) - target_float) < 1e-6:
                        return rowset.get("query_id")
                except (ValueError, TypeError):
                    pass
    return None

class ClaimProvenance:
    def __init__(self, unverified_marker: str = "[unverified]"):
        self._marker = unverified_marker

    def bind(self, synthesis_text: str, recent_rowsets: list) -> str:
        spans = extract_numeric_spans(synthesis_text)
        if not spans:
            return synthesis_text
        out = []
        cursor = 0
        for span in spans:
            out.append(synthesis_text[cursor:span.end])
            qid = match_claim(span.value, recent_rowsets)
            if qid is None:
                out.append(" " + self._marker)
            cursor = span.end
        out.append(synthesis_text[cursor:])
        return "".join(out)
