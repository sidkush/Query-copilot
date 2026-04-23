"""Phase G - skill archival (H15 convention: move, never delete).

Runs as an ops script or scheduled job. Reads the SkillRouter audit
log; any skill below `min_retrievals` in the past `dormancy_days`
moves to `askdb-skills/archive/<subdir>/`. Priority-1 skills (always-
on) are immune. Each archived file gains an `archived_at` frontmatter
stamp.

NEVER deletes. NEVER touches history. Archive root is still part of
the skill repo, just loaded by a future path-filtered SkillLibrary
(Phase I).
"""
from __future__ import annotations

import json
import logging
import shutil
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import frontmatter

logger = logging.getLogger(__name__)


@dataclass
class ArchivalResult:
    moved: list[str] = field(default_factory=list)
    skipped_priority_1: list[str] = field(default_factory=list)
    scanned: int = 0
    dry_run: bool = False


def _retrieval_counts(audit_log: Path, dormancy_days: int) -> Counter:
    if not audit_log.exists():
        logger.warning("skill_archival: audit log missing at %s - all skills appear dormant", audit_log)
        return Counter()
    cutoff = datetime.now(timezone.utc).timestamp() - dormancy_days * 86400.0
    counts: Counter = Counter()
    with audit_log.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = rec.get("ts", 0.0)
            if ts < cutoff:
                continue
            for name in rec.get("retrieved", []) or []:
                counts[name] += 1
    return counts


def archive_dormant_skills(
    *,
    skills_root: Path,
    audit_log: Path,
    archive_root: Path,
    dormancy_days: int,
    min_retrievals: int,
    dry_run: bool = False,
) -> ArchivalResult:
    skills_root = Path(skills_root)
    archive_root = Path(archive_root)
    audit_log = Path(audit_log)
    result = ArchivalResult(dry_run=dry_run)
    if not audit_log.exists():
        logger.warning("skill_archival: audit log missing at %s - aborting archival run", audit_log)
        return result
    counts = _retrieval_counts(audit_log, dormancy_days)

    for path in sorted(skills_root.rglob("*.md")):
        try:
            path.relative_to(archive_root)
            continue
        except ValueError:
            pass
        if path.name == "MASTER_INDEX.md":
            continue
        try:
            post = frontmatter.load(path)
        except Exception:  # noqa: BLE001
            continue
        meta = post.metadata or {}
        name = meta.get("name") or path.stem
        priority = int(meta.get("priority", 3))
        result.scanned += 1

        if priority == 1:
            result.skipped_priority_1.append(name)
            continue

        if counts.get(name, 0) >= min_retrievals:
            continue

        result.moved.append(name)
        if dry_run:
            continue

        rel = path.relative_to(skills_root)
        dest = archive_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)

        post.metadata["archived_at"] = datetime.now(timezone.utc).isoformat()
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(frontmatter.dumps(post), encoding="utf-8")
        shutil.move(str(tmp), str(dest))
        path.unlink()

    return result
