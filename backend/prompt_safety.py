import unicodedata
import re

_FENCE_TERMINATORS = re.compile(r'</?scope_fence[^>]*>|</?system[^>]*>', re.IGNORECASE)
_CONTROL_CHARS = re.compile(r'[\x00-\x08\x0b-\x0d\x0e-\x1f\x7f]')
_MAX_QUESTION_LEN = 2000


def safe_for_prompt(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Cf")
    text = _CONTROL_CHARS.sub("", text)
    text = _FENCE_TERMINATORS.sub("[REDACTED]", text)
    return text[:_MAX_QUESTION_LEN]
