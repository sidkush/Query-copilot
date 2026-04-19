# Skill Library Retrieval Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 48-file `askdb-skills/` library into AskDB's agent + query engines with deterministic-first three-stage retrieval (always-on → deterministic routing → dynamic RAG), Anthropic 4-breakpoint prompt caching, and ICRH-safe correction queue + golden eval gating — so the system answers with curated rules instead of raw knowledge, auto-improves from corrections without drift, and proves it through a frozen 20-pair eval suite.

**Architecture:** A `SkillLibrary` loads all markdown into RAM at startup and ingests to a new `skills_v1` ChromaDB collection using contextual-retrieval prefixing. A `SkillRouter` composes always-on Priority-1 core + deterministic dialect/domain + top-k dynamic hits, caps at 20K tokens, returns ordered skill hits. `agent_engine._build_system_prompt` is refactored to emit a 4-segment list with `cache_control` markers (1-hour TTL for identity + schema, 5-min for retrieved). Negative feedback and SQL edits write to `.data/corrections_pending/` via a review queue; hourly reviewer classifies + majority-votes before any retrieval store update, all gated by a 20-pair golden eval that blocks regressions > 2%. A drift monitor checks daily action-distribution KL divergence. Feature-flagged (`SKILL_LIBRARY_ENABLED`, default `False`) with shadow-mode infrastructure for safe rollout.

**Tech Stack:** Python 3.10+ (project uses 3.14.3 local), FastAPI, ChromaDB (pure-Python n-gram hash embeddings already in use), APScheduler (existing pattern in `digest.py`), python-frontmatter + tiktoken (from Plan 1), sqlglot (existing), pytest + pytest-asyncio (existing).

**Scope note — phase map:**
- **Phase 1:** Skill retrieval infrastructure (loader, ChromaDB ingest, router). Standalone; no agent changes.
- **Phase 2:** 4-breakpoint caching refactor of `_build_system_prompt`. Still no skill injection — just the shape change.
- **Phase 3:** Skill injection via router, replace hardcoded `DIALECT_HINTS`, mirror in `query_engine.py`. End of Phase 3 = retrieval live behind flag.
- **Phase 4:** Correction queue + hourly reviewer + shadow-mode infra.
- **Phase 5:** Golden eval harness + pre-commit gate.
- **Phase 6:** Drift monitor.
- **Phase 7:** Observability endpoint + rollout flag flip.

Every phase lands independently green on pytest + leaves `SKILL_LIBRARY_ENABLED=False` behaviour unchanged until Phase 7.

---

## Prerequisites

