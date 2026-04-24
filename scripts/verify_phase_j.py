"""Phase J verifier — every FEATURE_/RULE_/etc flag in config.py must be documented."""
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


def main():
    conf = flags_in_config()
    docs = flags_in_defaults()
    undocumented = conf - docs
    if undocumented:
        print("UNDOCUMENTED flags (present in config.py, missing from config-defaults.md):")
        for f in sorted(undocumented):
            print(f"  - {f}")
        sys.exit(1)
    print(f"OK — all {len(conf)} flags documented.")


if __name__ == "__main__":
    main()
