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

T2 (2026-04-26):
- `MAX_SYNTHESIS_BYTES` cap at bind() entry — never run unbounded scans.
- Locale-aware number regex: comma/underscore/space-separated thousands
  ("5,432") plus k/m/b/% suffixes parsed and applied to the comparison.
- Eastern Arabic (٠-٩), Extended Arabic-Indic (۰-۹), and Devanagari (०-९)
  digits normalized to ASCII before regex.
- `bind()` is wrapped in try/except — any exception marks the result
  unverified and logs, so a buggy bind never crashes the agent run.
"""
from __future__ import annotations
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Optional

_logger = logging.getLogger(__name__)

# T2 — hard cap on text scanned per bind() call. 256 KB is far above any
# realistic synthesis (Anthropic responses cap ~32 KB) but well below
# anything that would stall the regex.
MAX_SYNTHESIS_BYTES = 256_000

# T2 — locale-aware number extractor.
#   sign:    optional leading minus
#   value:   either thousands-grouped (5,432 / 5_432) with optional decimal,
#            OR a plain decimal number (42 / 42.5 / 42,5 european-style).
#   suffix:  one of % k K m M b B
# NOTE: space is intentionally NOT a thousands separator — it would consume
# adjacent unrelated numbers ("99 100" → "99100").
_NUMBER_RE = re.compile(
    r"(?P<sign>-?)"
    r"(?P<value>\d{1,3}(?:[,_]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)"
    r"(?P<suffix>[%kKmMbB]?)"
)
_YEAR_RE = re.compile(r"^(19|20)\d{2}$")

_DEFAULT_MAX_SPANS = 50

# T2 — multipliers for k/m/b suffixes when comparing span to cell.
_SUFFIX_MULTIPLIER = {
    "": 1.0,
    "k": 1_000.0,
    "K": 1_000.0,
    "m": 1_000_000.0,
    "M": 1_000_000.0,
    "b": 1_000_000_000.0,
    "B": 1_000_000_000.0,
}


def _nfkc(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "")


def _normalize_digits(text: str) -> str:
    """T2 — convert non-ASCII digit blocks to ASCII so the regex sees `5432`
    instead of `٥٤٣٢`. NFKC alone doesn't fold these (they're separate scripts,
    not compatibility characters)."""
    if not text:
        return text or ""
    out_chars = []
    for ch in text:
        cp = ord(ch)
        if 0x0660 <= cp <= 0x0669:  # Eastern Arabic 0-9
            out_chars.append(chr(cp - 0x0660 + ord("0")))
        elif 0x06F0 <= cp <= 0x06F9:  # Extended Arabic-Indic 0-9
            out_chars.append(chr(cp - 0x06F0 + ord("0")))
        elif 0x0966 <= cp <= 0x096F:  # Devanagari 0-9
            out_chars.append(chr(cp - 0x0966 + ord("0")))
        else:
            out_chars.append(ch)
    return "".join(out_chars)


def _parse_value(value: str, suffix: str) -> Optional[float]:
    """T2 — strip thousands separators, parse to float, apply suffix multiplier.
    Returns None when the string isn't a number."""
    if not value:
        return None
    cleaned = value.replace(",", "").replace("_", "")
    # Handle European-style comma decimal already converted above to "" — when
    # value matched the second alternative ("\d+(?:[.,]\d+)?") the comma may
    # have been the decimal separator. Heuristic: if cleaning removed exactly
    # one comma AND there's no period AND the trailing group is 1-2 digits,
    # treat that comma as a decimal point.
    if (
        "," in value
        and "." not in value
        and len(value.split(",")[-1]) in (1, 2)
    ):
        cleaned = value.replace(",", ".")
    try:
        f = float(cleaned)
    except (ValueError, TypeError):
        return None
    mult = _SUFFIX_MULTIPLIER.get(suffix or "", 1.0)
    if suffix == "%":
        # We don't decide percent vs ratio here — leave value as-is and let
        # the matcher try both forms via _values_match.
        return f
    return f * mult


def _values_match(a: float, b: float) -> bool:
    """T2 — relative tolerance to absorb floating-point noise + dialect rounding."""
    return abs(a - b) < max(1e-6, abs(b) * 1e-4)