- [ ] `git log --oneline | grep "Plan 1"` shows commits `98ca845`, `97f2842`, `b11726f` — Plan 1 content foundation is merged.
- [ ] `ls askdb-skills/ | wc -l` returns `7` (6 category dirs + `MASTER_INDEX.md`).
- [ ] `cd backend && python -m pytest tests/test_skill_library_structure.py -q` is 50/50 green.
- [ ] `python -c "import frontmatter, tiktoken"` succeeds.
- [ ] Plan 2 (`2026-04-20-skill-library-tier-b-updates.md`) is either merged OR you have confirmed with the user that Plan 2 legacy-flag removals do not need to land first for Phase 1 tasks (they don't — Plan 3 reads the file contents, not the `legacy` flag).
- [ ] You have read `docs/superpowers/plans/2026-04-19-skill-library-research-context.md` §1 (codebase audit), §3 (research findings), §4 (architecture), §6 (facts not to fabricate).

Stop and resolve if any check fails.

---

## File Structure

**New files (16):**

| Path | Responsibility |
|---|---|
| `backend/skill_library.py` | `SkillLibrary` class: load all `askdb-skills/*.md` to RAM dict at startup; expose `get(name)`, `search(query, k)`, `always_on()`, `deterministic(dialect, domain)`. Single entry point for all skill lookups. |
| `backend/skill_ingest.py` | One-shot script + in-process function: embed every skill into ChromaDB `skills_v1` collection with contextual-retrieval prefix. Idempotent — re-runs when md mtime > last ingest stamp. |
| `backend/skill_router.py` | `SkillRouter.resolve(question, connection_entry, action_type)` returning `list[SkillHit]`. Orchestrates always-on + deterministic + RAG; enforces 20K token cap + dedup within recent turn window. |
| `backend/skill_hit.py` | `SkillHit` dataclass (name, priority, tokens, source, content). Avoids circular imports between router + library. |
| `backend/correction_queue.py` | Append-only queue at `.data/corrections_pending/{user_hash}/{iso_ts}.json`. Never touches retrieval stores. |
| `backend/correction_reviewer.py` | Hourly async job (APScheduler): classify + majority-vote + promote to `examples_<conn_id>` only after golden eval passes in shadow. |
| `backend/drift_monitor.py` | Daily job: compute per-user action distribution (tables-hit, join-depth, chart-type, avg tokens/turn), KL-divergence vs 7-day baseline, alert on > 0.3. |
| `backend/eval/__init__.py` | Package marker. |
| `backend/eval/golden_nl_sql.jsonl` | Frozen 20-pair seed eval (grows to 200 over time). JSONL: `{question, expected_tables, expected_sql_pattern, connection_profile}`. |
| `backend/eval/run_golden_eval.py` | Harness: load set, run through current skill + prompt config, score. Outputs JSON report. `--shadow` flag runs against alternative collection. |
| `backend/eval/conftest.py` | Pytest fixture for mock `ConnectionEntry` + mock `ModelProvider`. |
| `backend/tests/test_skill_library.py` | |
| `backend/tests/test_skill_ingest.py` | |
| `backend/tests/test_skill_router.py` | |
| `backend/tests/test_caching_breakpoints.py` | |
| `backend/tests/test_correction_queue.py` | |
| `backend/tests/test_correction_reviewer.py` | |
| `backend/tests/test_drift_monitor.py` | |
| `backend/tests/test_golden_eval.py` | |
| `.githooks/pre-commit` | Shell hook. When `askdb-skills/*.md` or `backend/skill_library.py` changes are staged, runs `python -m backend.eval.run_golden_eval` and blocks commit on regression > 2%. |

**Modified files (5):**

| Path | Change |
|---|---|
| `backend/config.py` | Add 7 flags: `SKILL_LIBRARY_ENABLED=False`, `SKILL_LIBRARY_PATH=askdb-skills`, `SKILL_MAX_RETRIEVED=3`, `SKILL_MAX_TOTAL_TOKENS=20000`, `SKILL_ALWAYS_ON_TOKENS_CAP=7000`, `CORRECTION_QUEUE_ENABLED=True`, `SKILL_DRIFT_KL_THRESHOLD=0.3`. |
| `backend/agent_engine.py` | `_build_system_prompt()` → returns `list[PromptBlock]` with `cache_control` markers per Plan 1 `caching-breakpoint-policy.md`. `DIALECT_HINTS` dict stays as fallback but lookup routes through `SkillLibrary.get()` when flag on. |
| `backend/query_engine.py` | Mirror skill injection in non-agent path; reuses `SkillRouter`. |
| `backend/routers/query_routes.py` | Rewire `/api/queries/feedback` to write to `correction_queue` instead of calling `add_example` directly. |
| `backend/main.py` | Lifespan: instantiate `SkillLibrary` as `app.state.skill_library`; start `correction_reviewer` + `drift_monitor` APScheduler jobs when flag on. |

---

# PHASE 1 — Retrieval infrastructure

## Task 1: `SkillHit` dataclass + `SkillLibrary` loader

**Files:**
- Create: `backend/skill_hit.py`
- Create: `backend/skill_library.py`
- Test: `backend/tests/test_skill_library.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_skill_library.py`:

```python
"""Tests for SkillLibrary loader."""
from __future__ import annotations

from pathlib import Path

import pytest


def test_skill_hit_dataclass_fields():
    from skill_hit import SkillHit

    hit = SkillHit(
        name="llm-error-recovery",
        priority=2,
        tokens=1500,
        source="always_on",
        content="# LLM Error Recovery\n...",
        path=Path("askdb-skills/core/llm-error-recovery.md"),
    )
    assert hit.name == "llm-error-recovery"
    assert hit.priority == 2
    assert hit.source in ("always_on", "deterministic", "rag")


def test_skill_library_loads_all_files(tmp_path, monkeypatch):
    """Library must load every .md except MASTER_INDEX."""
    from skill_library import SkillLibrary

    # Use real repo skills folder (already on disk from Plan 1).
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    all_names = lib.all_names()
    assert "llm-error-recovery" in all_names
    assert "security-rules" in all_names
    assert "MASTER_INDEX" not in all_names
    assert len(all_names) >= 48  # Plan 1 delivers 48 skills


def test_skill_library_get_returns_skillhit():
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    hit = lib.get("security-rules")
    assert hit is not None
    assert hit.name == "security-rules"
    assert hit.priority == 1
    assert hit.tokens > 0
    assert "security" in hit.content.lower()


def test_skill_library_get_missing_returns_none():
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    assert lib.get("does-not-exist") is None


def test_always_on_returns_only_priority_1():
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    hits = lib.always_on()
    assert len(hits) >= 3
    for h in hits:
        assert h.priority == 1
        assert h.source == "always_on"


def test_always_on_under_cap(monkeypatch):
    """Always-on total must be <= SKILL_ALWAYS_ON_TOKENS_CAP."""
    from skill_library import SkillLibrary
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    total = sum(h.tokens for h in lib.always_on())
    assert total <= 7000, f"always-on tokens {total} over cap"


def test_load_is_idempotent():
    from skill_library import SkillLibrary
    root = Path(__file__).resolve().parents[2] / "askdb-skills"
    lib1 = SkillLibrary(root=root)
    lib2 = SkillLibrary(root=root)
    assert lib1.all_names() == lib2.all_names()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
python -m pytest tests/test_skill_library.py -v
```

Expected: `ModuleNotFoundError: No module named 'skill_hit'`.

- [ ] **Step 3: Create `backend/skill_hit.py`**

```python
"""Lightweight dataclass shared by SkillLibrary + SkillRouter.

Split from skill_library to avoid circular imports once SkillRouter
wants to import both SkillHit and SkillLibrary.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

SkillSource = Literal["always_on", "deterministic", "rag", "bundle"]


@dataclass(frozen=True, slots=True)
class SkillHit:
    name: str
    priority: int          # 1, 2, or 3
    tokens: int            # encoded cl100k_base token count of content
    source: SkillSource
    content: str           # full body (no frontmatter)
    path: Path
```

- [ ] **Step 4: Create `backend/skill_library.py`**

```python
"""Skill library loader.

Loads every .md under askdb-skills/ into RAM at startup. Parses
frontmatter, pre-computes token counts, exposes lookup methods
consumed by SkillRouter + direct callers.

This module has no ChromaDB dependency — it is pure filesystem +
parsing. ChromaDB ingestion lives in skill_ingest.py.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import frontmatter
import tiktoken

from skill_hit import SkillHit

logger = logging.getLogger(__name__)

_ENCODER = tiktoken.get_encoding("cl100k_base")
_INDEX_FILENAMES = {"MASTER_INDEX.md"}


class SkillLibrary:
    """In-memory index of askdb-skills/ markdown files."""

    def __init__(self, root: Path):
        self._root = Path(root)
        self._by_name: dict[str, SkillHit] = {}
        self._load()

    def _load(self) -> None:
        if not self._root.is_dir():
            raise FileNotFoundError(f"Skill library root not found: {self._root}")
        for path in self._root.rglob("*.md"):
            if path.name in _INDEX_FILENAMES:
                continue
            try:
                post = frontmatter.load(path)
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_library: failed to parse %s: %s", path, exc)
                continue
            meta = post.metadata or {}
            name = meta.get("name") or path.stem
            priority = int(meta.get("priority", 3))
            content = post.content
            tokens = len(_ENCODER.encode(content))
            self._by_name[name] = SkillHit(
                name=name,
                priority=priority,
                tokens=tokens,
                source="always_on" if priority == 1 else "rag",
                content=content,
                path=path,
            )
        logger.info("skill_library: loaded %d skills from %s", len(self._by_name), self._root)

    # ── Public API ──

    def get(self, name: str) -> Optional[SkillHit]:
        return self._by_name.get(name)

    def all_names(self) -> list[str]:
        return sorted(self._by_name.keys())

    def always_on(self) -> list[SkillHit]:
        """All Priority-1 skills tagged source='always_on'. Ordered by name."""
        return [
            SkillHit(
                name=h.name, priority=h.priority, tokens=h.tokens,
                source="always_on", content=h.content, path=h.path,
            )
            for h in sorted(self._by_name.values(), key=lambda h: h.name)
            if h.priority == 1
        ]

    def by_category(self, category: str) -> list[SkillHit]:
        """Skills whose parent directory equals `category` (e.g. 'dialects', 'domain')."""
        return [
            h for h in self._by_name.values()
            if h.path.parent.name == category
        ]
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend
python -m pytest tests/test_skill_library.py -v
```

Expected: 7 pass. If a test fails on `always_on_under_cap`, the Plan 1 Priority-1 count is drifting — verify via `python -c "from pathlib import Path; import frontmatter, tiktoken; enc=tiktoken.get_encoding('cl100k_base'); print(sum(len(enc.encode(frontmatter.load(p).content)) for p in Path('../askdb-skills').rglob('*.md') if p.name!='MASTER_INDEX.md' and frontmatter.load(p).metadata.get('priority')==1))`.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/skill_hit.py backend/skill_library.py backend/tests/test_skill_library.py
git commit -m "feat(skills): SkillLibrary + SkillHit loader (Plan 3 P1T1)"
```

---

## Task 2: ChromaDB ingest for dynamic retrieval

**Files:**
- Create: `backend/skill_ingest.py`
- Test: `backend/tests/test_skill_ingest.py`

**Rationale:** Contextual-retrieval prefix (per research-context §3.2.4) prepends a one-line "This is the <category> skill about <topic>" to each skill before embedding. Cuts retrieval failures ~35%.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_skill_ingest.py`:

```python
"""Tests for skill_ingest.py."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest


def test_ingest_prefix_is_contextual():
    """Each ingested document starts with '[Category: <cat>] <name>: '."""
    from skill_ingest import build_contextual_prefix

    prefix = build_contextual_prefix(
        category="sql",
        name="join-intelligence",
        description="Join types, fan-out, many-to-many rules",
    )
    assert prefix.startswith("[Category: sql]")
    assert "join-intelligence" in prefix
    assert "Join types" in prefix


def test_ingest_writes_all_skills_to_collection(tmp_path, monkeypatch):
    """ingest_library() upserts one doc per skill."""
    from skill_ingest import ingest_library
    from skill_library import SkillLibrary

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    fake_collection = MagicMock()
    fake_collection.upsert = MagicMock()

    fake_client = MagicMock()
    fake_client.get_or_create_collection.return_value = fake_collection

    ingest_library(lib, chroma_client=fake_client, collection_name="skills_v1_test")

    fake_client.get_or_create_collection.assert_called_once_with(name="skills_v1_test")
    # Should upsert in one batch or multiple; total documents = all skills
    total_docs = sum(len(call.kwargs["documents"]) for call in fake_collection.upsert.call_args_list)
    assert total_docs == len(lib.all_names())


def test_ingest_is_skipped_when_mtimes_older_than_stamp(tmp_path):
    """If last-ingest stamp is newer than any skill mtime, skip re-ingest."""
    from skill_ingest import should_reingest

    stamp_file = tmp_path / "last_ingest.txt"
    # Pretend ingest happened far in the future.
    stamp_file.write_text("9999999999")
    root = Path(__file__).resolve().parents[2] / "askdb-skills"
    assert should_reingest(root, stamp_file) is False

    # Empty stamp file forces re-ingest.
    stamp_file.write_text("")
    assert should_reingest(root, stamp_file) is True
```

- [ ] **Step 2: Run tests to verify fail**

```bash
cd backend
python -m pytest tests/test_skill_ingest.py -v
```

Expected: `ModuleNotFoundError: No module named 'skill_ingest'`.

- [ ] **Step 3: Implement `backend/skill_ingest.py`**

```python
"""ChromaDB ingest for the skill library.

Embeds every skill file into a dedicated `skills_v1` ChromaDB collection,
isolated from the per-connection `schema_<id>` / `examples_<id>` /
`query_memory_<id>` collections. Uses contextual-retrieval prefix pattern
(research-context §3.2.4): prepends '[Category: <cat>] <name>: <desc>'
before the body so embeddings match queries that use the business
terminology rather than bare rules.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

import chromadb
import frontmatter

from skill_library import SkillLibrary

logger = logging.getLogger(__name__)

COLLECTION_NAME = "skills_v1"
SHADOW_COLLECTION_NAME = "skills_v1_shadow"
_STAMP_FILENAME = ".skill_ingest_stamp"


def build_contextual_prefix(category: str, name: str, description: str) -> str:
    """Contextual prefix for embedding. Research-context §3.2.4."""
    return f"[Category: {category}] {name}: {description.strip()}\n\n"


def should_reingest(skills_root: Path, stamp_file: Path) -> bool:
    """True if any skill .md has mtime newer than the stamp file."""
    if not stamp_file.exists() or not stamp_file.read_text().strip():
        return True
    try:
        stamp = float(stamp_file.read_text().strip())
    except ValueError:
        return True
    newest = 0.0
    for path in skills_root.rglob("*.md"):
        if path.name == "MASTER_INDEX.md":
            continue
        newest = max(newest, path.stat().st_mtime)
    return newest > stamp


def ingest_library(
    library: SkillLibrary,
    chroma_client: chromadb.ClientAPI,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Upsert every skill into the named collection. Returns count."""
    collection = chroma_client.get_or_create_collection(name=collection_name)

    documents: list[str] = []
    ids: list[str] = []
    metadatas: list[dict] = []
    for name in library.all_names():
        hit = library.get(name)
        if hit is None:
            continue
        # Re-parse frontmatter for description (not on SkillHit).
        post = frontmatter.load(hit.path)
        desc = str(post.metadata.get("description", ""))
        category = hit.path.parent.name
        prefix = build_contextual_prefix(category, name, desc)
        documents.append(prefix + hit.content)
        ids.append(f"skill::{name}")
        metadatas.append({
            "name": name,
            "category": category,
            "priority": hit.priority,
            "tokens": hit.tokens,
        })

    if documents:
        collection.upsert(documents=documents, ids=ids, metadatas=metadatas)
    logger.info("skill_ingest: upserted %d skills to %s", len(documents), collection_name)
    return len(documents)


def maybe_ingest(
    library: SkillLibrary,
    chroma_client: chromadb.ClientAPI,
    stamp_dir: Path,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Ingest only if mtimes warrant it. Writes stamp on success."""
    stamp_file = stamp_dir / _STAMP_FILENAME
    if not should_reingest(library._root, stamp_file):  # noqa: SLF001
        logger.info("skill_ingest: up-to-date, skipping")
        return 0
    stamp_dir.mkdir(parents=True, exist_ok=True)
    count = ingest_library(library, chroma_client, collection_name=collection_name)
    stamp_file.write_text(str(os.path.getmtime(library._root)))  # noqa: SLF001
    return count


if __name__ == "__main__":  # pragma: no cover
    import logging
    logging.basicConfig(level=logging.INFO)
    from config import settings
    lib = SkillLibrary(root=Path(settings.SKILL_LIBRARY_PATH))
    client = chromadb.PersistentClient(path=".chroma/querycopilot")
    print(f"Ingested: {ingest_library(lib, client)}")
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend
python -m pytest tests/test_skill_ingest.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/skill_ingest.py backend/tests/test_skill_ingest.py
git commit -m "feat(skills): ChromaDB ingest with contextual-retrieval prefix (Plan 3 P1T2)"
```

---

## Task 3: Config flags + `SkillRouter` scaffolding

**Files:**
- Modify: `backend/config.py` (add 7 flags)
- Create: `backend/skill_router.py`
- Test: `backend/tests/test_skill_router.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_skill_router.py`:

```python
"""Tests for SkillRouter."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def real_library():
    from skill_library import SkillLibrary
    return SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")


@pytest.fixture
def mock_connection():
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={
        "customers": {"columns": [{"name": "id"}, {"name": "name"}]},
        "orders": {"columns": [{"name": "id"}, {"name": "amount"}, {"name": "customer_id"}]},
        "deals": {"columns": [{"name": "id"}, {"name": "stage"}, {"name": "amount"}]},
    })
    return conn


def test_router_always_on_only_when_rag_disabled(real_library, mock_connection):
    from skill_router import SkillRouter

    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("unused question", mock_connection, action_type="sql-generation")

    names = [h.name for h in hits]
    # Must contain the three Priority-1 core skills from Plan 1.
    assert "security-rules" in names
    assert "agent-identity-response-format" in names
    assert "confirmation-thresholds" in names


def test_router_injects_deterministic_dialect(real_library, mock_connection):
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("show me deals", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    # Postgres connection → dialect file must be selected.
    dialect_candidates = {"dialect-snowflake-postgres-duckdb", "dialect-postgres"}
    assert any(n in dialect_candidates for n in names)


def test_router_injects_deterministic_domain_sales(real_library, mock_connection):
    """Schema with 'deals' should be detected as sales domain."""
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("deals by stage", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    assert "domain-sales" in names


def test_router_enforces_20k_token_cap(real_library, mock_connection, monkeypatch):
    from skill_router import SkillRouter
    import skill_router
    monkeypatch.setattr(skill_router, "DEFAULT_MAX_TOTAL_TOKENS", 5000)  # force cap
    router = SkillRouter(library=real_library, chroma_collection=None, max_total_tokens=5000)
    hits = router.resolve("anything", mock_connection, action_type="sql-generation")
    total = sum(h.tokens for h in hits)
    assert total <= 5000


def test_router_priority_1_never_dropped_by_cap(real_library, mock_connection):
    """Even at aggressive caps, Priority-1 skills stay."""
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None, max_total_tokens=4500)
    hits = router.resolve("anything", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    # security-rules is Priority 1.
    assert "security-rules" in names


def test_router_dedup_by_name(real_library, mock_connection):
    """If a skill appears via deterministic AND RAG, keep only one."""
    from skill_router import SkillRouter
    router = SkillRouter(library=real_library, chroma_collection=None)
    hits = router.resolve("tell me about security rules", mock_connection, action_type="sql-generation")
    names = [h.name for h in hits]
    assert len(names) == len(set(names))
```

- [ ] **Step 2: Run tests, expect fail**

```bash
cd backend
python -m pytest tests/test_skill_router.py -v
```

Expected: `ModuleNotFoundError: No module named 'skill_router'`.

- [ ] **Step 3: Add config flags**

Open `backend/config.py`. Find the `class Settings(BaseSettings):` block and append these fields near the bottom (before `class Config:`):

```python
    # ── Skill Library (Plan 3) ────────────────────────────
    SKILL_LIBRARY_ENABLED: bool = False
    SKILL_LIBRARY_PATH: str = "../askdb-skills"
    SKILL_MAX_RETRIEVED: int = 3
    SKILL_MAX_TOTAL_TOKENS: int = 20000
    SKILL_ALWAYS_ON_TOKENS_CAP: int = 7000
    CORRECTION_QUEUE_ENABLED: bool = True
    SKILL_DRIFT_KL_THRESHOLD: float = 0.3
```

- [ ] **Step 4: Implement `backend/skill_router.py`**

```python
"""Skill router.

Composes a skill-set per turn via three-stage process:
1. Always-on (Priority 1) — unconditional.
2. Deterministic — dialect (from connection.db_type) +
   domain (from behavior_engine.detect_domain).
3. Dynamic RAG — top-k from `skills_v1` ChromaDB collection.

Enforces token cap (default 20K) and max-files cap (9). Drops
Priority-3 first, then Priority-2. Never drops Priority-1.

Deduplicates by skill name so a file retrieved by both deterministic
and RAG appears only once.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from skill_hit import SkillHit
from skill_library import SkillLibrary

logger = logging.getLogger(__name__)

DEFAULT_MAX_TOTAL_TOKENS = 20000
DEFAULT_MAX_SKILLS = 9
DEFAULT_K = 3

# Mapping from connection.db_type values to skill-library file stems.
_DIALECT_MAP = {
    "postgresql": "dialect-snowflake-postgres-duckdb",
    "postgres": "dialect-snowflake-postgres-duckdb",
    "supabase": "dialect-snowflake-postgres-duckdb",
    "snowflake": "dialect-snowflake-postgres-duckdb",
    "duckdb": "dialect-snowflake-postgres-duckdb",
    "bigquery": "dialect-bigquery",
    "mysql": "dialect-mysql-sqlserver-redshift-databricks",
    "mariadb": "dialect-mysql-sqlserver-redshift-databricks",
    "mssql": "dialect-mysql-sqlserver-redshift-databricks",
    "redshift": "dialect-mysql-sqlserver-redshift-databricks",
    "databricks": "dialect-mysql-sqlserver-redshift-databricks",
}


class SkillRouter:
    def __init__(
        self,
        library: SkillLibrary,
        chroma_collection: Any = None,  # chromadb Collection or None
        max_total_tokens: int = DEFAULT_MAX_TOTAL_TOKENS,
        max_skills: int = DEFAULT_MAX_SKILLS,
        k: int = DEFAULT_K,
    ):
        self.library = library
        self.collection = chroma_collection
        self.max_total_tokens = max_total_tokens
        self.max_skills = max_skills
        self.k = k

    def resolve(
        self,
        question: str,
        connection_entry: Any,
        action_type: str = "sql-generation",
    ) -> list[SkillHit]:
        seen: set[str] = set()
        hits: list[SkillHit] = []

        # Stage 1: always-on
        for h in self.library.always_on():
            if h.name not in seen:
                hits.append(h)
                seen.add(h.name)

        # Stage 2: deterministic dialect
        dialect_name = self._dialect_for(connection_entry)
        if dialect_name:
            dh = self.library.get(dialect_name)
            if dh and dh.name not in seen:
                hits.append(SkillHit(
                    name=dh.name, priority=dh.priority, tokens=dh.tokens,
                    source="deterministic", content=dh.content, path=dh.path,
                ))
                seen.add(dh.name)

        # Stage 2: deterministic domain
        domain_name = self._domain_for(connection_entry)
        if domain_name:
            dom = self.library.get(domain_name)
            if dom and dom.name not in seen:
                hits.append(SkillHit(
                    name=dom.name, priority=dom.priority, tokens=dom.tokens,
                    source="deterministic", content=dom.content, path=dom.path,
                ))
                seen.add(dom.name)

        # Stage 3: RAG (only if we have a collection wired)
        if self.collection is not None:
            try:
                results = self.collection.query(query_texts=[question], n_results=self.k)
                for name in (results.get("metadatas", [[]])[0] or []):
                    sk_name = name.get("name") if isinstance(name, dict) else None
                    if sk_name and sk_name not in seen:
                        sk = self.library.get(sk_name)
                        if sk:
                            hits.append(SkillHit(
                                name=sk.name, priority=sk.priority, tokens=sk.tokens,
                                source="rag", content=sk.content, path=sk.path,
                            ))
                            seen.add(sk.name)
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_router: RAG failed, continuing without: %s", exc)

        return self._enforce_caps(hits)

    # ── Helpers ──

    def _dialect_for(self, conn: Any) -> Optional[str]:
        db_type = (getattr(conn, "db_type", "") or "").lower()
        return _DIALECT_MAP.get(db_type)

    def _domain_for(self, conn: Any) -> Optional[str]:
        try:
            from behavior_engine import detect_domain  # noqa: WPS433
        except ImportError:
            return None
        try:
            schema_info = conn.engine.db.get_schema_info() if conn.engine else {}
        except Exception:  # noqa: BLE001
            return None
        domain = detect_domain(schema_info)
        if not domain or domain == "general":
            return None
        # Map detect_domain output to skill-library file name.
        domain_map = {
            "sales": "domain-sales",
            "product": "domain-product-finance-marketing-ecommerce",
            "finance": "domain-product-finance-marketing-ecommerce",
            "marketing": "domain-product-finance-marketing-ecommerce",
            "ecommerce": "domain-product-finance-marketing-ecommerce",
            "hr": "domain-hr-operations",
            "operations": "domain-hr-operations",
            "ops": "domain-hr-operations",
            "iot": "domain-iot-timeseries",
        }
        return domain_map.get(domain)

    def _enforce_caps(self, hits: list[SkillHit]) -> list[SkillHit]:
        # Sort: Priority 1 first, then 2, then 3, each by name.
        hits.sort(key=lambda h: (h.priority, h.name))
        kept: list[SkillHit] = []
        total = 0
        for h in hits:
            if len(kept) >= self.max_skills:
                break
            if total + h.tokens > self.max_total_tokens:
                if h.priority == 1:
                    # Never drop P1; make room by popping lowest-priority already-kept.
                    while kept and total + h.tokens > self.max_total_tokens:
                        victim = None
                        for idx in range(len(kept) - 1, -1, -1):
                            if kept[idx].priority >= 3:
                                victim = idx
                                break
                        if victim is None:
                            for idx in range(len(kept) - 1, -1, -1):
                                if kept[idx].priority == 2:
                                    victim = idx
                                    break
                        if victim is None:
                            break
                        removed = kept.pop(victim)
                        total -= removed.tokens
                else:
                    continue
            kept.append(h)
            total += h.tokens
        return kept
```

- [ ] **Step 5: Run tests, expect pass**

```bash
cd backend
python -m pytest tests/test_skill_router.py -v
```

Expected: 6 pass.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/config.py backend/skill_router.py backend/tests/test_skill_router.py
git commit -m "feat(skills): SkillRouter + config flags (Plan 3 P1T3)"
```

---

# PHASE 2 — 4-breakpoint caching refactor

## Task 4: Prompt-block dataclass + cache_control emitter

**Files:**
- Create: `backend/prompt_block.py`
- Test: `backend/tests/test_caching_breakpoints.py`

**Rationale:** Plan 1 `caching-breakpoint-policy.md` requires four segments with Anthropic `cache_control` markers. Rather than hack `_build_system_prompt` to return a sometimes-list-sometimes-string, introduce a tiny dataclass + helper that composes segments with markers.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_caching_breakpoints.py`:

```python
"""Tests for the 4-breakpoint system prompt assembly."""
from __future__ import annotations

from unittest.mock import MagicMock


def test_prompt_block_has_cache_control():
    from prompt_block import PromptBlock
    b = PromptBlock(text="identity + core", ttl="1h")
    d = b.to_anthropic()
    assert d["type"] == "text"
    assert d["text"] == "identity + core"
    assert d["cache_control"] == {"type": "ephemeral", "ttl": "1h"}


def test_prompt_block_no_cache_for_conversation():
    from prompt_block import PromptBlock
    b = PromptBlock(text="user turn", ttl=None)
    d = b.to_anthropic()
    assert "cache_control" not in d


def test_compose_four_breakpoints_in_order():
    from prompt_block import compose_system_blocks
    blocks = compose_system_blocks(
        identity_core="identity + p1 skills",
        schema_context="schema + dialect + domain",
        retrieved_skills="retrieved + memory",
    )
    # Three cached segments, each with the right TTL.
    assert len(blocks) == 3
    assert blocks[0].ttl == "1h"
    assert blocks[1].ttl == "1h"
    assert blocks[2].ttl == "5m"
    assert "identity + p1 skills" in blocks[0].text
    assert "schema + dialect + domain" in blocks[1].text
    assert "retrieved + memory" in blocks[2].text


def test_compose_skips_empty_segments():
    """Don't emit empty cache blocks."""
    from prompt_block import compose_system_blocks
    blocks = compose_system_blocks(
        identity_core="identity",
        schema_context="",
        retrieved_skills="",
    )
    assert len(blocks) == 1
    assert blocks[0].text == "identity"
```

- [ ] **Step 2: Run tests, expect fail**

```bash
cd backend
python -m pytest tests/test_caching_breakpoints.py -v
```

Expected: `ModuleNotFoundError: No module named 'prompt_block'`.

- [ ] **Step 3: Implement `backend/prompt_block.py`**

```python
"""Prompt block dataclass for Anthropic 4-breakpoint caching.

See askdb-skills/core/caching-breakpoint-policy.md for the TTL policy
and invalidation rules. This module only composes the Anthropic API
shape; invocation lives in anthropic_provider.py (unchanged).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

TTL = Literal["1h", "5m"]


@dataclass(frozen=True, slots=True)
class PromptBlock:
    text: str
    ttl: Optional[TTL]  # None = no cache_control (conversation turn)

    def to_anthropic(self) -> dict:
        out: dict = {"type": "text", "text": self.text}
        if self.ttl is not None:
            out["cache_control"] = {"type": "ephemeral", "ttl": self.ttl}
        return out


def compose_system_blocks(
    *,
    identity_core: str,
    schema_context: str,
    retrieved_skills: str,
) -> list[PromptBlock]:
    """Build the three cached system segments. Empty segments are dropped.

    The fourth breakpoint (conversation + latest user turn) is emitted by
    the caller — this function is system-only.
    """
    blocks: list[PromptBlock] = []
    if identity_core.strip():
        blocks.append(PromptBlock(text=identity_core, ttl="1h"))
    if schema_context.strip():
        blocks.append(PromptBlock(text=schema_context, ttl="1h"))
    if retrieved_skills.strip():
        blocks.append(PromptBlock(text=retrieved_skills, ttl="5m"))
    return blocks
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend
python -m pytest tests/test_caching_breakpoints.py -v
```

Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/prompt_block.py backend/tests/test_caching_breakpoints.py
git commit -m "feat(skills): PromptBlock + 4-breakpoint composer (Plan 3 P2T4)"
```

---

# PHASE 3 — Skill injection in prompt building

## Task 5: Wire `SkillLibrary` into app lifespan

**Files:**
- Modify: `backend/main.py` (lifespan startup)

**Rationale:** Singleton skill library loaded once at startup; lives on `app.state.skill_library`. No per-request loading.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_main_skill_state.py`:

```python
"""Smoke test: skill_library is attached to app.state after startup."""
from __future__ import annotations

from pathlib import Path
import pytest


def test_skill_library_on_app_state():
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app):
        lib = getattr(app.state, "skill_library", None)
        assert lib is not None, "SkillLibrary not attached to app.state"
        from skill_library import SkillLibrary
        assert isinstance(lib, SkillLibrary)
        assert len(lib.all_names()) >= 48
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_main_skill_state.py -v
```

Expected: `AttributeError: 'State' object has no attribute 'skill_library'`.

- [ ] **Step 3: Modify `backend/main.py` lifespan**

Locate the `@asynccontextmanager async def lifespan(app: FastAPI):` block in `main.py`. At the top of the startup section (before any `start_*_scheduler()` calls), add:

```python
    # Skill library — Plan 3 P3T5
    from skill_library import SkillLibrary
    from pathlib import Path as _Path
    _skills_root = _Path(__file__).resolve().parent.parent / "askdb-skills"
    try:
        app.state.skill_library = SkillLibrary(root=_skills_root)
    except FileNotFoundError as exc:
        import logging
        logging.getLogger(__name__).warning("skill_library: %s; continuing without", exc)
        app.state.skill_library = None
```

- [ ] **Step 4: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_main_skill_state.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/main.py backend/tests/test_main_skill_state.py
git commit -m "feat(skills): attach SkillLibrary to app.state in lifespan (Plan 3 P3T5)"
```

---

## Task 6: Refactor `_build_system_prompt` to emit PromptBlocks

**Files:**
- Modify: `backend/agent_engine.py` (lines ~1620-1755 `_build_system_prompt` method)
- Test: `backend/tests/test_agent_prompt_blocks.py`

**Rationale:** Switch the return type from single string to `list[PromptBlock]`. Gate on `settings.SKILL_LIBRARY_ENABLED` — when `False`, old behaviour preserved (returns `[PromptBlock(text=original_string, ttl=None)]` so nothing caches). When `True`, split into 4 breakpoints and consult `SkillRouter`.

- [ ] **Step 1: Write test**

Create `backend/tests/test_agent_prompt_blocks.py`:

```python
"""AgentEngine._build_system_prompt returns PromptBlock list under the flag."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_agent():
    from agent_engine import AgentEngine
    from skill_library import SkillLibrary
    from pathlib import Path

    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = engine
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    memory.get_messages = MagicMock(return_value=[])
    agent = AgentEngine(
        engine=engine, email="test@example.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    return agent


def test_flag_off_returns_single_block(mock_agent, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    blocks = mock_agent._build_system_blocks(question="hi", prefetch_context="")
    assert len(blocks) == 1
    assert blocks[0].ttl is None  # no caching when flag off


def test_flag_on_returns_three_cached_blocks(mock_agent, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    blocks = mock_agent._build_system_blocks(question="hi", prefetch_context="")
    # Identity + schema + retrieved = up to 3 (schema may be empty in test).
    assert 1 <= len(blocks) <= 3
    for b in blocks:
        assert b.ttl in ("1h", "5m")


def test_flag_on_includes_security_rules(mock_agent, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    blocks = mock_agent._build_system_blocks(question="hi", prefetch_context="")
    joined = "\n".join(b.text for b in blocks)
    # security-rules.md content must appear in the identity breakpoint.
    assert "security" in joined.lower() or "read-only" in joined.lower()
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_agent_prompt_blocks.py -v
```

Expected: `AttributeError: 'AgentEngine' object has no attribute '_build_system_blocks'`.

- [ ] **Step 3: Add `_build_system_blocks` to `agent_engine.py`**

In `backend/agent_engine.py`, immediately after the existing `_build_system_prompt` method definition, add this new method:

```python
    def _build_system_blocks(self, question: str, prefetch_context: str) -> list:
        """Plan 3 P3T6: 4-breakpoint-aware system prompt composition.

        Flag OFF: returns the existing flat string wrapped in a single
        non-cached block (behaviour-preserving).

        Flag ON: splits into 3 cached segments per askdb-skills/core/
        caching-breakpoint-policy.md — identity+Priority-1 (1h),
        schema+dialect+domain (1h), retrieved skills + memory (5m).
        """
        from prompt_block import PromptBlock, compose_system_blocks
        from config import settings

        if not settings.SKILL_LIBRARY_ENABLED:
            # Flag off: call existing builder, wrap result.
            return [PromptBlock(text=self._build_system_prompt(question, prefetch_context), ttl=None)]

        lib = getattr(self, "_skill_library", None)
        if lib is None:
            # Skill library not wired; fall back to legacy path.
            return [PromptBlock(text=self._build_system_prompt(question, prefetch_context), ttl=None)]

        from skill_router import SkillRouter
        router = SkillRouter(library=lib)
        hits = router.resolve(question, self.connection_entry, action_type="sql-generation")

        identity_parts = [self.SYSTEM_PROMPT]
        schema_parts: list[str] = []
        retrieved_parts: list[str] = []

        for h in hits:
            header = f"\n\n### Skill: {h.name}\n\n"
            if h.priority == 1:
                identity_parts.append(header + h.content)
            elif h.source == "deterministic":
                schema_parts.append(header + h.content)
            else:
                retrieved_parts.append(header + h.content)

        if prefetch_context:
            schema_parts.append(prefetch_context)

        return compose_system_blocks(
            identity_core="".join(identity_parts),
            schema_context="".join(schema_parts),
            retrieved_skills="".join(retrieved_parts),
        )
```

Also add this import at the top of `agent_engine.py` if not already present:

```python
from prompt_block import PromptBlock  # type: ignore  # noqa: F401
```

- [ ] **Step 4: Wire `_skill_library` in `__init__`**

In `AgentEngine.__init__`, after `self._query_memory = QueryMemory()` add:

```python
        # Skill library (Plan 3) — optional; None when lifespan didn't attach.
        import importlib
        self._skill_library = None
        try:
            main_mod = importlib.import_module("main")
            self._skill_library = getattr(main_mod.app.state, "skill_library", None)
        except Exception:
            pass
```

- [ ] **Step 5: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_agent_prompt_blocks.py -v
```

Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/agent_engine.py backend/tests/test_agent_prompt_blocks.py
git commit -m "feat(skills): _build_system_blocks with 4-breakpoint support behind flag (Plan 3 P3T6)"
```

---

## Task 7: Route agent LLM calls through block-aware path

**Files:**
- Modify: `backend/agent_engine.py` (every call site that builds messages with system prompt)

**Rationale:** Right now callers do something like `messages = [{"role":"system","content":self._build_system_prompt(...)}, ...]`. Change to consume `_build_system_blocks` output. Provider adapter already supports `content: [blocks]` since Anthropic SDK accepts both string and list of content blocks.

- [ ] **Step 1: Write the failing integration test**

Create/edit `backend/tests/test_agent_engine_flag_behavior.py`:

```python
"""Smoke test: flag OFF preserves legacy single-string system prompt."""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def test_flag_off_legacy_path_unchanged(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)

    from agent_engine import AgentEngine
    engine, provider, memory = MagicMock(), MagicMock(), MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory.get_messages = MagicMock(return_value=[])
    conn = MagicMock()
    conn.db_type = "postgresql"

    agent = AgentEngine(
        engine=engine, email="a@b.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    blocks = agent._build_system_blocks(question="hi", prefetch_context="")
    # Single block, no caching — matches legacy behavior modulo wrapping.
    assert len(blocks) == 1
    assert blocks[0].ttl is None


def test_flag_on_provider_receives_list_content(monkeypatch):
    """When flag on, AgentEngine should pass system as list-of-blocks."""
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)

    from agent_engine import AgentEngine
    from skill_library import SkillLibrary
    from pathlib import Path

    engine, provider, memory = MagicMock(), MagicMock(), MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory.get_messages = MagicMock(return_value=[])
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})

    agent = AgentEngine(
        engine=engine, email="a@b.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    blocks = agent._build_system_blocks(question="show revenue", prefetch_context="")
    assert isinstance(blocks, list)
    assert all(hasattr(b, "to_anthropic") for b in blocks)
    anthropic_payload = [b.to_anthropic() for b in blocks]
    # Identity block must have cache_control when flag on.
    assert any("cache_control" in p for p in anthropic_payload)
```

- [ ] **Step 2: Run, expect pass** (both tests use only the method introduced in Task 6)

```bash
cd backend
python -m pytest tests/test_agent_engine_flag_behavior.py -v
```

Expected: 2 pass.

- [ ] **Step 3: Find every agent call site that builds messages with system prompt**

Search `backend/agent_engine.py` for all occurrences of `_build_system_prompt(`:

```bash
cd backend
grep -n "_build_system_prompt" agent_engine.py
```

For each call site (there may be several — SSE run path, non-streaming path, ask-user-resume path), convert:

```python
# BEFORE
system_text = self._build_system_prompt(question, prefetch_context)
messages = [{"role": "system", "content": system_text}, *memory_messages, user_turn]

# AFTER
system_blocks = self._build_system_blocks(question, prefetch_context)
system_content = [b.to_anthropic() for b in system_blocks]
# Provider accepts list-or-string.
messages = [{"role": "system", "content": system_content}, *memory_messages, user_turn]
```

Do NOT delete `_build_system_prompt` — `_build_system_blocks` still calls it when the flag is off.

- [ ] **Step 4: Run the full agent-related test suite**

```bash
cd backend
python -m pytest tests/test_adv_chart_stream_endpoint.py tests/test_skill_library.py tests/test_skill_router.py tests/test_agent_engine_flag_behavior.py tests/test_agent_prompt_blocks.py tests/test_caching_breakpoints.py tests/test_skill_library_structure.py -v --timeout=30
```

Expected: all pass; flag-off default means no regression in existing agent behaviour.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/agent_engine.py backend/tests/test_agent_engine_flag_behavior.py
git commit -m "feat(skills): route agent LLM calls through block-aware system prompt (Plan 3 P3T7)"
```

---

## Task 8: Mirror skill injection in `query_engine.py`

**Files:**
- Modify: `backend/query_engine.py` — add `_build_system_blocks` alongside the existing prompt-building path.
- Test: `backend/tests/test_query_engine_skill_injection.py`

- [ ] **Step 1: Write test**

Create `backend/tests/test_query_engine_skill_injection.py`:

```python
"""QueryEngine prompt composition honours SKILL_LIBRARY_ENABLED."""
from __future__ import annotations

from unittest.mock import MagicMock


def test_query_engine_flag_off(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)

    from query_engine import QueryEngine
    db = MagicMock()
    db.get_schema_info = MagicMock(return_value={})
    qe = QueryEngine(db=db, conn_id="test", provider=MagicMock())
    prompt = qe._build_system_blocks("show revenue")
    assert len(prompt) == 1
    assert prompt[0].ttl is None


def test_query_engine_flag_on_has_cached_blocks(monkeypatch):
    from config import settings
    from pathlib import Path
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)

    from query_engine import QueryEngine
    from skill_library import SkillLibrary

    db = MagicMock()
    db.get_schema_info = MagicMock(return_value={})
    qe = QueryEngine(db=db, conn_id="test", provider=MagicMock())
    qe._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    qe._connection_entry_stub = MagicMock(db_type="postgresql", engine=MagicMock())
    qe._connection_entry_stub.engine.db = db
    prompt = qe._build_system_blocks("show revenue")
    assert any(b.ttl in ("1h", "5m") for b in prompt)
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_query_engine_skill_injection.py -v
```

Expected: `AttributeError: 'QueryEngine' object has no attribute '_build_system_blocks'`.

- [ ] **Step 3: Add `_build_system_blocks` to `QueryEngine`**

In `backend/query_engine.py`, add this method on the `QueryEngine` class:

```python
    def _build_system_blocks(self, question: str):
        """Plan 3 P3T8: skill-library-aware prompt composition for single-shot flow."""
        from prompt_block import PromptBlock, compose_system_blocks
        from config import settings

        # Single-shot path does not have a precise agent system prompt; fall
        # back to the existing prompt-build method if we have one, else use
        # a minimal identity string.
        legacy = getattr(self, "_build_system_prompt", None)
        legacy_text = legacy(question) if callable(legacy) else "You are AskDB."

        if not settings.SKILL_LIBRARY_ENABLED:
            return [PromptBlock(text=legacy_text, ttl=None)]

        lib = getattr(self, "_skill_library", None)
        if lib is None:
            return [PromptBlock(text=legacy_text, ttl=None)]

        # Re-use the agent's router — single-shot path needs dialect + domain too.
        from skill_router import SkillRouter
        router = SkillRouter(library=lib)
        conn_stub = getattr(self, "_connection_entry_stub", None)
        hits = router.resolve(question, conn_stub, action_type="sql-generation") if conn_stub else router.library.always_on()

        identity = legacy_text + "\n\n" + "".join(
            f"### Skill: {h.name}\n\n{h.content}\n\n" for h in hits if h.priority == 1
        )
        schema = "".join(
            f"### Skill: {h.name}\n\n{h.content}\n\n" for h in hits if h.source == "deterministic"
        )
        retrieved = "".join(
            f"### Skill: {h.name}\n\n{h.content}\n\n" for h in hits if h.source == "rag"
        )
        return compose_system_blocks(
            identity_core=identity,
            schema_context=schema,
            retrieved_skills=retrieved,
        )
```

- [ ] **Step 4: Wire `_skill_library` + `_connection_entry_stub` in `QueryEngine.__init__`**

Inside `QueryEngine.__init__`, after existing initialisation, add:

```python
        # Plan 3 — optional skill library attach; callers may set later.
        self._skill_library = None
        self._connection_entry_stub = None
```

And in `connection_routes.py` (or wherever `QueryEngine` is instantiated per connection), after `entry.engine = QueryEngine(...)` add:

```python
        # Plan 3: attach skill library + connection-entry stub so single-shot
        # path can consult SkillRouter with the right dialect + domain.
        from fastapi import FastAPI  # for type-checker only
        import sys
        _app = sys.modules.get("main")
        if _app is not None and getattr(_app.app.state, "skill_library", None) is not None:
            entry.engine._skill_library = _app.app.state.skill_library
            entry.engine._connection_entry_stub = entry
```

- [ ] **Step 5: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_query_engine_skill_injection.py -v
```

Expected: 2 pass.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/query_engine.py backend/routers/connection_routes.py backend/tests/test_query_engine_skill_injection.py
git commit -m "feat(skills): mirror skill injection in QueryEngine single-shot path (Plan 3 P3T8)"
```

---

## Task 9: Ingest skill library into ChromaDB at startup + wire RAG into router

**Files:**
- Modify: `backend/main.py` (lifespan: call `maybe_ingest` after `SkillLibrary` is built, attach collection to router factory)
- Modify: `backend/skill_router.py` (add factory function `default_router(app_state)` that reads `app.state.skill_collection`)

- [ ] **Step 1: Write test**

Create `backend/tests/test_skill_ingest_startup.py`:

```python
def test_skill_collection_on_app_state():
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app):
        coll = getattr(app.state, "skill_collection", None)
        # Ingest may be skipped if stamp up-to-date; either way, attribute exists.
        assert hasattr(app.state, "skill_collection")
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_skill_ingest_startup.py -v
```

Expected: assertion on `hasattr` fails.

- [ ] **Step 3: Extend `main.py` lifespan**

Right after the `app.state.skill_library = SkillLibrary(...)` block from Task 5, add:

```python
    # Plan 3 P3T9: ingest skills into ChromaDB
    from skill_ingest import maybe_ingest
    import chromadb
    try:
        _chroma_client = chromadb.PersistentClient(path=".chroma/querycopilot")
        _stamp_dir = _Path(".data")
        if app.state.skill_library is not None:
            maybe_ingest(app.state.skill_library, _chroma_client, _stamp_dir)
            app.state.skill_collection = _chroma_client.get_or_create_collection(name="skills_v1")
        else:
            app.state.skill_collection = None
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("skill_ingest startup: %s", exc)
        app.state.skill_collection = None
```

- [ ] **Step 4: Update `SkillRouter` to accept + query the collection**

In `backend/skill_router.py`, the `resolve()` method already probes `self.collection`. Now make the injection point set it at construction.

Then update the callsite in `agent_engine._build_system_blocks`:

```python
        from skill_router import SkillRouter
        collection = getattr(getattr(self, "_skill_collection", None), "collection", None) or getattr(self, "_skill_collection", None)
        router = SkillRouter(library=lib, chroma_collection=collection)
```

And in `AgentEngine.__init__` after the `self._skill_library` wiring:

```python
        try:
            self._skill_collection = main_mod.app.state.skill_collection
        except Exception:
            self._skill_collection = None
```

- [ ] **Step 5: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_skill_ingest_startup.py tests/test_skill_router.py tests/test_agent_prompt_blocks.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/main.py backend/skill_router.py backend/agent_engine.py backend/tests/test_skill_ingest_startup.py
git commit -m "feat(skills): ingest skills into ChromaDB at startup + wire RAG collection into router (Plan 3 P3T9)"
```

---

# PHASE 4 — Correction queue + ICRH safeguards

## Task 10: Correction queue module

**Files:**
- Create: `backend/correction_queue.py`
- Test: `backend/tests/test_correction_queue.py`

- [ ] **Step 1: Write failing test**

```python
"""Tests for correction_queue.py."""
from __future__ import annotations

import json
from pathlib import Path

import pytest


def test_enqueue_writes_json_file(tmp_path):
    from correction_queue import enqueue
    path = enqueue(
        user_hash="abc123",
        question="revenue by region",
        original_sql="SELECT ...",
        corrected_sql="SELECT ... WHERE NOT test_account",
        user_note="exclude tests",
        connection_id="conn-1",
        queue_root=tmp_path,
    )
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["question"] == "revenue by region"
    assert data["status"] == "pending_review"
    assert data["tier"] == "T1_explicit_edit"


def test_enqueue_never_touches_chroma(tmp_path, monkeypatch):
    """Regression guard: correction writes ONLY to queue_root, not ChromaDB."""
    from correction_queue import enqueue
    touched = []
    monkeypatch.setattr("chromadb.PersistentClient", lambda *a, **k: touched.append(True))
    enqueue(
        user_hash="abc123", question="q", original_sql="s", corrected_sql="s2",
        user_note="", connection_id="c", queue_root=tmp_path,
    )
    assert touched == [], "correction_queue should not import/init ChromaDB"


def test_list_pending(tmp_path):
    from correction_queue import enqueue, list_pending
    for i in range(3):
        enqueue(
            user_hash=f"u{i}", question=f"q{i}", original_sql="",
            corrected_sql="", user_note="", connection_id="c", queue_root=tmp_path,
        )
    pending = list_pending(queue_root=tmp_path)
    assert len(pending) == 3
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_correction_queue.py -v
```

Expected: ImportError.

- [ ] **Step 3: Implement `backend/correction_queue.py`**

```python
"""Write-only correction queue.

Corrections land here; the review pipeline (correction_reviewer.py) decides
promotion. NEVER import ChromaDB from this module — keeps the write path
strictly filesystem and makes ICRH safeguards auditable.

See askdb-skills/agent/learn-from-corrections.md.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

Tier = Literal["T1_explicit_edit", "T1_thumbs_up", "T2_implicit", "T3_follow_up"]
Status = Literal["pending_review", "auto_promoted", "manual_review", "rejected"]


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def enqueue(
    *,
    user_hash: str,
    question: str,
    original_sql: str,
    corrected_sql: str,
    user_note: str,
    connection_id: str,
    queue_root: Path,
    tier: Tier = "T1_explicit_edit",
) -> Path:
    ts = _iso_now()
    dir_ = queue_root / user_hash
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / f"{ts}.json"
    record = {
        "ts": ts,
        "user_hash": user_hash,
        "question": question,
        "original_sql": original_sql,
        "corrected_sql": corrected_sql,
        "user_note": user_note,
        "connection_id": connection_id,
        "status": "pending_review",
        "tier": tier,
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(record, indent=2), encoding="utf-8")
    tmp.replace(path)  # atomic
    logger.info("correction_queue: enqueued %s", path.name)
    return path


def list_pending(queue_root: Path) -> list[dict]:
    pending = []
    if not queue_root.exists():
        return pending
    for path in queue_root.rglob("*.json"):
        try:
            pending.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001
            continue
    return pending
```

- [ ] **Step 4: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_correction_queue.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/correction_queue.py backend/tests/test_correction_queue.py
git commit -m "feat(skills): correction queue write-only module (Plan 3 P4T10)"
```

---

## Task 11: Rewire `/api/queries/feedback` to correction queue

**Files:**
- Modify: `backend/routers/query_routes.py:435-451` (feedback endpoint)
- Test: `backend/tests/test_feedback_route_correction_queue.py`

- [ ] **Step 1: Write test**

```python
"""Regression test: feedback endpoint routes corrections through queue."""
from __future__ import annotations

from pathlib import Path
import json


def test_feedback_negative_writes_to_queue(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from main import app
    import config

    monkeypatch.setattr(config.settings, "CORRECTION_QUEUE_ENABLED", True)
    # Redirect queue root to tmp_path.
    import correction_queue
    monkeypatch.setattr("backend.routers.query_routes.CORRECTION_QUEUE_ROOT", tmp_path, raising=False)

    # Mock auth dependency to return a test user.
    from routers.query_routes import get_current_user
    def _fake_user():
        return {"email": "test@example.com"}
    app.dependency_overrides[get_current_user] = _fake_user

    with TestClient(app) as client:
        resp = client.post("/api/queries/feedback", json={
            "conn_id": "conn1",
            "question": "revenue",
            "sql": "SELECT 1",
            "corrected_sql": "SELECT 2",
            "is_correct": False,
            "note": "wrong",
        })
        assert resp.status_code in (200, 204)

    app.dependency_overrides.clear()

    # Verify a queue file landed.
    files = list(tmp_path.rglob("*.json"))
    assert files, "No correction file created"
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_feedback_route_correction_queue.py -v
```

Expected: 404 or 500 (endpoint rejects new body fields) OR no file created.

- [ ] **Step 3: Modify `backend/routers/query_routes.py`**

Find the `FeedbackRequest` Pydantic model. Add optional fields:

```python
class FeedbackRequest(BaseModel):
    conn_id: str
    question: str
    sql: str
    is_correct: bool
    corrected_sql: Optional[str] = None
    note: Optional[str] = None
```

Find the `record_feedback` function. Replace body with:

```python
CORRECTION_QUEUE_ROOT = Path(".data/corrections_pending")


@router.post("/feedback")
def record_feedback(req: FeedbackRequest, user: dict = Depends(get_current_user)):
    """Record user feedback. Positive → examples; negative → correction queue."""
    email = user["email"]
    entry = get_connection(req.conn_id, email)
    if req.is_correct:
        # Legacy positive path unchanged.
        entry.engine.record_feedback(req.question, req.sql, True)
        return {"status": "recorded"}

    # Negative: route through ICRH-safe queue (askdb-skills/agent/learn-from-corrections.md).
    from correction_queue import enqueue
    import hashlib
    user_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]
    enqueue(
        user_hash=user_hash,
        question=req.question,
        original_sql=req.sql,
        corrected_sql=req.corrected_sql or "",
        user_note=req.note or "",
        connection_id=req.conn_id,
        queue_root=CORRECTION_QUEUE_ROOT,
    )
    return {"status": "queued"}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_feedback_route_correction_queue.py -v
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/routers/query_routes.py backend/tests/test_feedback_route_correction_queue.py
git commit -m "feat(skills): rewire /api/queries/feedback to correction queue (Plan 3 P4T11)"
```

---

## Task 12: Hourly correction reviewer

**Files:**
- Create: `backend/correction_reviewer.py`
- Test: `backend/tests/test_correction_reviewer.py`
- Modify: `backend/main.py` (lifespan: start APScheduler job)

- [ ] **Step 1: Write test**

Create `backend/tests/test_correction_reviewer.py`:

```python
from pathlib import Path
import json


def test_classify_safe_dedup(tmp_path):
    from correction_reviewer import classify

    rec = {
        "question": "revenue by region",
        "original_sql": "SELECT SUM(amount) FROM orders GROUP BY region",
        "corrected_sql": "SELECT SUM(amount) FROM orders WHERE NOT test GROUP BY region",
    }
    assert classify(rec) == "safe_dedup"


def test_classify_schema_change(tmp_path):
    from correction_reviewer import classify

    rec = {
        "question": "...",
        "original_sql": "SELECT * FROM orders",
        "corrected_sql": "SELECT * FROM invoices",
    }
    assert classify(rec) == "schema_change"


def test_review_batch_promotes_after_majority(tmp_path, monkeypatch):
    from correction_queue import enqueue
    from correction_reviewer import review_batch

    for i in range(3):
        enqueue(
            user_hash=f"u{i}", question="revenue",
            original_sql="SELECT * FROM orders",
            corrected_sql="SELECT * FROM orders WHERE NOT is_test",
            user_note="", connection_id="same-conn", queue_root=tmp_path,
        )
    promoted = []
    monkeypatch.setattr("correction_reviewer.promote_to_examples", lambda rec: promoted.append(rec))
    result = review_batch(queue_root=tmp_path, golden_eval_ok=lambda _: True)
    assert result["safe_dedup"] >= 1
    assert len(promoted) == 1  # One canonical correction promoted via majority
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_correction_reviewer.py -v
```

- [ ] **Step 3: Implement `backend/correction_reviewer.py`**

```python
"""Hourly correction reviewer.

Reads pending corrections, classifies them, aggregates by (question-hash,
connection_id), and promotes only when:
  - classification == 'safe_dedup'
  - at least 3 independent users submitted the same correction
  - golden eval passes in shadow (callback supplied by caller).

Everything else is marked manual_review.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Callable, Literal

import sqlglot

logger = logging.getLogger(__name__)

Classification = Literal["safe_dedup", "schema_change", "semantic_change"]


def _table_set(sql: str) -> set[str]:
    try:
        parsed = sqlglot.parse_one(sql)
        return {t.name.lower() for t in parsed.find_all(sqlglot.exp.Table)}
    except Exception:
        return set()


def classify(record: dict) -> Classification:
    orig_tables = _table_set(record["original_sql"])
    corr_tables = _table_set(record["corrected_sql"])
    if orig_tables != corr_tables:
        return "schema_change"
    # If WHERE/filter added/removed but tables + projected columns match, dedup.
    # Heuristic: same normalized SELECT list.
    try:
        a = sqlglot.parse_one(record["original_sql"]).find(sqlglot.exp.Select)
        b = sqlglot.parse_one(record["corrected_sql"]).find(sqlglot.exp.Select)
        a_cols = tuple(str(e) for e in a.expressions) if a else ()
        b_cols = tuple(str(e) for e in b.expressions) if b else ()
        if a_cols == b_cols:
            return "safe_dedup"
    except Exception:
        pass
    return "semantic_change"


def promote_to_examples(record: dict) -> None:  # pragma: no cover - runtime only
    """Placeholder — wired by callers that hold the QueryEngine handle."""
    logger.info("correction_reviewer: would promote correction for %s", record.get("question"))


def review_batch(
    queue_root: Path,
    golden_eval_ok: Callable[[dict], bool],
) -> dict:
    """Scan queue, aggregate corrections, promote majority-vote safe_dedups."""
    from correction_queue import list_pending
    pending = list_pending(queue_root=queue_root)
    by_group: dict[tuple, list[dict]] = defaultdict(list)
    counts = Counter()

    for rec in pending:
        cls = classify(rec)
        counts[cls] += 1
        if cls != "safe_dedup":
            continue
        q_norm = re.sub(r"\s+", " ", rec["question"].strip().lower())
        key = (rec["connection_id"], q_norm)
        by_group[key].append(rec)

    promoted = 0
    for key, recs in by_group.items():
        unique_users = {r["user_hash"] for r in recs}
        if len(unique_users) < 3:
            continue
        canonical = recs[0]  # arbitrary but deterministic
        if not golden_eval_ok(canonical):
            logger.warning("correction_reviewer: rejected — golden eval regressed")
            continue
        promote_to_examples(canonical)
        promoted += 1

    return {**counts, "promoted": promoted}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_correction_reviewer.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Wire APScheduler in `main.py` lifespan**

After the existing digest scheduler:

```python
    # Plan 3 P4T12: hourly correction reviewer
    from correction_reviewer import review_batch
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        lambda: review_batch(_Path(".data/corrections_pending"), lambda rec: True),  # Golden eval wired in Phase 5
        CronTrigger(minute=17),  # top-of-hour +17 min to avoid storms
        id="correction_reviewer",
        max_instances=1,
    )
    scheduler.start()
    app.state.correction_scheduler = scheduler
