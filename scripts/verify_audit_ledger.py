"""Phase L — Audit ledger chain verifier CLI.
Usage:
  python scripts/verify_audit_ledger.py
  python scripts/verify_audit_ledger.py --tenant t1 --month 2026-06
"""
from __future__ import annotations
import argparse, sys
from pathlib import Path

def main():
    sys.path.insert(0, "backend")
    from audit_ledger import AuditLedger
    from config import settings
    p = argparse.ArgumentParser()
    p.add_argument("--tenant", default=None)
    p.add_argument("--month", default=None)
    p.add_argument("--root", default=settings.AUDIT_LEDGER_DIR)
    args = p.parse_args()
    root = Path(args.root)
    ledger = AuditLedger(root=root)
    if args.tenant and args.month:
        targets = [(args.tenant, args.month)]
    else:
        targets = []
        if root.exists():
            for tdir in root.iterdir():
                if not tdir.is_dir():
                    continue
                for fpath in tdir.glob("*.jsonl"):
                    targets.append((tdir.name, fpath.stem))
    if not targets:
        print("No ledger files found.")
        sys.exit(0)
    any_broken = False
    for tenant, month in targets:
        result = ledger.verify_chain(tenant_id=tenant, year_month=month)
        if result.ok:
            print(f"OK   {tenant}/{month}")
        else:
            print(f"BAD  {tenant}/{month} broken_at_index={result.broken_at_index} reason={result.reason}")
            any_broken = True
    sys.exit(1 if any_broken else 0)

if __name__ == "__main__":
    main()
