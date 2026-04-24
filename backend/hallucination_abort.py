"""Ring 8 — HallucinationAbort.

Detects LLM-confabulated error messages. Agent output that mentions a
database/connection error MUST either quote a known backend exception
verbatim, or be blocked. Hallucinated strings like "database connectivity
issues" (not in any source file) trip SafeText and trigger safe_abort.
"""
from __future__ import annotations

import importlib
import inspect
import re
from typing import Optional


_FALLBACK_ERROR_PHRASES = (
    "database connection refused",
    "read-only violation",
    "query timeout exceeded",
    "permission denied",
    "syntax error",
)

_DB_ERROR_TRIGGERS = re.compile(
    r"\b(database|db|connection|connectivity|connect(ing|ion)?|backend|server|"
    r"query|pool|driver|socket)\s+(error|issues?|problem|failure|unavailable|"
    r"disconnect|refused|timeout|reset)\b",
    re.IGNORECASE,
)


def enumerate_backend_error_phrases() -> list:
    """Harvest exception class names from db_connector.py and convert to
    human-readable phrases. Falls back to a fixed list if import fails.
    """
    phrases: list = []
    try:
        mod = importlib.import_module("db_connector")
        for name, obj in inspect.getmembers(mod, inspect.isclass):
            if not name.endswith(("Error", "Exception")):
                continue
            # Convert CamelCase → "camel case"
            human = re.sub(r"([a-z])([A-Z])", r"\1 \2", name).lower()
            phrases.append(human)
    except Exception:
        pass
    for p in _FALLBACK_ERROR_PHRASES:
        if p not in phrases:
            phrases.append(p)
    return phrases


class SafeText:
    """Sanitises agent output. Returns None when the text contains a
    DB-error trigger that is not in the known-phrase whitelist.
    """

    def __init__(self, known_error_phrases: list):
        self._known = [p.lower() for p in known_error_phrases]

    def sanitize(self, text: str) -> Optional[str]:
        if not text:
            return text
        lowered = text.lower()
        if not _DB_ERROR_TRIGGERS.search(lowered):
            return text
        # Trigger fired. Must contain at least one known phrase verbatim.
        for phrase in self._known:
            if phrase in lowered:
                return text
        return None
