"""Routing V2 post-run analysis: per-question model distribution + cost breakdown.

For each question in main150_routing_v2:
  - Was first api_call Opus (Layer 2 fire)?
  - Was there a mid-question switch from Sonnet to Opus (Layer 3 fire)?
  - Sonnet-only (no Opus involvement)?
  - Total spend per question.

Output: per-tier averages + question counts.
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
TRACE_DIR = _REPO_ROOT / "benchmarks" / "bird" / "traces" / "main150_routing_v2"


def _classify_model(m: str) -> str:
    m = (m or "").lower()
    if "opus" in m: return "opus"
    if "sonnet" in m: return "sonnet"
    if "haiku" in m: return "haiku"
    return "unknown"


def _audit_qid(path):
    events = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    meta = next((e for e in events if e.get("type") == "meta"), None)
    result = next((e for e in events if e.get("type") == "result"), None)
    if not meta or not result:
        return None
    api_calls = [e for e in events if e.get("type") == "api_call"]
    models_used = [_classify_model(e.get("model", "")) for e in api_calls]
    spend = sum(e.get("cost_usd", 0) for e in api_calls)
    first_model = models_used[0] if models_used else None
    saw_opus = "opus" in models_used
    layer = "no_call"
    if first_model == "opus":
        layer = "L2"  # Layer 2: first call was Opus (initial escalation)
    elif saw_opus:
        layer = "L3"  # Layer 3: mid-question Opus escalation
    elif first_model in ("sonnet", "haiku"):
        layer = "primary"  # Sonnet (or Haiku fallback)-only
    return {
        "qid": meta.get("qid"),
        "db_id": meta.get("db_id"),
        "difficulty": meta.get("difficulty"),
        "ex_pass": result.get("ex_pass"),
        "spend": spend,
        "models": models_used,
        "first_model": first_model,
        "n_api_calls": len(api_calls),
        "layer": layer,
    }


def main():
    audits = []
    for path in sorted(TRACE_DIR.glob("*.jsonl")):
        if path.name.startswith("_"):
            continue
        a = _audit_qid(path)
        if a:
            audits.append(a)

    # Layer breakdown
    by_layer = defaultdict(list)
    for a in audits:
        by_layer[a["layer"]].append(a)

    print(f"\n{'='*60}\n ROUTING V2 — Per-Q Analysis\n{'='*60}")
    print(f" Total: {len(audits)} questions\n")
    print(f" {'Layer':<10} {'count':>6} {'pass':>5} {'fail':>5} {'pass%':>6} {'avg$':>7}")
    for layer in ("L2", "L3", "primary", "no_call"):
        items = by_layer.get(layer, [])
        if not items:
            continue
        passes = sum(1 for x in items if x["ex_pass"])
        avg_spend = sum(x["spend"] for x in items) / len(items)
        pct = 100.0 * passes / len(items) if items else 0
        print(f" {layer:<10} {len(items):>6} {passes:>5} {len(items)-passes:>5} "
              f"{pct:>5.1f}% ${avg_spend:>6.4f}")

    # Cost breakdown
    sonnet_only = [a for a in audits if a["layer"] == "primary"]
    opus_touched = [a for a in audits if a["layer"] in ("L2", "L3")]
    print(f"\n Cost breakdown:")
    if sonnet_only:
        avg_s = sum(a["spend"] for a in sonnet_only) / len(sonnet_only)
        print(f"   Sonnet/Haiku-only avg: ${avg_s:.4f}/Q across {len(sonnet_only)} Qs")
    if opus_touched:
        avg_o = sum(a["spend"] for a in opus_touched) / len(opus_touched)
        print(f"   Opus-touched avg:      ${avg_o:.4f}/Q across {len(opus_touched)} Qs")
    total = sum(a["spend"] for a in audits)
    print(f"   Total: ${total:.4f}")

    # Layer fires (unique questions, not event count)
    n_l2 = len(by_layer.get("L2", []))
    n_l3 = len(by_layer.get("L3", []))
    print(f"\n Layer fires (unique questions):")
    print(f"   L2 (initial Opus escalation):      {n_l2}")
    print(f"   L3 (mid-question Opus escalation): {n_l3}")
    print(f"   Total Opus-touched:                {n_l2 + n_l3}")
    print(f"   Sonnet-only:                       {len(sonnet_only)}")


if __name__ == "__main__":
    main()
