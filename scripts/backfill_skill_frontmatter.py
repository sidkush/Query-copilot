"""One-shot: add frontmatter to existing askdb-skills/ files.

Idempotent — skips files that already have frontmatter.
Run once from the QueryCopilot V1/ repo root:

    python scripts/backfill_skill_frontmatter.py
"""
from __future__ import annotations

import re
from pathlib import Path

import frontmatter
import tiktoken

ROOT = Path(__file__).resolve().parents[1] / "askdb-skills"
ENCODER = tiktoken.get_encoding("cl100k_base")

# Priority tier from MASTER_INDEX.md (1 = always on, 2 = frequent, 3 = on trigger).
PRIORITY_MAP = {
    "security-rules": 1,
    "agent-identity-response-format": 1,
    "confirmation-thresholds": 1,
    "error-handling": 2,
    "query-lifecycle-budget": 2,
    "aggregation-rules": 2,
    "null-handling": 2,
    "chart-selection": 2,
}

APPLIES_TO = {
    "core": "always-on",
    "sql": "sql-generation",
    "visualization": "chart-selection, dashboard-build",
    "agent": "multi-step-agent, dashboard-build",
    "dialects": "sql-generation",
    "domain": "sql-generation, chart-selection",
}


def trigger_description(title: str, first_para: str) -> str:
    """Compose a 20-160 char trigger phrase."""
    cleaned = re.sub(r"\s+", " ", first_para).strip()
    # Strip leading markdown emphasis / bullets.
    cleaned = re.sub(r"^[-*>#`\s]+", "", cleaned)
    if len(cleaned) > 150:
        cleaned = cleaned[:147].rsplit(" ", 1)[0] + "..."
    if len(cleaned) < 20:
        cleaned = f"Apply {title} rules."
    return cleaned


def process(path: Path) -> bool:
    post = frontmatter.load(path)
    if post.metadata:  # already has frontmatter
        return False

    body = post.content
    h1 = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    title = h1.group(1).strip() if h1 else path.stem

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    first_para = next((p for p in paragraphs if not p.startswith("#")), title)

    category = path.parent.name
    tokens = len(ENCODER.encode(body))

    post.metadata = {
        "name": path.stem,
        "description": trigger_description(title, first_para),
        "priority": PRIORITY_MAP.get(path.stem, 3),
        "tokens_budget": max(300, int(round(tokens / 100) * 100)),
        "applies_to": APPLIES_TO.get(category, "sql-generation"),
        "legacy": True,
    }

    path.write_text(frontmatter.dumps(post) + "\n", encoding="utf-8")
    return True


def main() -> int:
    updated = 0
    for path in ROOT.rglob("*.md"):
        if path.name == "MASTER_INDEX.md":
            continue
        if process(path):
            updated += 1
            print(f"updated: {path.relative_to(ROOT)}")
    print(f"\n{updated} files updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