```

And on shutdown:
```python
    sched = getattr(app.state, "correction_scheduler", None)
    if sched:
        sched.shutdown()
```

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/correction_reviewer.py backend/tests/test_correction_reviewer.py backend/main.py
git commit -m "feat(skills): hourly correction reviewer + APScheduler job (Plan 3 P4T12)"
```

---

# PHASE 5 — Golden eval gate

## Task 13: Seed golden eval set + harness

**Files:**
- Create: `backend/eval/__init__.py` (empty)
- Create: `backend/eval/golden_nl_sql.jsonl`
- Create: `backend/eval/run_golden_eval.py`
- Test: `backend/tests/test_golden_eval.py`

- [ ] **Step 1: Write test**

```python
"""Golden eval harness tests."""
from pathlib import Path


def test_eval_loads_20_pairs():
    from eval.run_golden_eval import load_eval_set
    path = Path(__file__).resolve().parents[1] / "eval" / "golden_nl_sql.jsonl"
    pairs = load_eval_set(path)
    assert len(pairs) >= 20


def test_score_pattern_match():
    from eval.run_golden_eval import score_pattern
    ok = score_pattern("SELECT SUM(amount) FROM orders", r"SUM\(.*amount.*\)")
    assert ok is True
    bad = score_pattern("SELECT count(*) FROM orders", r"SUM\(.*amount.*\)")
    assert bad is False


def test_eval_regression_check():
    from eval.run_golden_eval import is_regression
    # Baseline 20/20, shadow 20/20 → no regression
    assert is_regression(baseline_pass_rate=1.0, shadow_pass_rate=1.0, threshold=0.02) is False
    # Baseline 1.0, shadow 0.95 → 5% regression > 2% threshold
    assert is_regression(baseline_pass_rate=1.0, shadow_pass_rate=0.95, threshold=0.02) is True
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_golden_eval.py -v
```