@dataclass(frozen=True)
class NumericSpan:
    value: str
    suffix: str
    start: int
    end: int


def extract_numeric_spans(text: str) -> list:
    norm = _normalize_digits(_nfkc(text))
    spans = []
    for m in _NUMBER_RE.finditer(norm):
        val = m.group("value")
        # Skip year-shaped bare integers ("2024") to avoid noisy unverified marks.
        if "." not in val and "," not in val and _YEAR_RE.match(val):
            continue
        spans.append(
            NumericSpan(
                value=val,
                suffix=m.group("suffix") or "",
                start=m.start(),
                end=m.end(),
            )
        )
    return spans


def match_claim(
    value: str,
    recent_rowsets: list,
    allowed_query_ids: Optional[Iterable[str]] = None,
    suffix: str = "",
) -> Optional[str]:
    """Return query_id of the rowset whose any cell matches the claimed value
    (after suffix-aware scaling), or None when nothing matches."""
    target_float = _parse_value(value, suffix)
    if target_float is None:
        return None
    # Percent special-case: try both raw and /100, since synthesis may write
    # 99.5% while cells store 0.995 OR 99.5.
    candidates = [target_float]
    if suffix == "%":
        candidates.append(target_float / 100.0)
    try:
        target_int = int(value.replace(",", "").replace("_", ""))
        candidates.append(float(target_int))
    except (ValueError, TypeError):
        target_int = None
    allow = set(allowed_query_ids) if allowed_query_ids is not None else None
    for rowset in recent_rowsets or []:
        if not isinstance(rowset, dict):
            continue
        qid = rowset.get("query_id")
        if allow is not None and qid not in allow:
            continue
        for row in rowset.get("rows", []) or []:
            try:
                cells = list(row)
            except TypeError:
                cells = [row]
            for cell in cells:
                try:
                    cell_f = float(cell)
                except (ValueError, TypeError):
                    continue
                for cand in candidates:
                    if _values_match(cand, cell_f):
                        return qid
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
        """Annotate unverified numeric claims with `[unverified]`. T2: never
        raise — on any exception, fall back to a single unverified banner."""
        try:
            return self._bind_impl(synthesis_text, recent_rowsets, allowed_query_ids)
        except Exception as e:
            _logger.exception(
                "claim_provenance.bind failed: %s — marking output unverified", e,
            )
            base = synthesis_text if isinstance(synthesis_text, str) else ""
            return base + "\n[unverified: provenance check failed]"

    def _bind_impl(
        self,
        synthesis_text: str,
        recent_rowsets: list,
        allowed_query_ids: Optional[Iterable[str]] = None,
    ) -> str:
        # Defensive: tolerate None / non-string input.
        if synthesis_text is None:
            return ""
        if not isinstance(synthesis_text, str):
            synthesis_text = str(synthesis_text)
        # T2 — cap input size to a sane upper bound. We trim on byte length
        # but render the result as a string after a lossy decode so multibyte
        # boundaries don't crash.
        encoded = synthesis_text.encode("utf-8")
        if len(encoded) > MAX_SYNTHESIS_BYTES:
            _logger.warning(
                "claim_provenance.bind: text too large (%d bytes > %d), "
                "truncating to first chunk",
                len(encoded), MAX_SYNTHESIS_BYTES,
            )
            synthesis_text = encoded[:MAX_SYNTHESIS_BYTES].decode(
                "utf-8", errors="ignore"
            )
        normalized = _normalize_digits(_nfkc(synthesis_text))
        spans = extract_numeric_spans(synthesis_text)  # uses normalize+nfkc internally
        if not spans:
            return normalized
        rowsets = recent_rowsets or []
        out = []
        cursor = 0
        for i, span in enumerate(spans):
            out.append(normalized[cursor:span.end])
            if i < self._max_spans:
                qid = match_claim(
                    span.value,
                    rowsets,
                    allowed_query_ids=allowed_query_ids,
                    suffix=span.suffix,
                )
            else:
                qid = None  # past the cap, auto-unverified
            if qid is None:
                out.append(" " + self._marker)
            cursor = span.end
        out.append(normalized[cursor:])
        return "".join(out)
