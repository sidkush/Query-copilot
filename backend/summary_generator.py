"""
summary_generator.py — NL summary helpers for query results.

Phase E adds maybe_force_median() which detects skewed distributions and
injects a directive into the summary prompt so the LLM surfaces the median
alongside the mean, preventing misleading averages.
"""

from __future__ import annotations


def maybe_force_median(prompt_text: str, p50: float = None, p99: float = None) -> str:
    """Phase E — when skew detected, inject 'report median and mean' directive."""
    try:
        from skew_guard import is_skewed
    except Exception:
        return prompt_text
    if p50 is None or p99 is None:
        return prompt_text
    if not is_skewed(p50=p50, p99=p99):
        return prompt_text
    injection = (
        "\n\nIMPORTANT: this column is heavily skewed (p99/p50 > 10). "
        "Report the MEDIAN alongside the mean to avoid misleading the user.\n"
    )
    return prompt_text + injection