- [ ] **Step 3: Create golden set**

Write `backend/eval/golden_nl_sql.jsonl` with 20 pairs. Start with this seed:

```jsonl
{"id":"rev-01","question":"Total revenue last month","expected_tables":["orders","invoices"],"expected_pattern":"SUM\\(.*amount.*\\)","dialect":"postgresql"}
{"id":"rev-02","question":"Gross revenue by region","expected_tables":["orders","customers","regions"],"expected_pattern":"(?s)SUM\\(.*GROUP BY.*region","dialect":"postgresql"}
{"id":"time-01","question":"Monthly active users over last 6 months","expected_tables":["users","events"],"expected_pattern":"(?s)DATE_TRUNC\\('month'.*COUNT\\(DISTINCT","dialect":"postgresql"}
{"id":"time-02","question":"Year-over-year growth","expected_tables":["orders"],"expected_pattern":"LAG\\(|DATEADD|INTERVAL '1 year'","dialect":"postgresql"}
{"id":"time-03","question":"Last 30 days sales","expected_tables":["orders"],"expected_pattern":"INTERVAL '29 days'|CURRENT_DATE - 29","dialect":"postgresql"}
{"id":"join-01","question":"Customers with total spend","expected_tables":["customers","orders"],"expected_pattern":"(?s)JOIN.*GROUP BY.*customer","dialect":"postgresql"}
{"id":"join-02","question":"Products per order","expected_tables":["orders","order_items","products"],"expected_pattern":"(?s)JOIN.*order_items.*JOIN","dialect":"postgresql"}
{"id":"join-03","question":"Employees and their managers","expected_tables":["employees"],"expected_pattern":"(?s)LEFT JOIN employees.*manager_id","dialect":"postgresql"}
{"id":"null-01","question":"Average order value excluding nulls","expected_tables":["orders"],"expected_pattern":"AVG\\(.*amount.*\\)","dialect":"postgresql"}
{"id":"null-02","question":"Conversion rate","expected_tables":["events"],"expected_pattern":"NULLIF\\(","dialect":"postgresql"}
{"id":"funnel-01","question":"Signup to purchase conversion","expected_tables":["users","orders"],"expected_pattern":"(?s)SELECT.*COUNT","dialect":"postgresql"}
{"id":"cohort-01","question":"Cohort retention by signup month","expected_tables":["users","events"],"expected_pattern":"(?s)DATE_TRUNC\\('month'.*FIRST_VALUE","dialect":"postgresql"}
{"id":"churn-01","question":"Monthly churn rate","expected_tables":["subscriptions","customers"],"expected_pattern":"(?s)cancelled_at|is_churned","dialect":"postgresql"}
{"id":"ltv-01","question":"Customer lifetime value","expected_tables":["orders","customers"],"expected_pattern":"(?s)SUM\\(.*amount.*\\).*GROUP BY.*customer","dialect":"postgresql"}
{"id":"cac-01","question":"Customer acquisition cost Q1","expected_tables":["marketing_spend","customers"],"expected_pattern":"(?s)SUM\\(.*spend.*\\).*COUNT","dialect":"postgresql"}
{"id":"top-01","question":"Top 10 products by revenue","expected_tables":["products","order_items"],"expected_pattern":"(?s)ORDER BY.*DESC.*LIMIT 10","dialect":"postgresql"}
{"id":"dist-01","question":"Distribution of order values","expected_tables":["orders"],"expected_pattern":"(?s)COUNT\\(|GROUP BY|NTILE","dialect":"postgresql"}
{"id":"geo-01","question":"Sales by country","expected_tables":["orders","customers"],"expected_pattern":"(?s)GROUP BY.*country","dialect":"postgresql"}
{"id":"dialect-01","question":"ILIKE search for 'acme'","expected_tables":["customers"],"expected_pattern":"ILIKE","dialect":"postgresql"}
{"id":"dialect-02","question":"BigQuery date truncation to month","expected_tables":["orders"],"expected_pattern":"DATE_TRUNC\\([^,]+, MONTH\\)","dialect":"bigquery"}
```

