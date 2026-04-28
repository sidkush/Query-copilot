"""Wave 2 — opt-in maintenance: delete pre-tenant-prefix plan_cache collections.

Background:
  Pre-Wave-2 plan_cache collection name = "plan_cache_<32-hex conn>" (43 chars)
  Post-Wave-2 plan_cache collection name = "plan_cache_<16-hex tenant>_<32-hex conn>" (60 chars)
  See plan_cache.py::compose_plan_cache_collection_name.

  Wave 2 deploys do NOT auto-delete legacy collections — they become orphans
  but cannot leak data (new code path never reads them, since the names
  diverge in length and structure). This script provides opt-in cleanup
  for disk hygiene.

Safety:
  - Default mode is dry-run (lists only, deletes nothing).
  - Pass --apply to actually delete. Print every deletion.
  - Refuses to touch collections matching the new format (defensive belt).

Usage:
  python scripts/purge_legacy_plan_cache.py            # dry-run, list only
  python scripts/purge_legacy_plan_cache.py --apply    # actually delete
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Allow running from project root or from backend/
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


# Legacy: "plan_cache_" + exactly 32 lowercase hex chars (and nothing else)
_LEGACY_PATTERN = re.compile(r"^plan_cache_[a-f0-9]{32}$")
# New (post-Wave-2): "plan_cache_" + 16 hex + "_" + 32 hex
_NEW_PATTERN = re.compile(r"^plan_cache_[a-f0-9]{16}_[a-f0-9]{32}$")


def _list_legacy_collections(chroma):
    """Return collection names matching the legacy plan_cache_<32-hex> format."""
    legacy = []
    for c in chroma.list_collections():
        name = c.name if hasattr(c, "name") else str(c)
        if _LEGACY_PATTERN.match(name):
            legacy.append(name)
        elif _NEW_PATTERN.match(name):
            # Defensive: should not happen, but belt-and-suspenders against
            # accidental deletion of a new-format collection.
            continue
    return legacy


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete legacy collections (default: dry-run, list only).",
    )
    args = parser.parse_args()

    from query_memory import QueryMemory

    qm = QueryMemory()
    chroma = qm._chroma

    legacy = _list_legacy_collections(chroma)
    print(f"Found {len(legacy)} legacy plan_cache collection(s).")

    if not legacy:
        print("Nothing to do.")
        return 0

    for name in legacy:
        if args.apply:
            try:
                chroma.delete_collection(name)
                print(f"  deleted: {name}")
            except Exception as exc:
                print(f"  FAILED ({type(exc).__name__}): {name} — {exc}")
        else:
            print(f"  [DRY-RUN] would delete: {name}")

    if not args.apply:
        print("\nDry-run only. Pass --apply to actually delete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
