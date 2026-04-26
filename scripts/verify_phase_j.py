"""Phase J verifier — every FEATURE_/RULE_/etc flag in config.py must be documented.
T9.5 extension: assert doc-table default values match code defaults for security flags."""
from __future__ import annotations

import re
import sys
from pathlib import Path


PROJECT = Path(__file__).resolve().parent.parent
CONFIG_PY = PROJECT / "backend" / "config.py"
DEFAULTS_MD = PROJECT / "docs" / "claude" / "config-defaults.md"

FLAG_PREFIXES = (
    "FEATURE_", "RULE_", "ECHO_", "COVERAGE_", "SCOPE_", "TENANT_",
    "SKEW_", "TIER_", "JITTER_", "SINGLEFLIGHT_", "COST_", "SSE_",
    "HLL_", "VIZQL_HEX_", "FISCAL_", "TURBO_LIVE_",
)

# T9.5 — security flags whose doc-table value must match code default.
# Format: flag_name -> expected_python_value (bool)
SECURITY_FLAG_VALUE_PARITY = {
    "FEATURE_AGENT_FEEDBACK_LOOP": True,
    "FEATURE_AGENT_HALLUCINATION_ABORT": True,
    "FEATURE_SCOPE_VALIDATOR": True,
    "FEATURE_CLAIM_PROVENANCE": True,   # T6 — flipped after canary 2026-04-26
    "FEATURE_AUDIT_LEDGER": True,       # T6 — flipped after canary 2026-04-26
}


def flags_in_config():
    out = set()
    for line in CONFIG_PY.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*([A-Z][A-Z0-9_]+)\s*:\s*", line)
        if m and m.group(1).startswith(FLAG_PREFIXES):
            out.add(m.group(1))
    return out


def flags_in_defaults():
    text = DEFAULTS_MD.read_text(encoding="utf-8")
    out = set()
    for m in re.finditer(r"`([A-Z][A-Z0-9_]+)`", text):
        name = m.group(1)
        if name.startswith(FLAG_PREFIXES):
            out.add(name)
    return out


def code_defaults() -> dict[str, object]:
    """Parse Field(default=...) values for all boolean flags in config.py."""
    text = CONFIG_PY.read_text(encoding="utf-8")
    out: dict[str, object] = {}
    for line in text.splitlines():
        m = re.match(r"\s*([A-Z][A-Z0-9_]+)\s*:\s*bool\s*=\s*Field\(default=(True|False)", line)
        if m:
            out[m.group(1)] = m.group(2) == "True"
    return out


def doc_values() -> dict[str, object]:
    """Parse table rows ` | `FLAG` | `True`/`False` | ` from config-defaults.md."""
    text = DEFAULTS_MD.read_text(encoding="utf-8")
    out: dict[str, object] = {}
    for line in text.splitlines():
        # Match markdown table rows like: | `FEATURE_FOO` | `True` | ...
        m = re.search(r"\|\s*`([A-Z][A-Z0-9_]+)`\s*\|\s*`(True|False)`", line)
        if m:
            out[m.group(1)] = m.group(2) == "True"
    return out


def main():
    conf = flags_in_config()
    docs = flags_in_defaults()
    undocumented = conf - docs
    errors = []

    if undocumented:
        errors.append("UNDOCUMENTED flags (present in config.py, missing from config-defaults.md):")
        for f in sorted(undocumented):
            errors.append(f"  - {f}")

    # T9.5 value parity check for security-critical flags
    code_vals = code_defaults()
    doc_vals = doc_values()
    for flag, expected_py in SECURITY_FLAG_VALUE_PARITY.items():
        actual_code = code_vals.get(flag)
        actual_doc = doc_vals.get(flag)
        if actual_code is None:
            errors.append(f"VALUE-PARITY: {flag} not found in config.py — expected default={expected_py}")
        elif actual_code != expected_py:
            errors.append(f"VALUE-PARITY: {flag} code default={actual_code} but expected={expected_py}")
        if actual_doc is not None and actual_doc != actual_code:
            errors.append(
                f"VALUE-PARITY DOC DRIFT: {flag} code={actual_code} but config-defaults.md says {actual_doc}"
            )

    if errors:
        for line in errors:
            print(line)
        sys.exit(1)

    print(f"OK — all {len(conf)} flags documented; {len(SECURITY_FLAG_VALUE_PARITY)} security-flag values match.")


if __name__ == "__main__":
    main()