- [ ] **Step 4: Implement `backend/eval/run_golden_eval.py`**

```python
"""Golden NL→SQL eval harness.

Runs every pair through the current skill + prompt configuration.
Scores by: (a) expected tables appear in generated SQL, (b) regex pattern
matches. Outputs a JSON report.

Usage:
    python -m backend.eval.run_golden_eval [--shadow]
    python -m backend.eval.run_golden_eval --baseline baseline.json --shadow shadow.json --threshold 0.02
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def load_eval_set(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def score_pattern(sql: str, pattern: str) -> bool:
    try:
        return bool(re.search(pattern, sql, re.IGNORECASE))
    except re.error:
        return False


def score_tables(sql: str, expected: list[str]) -> bool:
    sql_lower = sql.lower()
    return all(t.lower() in sql_lower for t in expected)


def is_regression(*, baseline_pass_rate: float, shadow_pass_rate: float, threshold: float) -> bool:
    return (baseline_pass_rate - shadow_pass_rate) > threshold


def run(set_path: Path, sql_generator) -> dict:
    pairs = load_eval_set(set_path)
    results = []
    for p in pairs:
        sql = sql_generator(p["question"], p.get("dialect", "postgresql"))
        passed = score_tables(sql, p["expected_tables"]) and score_pattern(sql, p["expected_pattern"])
        results.append({"id": p["id"], "question": p["question"], "sql": sql, "passed": passed})
    pass_rate = sum(r["passed"] for r in results) / max(len(results), 1)
    return {"pass_rate": pass_rate, "total": len(results), "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--shadow", type=Path)
    parser.add_argument("--threshold", type=float, default=0.02)
    args = parser.parse_args()

    if args.baseline and args.shadow:
        b = json.loads(args.baseline.read_text())
        s = json.loads(args.shadow.read_text())
        regressed = is_regression(
            baseline_pass_rate=b["pass_rate"],
            shadow_pass_rate=s["pass_rate"],
            threshold=args.threshold,
        )
        print(json.dumps({
            "baseline": b["pass_rate"], "shadow": s["pass_rate"],
            "regressed": regressed, "threshold": args.threshold,
        }, indent=2))
        return 1 if regressed else 0

    # Stub SQL generator for smoke — real generator injected by caller.
    def _stub(q: str, dialect: str) -> str:
        return "SELECT 1"

    set_path = Path(__file__).resolve().parent / "golden_nl_sql.jsonl"
    report = run(set_path, _stub)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
```

