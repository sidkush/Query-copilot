"""Cross-encoder rerank with adversarial-input sanitization.

H14 ORDER: NFKC normalize FIRST, THEN strip adversarial patterns.
Reversing this order lets attackers bypass via fullwidth homoglyphs.
"""
from __future__ import annotations
import re
import unicodedata


UNSAFE_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:prior|previous|above)(?:\s+instructions?)?",
    r"this\s+is\s+the\s+answer\s+to",
    r"disregard\s+(?:all\s+)?(?:prior|previous|above)",
    r"system\s*:\s*override",
]
_UNSAFE_RX = re.compile("|".join(UNSAFE_PATTERNS), re.IGNORECASE)


def sanitize_rerank_input(text: str) -> str:
    """Normalize, then strip known injection patterns. Order is critical."""
    # Step 1: Unicode normalization (fullwidth → ASCII, etc.)
    normalized = unicodedata.normalize("NFKC", text)
    # Step 2: Strip adversarial patterns.
    cleaned = _UNSAFE_RX.sub("[REDACTED]", normalized)
    return cleaned