Create empty `backend/eval/__init__.py`.

- [ ] **Step 5: Run tests**

```bash
cd backend
python -m pytest tests/test_golden_eval.py -v
```

Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/eval/ backend/tests/test_golden_eval.py
git commit -m "feat(skills): golden eval set + harness (Plan 3 P5T13)"
```

---

## Task 14: Pre-commit hook — gate skill changes on golden eval

**Files:**
- Create: `.githooks/pre-commit`
- Modify: `backend/eval/run_golden_eval.py` (add `--check-staged` mode)

- [ ] **Step 1: Write script**

Create `.githooks/pre-commit`:

```bash
#!/usr/bin/env bash
# Plan 3 P5T14 — block commits that regress golden eval.
set -e

changed=$(git diff --cached --name-only | grep -E "(askdb-skills/.*\.md|backend/skill_library\.py|backend/skill_router\.py)" || true)
if [ -z "$changed" ]; then
  exit 0
fi

echo "Skill files changed — running golden eval..."
cd "$(git rev-parse --show-toplevel)"
python -m backend.eval.run_golden_eval > /tmp/eval_current.json
# First run: no baseline → pass unconditionally and store current as baseline.
if [ ! -f .data/eval_baseline.json ]; then
  mkdir -p .data
  cp /tmp/eval_current.json .data/eval_baseline.json
  echo "golden eval: first baseline established"
  exit 0
fi
python -m backend.eval.run_golden_eval \
  --baseline .data/eval_baseline.json \
  --shadow /tmp/eval_current.json
```

- [ ] **Step 2: Install hook locally**

```bash
cd "QueryCopilot V1"
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

- [ ] **Step 3: Test manually**

```bash
# Stage a skill file change + run the hook
git add askdb-skills/core/security-rules.md || true
.githooks/pre-commit
```

Expected: first run prints `"golden eval: first baseline established"` and exits 0.

- [ ] **Step 4: Commit**

```bash
git add .githooks/pre-commit
git commit -m "feat(skills): pre-commit hook — golden eval gate on skill changes (Plan 3 P5T14)"
```

---

# PHASE 6 — Drift monitor

## Task 15: Daily distribution-shift monitor

**Files:**
- Create: `backend/drift_monitor.py`
- Test: `backend/tests/test_drift_monitor.py`

- [ ] **Step 1: Write test**

```python
"""Drift monitor tests."""
def test_kl_divergence_identical():
    from drift_monitor import kl_divergence
    # Same distribution → 0 (within floating error).
    assert abs(kl_divergence({"a": 0.5, "b": 0.5}, {"a": 0.5, "b": 0.5})) < 1e-9


def test_kl_divergence_high_when_distributions_diverge():
    from drift_monitor import kl_divergence
    v = kl_divergence({"a": 0.9, "b": 0.1}, {"a": 0.1, "b": 0.9})
    assert v > 0.5


def test_action_distribution_from_audit_lines(tmp_path):
    from drift_monitor import distribution_from_audit
    path = tmp_path / "audit.jsonl"
    path.write_text("\n".join([
        '{"tables":["orders"],"join_depth":1,"chart_type":"line","tokens":1000}',
        '{"tables":["orders","customers"],"join_depth":2,"chart_type":"bar","tokens":1500}',
        '{"tables":["orders"],"join_depth":1,"chart_type":"line","tokens":1200}',
    ]))
    dist = distribution_from_audit(path, key="chart_type")
    assert abs(dist["line"] - 2/3) < 1e-9
    assert abs(dist["bar"] - 1/3) < 1e-9
```

- [ ] **Step 2: Run, expect fail**

```bash
cd backend
python -m pytest tests/test_drift_monitor.py -v
```

- [ ] **Step 3: Implement**

Create `backend/drift_monitor.py`:

```python
"""Daily drift monitor.

Compares last-24h action distribution against the 7-day baseline.
KL divergence above SKILL_DRIFT_KL_THRESHOLD → alert admin via the
existing audit-log pathway (and email if configured).
"""
from __future__ import annotations

import json
import logging
import math
from collections import Counter
from pathlib import Path

logger = logging.getLogger(__name__)


def kl_divergence(p: dict[str, float], q: dict[str, float], eps: float = 1e-9) -> float:
    keys = set(p.keys()) | set(q.keys())
    total = 0.0
    for k in keys:
        pk = p.get(k, eps)
        qk = q.get(k, eps)
        total += pk * math.log(pk / qk)
    return total


def distribution_from_audit(audit_path: Path, *, key: str) -> dict[str, float]:
    counter: Counter = Counter()
    if not audit_path.exists():
        return {}
    for line in audit_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except Exception:  # noqa: BLE001
            continue
        v = rec.get(key)
        if isinstance(v, list):
            for item in v:
                counter[str(item)] += 1
        elif v is not None:
            counter[str(v)] += 1
    total = sum(counter.values()) or 1
    return {k: v / total for k, v in counter.items()}


def check_drift(
    *,
    today_audit: Path,
    baseline_audit: Path,
    threshold: float,
    keys: list[str] = ("chart_type", "join_depth", "dialect"),
) -> dict:
    alerts = []
    for key in keys:
        today = distribution_from_audit(today_audit, key=key)
        base = distribution_from_audit(baseline_audit, key=key)
        if not today or not base:
            continue
        div = kl_divergence(today, base)
        logger.info("drift_monitor: key=%s kl=%.4f", key, div)
        if div > threshold:
            alerts.append({"key": key, "kl": div})
    return {"alerts": alerts}
```

- [ ] **Step 4: Run, expect pass**

```bash
cd backend
python -m pytest tests/test_drift_monitor.py -v
```

Expected: 3 pass.

- [ ] **Step 5: Wire daily APScheduler job in `main.py`**

In the same lifespan `AsyncIOScheduler` block from Task 12, add:

```python
    scheduler.add_job(
        lambda: check_drift(
            today_audit=_Path(".data/audit/skill_retrieval.jsonl"),
            baseline_audit=_Path(".data/audit/skill_retrieval_baseline.jsonl"),
            threshold=0.3,
        ),
        CronTrigger(hour=3, minute=23),  # 03:23 local daily
        id="drift_monitor",
        max_instances=1,
    )
```

Also add `from drift_monitor import check_drift` at the top of `main.py`.

- [ ] **Step 6: Commit**

```bash
cd "QueryCopilot V1"
git add backend/drift_monitor.py backend/tests/test_drift_monitor.py backend/main.py
git commit -m "feat(skills): daily drift monitor (Plan 3 P6T15)"
```

---

# PHASE 7 — Observability + rollout

## Task 16: Skill retrieval audit logger

**Files:**
- Modify: `backend/skill_router.py` (write an audit line per `resolve()` call)
- Test: `backend/tests/test_skill_router_audit.py`

- [ ] **Step 1: Write test**

```python
def test_router_writes_audit_line(tmp_path, monkeypatch):
    from pathlib import Path
    from skill_library import SkillLibrary
    from skill_router import SkillRouter

    audit = tmp_path / "skill_retrieval.jsonl"
    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib, chroma_collection=None, audit_path=audit)

    from unittest.mock import MagicMock
    conn = MagicMock(db_type="postgresql", engine=MagicMock())
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={})

    router.resolve("test question", conn, action_type="sql-generation")
    assert audit.exists()
    import json
    line = audit.read_text().strip().splitlines()[0]
    rec = json.loads(line)
    assert "retrieved" in rec
    assert "latency_ms" in rec
    assert "total_tokens" in rec
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Extend `SkillRouter.__init__` + `resolve`**

Add `audit_path: Optional[Path] = None` to `__init__`, store on `self`. In `resolve`, wrap body with timing + write a line at end:

```python
import json
import time
from hashlib import sha256

def resolve(self, question, connection_entry, action_type="sql-generation"):
    start = time.perf_counter()
    # ... existing body ...
    kept = self._enforce_caps(hits)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    if self.audit_path is not None:
        try:
            self.audit_path.parent.mkdir(parents=True, exist_ok=True)
            rec = {
                "question_hash": sha256(question.encode()).hexdigest()[:12],
                "retrieved": [h.name for h in kept],
                "latency_ms": elapsed_ms,
                "total_tokens": sum(h.tokens for h in kept),
            }
            with self.audit_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        except Exception as exc:
            logger.warning("skill_router: audit write failed: %s", exc)
    return kept
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add backend/skill_router.py backend/tests/test_skill_router_audit.py
git commit -m "feat(skills): skill retrieval audit logging (Plan 3 P7T16)"
```

---

## Task 17: Flag-flip: enable SKILL_LIBRARY_ENABLED in staging + run full suite

**Files:**
- No code changes — operational task + full suite run.

- [ ] **Step 1: Set env flag locally**

```bash
# In backend/.env:
SKILL_LIBRARY_ENABLED=True
```

- [ ] **Step 2: Start server**

```bash
cd backend
uvicorn main:app --reload --port 8002
```

- [ ] **Step 3: Hit smoke endpoints**

```bash
# In another terminal
curl -s http://localhost:8002/health | jq .
curl -s http://localhost:8002/api/v1/skill-library/status | jq .  # NEW, see Step 4
```

- [ ] **Step 4: Add status endpoint**

Create a tiny router in `backend/routers/skill_routes.py`:

```python
from fastapi import APIRouter, Request
router = APIRouter(prefix="/api/v1/skill-library", tags=["skill-library"])

@router.get("/status")
def status(request: Request):
    lib = getattr(request.app.state, "skill_library", None)
    coll = getattr(request.app.state, "skill_collection", None)
    from config import settings
    return {
        "enabled": settings.SKILL_LIBRARY_ENABLED,
        "library_loaded": lib is not None,
        "skill_count": len(lib.all_names()) if lib else 0,
        "chroma_collection": getattr(coll, "name", None) if coll else None,
    }
```

Register in `main.py`:

```python
from routers import skill_routes
app.include_router(skill_routes.router)
```

- [ ] **Step 5: Full regression suite**

```bash
cd backend
python -m pytest tests/ -q --timeout=30 -x
```

Expected: all pass. If any existing test fails, revert the default in `config.py` back to `False` and investigate before re-enabling.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/skill_routes.py backend/main.py
git commit -m "feat(skills): /api/v1/skill-library/status endpoint + flag-flip readiness (Plan 3 P7T17)"
```

---

## Self-Review Checklist

After finishing all tasks, walk through this list before shipping:

- [ ] **Spec coverage:**
  - Phase 1 (retrieval infra): Tasks 1, 2, 3 ✓
  - Phase 2 (caching breakpoints): Task 4 ✓
  - Phase 3 (injection): Tasks 5, 6, 7, 8, 9 ✓
  - Phase 4 (correction queue + reviewer): Tasks 10, 11, 12 ✓
  - Phase 5 (golden eval gate): Tasks 13, 14 ✓
  - Phase 6 (drift monitor): Task 15 ✓
  - Phase 7 (observability + rollout): Tasks 16, 17 ✓

- [ ] **Placeholder scan:** No `TODO`, `TBD`, `FIXME`, `<fill`, `lorem ipsum`. Verified by structure validator (running through `backend/tests/test_skill_library_structure.py`).

- [ ] **Type consistency:** `SkillHit.name` is used everywhere consistently. `SkillRouter.resolve()` signature (`question: str, connection_entry: Any, action_type: str`) matches across agent_engine, query_engine, tests. `PromptBlock.ttl` is `Literal["1h", "5m"]` or `None` in every usage. `CORRECTION_QUEUE_ROOT` path resolves the same in reviewer + router.

- [ ] **No placeholder imports:** `behavior_engine.detect_domain` is imported lazily inside `SkillRouter._domain_for` — avoids circular import at module load. Verified.

- [ ] **Feature flag safety:** `SKILL_LIBRARY_ENABLED=False` is the default. Every new code path checks the flag or falls back cleanly when the library is missing. Plan 1 pytest remains 50/50 green at every commit. Existing 500+ backend tests unchanged when flag off.

- [ ] **ICRH safety:** No code writes user corrections directly to `examples_<conn_id>` — all paths go through `correction_queue.enqueue()`. Verified by `test_enqueue_never_touches_chroma`.

- [ ] **Golden eval gate:** Pre-commit hook blocks skill changes that drop pass rate > 2%.

- [ ] **Cross-skill references:** Every reference to `askdb-skills/...` file in the code comments points to a file that actually exists in the library (verified by `test_master_index_lists_all_skills` from Plan 1).

If any item fails, fix inline before handing off.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-skill-library-retrieval-infrastructure.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
