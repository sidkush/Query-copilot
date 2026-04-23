# Grounding Stack v6 — Phase G (Retrieval Hygiene — P9 + H14 bundle extensions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce skill-library retrieval token cost by **≥30%** against a pinned 50-query corpus — without degrading trap-suite pass rates — by (a) bundling co-retrieved skills into atomic groups, (b) rewriting each user NL into an expanded embedding input before ChromaDB lookup, (c) archiving never-retrieved skills into `askdb-skills/archive/` behind a dormancy threshold (move, never delete), and (d) detecting cycles in a new `depends_on` skill DAG before retrieval.

**Architecture:** Four new backend modules (`skill_bundles.py`, `query_expansion.py`, `skill_archival.py`, `depends_on_resolver.py`). `skill_library.py` + `skill_router.py` consult the bundle table + `depends_on` closure + expansion text **before** the ChromaDB `query_texts=[question]` call; token cap enforcement stays in `_enforce_caps`. `skill_archival.py` is an **ops script** that runs over the existing SkillRouter audit log (JSONL at `.data/skill_audit/retrievals.jsonl`) and physically moves low-usage `.md` files; it never deletes. A measurement harness (`tests/test_retrieval_budget.py`) pins a 50-query corpus, runs before/after token totals, and hard-asserts the 30 % reduction — so the exit criterion is CI-verifiable, not an eyeball estimate. Bundle cache + expansion cache are keyed via `tenant_fortress.chroma_namespace()` (Ring 6) so retrieval stays tenant-isolated.

**Tech Stack:** Python 3.10+, `sqlglot` (already pinned — unused in Phase G but available), `frontmatter` (already imported by `skill_library`), `tiktoken` (already imported), Phase F `correction_pipeline` patterns (for file-backed state with atomic writes), Phase E `tenant_fortress.chroma_namespace` (for per-tenant expansion-cache keys), existing `anthropic_provider.AnthropicProvider.complete()` (Haiku 4.5 primary for query expansion — **no new LLM adapter**), existing `skill_router.SkillRouter` + `skill_library.SkillLibrary` + `skill_hit.SkillHit` (note: `SkillSource` Literal already contains `"bundle"` — no dataclass change needed).

**Scope — Phase G covers vs defers:**
- ✅ `DependsOnResolver` — parse `depends_on:` frontmatter, topological sort, synthetic-cycle detector, `ValueError` on cycle (fail-closed).
- ✅ `SkillBundles` — declarative table of bundle → {skill names, trigger_keywords, priority_ceiling}; resolver returns expanded skill set after `depends_on` closure.
- ✅ `QueryExpansion` — Haiku call with prompt-cached system block; emits ≤ `QUERY_EXPANSION_MAX_TOKENS` = 200 tokens of synonyms/paraphrases; TTL cache keyed by `(tenant_id, question_hash)`; fail-open on LLM error (return original question).
- ✅ `SkillArchival` — reads `.data/skill_audit/retrievals.jsonl`, classifies each skill by 30-day retrieval count, **moves** (never deletes) below-threshold skills to `askdb-skills/archive/<original-subdir>/` with a `moved_at` marker in frontmatter; refuses to archive any skill with `priority: 1` (always-on is immune).
- ✅ `depends_on:` frontmatter field added to ~6 skills (documented in T5 exactly which).
- ✅ `skill_library.SkillLibrary` reads `depends_on:` and stores it on `SkillHit` (new optional field, defaults empty).
- ✅ `skill_router.SkillRouter.resolve()` — new path: expansion → bundle match → deterministic → RAG → `depends_on` closure → cap enforcement.
- ✅ Measurement harness `tests/test_retrieval_budget.py` with pinned corpus `.data/retrieval_budget_corpus.jsonl` (50 Qs, committed).
- ✅ Baseline artifact `.data/retrieval_budget_baseline.json` (committed; mean tokens before Phase G).
- ✅ 1 new trap suite `tests/trap_retrieval_hygiene.jsonl` (12 Qs: bundles fire, expansion helps, cycle detected, archive respected).
- ✅ `trap_grader.py` new oracle `must_not_regress_retrieval_budget`.
- ✅ CI gate extension (ninth trap suite wired into `.github/workflows/agent-traps.yml`).
- ⛔ **Deferred:** Supply-chain + infra hardening H19–H27 (Phase H), hourly reviewer cron that feeds `AdversarialSimilarity` via expansion (Phase I P11), Alert-Manager for retrieval-lag alerts (Phase I), doc rollup (Phase J). Production wiring of the golden-suite runner that Phase F documented as "deferred to Phase G" is NOT in this plan — confirmed with master plan Phase G row 254 which scopes Phase G to retrieval only.

---

## Prerequisites

- [ ] Branch `askdb-global-comp` at or after Phase F exit gate (commit `cdec2d1` `chore(phase-f): exit gate` or later).
- [ ] `python -m pytest backend/tests/ -v` green from `QueryCopilot V1/backend/` (~1720+ pass, 1 skip).
- [ ] Phase A–F imports clean:
  ```bash
  cd "QueryCopilot V1/backend"
  python -c "
  import sys; sys.path.insert(0, '.')
  from embeddings.embedder_registry import get_embedder
  from data_coverage import DataCoverageCard
  from scope_validator import ScopeValidator, RuleId
  from intent_echo import build_echo
  from semantic_registry import SemanticRegistry
  from provenance_chip import ProvenanceChip
  from tenant_fortress import chroma_namespace
  from sampling_aware import approximate_distinct_count
  from correction_pipeline import promote_to_examples
  from golden_eval_gate import GoldenEvalGate
  from admin_ceremony import AdminCeremony
  from adversarial_similarity import AdversarialSimilarity
  print('Phase A-F imports OK')
  "
  ```
  Expected: `Phase A-F imports OK`
- [ ] Eight trap baselines present under `.data/` (count ≥ 8):
  ```bash
  ls "QueryCopilot V1/.data/" | grep baseline | wc -l
  ```
  Expected: `8` or more.
- [ ] Skill library at 49 files:
  ```bash
  find "QueryCopilot V1/askdb-skills" -name "*.md" -not -name "MASTER_INDEX.md" | wc -l
  ```
  Expected: `49`.
- [ ] Read master plan row for Phase G (line 254) + H14 embedding-migration section + "What we explicitly rejected" row 310 (archival != deletion).
- [ ] Read `backend/skill_library.py` (148 lines), `backend/skill_router.py` (237 lines), `backend/skill_hit.py` — all three hold the current retrieval surface. Note `SkillSource` Literal already contains `"bundle"`.

---

## File Structure

| Path | Create/Edit | Purpose |
|---|---|---|
| `backend/depends_on_resolver.py` | Create | Frontmatter `depends_on:` parser + topological sort + cycle detector (Kahn's algorithm, deterministic order). |
| `backend/skill_bundles.py` | Create | Declarative bundle registry + `resolve_bundles(question, hits)` → expanded `SkillHit` list, tagged `source="bundle"`. |
| `backend/query_expansion.py` | Create | Haiku-backed NL expansion with per-tenant TTL cache + ≤200-token output cap + fail-open. |
| `backend/skill_archival.py` | Create | Ops module: scan audit log → classify → move low-usage skills to `askdb-skills/archive/`. Priority-1 immune; atomic move. |
| `backend/tests/test_depends_on_resolver.py` | Create | Topo sort + synthetic cycle + missing-dep + stable order. |
| `backend/tests/test_skill_bundles.py` | Create | Bundle match + priority ceiling + dedup + empty-question safety. |
| `backend/tests/test_query_expansion.py` | Create | LLM mock + cache hit + fail-open on error + token-cap enforcement. |
| `backend/tests/test_skill_archival.py` | Create | Move semantics + priority-1 skip + marker injection + rollback-safe. |
| `backend/tests/test_retrieval_budget.py` | Create | Measurement harness: pinned corpus, before/after token totals, hard-assert ≥30 % reduction. |
| `backend/tests/trap_retrieval_hygiene.jsonl` | Create | 12 trap Qs (bundles, expansion, cycle, archive). |
| `backend/tests/test_trap_grader_phase_g.py` | Create | Unit test for `must_not_regress_retrieval_budget` oracle. |
| `backend/tests/trap_grader.py` | Modify | Add `must_not_regress_retrieval_budget` oracle. |
| `backend/skill_library.py` | Modify | Parse `depends_on:` frontmatter → attach to `SkillHit`. |
| `backend/skill_hit.py` | Modify | Add `depends_on: tuple[str, ...] = ()` field to `SkillHit` dataclass. |
| `backend/skill_router.py` | Modify | Hook expansion + bundles + `depends_on` closure into `resolve()` before cap enforcement. |
| `backend/config.py` | Modify | ~8 new flags under a "Retrieval Hygiene (Phase G — P9)" block. |
| `docs/claude/config-defaults.md` | Modify | New "Retrieval Hygiene (Phase G — P9)" section. |
| `askdb-skills/core/chromadb-retrieval-integration.md` | Modify (frontmatter only) | Add `depends_on: [security-rules]`. |
| `askdb-skills/agent/dashboard-build-protocol.md` | Modify (frontmatter only) | Add `depends_on: [multi-step-planning, session-memory-protocol]`. |
| `askdb-skills/agent/learn-from-corrections.md` | Modify (frontmatter only) | Add `depends_on: [session-memory-protocol]`. |
| `askdb-skills/sql/calculation-patterns.md` | Modify (frontmatter only) | Add `depends_on: [aggregation-rules, null-handling]`. |
| `askdb-skills/sql/join-intelligence.md` | Modify (frontmatter only) | Add `depends_on: [schema-linking-evidence, schema-profiling]`. |
| `askdb-skills/visualization/chart-formatting.md` | Modify (frontmatter only) | Add `depends_on: [chart-selection, color-system]`. |
| `askdb-skills/archive/` | Create dir + `.gitkeep` | Destination root for archival moves. |
| `.data/retrieval_budget_corpus.jsonl` | Create (committed) | 50 pinned queries spanning sql/dashboard/viz/agent. |
| `.data/retrieval_budget_baseline.json` | Create (committed) | Mean-tokens-per-retrieval snapshot PRE-Phase-G (computed in T12 with Phase G wiring disabled). |
| `.github/workflows/agent-traps.yml` | Modify | Gate ninth trap suite + retrieval-budget test. |

---

## Track A — Foundation (config + surface extensions)

### Task 0: Config flags + config-defaults.md

**Files:**
- Modify: `backend/config.py`
- Modify: `docs/claude/config-defaults.md`

- [ ] **Step 1: Add config fields**

Open `backend/config.py`. Find the "Correction Pipeline (Phase F — P6 + P10 + H15)" block (ends with `PROMOTION_LEDGER_DIR: str = Field(default=".data/promotion_ledger")`). Add immediately below it:

```python
    # ── Retrieval Hygiene (Phase G — P9) ──
    FEATURE_RETRIEVAL_HYGIENE: bool = Field(default=True, description="Master gate for Phase G (bundles + expansion + archival + depends_on).")
    FEATURE_QUERY_EXPANSION: bool = Field(default=True, description="Off -> router calls ChromaDB with raw question.")
    FEATURE_SKILL_BUNDLES: bool = Field(default=True, description="Off -> bundles never fire; fallback to 3-stage router.")
    FEATURE_DEPENDS_ON_RESOLVER: bool = Field(default=True, description="Off -> depends_on closure is a no-op.")
    QUERY_EXPANSION_MAX_TOKENS: int = Field(default=200, description="Hard cap on LLM expansion output (Haiku max_tokens).")
    QUERY_EXPANSION_CACHE_TTL_SECONDS: int = Field(default=3600, description="Per-tenant expansion cache TTL.")
    QUERY_EXPANSION_MODEL: str = Field(default="claude-haiku-4-5-20251001", description="Must match anthropic_provider default Haiku.")
    RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT: float = Field(default=30.0, description="Phase G exit criterion - measured against pinned corpus.")
    SKILL_ARCHIVAL_DORMANCY_DAYS: int = Field(default=30, description="Skill never retrieved in N days -> archival candidate.")
    SKILL_ARCHIVAL_MIN_RETRIEVALS: int = Field(default=1, description="< N retrievals in the dormancy window -> archive.")
    SKILL_ARCHIVAL_ROOT: str = Field(default="askdb-skills/archive", description="Relative to repo root. Moved files preserve subdir.")
```

- [ ] **Step 2: Update config-defaults.md**

Open `docs/claude/config-defaults.md`. Find the "Correction Pipeline (Phase F — P6 + P10 + H15)" section (ends with the `PROMOTION_LEDGER_DIR` row). Add immediately below it (before the "Calc parser (Plan 8a)" section):

```markdown
### Retrieval Hygiene (Phase G — P9)

| Constant | Value | Notes |
|---|---|---|
| `FEATURE_RETRIEVAL_HYGIENE` | `True` | Master gate for Phase G. Off → `SkillRouter.resolve` pre-G behaviour (no bundles, no expansion, no depends_on closure). |
| `FEATURE_QUERY_EXPANSION` | `True` | Off → router embeds the raw question. |
| `FEATURE_SKILL_BUNDLES` | `True` | Off → bundle stage skipped. |
| `FEATURE_DEPENDS_ON_RESOLVER` | `True` | Off → `depends_on:` frontmatter ignored at retrieval. |
| `QUERY_EXPANSION_MAX_TOKENS` | `200` | Hard cap on LLM output. Haiku `max_tokens` param. |
| `QUERY_EXPANSION_CACHE_TTL_SECONDS` | `3600` | Per-tenant expansion cache lifetime. |
| `QUERY_EXPANSION_MODEL` | `claude-haiku-4-5-20251001` | Must match `PRIMARY_MODEL`. |
| `RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT` | `30.0` | Phase G exit criterion (measured in `tests/test_retrieval_budget.py`). |
| `SKILL_ARCHIVAL_DORMANCY_DAYS` | `30` | Skill unused this long is archival candidate. |
| `SKILL_ARCHIVAL_MIN_RETRIEVALS` | `1` | < N retrievals in window → archive. |
| `SKILL_ARCHIVAL_ROOT` | `askdb-skills/archive` | Destination. Preserves original subdir. Never deletes. |
```

- [ ] **Step 3: Sanity check**

```bash
cd "QueryCopilot V1/backend"
python -c "from config import settings; print(settings.FEATURE_RETRIEVAL_HYGIENE, settings.QUERY_EXPANSION_MAX_TOKENS, settings.RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT)"
```

Expected: `True 200 30.0`

- [ ] **Step 4: Commit**

```bash
git add backend/config.py docs/claude/config-defaults.md
git commit -m "feat(phase-g): config flags for retrieval hygiene (P9)"
```

---

### Task 1: `SkillHit.depends_on` field

**Files:**
- Modify: `backend/skill_hit.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skill_hit_depends_on.py`:

```python
from pathlib import Path
from skill_hit import SkillHit


def test_skill_hit_default_depends_on_empty():
    h = SkillHit(
        name="x", priority=1, tokens=10, source="always_on",
        content="body", path=Path("/tmp/x.md"),
    )
    assert h.depends_on == ()


def test_skill_hit_accepts_depends_on_tuple():
    h = SkillHit(
        name="x", priority=1, tokens=10, source="always_on",
        content="body", path=Path("/tmp/x.md"),
        depends_on=("a", "b"),
    )
    assert h.depends_on == ("a", "b")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "QueryCopilot V1/backend"
python -m pytest tests/test_skill_hit_depends_on.py -v
```

Expected: `FAIL` — `TypeError: __init__() got an unexpected keyword argument 'depends_on'`.

- [ ] **Step 3: Add the field**

Open `backend/skill_hit.py`. Replace the dataclass body:

```python
"""Lightweight dataclass shared by SkillLibrary + SkillRouter.

Split from skill_library to avoid circular imports once SkillRouter
wants to import both SkillHit and SkillLibrary.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

SkillSource = Literal["always_on", "deterministic", "rag", "bundle", "memory_cache"]


@dataclass(frozen=True, slots=True)
class SkillHit:
    name: str
    priority: int          # 1, 2, or 3
    tokens: int            # encoded cl100k_base token count of content
    source: SkillSource
    content: str           # full body (no frontmatter)
    path: Path
    embedder_version: str = "hash-v1"  # H14: migration filtering tag
    depends_on: tuple[str, ...] = ()   # Phase G: declared skill-name dependencies
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_skill_hit_depends_on.py -v
```

Expected: `2 passed`.

- [ ] **Step 5: Verify no regressions in existing SkillHit callers**

```bash
python -m pytest tests/test_skill_router.py tests/test_skill_router_memory_cap.py tests/test_skill_router_audit.py tests/test_skill_ingest.py -v
```

Expected: all pass (existing call sites use keyword args; trailing optional field with default is backward-compatible).

- [ ] **Step 6: Commit**

```bash
git add backend/skill_hit.py backend/tests/test_skill_hit_depends_on.py
git commit -m "feat(phase-g): SkillHit.depends_on field (Ring 2 retrieval DAG)"
```

---

### Task 2: `SkillLibrary` parses `depends_on:` frontmatter

**Files:**
- Modify: `backend/skill_library.py`
- Test: `backend/tests/test_skill_library_depends_on.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skill_library_depends_on.py`:

```python
import tempfile
from pathlib import Path
from skill_library import SkillLibrary


_SKILL_WITH_DEPS = """---
name: child
priority: 2
depends_on:
  - parent-a
  - parent-b
---

child body
"""

_SKILL_NO_DEPS = """---
name: parent-a
priority: 2
---

parent body
"""


def test_skill_library_reads_depends_on():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "child.md").write_text(_SKILL_WITH_DEPS, encoding="utf-8")
        (root / "parent-a.md").write_text(_SKILL_NO_DEPS, encoding="utf-8")
        lib = SkillLibrary(root)

        child = lib.get("child")
        parent = lib.get("parent-a")

        assert child.depends_on == ("parent-a", "parent-b")
        assert parent.depends_on == ()


def test_skill_library_missing_depends_on_key_is_empty_tuple():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "only.md").write_text(_SKILL_NO_DEPS, encoding="utf-8")
        lib = SkillLibrary(root)
        assert lib.get("parent-a").depends_on == ()


def test_skill_library_malformed_depends_on_logs_and_empties(caplog):
    malformed = """---
name: bad
priority: 3
depends_on: not-a-list
---

body
"""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "bad.md").write_text(malformed, encoding="utf-8")
        with caplog.at_level("WARNING"):
            lib = SkillLibrary(root)
        assert lib.get("bad").depends_on == ()
        assert any("malformed depends_on" in r.message for r in caplog.records)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_skill_library_depends_on.py -v
```

Expected: `FAIL` — attribute default empty tuple but `depends_on` never read from frontmatter.

- [ ] **Step 3: Parse `depends_on` in `_load`**

Open `backend/skill_library.py`. Inside `_load()`, after the line `embedder_version = meta.get("embedder_version", "hash-v1")`, add:

```python
            raw_deps = meta.get("depends_on", [])
            if isinstance(raw_deps, list) and all(isinstance(x, str) for x in raw_deps):
                depends_on = tuple(raw_deps)
            else:
                if raw_deps:
                    logger.warning("skill_library: malformed depends_on in %s (expected list[str])", path)
                depends_on = ()
```

Then modify the `SkillHit(...)` construction a few lines below to pass `depends_on=depends_on,` as the last keyword arg. The full amended block:

```python
            self._by_name[name] = SkillHit(
                name=name,
                priority=priority,
                tokens=tokens,
                source="always_on" if priority == 1 else "rag",
                content=content,
                path=path,
                embedder_version=embedder_version,
                depends_on=depends_on,
            )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_skill_library_depends_on.py -v
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/skill_library.py backend/tests/test_skill_library_depends_on.py
git commit -m "feat(phase-g): SkillLibrary parses depends_on frontmatter"
```

---

## Track B — `depends_on` resolver (parallel with C / D / E after T0–T2)

### Task 3: `DependsOnResolver` — topological sort + cycle detector

**Files:**
- Create: `backend/depends_on_resolver.py`
- Create: `backend/tests/test_depends_on_resolver.py`

**Design:** Pure, stateless class. Builds a DAG from `{name: hit}` using `hit.depends_on`. Exposes `closure(names)` → ordered list of names including transitive deps; `topo_sort()` → globally-sorted name list; both raise `DependsOnCycleError` on cycle. Algorithm: Kahn's (iterative, deterministic) with lexicographic tiebreak.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_depends_on_resolver.py`:

```python
import pytest
from pathlib import Path

from skill_hit import SkillHit
from depends_on_resolver import DependsOnResolver, DependsOnCycleError


def _hit(name: str, deps: tuple[str, ...] = (), pri: int = 2) -> SkillHit:
    return SkillHit(
        name=name, priority=pri, tokens=10, source="rag",
        content="", path=Path(f"/tmp/{name}.md"),
        depends_on=deps,
    )


def test_topo_sort_linear_chain():
    hits = {
        "a": _hit("a"),
        "b": _hit("b", ("a",)),
        "c": _hit("c", ("b",)),
    }
    r = DependsOnResolver(hits)
    assert r.topo_sort() == ["a", "b", "c"]


def test_closure_includes_transitive_deps():
    hits = {
        "a": _hit("a"),
        "b": _hit("b", ("a",)),
        "c": _hit("c", ("b",)),
        "d": _hit("d"),
    }
    r = DependsOnResolver(hits)
    assert r.closure(["c"]) == ["a", "b", "c"]
    assert r.closure(["c", "d"]) == ["a", "b", "c", "d"]


def test_closure_deterministic_lexicographic():
    hits = {
        "root": _hit("root"),
        "z": _hit("z", ("root",)),
        "a": _hit("a", ("root",)),
    }
    r = DependsOnResolver(hits)
    assert r.closure(["z", "a"]) == ["root", "a", "z"]


def test_cycle_detection_raises():
    hits = {
        "a": _hit("a", ("b",)),
        "b": _hit("b", ("a",)),
    }
    r = DependsOnResolver(hits)
    with pytest.raises(DependsOnCycleError) as exc:
        r.topo_sort()
    assert "cycle" in str(exc.value).lower()


def test_self_cycle_detected():
    hits = {"x": _hit("x", ("x",))}
    r = DependsOnResolver(hits)
    with pytest.raises(DependsOnCycleError):
        r.topo_sort()


def test_missing_dep_raises_valueerror():
    hits = {"b": _hit("b", ("does-not-exist",))}
    r = DependsOnResolver(hits)
    with pytest.raises(ValueError) as exc:
        r.topo_sort()
    assert "does-not-exist" in str(exc.value)


def test_closure_missing_target_raises():
    hits = {"a": _hit("a")}
    r = DependsOnResolver(hits)
    with pytest.raises(KeyError):
        r.closure(["ghost"])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_depends_on_resolver.py -v
```

Expected: `ModuleNotFoundError: No module named 'depends_on_resolver'`.

- [ ] **Step 3: Implement resolver**

Create `backend/depends_on_resolver.py`:

```python
"""Phase G - depends_on DAG resolver.

Skills declare dependencies via frontmatter:

    depends_on:
      - other-skill-name

This module closes that DAG at retrieval time (so if RAG returns
`child` we also ship `parent`) and rejects cycles before they can
poison the cached skill corpus.

Pure, stateless, no ChromaDB or filesystem calls - it operates on the
already-parsed SkillLibrary output.
"""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Iterable, Mapping

from skill_hit import SkillHit


class DependsOnCycleError(ValueError):
    """Raised when the depends_on DAG contains a cycle."""


class DependsOnResolver:
    def __init__(self, hits_by_name: Mapping[str, SkillHit]):
        self._hits = dict(hits_by_name)

    def topo_sort(self) -> list[str]:
        """Globally topo-sort every skill. Raises on cycle or missing dep."""
        return self._kahn(self._hits.keys())

    def closure(self, targets: Iterable[str]) -> list[str]:
        """Topo-sorted transitive closure rooted at `targets`.

        Raises KeyError if a target is unknown (callers should pre-filter).
        Raises DependsOnCycleError on a cycle in the closure subgraph.
        Raises ValueError on a missing transitive dep.
        """
        reachable: set[str] = set()
        stack = list(targets)
        while stack:
            n = stack.pop()
            if n not in self._hits:
                raise KeyError(f"unknown skill: {n}")
            if n in reachable:
                continue
            reachable.add(n)
            for dep in self._hits[n].depends_on:
                stack.append(dep)
        return self._kahn(reachable)

    def _kahn(self, subset: Iterable[str]) -> list[str]:
        subset = list(subset)
        subset_set = set(subset)
        indeg: dict[str, int] = defaultdict(int)
        edges: dict[str, list[str]] = defaultdict(list)

        for n in subset:
            indeg.setdefault(n, 0)
            hit = self._hits[n]
            for dep in hit.depends_on:
                if dep not in self._hits:
                    raise ValueError(f"skill {n!r} depends on unknown skill {dep!r}")
                if dep not in subset_set:
                    subset_set.add(dep)
                    indeg.setdefault(dep, 0)
                edges[dep].append(n)
                indeg[n] += 1

        ready: deque[str] = deque(sorted([n for n in subset_set if indeg[n] == 0]))
        out: list[str] = []
        while ready:
            n = ready.popleft()
            out.append(n)
            for child in sorted(edges[n]):
                indeg[child] -= 1
                if indeg[child] == 0:
                    ready.append(child)

        if len(out) != len(subset_set):
            remaining = sorted(subset_set - set(out))
            raise DependsOnCycleError(f"cycle detected among: {remaining}")
        return out
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_depends_on_resolver.py -v
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/depends_on_resolver.py backend/tests/test_depends_on_resolver.py
git commit -m "feat(phase-g): DependsOnResolver - topo sort + cycle detector"
```

---

## Track C — Skill bundles (parallel with B / D / E)

### Task 4: `SkillBundles` — declarative bundle table + resolver

**Files:**
- Create: `backend/skill_bundles.py`
- Create: `backend/tests/test_skill_bundles.py`

**Design:** A bundle is a named set `{skill_names}` that always ship together. Bundles fire when the question contains any of the bundle's `trigger_keywords` (lowercase substring match) OR when RAG already returned any member (co-retrieval amplifier). Priority ceiling: bundle-sourced hits never exceed the bundle's `priority_ceiling` (defaults to 2) so they cannot pre-empt always-on P1 skills. Output tagged `source="bundle"` so router audits distinguish reasons.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skill_bundles.py`:

```python
from pathlib import Path

from skill_hit import SkillHit
from skill_bundles import (
    BUNDLES, resolve_bundles, Bundle,
)


def _hit(name: str, pri: int = 3) -> SkillHit:
    return SkillHit(
        name=name, priority=pri, tokens=50, source="rag",
        content=name, path=Path(f"/tmp/{name}.md"),
    )


def test_dashboard_bundle_fires_on_trigger_keyword():
    library = {n: _hit(n) for n in [
        "dashboard-build-protocol",
        "multi-step-planning",
        "session-memory-protocol",
    ]}
    question = "Build me a dashboard showing Q1 sales"
    existing: list[SkillHit] = []

    added = resolve_bundles(question, existing, library)

    names = {h.name for h in added}
    assert {"dashboard-build-protocol", "multi-step-planning", "session-memory-protocol"}.issubset(names)
    assert all(h.source == "bundle" for h in added)


def test_bundle_fires_on_co_retrieval():
    library = {n: _hit(n) for n in [
        "calculation-patterns", "aggregation-rules", "null-handling",
    ]}
    existing = [_hit("aggregation-rules")]
    added = resolve_bundles("what's the average?", existing, library)
    names = {h.name for h in added}
    assert "calculation-patterns" in names
    assert "null-handling" in names


def test_bundle_does_not_duplicate_existing_hits():
    library = {n: _hit(n) for n in ["dashboard-build-protocol", "multi-step-planning", "session-memory-protocol"]}
    existing = [_hit("multi-step-planning")]
    added = resolve_bundles("build a dashboard", existing, library)
    assert not any(h.name == "multi-step-planning" for h in added)


def test_bundle_respects_priority_ceiling():
    library = {
        "a": _hit("a", pri=3),
        "b": _hit("b", pri=3),
    }
    b = Bundle(name="t", skills=("a", "b"), trigger_keywords=("foo",), priority_ceiling=2)
    added = resolve_bundles("foo", [], library, bundles=(b,))
    assert {h.priority for h in added} == {2}


def test_empty_question_matches_no_bundle_by_keyword():
    library = {n: _hit(n) for n in ["dashboard-build-protocol", "multi-step-planning", "session-memory-protocol"]}
    added = resolve_bundles("", [], library)
    assert added == []


def test_bundle_skips_missing_members():
    library = {"multi-step-planning": _hit("multi-step-planning")}
    b = Bundle(name="dashboard", skills=("dashboard-build-protocol", "multi-step-planning"), trigger_keywords=("dashboard",))
    added = resolve_bundles("dashboard", [], library, bundles=(b,))
    assert [h.name for h in added] == ["multi-step-planning"]


def test_bundles_registry_is_nonempty_and_well_formed():
    assert len(BUNDLES) >= 2
    for b in BUNDLES:
        assert b.name
        assert b.skills
        assert all(isinstance(k, str) for k in b.trigger_keywords)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_skill_bundles.py -v
```

Expected: `ModuleNotFoundError: No module named 'skill_bundles'`.

- [ ] **Step 3: Implement bundles**

Create `backend/skill_bundles.py`:

```python
"""Phase G - skill bundles.

A bundle is a named set of skills that always ship together. Bundles
fire when:
  (a) the user question contains any of the bundle's trigger keywords
      (case-insensitive substring match), OR
  (b) RAG already returned at least one bundle member (co-retrieval
      amplifier - if you got one you probably need the others).

Bundles are purely additive: `resolve_bundles` returns NEW SkillHits
beyond what RAG already produced. Deduplication against `existing` is
caller-side (here, for clarity). The router later passes everything
through `depends_on` closure + cap enforcement.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping

from skill_hit import SkillHit


@dataclass(frozen=True)
class Bundle:
    name: str
    skills: tuple[str, ...]
    trigger_keywords: tuple[str, ...] = ()
    priority_ceiling: int = 2


BUNDLES: tuple[Bundle, ...] = (
    Bundle(
        name="dashboard-build",
        skills=(
            "dashboard-build-protocol",
            "multi-step-planning",
            "session-memory-protocol",
        ),
        trigger_keywords=("dashboard", "dashboards", "tile", "widget"),
        priority_ceiling=2,
    ),
    Bundle(
        name="sql-calculation",
        skills=(
            "calculation-patterns",
            "aggregation-rules",
            "null-handling",
        ),
        trigger_keywords=("sum", "avg", "average", "count", "total", "percentage", "ratio"),
        priority_ceiling=2,
    ),
    Bundle(
        name="chart-styling",
        skills=(
            "chart-formatting",
            "chart-selection",
            "color-system",
        ),
        trigger_keywords=("chart", "color", "palette", "legend", "axis"),
        priority_ceiling=2,
    ),
    Bundle(
        name="join-reasoning",
        skills=(
            "join-intelligence",
            "schema-linking-evidence",
            "schema-profiling",
        ),
        trigger_keywords=("join", "joined", "joining", "foreign key", "fk"),
        priority_ceiling=2,
    ),
)


def resolve_bundles(
    question: str,
    existing: list[SkillHit],
    library_by_name: Mapping[str, SkillHit],
    bundles: Iterable[Bundle] = BUNDLES,
) -> list[SkillHit]:
    """Return NEW hits (not already in `existing`) pulled in by bundles."""
    q_lower = question.lower()
    existing_names = {h.name for h in existing}
    added: list[SkillHit] = []
    added_names: set[str] = set()

    for bundle in bundles:
        fires = False
        if q_lower:
            for kw in bundle.trigger_keywords:
                if kw in q_lower:
                    fires = True
                    break
        if not fires:
            if any(name in existing_names for name in bundle.skills):
                fires = True
        if not fires:
            continue

        for name in bundle.skills:
            if name in existing_names or name in added_names:
                continue
            src = library_by_name.get(name)
            if src is None:
                continue
            effective_priority = max(src.priority, bundle.priority_ceiling)
            added.append(SkillHit(
                name=src.name,
                priority=effective_priority,
                tokens=src.tokens,
                source="bundle",
                content=src.content,
                path=src.path,
                embedder_version=src.embedder_version,
                depends_on=src.depends_on,
            ))
            added_names.add(name)

    return added
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_skill_bundles.py -v
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/skill_bundles.py backend/tests/test_skill_bundles.py
git commit -m "feat(phase-g): SkillBundles - declarative co-retrieval table"
```

---

## Track D — Query expansion (parallel with B / C / E)

### Task 5: `QueryExpansion` — Haiku-backed NL expansion + per-tenant TTL cache

**Files:**
- Create: `backend/query_expansion.py`
- Create: `backend/tests/test_query_expansion.py`

**Design:** One class `QueryExpansion(provider, *, max_tokens, ttl_s, cache)`. `expand(question, tenant_id)` → expanded string for ChromaDB lookup. Cache key uses `tenant_fortress.chroma_namespace`-shaped key `(tenant_id, sha256(question))`. Fail-open: any exception returns the original question verbatim, logs warning. Prompt is a short system message instructing Haiku to return 3–6 comma-separated synonyms + 1 paraphrase, no commentary. `max_tokens` passed directly to `provider.complete`.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_query_expansion.py`:

```python
from unittest.mock import MagicMock

import pytest

from query_expansion import QueryExpansion, _format_prompt


class _FakeProvider:
    def __init__(self, reply: str):
        self.reply = reply
        self.calls = 0

    def complete(self, *, model, system, messages, max_tokens, **kwargs):
        self.calls += 1
        r = MagicMock()
        r.text = self.reply
        return r


def test_format_prompt_includes_question_and_asks_for_synonyms():
    p = _format_prompt("top products last month")
    assert "top products last month" in p
    assert "synonym" in p.lower() or "paraphrase" in p.lower()


def test_expand_returns_expanded_string_on_success():
    fake = _FakeProvider("best, highest-selling, leading; paraphrase: which items sold the most recently")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    out = qe.expand("top products last month", tenant_id="t1")
    assert "top products last month" in out
    assert "best" in out or "paraphrase" in out
    assert fake.calls == 1


def test_expand_cache_hit_skips_provider():
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    qe.expand("abc", tenant_id="t1")
    qe.expand("abc", tenant_id="t1")
    assert fake.calls == 1


def test_expand_cache_keyed_by_tenant():
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    qe.expand("abc", tenant_id="t1")
    qe.expand("abc", tenant_id="t2")
    assert fake.calls == 2


def test_expand_fails_open_on_provider_error(caplog):
    class _Bad:
        def complete(self, **kw):
            raise RuntimeError("boom")
    qe = QueryExpansion(provider=_Bad(), max_tokens=200, ttl_s=60)
    with caplog.at_level("WARNING"):
        out = qe.expand("question?", tenant_id="t1")
    assert out == "question?"
    assert any("boom" in r.message or "expansion failed" in r.message for r in caplog.records)


def test_expand_respects_ttl():
    import time
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=0)
    qe.expand("abc", tenant_id="t1")
    time.sleep(0.01)
    qe.expand("abc", tenant_id="t1")
    assert fake.calls == 2


def test_expand_empty_question_short_circuits_no_llm_call():
    fake = _FakeProvider("x")
    qe = QueryExpansion(provider=fake, max_tokens=200, ttl_s=60)
    out = qe.expand("", tenant_id="t1")
    assert out == ""
    assert fake.calls == 0


def test_expand_passes_max_tokens_to_provider():
    class _Spy:
        def __init__(self):
            self.max_tokens = None
        def complete(self, *, model, system, messages, max_tokens, **kwargs):
            self.max_tokens = max_tokens
            r = MagicMock(); r.text = "ok"
            return r
    spy = _Spy()
    qe = QueryExpansion(provider=spy, max_tokens=200, ttl_s=60)
    qe.expand("q", tenant_id="t1")
    assert spy.max_tokens == 200
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_query_expansion.py -v
```

Expected: `ModuleNotFoundError: No module named 'query_expansion'`.

- [ ] **Step 3: Implement expansion**

Create `backend/query_expansion.py`:

```python
"""Phase G - NL query expansion for ChromaDB retrieval.

Before embedding the user question into `skills_v1`, ask Haiku for a
tiny synonym/paraphrase bundle so queries like "last month's top
products" match skills that talk about "recent best-sellers". The
expansion is concatenated with the original question and fed to the
embedder - we never REPLACE the user's text.

Fail-open: any LLM error returns the original question. Per-tenant
in-process TTL cache keeps this <= 1 LLM call per question per hour.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _format_prompt(question: str) -> str:
    return (
        "You expand short natural-language database questions into "
        "3-6 comma-separated synonyms plus one paraphrase. Return only "
        "the expansion (no commentary, no quotes). Target word budget: "
        "under 40 words.\n\n"
        f"Question: {question}"
    )


_SYSTEM = (
    "You rewrite user database questions for semantic search. "
    "Never answer the question. Output only synonyms and paraphrases."
)


class QueryExpansion:
    def __init__(
        self,
        provider: Any,
        *,
        max_tokens: int = 200,
        ttl_s: int = 3600,
        model: str = "claude-haiku-4-5-20251001",
    ) -> None:
        self._provider = provider
        self._max_tokens = max_tokens
        self._ttl_s = ttl_s
        self._model = model
        self._cache: dict[tuple[str, str], tuple[float, str]] = {}
        self._lock = threading.Lock()

    def expand(self, question: str, *, tenant_id: str) -> str:
        if not question:
            return ""
        key = (tenant_id, hashlib.sha256(question.encode("utf-8")).hexdigest())
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(key)
        if cached is not None:
            ts, val = cached
            if now - ts < self._ttl_s:
                return val

        try:
            resp = self._provider.complete(
                model=self._model,
                system=_SYSTEM,
                messages=[{"role": "user", "content": _format_prompt(question)}],
                max_tokens=self._max_tokens,
            )
            expansion = (resp.text or "").strip()
            out = f"{question}\n{expansion}" if expansion else question
        except Exception as exc:  # noqa: BLE001 - fail-open is the feature
            logger.warning("query_expansion: expansion failed, using raw question: %s", exc)
            out = question

        with self._lock:
            self._cache[key] = (now, out)
        return out
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_query_expansion.py -v
```

Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/query_expansion.py backend/tests/test_query_expansion.py
git commit -m "feat(phase-g): QueryExpansion - Haiku NL expansion + per-tenant TTL cache"
```

---

## Track E — Skill archival (parallel with B / C / D)

### Task 6: `SkillArchival` — scan audit log + move low-usage skills

**Files:**
- Create: `backend/skill_archival.py`
- Create: `backend/tests/test_skill_archival.py`

**Design:** Ops module, runs out-of-band. Reads `.data/skill_audit/retrievals.jsonl` (populated by `SkillRouter` already when `audit_path` is set) — each line has `retrieved: [names]`. Rolls a histogram over the last `dormancy_days`. For each skill in `askdb-skills/`:
- If `priority: 1` → SKIP (always-on is immune).
- If retrieval count within window `< min_retrievals` → move file to `askdb-skills/archive/<subdir>/<name>.md`, preserving relative directory.
- Inject `archived_at: <ISO>` into frontmatter on move.

Move is atomic (shutil.move) to a staging temp then rename. Return a dataclass summarising moved + skipped.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skill_archival.py`:

```python
import json
import time
from pathlib import Path

import frontmatter
import pytest

from skill_archival import archive_dormant_skills, ArchivalResult


def _write_skill(root: Path, subdir: str, name: str, priority: int = 2):
    d = root / subdir
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{name}.md"
    path.write_text(
        f"---\nname: {name}\npriority: {priority}\n---\n\nbody\n",
        encoding="utf-8",
    )
    return path


def _write_audit(audit_file: Path, entries: list[dict]):
    audit_file.parent.mkdir(parents=True, exist_ok=True)
    with audit_file.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")


def test_dormant_skill_moved_to_archive(tmp_path: Path):
    skills = tmp_path / "askdb-skills"
    _write_skill(skills, "core", "dormant-one", priority=2)
    _write_skill(skills, "core", "active-one", priority=2)
    audit = tmp_path / ".data" / "skill_audit" / "retrievals.jsonl"
    _write_audit(audit, [
        {"retrieved": ["active-one"], "ts": time.time()},
        {"retrieved": ["active-one"], "ts": time.time()},
    ])

    result = archive_dormant_skills(
        skills_root=skills,
        audit_log=audit,
        archive_root=tmp_path / "askdb-skills" / "archive",
        dormancy_days=30,
        min_retrievals=1,
    )

    assert isinstance(result, ArchivalResult)
    assert result.moved == ["dormant-one"]
    assert result.skipped_priority_1 == []
    assert not (skills / "core" / "dormant-one.md").exists()
    archived = tmp_path / "askdb-skills" / "archive" / "core" / "dormant-one.md"
    assert archived.exists()
    post = frontmatter.load(archived)
    assert "archived_at" in post.metadata


def test_priority_1_skill_is_immune(tmp_path: Path):
    skills = tmp_path / "askdb-skills"
    _write_skill(skills, "core", "always-on-skill", priority=1)
    audit = tmp_path / ".data" / "skill_audit" / "retrievals.jsonl"
    _write_audit(audit, [])

    result = archive_dormant_skills(
        skills_root=skills,
        audit_log=audit,
        archive_root=tmp_path / "askdb-skills" / "archive",
        dormancy_days=30,
        min_retrievals=1,
    )
    assert "always-on-skill" in result.skipped_priority_1
    assert result.moved == []
    assert (skills / "core" / "always-on-skill.md").exists()


def test_missing_audit_log_returns_empty_with_warning(tmp_path: Path, caplog):
    skills = tmp_path / "askdb-skills"
    _write_skill(skills, "core", "whatever", priority=2)
    audit = tmp_path / "nonexistent.jsonl"
    with caplog.at_level("WARNING"):
        result = archive_dormant_skills(
            skills_root=skills, audit_log=audit,
            archive_root=tmp_path / "archive",
            dormancy_days=30, min_retrievals=1,
        )
    assert result.moved == []
    assert any("audit log missing" in r.message for r in caplog.records)


def test_dry_run_does_not_move(tmp_path: Path):
    skills = tmp_path / "askdb-skills"
    path = _write_skill(skills, "core", "dormant", priority=2)
    audit = tmp_path / "audit.jsonl"
    _write_audit(audit, [])
    result = archive_dormant_skills(
        skills_root=skills, audit_log=audit,
        archive_root=tmp_path / "askdb-skills" / "archive",
        dormancy_days=30, min_retrievals=1, dry_run=True,
    )
    assert result.moved == ["dormant"]
    assert path.exists()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_skill_archival.py -v
```

Expected: `ModuleNotFoundError: No module named 'skill_archival'`.

- [ ] **Step 3: Implement archival**

Create `backend/skill_archival.py`:

```python
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
    counts = _retrieval_counts(Path(audit_log), dormancy_days)
    result = ArchivalResult(dry_run=dry_run)

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_skill_archival.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Create the archive root so imports/scans don't blow up**

```bash
cd "QueryCopilot V1"
mkdir -p askdb-skills/archive
printf "" > askdb-skills/archive/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add backend/skill_archival.py backend/tests/test_skill_archival.py askdb-skills/archive/.gitkeep
git commit -m "feat(phase-g): SkillArchival - dormancy scan + move to archive (H15 convention)"
```

---

## Track F — Frontmatter `depends_on:` additions (parallel with B / C / D / E)

### Task 7: Add `depends_on:` to 6 skill files

**Files (frontmatter-only edits — content bodies untouched):**
- Modify: `askdb-skills/core/chromadb-retrieval-integration.md`
- Modify: `askdb-skills/agent/dashboard-build-protocol.md`
- Modify: `askdb-skills/agent/learn-from-corrections.md`
- Modify: `askdb-skills/sql/calculation-patterns.md`
- Modify: `askdb-skills/sql/join-intelligence.md`
- Modify: `askdb-skills/visualization/chart-formatting.md`

**Pattern for every file:** open it, locate the existing frontmatter block, insert `depends_on:` as a YAML list directly above `legacy:`. Example for `dashboard-build-protocol.md`:

Before:
```
---
applies_to: multi-step-agent, dashboard-build
description: 'Phase 1: UNDERSTAND ...'
legacy: true
name: dashboard-build-protocol
priority: 2
tokens_budget: ...
---
```

After:
```
---
applies_to: multi-step-agent, dashboard-build
depends_on:
  - multi-step-planning
  - session-memory-protocol
description: 'Phase 1: UNDERSTAND ...'
legacy: true
name: dashboard-build-protocol
priority: 2
tokens_budget: ...
---
```

- [ ] **Step 1: `chromadb-retrieval-integration.md`** — add `depends_on: [security-rules]`.
- [ ] **Step 2: `dashboard-build-protocol.md`** — add `depends_on: [multi-step-planning, session-memory-protocol]`.
- [ ] **Step 3: `learn-from-corrections.md`** — add `depends_on: [session-memory-protocol]`.
- [ ] **Step 4: `calculation-patterns.md`** — add `depends_on: [aggregation-rules, null-handling]`.
- [ ] **Step 5: `join-intelligence.md`** — add `depends_on: [schema-linking-evidence, schema-profiling]`.
- [ ] **Step 6: `chart-formatting.md`** — add `depends_on: [chart-selection, color-system]`.

> **Anti-drift:** Before editing each file, run `head -15 <path>` to confirm the actual current frontmatter. YAML is whitespace-sensitive — use 2-space indent and no tabs. If a file does not yet have `legacy:`, insert `depends_on:` immediately before `description:` instead.

- [ ] **Step 7: Verify library still loads**

```bash
cd "QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from pathlib import Path
from skill_library import SkillLibrary
lib = SkillLibrary(Path('../askdb-skills'))
print('loaded', len(lib.all_names()), 'skills')
print('deps on calculation-patterns:', lib.get('calculation-patterns').depends_on)
print('deps on dashboard-build-protocol:', lib.get('dashboard-build-protocol').depends_on)
"
```

Expected: `loaded 49 skills` + both `depends_on` tuples populated.

- [ ] **Step 8: Verify no cycles across the whole library**

```bash
python -c "
import sys; sys.path.insert(0, '.')
from pathlib import Path
from skill_library import SkillLibrary
from depends_on_resolver import DependsOnResolver
lib = SkillLibrary(Path('../askdb-skills'))
order = DependsOnResolver({n: lib.get(n) for n in lib.all_names()}).topo_sort()
print('topo OK; 49 skills, head:', order[:5])
"
```

Expected: prints `topo OK; 49 skills, ...` — no `DependsOnCycleError` raised.

- [ ] **Step 9: Commit**

```bash
git add askdb-skills/core/chromadb-retrieval-integration.md \
        askdb-skills/agent/dashboard-build-protocol.md \
        askdb-skills/agent/learn-from-corrections.md \
        askdb-skills/sql/calculation-patterns.md \
        askdb-skills/sql/join-intelligence.md \
        askdb-skills/visualization/chart-formatting.md
git commit -m "feat(phase-g): depends_on frontmatter on 6 skill files"
```

---

## Track G — Router wiring (serial, after B + C + D + E + F)

### Task 8: Wire expansion + bundles + depends_on into `SkillRouter.resolve`

**Files:**
- Modify: `backend/skill_router.py`

**Design:** Introduce optional constructor args `query_expansion: Optional[QueryExpansion] = None`, `bundles_enabled: bool = True`, `depends_on_enabled: bool = True`, `tenant_id_getter: Optional[Callable[[Any], str]] = None`. `resolve()` changes:
1. If `query_expansion` configured AND `settings.FEATURE_QUERY_EXPANSION` AND tenant resolvable → replace `question` in the ChromaDB call with `expansion.expand(question, tenant_id=tenant_id)`. Keep `question` var for audit/keyword match.
2. After RAG stage, if bundles_enabled AND `settings.FEATURE_SKILL_BUNDLES` → call `resolve_bundles(question, hits, library_by_name=self.library._by_name)` and extend `hits`.
3. Before `_enforce_caps`, if `depends_on_enabled` AND `settings.FEATURE_DEPENDS_ON_RESOLVER` → run `DependsOnResolver.closure([h.name for h in hits])`, fetch any missing names from `library`, append as `source="bundle"` (dependency-driven) and dedupe.
4. Cycle errors are logged and fail-open: skip closure, keep current hits.

**Master gate:** every step above gated on `settings.FEATURE_RETRIEVAL_HYGIENE`. When off → behavior is identical to pre-Phase-G.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skill_router_phase_g.py`:

```python
from pathlib import Path
from unittest.mock import MagicMock
import pytest

from skill_hit import SkillHit
from skill_library import SkillLibrary
from skill_router import SkillRouter


class _FakeChroma:
    def __init__(self, names: list[str]):
        self.last_query: str | None = None
        self._names = names
    def query(self, *, query_texts, n_results):
        self.last_query = query_texts[0]
        return {"metadatas": [[{"name": n} for n in self._names]]}


class _FakeConn:
    db_type = "postgres"
    engine = None


def _mk_library(tmp_path: Path) -> SkillLibrary:
    (tmp_path / "calculation-patterns.md").write_text(
        "---\nname: calculation-patterns\npriority: 2\ndepends_on:\n  - aggregation-rules\n  - null-handling\n---\nbody",
        encoding="utf-8",
    )
    (tmp_path / "aggregation-rules.md").write_text(
        "---\nname: aggregation-rules\npriority: 2\n---\nbody",
        encoding="utf-8",
    )
    (tmp_path / "null-handling.md").write_text(
        "---\nname: null-handling\npriority: 2\n---\nbody",
        encoding="utf-8",
    )
    return SkillLibrary(tmp_path)


def test_depends_on_closure_pulls_missing_deps(tmp_path: Path):
    lib = _mk_library(tmp_path)
    chroma = _FakeChroma(["calculation-patterns"])
    router = SkillRouter(lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1)
    hits = router.resolve("sum of amount", _FakeConn())
    names = {h.name for h in hits}
    assert {"calculation-patterns", "aggregation-rules", "null-handling"}.issubset(names)


def test_bundle_pulls_co_retrieved_siblings(tmp_path: Path):
    lib = _mk_library(tmp_path)
    chroma = _FakeChroma(["aggregation-rules"])
    router = SkillRouter(lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1)
    hits = router.resolve("sum of amount", _FakeConn())
    names = {h.name for h in hits}
    assert {"aggregation-rules", "calculation-patterns", "null-handling"}.issubset(names)


def test_query_expansion_injected_into_chroma(tmp_path: Path):
    lib = _mk_library(tmp_path)
    chroma = _FakeChroma(["aggregation-rules"])
    fake_qe = MagicMock()
    fake_qe.expand.return_value = "sum of amount\nSYNONYM total revenue"
    router = SkillRouter(
        lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1,
        query_expansion=fake_qe, tenant_id_getter=lambda conn: "t1",
    )
    router.resolve("sum of amount", _FakeConn())
    assert "SYNONYM" in chroma.last_query


def test_cycle_in_closure_fails_open(tmp_path: Path, caplog):
    (tmp_path / "a.md").write_text(
        "---\nname: a\npriority: 2\ndepends_on:\n  - b\n---\nbody",
        encoding="utf-8",
    )
    (tmp_path / "b.md").write_text(
        "---\nname: b\npriority: 2\ndepends_on:\n  - a\n---\nbody",
        encoding="utf-8",
    )
    lib = SkillLibrary(tmp_path)
    chroma = _FakeChroma(["a"])
    router = SkillRouter(lib, chroma_collection=chroma, max_skills=9, max_total_tokens=10000, k=1)
    with caplog.at_level("WARNING"):
        hits = router.resolve("unrelated question", _FakeConn())
    assert any(h.name == "a" for h in hits)
    assert any("cycle" in r.message.lower() for r in caplog.records)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_skill_router_phase_g.py -v
```

Expected: all four fail — router has no `query_expansion` kwarg, no closure, no bundles.

- [ ] **Step 3: Patch `skill_router.py`**

Open `backend/skill_router.py`. Add after existing imports:

```python
from depends_on_resolver import DependsOnResolver, DependsOnCycleError
from skill_bundles import resolve_bundles
```

Extend `__init__` signature — add four kwargs at the end (keyword-only with defaults so all existing call sites keep working):

```python
    def __init__(
        self,
        library: SkillLibrary,
        chroma_collection: Any = None,
        max_total_tokens: int = DEFAULT_MAX_TOTAL_TOKENS,
        max_skills: int = DEFAULT_MAX_SKILLS,
        k: int = DEFAULT_K,
        audit_path: Optional[Path] = None,
        query_expansion: Any = None,
        tenant_id_getter: Optional[Any] = None,
        bundles_enabled: bool = True,
        depends_on_enabled: bool = True,
    ):
        self.library = library
        self.collection = chroma_collection
        self.max_total_tokens = max_total_tokens
        self.max_skills = max_skills
        self.k = k
        self.audit_path = audit_path
        self.query_expansion = query_expansion
        self.tenant_id_getter = tenant_id_getter
        self.bundles_enabled = bundles_enabled
        self.depends_on_enabled = depends_on_enabled
```

Replace the ChromaDB call inside `resolve` (the line that reads `results = self.collection.query(query_texts=[question], n_results=self.k)`) with:

```python
                embed_text = question
                try:
                    from config import settings
                    hygiene_on = settings.FEATURE_RETRIEVAL_HYGIENE
                    expansion_on = settings.FEATURE_QUERY_EXPANSION
                except Exception:
                    hygiene_on, expansion_on = True, True
                if (
                    hygiene_on and expansion_on and
                    self.query_expansion is not None and self.tenant_id_getter is not None
                ):
                    try:
                        tid = self.tenant_id_getter(connection_entry)
                        if tid:
                            embed_text = self.query_expansion.expand(question, tenant_id=tid)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("skill_router: expansion failed, using raw question: %s", exc)
                results = self.collection.query(query_texts=[embed_text], n_results=self.k)
```

Immediately after the RAG loop closes (just above `kept = self._enforce_caps(hits)`), insert the bundle + closure stages:

```python
        # Phase G - bundles (co-retrieval amplifier + keyword match)
        try:
            from config import settings
            hygiene_on = settings.FEATURE_RETRIEVAL_HYGIENE
            bundles_on = settings.FEATURE_SKILL_BUNDLES
            deps_on = settings.FEATURE_DEPENDS_ON_RESOLVER
        except Exception:
            hygiene_on, bundles_on, deps_on = True, True, True

        if hygiene_on and bundles_on and self.bundles_enabled:
            try:
                extra = resolve_bundles(
                    question, hits,
                    library_by_name=self.library._by_name,  # noqa: SLF001
                )
                for h in extra:
                    if h.name not in seen:
                        hits.append(h)
                        seen.add(h.name)
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_router: bundle resolution failed: %s", exc)

        # Phase G - depends_on closure (fail-open on cycle)
        if hygiene_on and deps_on and self.depends_on_enabled and hits:
            try:
                resolver = DependsOnResolver(self.library._by_name)  # noqa: SLF001
                closure = resolver.closure([h.name for h in hits])
                for name in closure:
                    if name in seen:
                        continue
                    dep_hit = self.library.get(name)
                    if dep_hit is None:
                        continue
                    hits.append(SkillHit(
                        name=dep_hit.name, priority=max(dep_hit.priority, 2),
                        tokens=dep_hit.tokens, source="bundle",
                        content=dep_hit.content, path=dep_hit.path,
                        embedder_version=dep_hit.embedder_version,
                        depends_on=dep_hit.depends_on,
                    ))
                    seen.add(name)
            except DependsOnCycleError as exc:
                logger.warning("skill_router: depends_on cycle detected, fail-open: %s", exc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("skill_router: depends_on closure failed: %s", exc)
```

- [ ] **Step 4: Run Phase G router tests**

```bash
python -m pytest tests/test_skill_router_phase_g.py -v
```

Expected: `4 passed`.

- [ ] **Step 5: Run existing router tests for regressions**

```bash
python -m pytest tests/test_skill_router.py tests/test_skill_router_memory_cap.py tests/test_skill_router_audit.py -v
```

Expected: all pass (Phase G paths are feature-flagged; new kwargs all have defaults → backwards-compatible).

- [ ] **Step 6: Commit**

```bash
git add backend/skill_router.py backend/tests/test_skill_router_phase_g.py
git commit -m "feat(phase-g): wire expansion + bundles + depends_on into SkillRouter"
```

---

## Track H — Measurement harness (serial, after G)

### Task 9: Pin 50-query corpus

**Files:**
- Create: `.data/retrieval_budget_corpus.jsonl` (committed; gitignore exception needed — verify `.gitignore` does not blanket-ignore `.data/`)

- [ ] **Step 1: Verify `.gitignore` allows this file**

```bash
cd "QueryCopilot V1"
grep -n "\.data" .gitignore | head
```

If `.data/` is globally ignored, add explicit exceptions:

```bash
echo "!.data/retrieval_budget_corpus.jsonl" >> .gitignore
echo "!.data/retrieval_budget_baseline.json" >> .gitignore
```

- [ ] **Step 2: Write the corpus**

Create `.data/retrieval_budget_corpus.jsonl` with exactly 50 lines. Each line is:

```json
{"id": "q01", "category": "<cat>", "db_type": "postgres", "question": "..."}
```

**Composition** — this ratio produces coverage without any one bundle dominating:
- 12 × `sql-aggregation` (hits sql-calculation bundle): "total revenue by month", "average order size", "count distinct users", "percentage of returning customers", "ratio of new to repeat orders", "sum of refunds this quarter", "median session length", "standard deviation of order value", "total units sold by category", "average days between purchases", "count of failed logins", "sum discounts applied".
- 10 × `dashboard-build` (hits dashboard-build bundle): "build me a dashboard of sales KPIs", "create a marketing dashboard with 4 tiles", "dashboard for daily active users with widgets for retention and churn", "build a dashboard showing pipeline health", "dashboard: orders, refunds, top products, regions", "make a dashboard about support ticket volume", "dashboard with tile for revenue and tile for funnel", "dashboard for ecommerce with conversion funnel", "dashboard: add widget for top-10 customers", "dashboard with 6 tiles: revenue, orders, AOV, CAC, LTV, churn".
- 8 × `join-reasoning` (hits join-reasoning bundle): "join orders to customers on user id", "why is my join returning too many rows", "join products with inventory", "left join users to subscriptions including never-subscribed", "inner join events to sessions", "join with foreign key on order_id", "complex join across orders, items, products", "find orders without a matching customer (outer join)".
- 6 × `chart-styling` (hits chart-styling bundle): "format this chart with better colors", "change the axis to logarithmic", "make the legend clearer", "palette for 7 categories", "remove gridlines from the chart", "swap the color system to dark theme".
- 14 × `unbundled-mix` (exercises RAG alone; no bundle should fire): "what is schema profiling", "explain ambiguity resolution", "when does the agent ask for user confirmation", "how does session memory work", "security rules for PII masking", "error handling patterns", "self-repair after sql error", "LLM error recovery", "IoT timeseries domain", "HR domain examples", "BigQuery dialect", "MySQL dialect pitfalls", "performance optimization tips", "caching breakpoint policy".

(Keep each question ≤ 120 chars, lowercase preferred, no trailing punctuation drama.)

- [ ] **Step 3: Sanity check**

```bash
wc -l .data/retrieval_budget_corpus.jsonl
```

Expected: `50`.

```bash
python -c "
import json
lines = open('.data/retrieval_budget_corpus.jsonl', encoding='utf-8').read().splitlines()
cats = {}
for l in lines:
    r = json.loads(l); cats[r['category']] = cats.get(r['category'], 0) + 1
print(cats)
"
```

Expected: `{'sql-aggregation': 12, 'dashboard-build': 10, 'join-reasoning': 8, 'chart-styling': 6, 'unbundled-mix': 14}`.

- [ ] **Step 4: Commit**

```bash
git add .data/retrieval_budget_corpus.jsonl .gitignore
git commit -m "feat(phase-g): pin 50-query retrieval-budget corpus"
```

---

### Task 10: Measurement harness + baseline

**Files:**
- Create: `backend/tests/test_retrieval_budget.py`

**Design:** The test stands up a `SkillLibrary` against the real `askdb-skills/` tree, stubs ChromaDB with a deterministic top-k retriever (n-gram hash similarity against the raw corpus — Phase A legacy embedder; no real ChromaDB needed), runs every corpus question through a router configured in two modes:

- **off-mode:** `FEATURE_RETRIEVAL_HYGIENE=False` (all Phase G disabled) — records total tokens.
- **on-mode:** `FEATURE_RETRIEVAL_HYGIENE=True` — records total tokens.

Asserts `(off_total - on_total) / off_total * 100 >= RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT`.

Also asserts no corpus query produced a hit list that blew the per-request cap (`max_total_tokens=20000`, `max_skills=9`).

> **Surprising direction caveat:** bundles + closure ADD skills, which raises per-query tokens. The reduction comes from (a) expansion surfacing FEWER but MORE RELEVANT RAG hits (expansion replaces 2–3 low-value RAG hits with 1–2 high-value ones because embeddings match better), combined with (b) bundles replacing REDUNDANT top-k expansions that would otherwise drift to neighbouring skills, and (c) cap enforcement dropping P3 RAG hits when bundle hits fill the working set. If on-mode tokens EXCEED off-mode tokens on some queries, the test must still show a net positive reduction across the corpus — the assertion is on the aggregate mean, not per-query.
>
> If the first real run shows < 30 % reduction, **do not weaken the target** — instead: (i) tune `DEFAULT_K` down by 1, (ii) widen bundle `trigger_keywords` coverage, (iii) add 1–2 more bundles for high-frequency RAG neighbourhoods. Then re-measure. The 30 % number is inherited from the master plan row 254 and is the exit criterion.

- [ ] **Step 1: Write the harness (expected to fail until baseline exists)**

Create `backend/tests/test_retrieval_budget.py`:

```python
"""Phase G exit criterion: >= RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT
token reduction against pinned corpus."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from skill_library import SkillLibrary
from skill_router import SkillRouter
from embeddings.embedder_registry import HashV1Embedder


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = REPO_ROOT / "askdb-skills"
CORPUS = REPO_ROOT / ".data" / "retrieval_budget_corpus.jsonl"
BASELINE = REPO_ROOT / ".data" / "retrieval_budget_baseline.json"


class _DeterministicChroma:
    """Tiny n-gram-hash top-k over the library. No external ChromaDB."""

    def __init__(self, library: SkillLibrary, k: int = 3):
        self._emb = HashV1Embedder()
        names = library.all_names()
        self._names = names
        docs = [library.get(n).content for n in names]
        self._vecs = np.stack([self._emb.encode(d) for d in docs])
        self._k = k

    def query(self, *, query_texts: list[str], n_results: int):
        q = self._emb.encode(query_texts[0])
        sims = self._vecs @ q
        top = np.argsort(-sims)[: n_results or self._k]
        return {"metadatas": [[{"name": self._names[i]} for i in top]]}


class _Conn:
    db_type = "postgres"
    engine = None


def _load_corpus() -> list[dict[str, Any]]:
    return [json.loads(l) for l in CORPUS.read_text(encoding="utf-8").splitlines() if l.strip()]


def _measure(hygiene_on: bool) -> list[int]:
    from config import settings
    object.__setattr__(settings, "FEATURE_RETRIEVAL_HYGIENE", hygiene_on)
    object.__setattr__(settings, "FEATURE_QUERY_EXPANSION", hygiene_on)
    object.__setattr__(settings, "FEATURE_SKILL_BUNDLES", hygiene_on)
    object.__setattr__(settings, "FEATURE_DEPENDS_ON_RESOLVER", hygiene_on)

    lib = SkillLibrary(SKILLS_ROOT)
    chroma = _DeterministicChroma(lib, k=3)
    router = SkillRouter(
        lib, chroma_collection=chroma,
        max_skills=9, max_total_tokens=20000, k=3,
        query_expansion=None,
        tenant_id_getter=lambda c: "t1",
    )
    totals: list[int] = []
    for row in _load_corpus():
        hits = router.resolve(row["question"], _Conn())
        totals.append(sum(h.tokens for h in hits))
    return totals


def test_no_per_query_cap_overflow():
    totals = _measure(hygiene_on=True)
    assert all(t <= 20000 for t in totals), f"cap overflow: {max(totals)}"
    assert len(totals) == 50


def test_retrieval_budget_reduction_meets_target():
    assert BASELINE.exists(), "baseline missing - run tools/record_retrieval_baseline.py first (Task 11)"
    from config import settings
    target = float(settings.RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT)

    on_totals = _measure(hygiene_on=True)
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    off_mean = float(baseline["mean_tokens"])
    on_mean = float(np.mean(on_totals))
    reduction_pct = (off_mean - on_mean) / off_mean * 100.0

    assert reduction_pct >= target, (
        f"Phase G target MISSED: reduction {reduction_pct:.1f}% < target {target}% "
        f"(off={off_mean:.1f}, on={on_mean:.1f})"
    )
```

- [ ] **Step 2: Run harness — baseline test should error out**

```bash
cd "QueryCopilot V1/backend"
python -m pytest tests/test_retrieval_budget.py::test_no_per_query_cap_overflow -v
```

Expected: `PASS` — no query in the corpus should ever breach the 20K token cap. If it fails, investigate the offending query (likely a bundle + closure union > 9 files; tighten bundle membership).

```bash
python -m pytest tests/test_retrieval_budget.py::test_retrieval_budget_reduction_meets_target -v
```

Expected: `FAIL` — baseline does not yet exist.

- [ ] **Step 3: Commit harness (red state is intentional — baseline written next)**

```bash
git add backend/tests/test_retrieval_budget.py
git commit -m "feat(phase-g): retrieval budget harness (pre-baseline)"
```

---

### Task 11: Record the pre-Phase-G baseline

**Files:**
- Create: `backend/tools/record_retrieval_baseline.py`
- Create: `.data/retrieval_budget_baseline.json` (committed)

- [ ] **Step 1: Write the recorder script**

Create `backend/tools/__init__.py` (empty, if the dir doesn't exist) and `backend/tools/record_retrieval_baseline.py`:

```python
"""One-shot script: record pre-Phase-G retrieval token baseline.

Runs the same harness as tests/test_retrieval_budget.py with
hygiene OFF, writes mean+stdev+per-query to
.data/retrieval_budget_baseline.json. Committed so future Phase-G
edits measure against the same fixed snapshot.
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
BACKEND = HERE.parents[1]
sys.path.insert(0, str(BACKEND))

from tests.test_retrieval_budget import _measure, _load_corpus, BASELINE  # noqa: E402


def main() -> None:
    totals = _measure(hygiene_on=False)
    rows = _load_corpus()
    assert len(totals) == len(rows)
    payload = {
        "mean_tokens": statistics.mean(totals),
        "stdev_tokens": statistics.pstdev(totals),
        "per_query": [{"id": r["id"], "tokens": t} for r, t in zip(rows, totals)],
        "n": len(totals),
    }
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"baseline: mean={payload['mean_tokens']:.1f} n={payload['n']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
cd "QueryCopilot V1/backend"
python -m tools.record_retrieval_baseline
```

Expected: prints `baseline: mean=<X> n=50` and writes `.data/retrieval_budget_baseline.json`.

- [ ] **Step 3: Run the reduction test**

```bash
python -m pytest tests/test_retrieval_budget.py -v
```

Expected: `2 passed`. If `test_retrieval_budget_reduction_meets_target` fails, **follow the tuning order from Task 10's caveat block (tighten k, widen bundle triggers, add bundle) — do NOT lower the target.**

- [ ] **Step 4: Commit**

```bash
git add backend/tools/__init__.py backend/tools/record_retrieval_baseline.py .data/retrieval_budget_baseline.json
git commit -m "feat(phase-g): record pre-Phase-G retrieval baseline + exit-criterion pass"
```

---

## Track I — Trap suite + CI gate (serial, after G and H)

### Task 12: Trap grader oracle + unit tests

**Files:**
- Modify: `backend/tests/trap_grader.py`
- Create: `backend/tests/test_trap_grader_phase_g.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_trap_grader_phase_g.py`:

```python
from tests.trap_grader import must_not_regress_retrieval_budget


def test_accepts_when_on_mean_within_tolerance():
    off = {"mean_tokens": 1000.0}
    on = {"mean_tokens": 690.0}  # 31% reduction
    assert must_not_regress_retrieval_budget(off, on, target_pct=30.0) is None


def test_rejects_when_on_mean_too_high():
    off = {"mean_tokens": 1000.0}
    on = {"mean_tokens": 800.0}  # 20% reduction
    err = must_not_regress_retrieval_budget(off, on, target_pct=30.0)
    assert err is not None
    assert "20" in err or "30" in err


def test_rejects_when_on_mean_exceeds_off():
    off = {"mean_tokens": 1000.0}
    on = {"mean_tokens": 1100.0}
    assert must_not_regress_retrieval_budget(off, on, target_pct=30.0) is not None
```

- [ ] **Step 2: Run to verify fail**

```bash
python -m pytest tests/test_trap_grader_phase_g.py -v
```

Expected: `ImportError` — function not present.

- [ ] **Step 3: Add the oracle**

Open `backend/tests/trap_grader.py`. Add at bottom:

```python
def must_not_regress_retrieval_budget(
    baseline: dict,
    current: dict,
    *,
    target_pct: float,
) -> str | None:
    """Trap-grader oracle for Phase G.

    Returns None if `current['mean_tokens']` represents at least
    `target_pct` reduction vs `baseline['mean_tokens']`. Otherwise
    returns an error string for the trap report.
    """
    off = float(baseline["mean_tokens"])
    on = float(current["mean_tokens"])
    if off <= 0:
        return f"baseline mean_tokens invalid: {off}"
    reduction = (off - on) / off * 100.0
    if reduction < target_pct:
        return (
            f"retrieval budget regressed: got {reduction:.1f}% reduction, "
            f"target {target_pct:.1f}% (off={off:.1f}, on={on:.1f})"
        )
    return None
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_trap_grader_phase_g.py -v
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/trap_grader.py backend/tests/test_trap_grader_phase_g.py
git commit -m "feat(phase-g): trap_grader oracle must_not_regress_retrieval_budget"
```

---

### Task 13: Trap suite `trap_retrieval_hygiene.jsonl`

**Files:**
- Create: `backend/tests/trap_retrieval_hygiene.jsonl`

**Design:** 12 lines. Each line has:

```json
{"id": "g01", "category": "bundle|expansion|cycle|archive", "question": "...", "expects": {...}}
```

- [ ] **Step 1: Author the 12 traps**

Create `backend/tests/trap_retrieval_hygiene.jsonl` with exactly these 12 lines (one per line, no trailing newline after last):

```json
{"id":"g01","category":"bundle","question":"average order value by region","expects":{"must_contain_skills":["calculation-patterns","aggregation-rules","null-handling"]}}
{"id":"g02","category":"bundle","question":"build a dashboard of sales KPIs","expects":{"must_contain_skills":["dashboard-build-protocol","multi-step-planning","session-memory-protocol"]}}
{"id":"g03","category":"bundle","question":"join orders to customers","expects":{"must_contain_skills":["join-intelligence","schema-linking-evidence","schema-profiling"]}}
{"id":"g04","category":"bundle","question":"format chart colors","expects":{"must_contain_skills":["chart-formatting","chart-selection","color-system"]}}
{"id":"g05","category":"expansion","question":"top SKUs last 30 days","expects":{"expansion_text_contains_any":["best","highest","leading","recent"]}}
{"id":"g06","category":"expansion","question":"who churned","expects":{"expansion_text_contains_any":["dropped","cancelled","left","inactive"]}}
{"id":"g07","category":"cycle","question":"<synthetic: a-b cycle>","expects":{"resolver_raises":"DependsOnCycleError"}}
{"id":"g08","category":"cycle","question":"<synthetic: a self-loop>","expects":{"resolver_raises":"DependsOnCycleError"}}
{"id":"g09","category":"archive","question":"<dry-run with zero retrievals>","expects":{"archival_moved_nonzero":true,"priority_1_untouched":true}}
{"id":"g10","category":"archive","question":"<dry-run with one P1 and zero retrievals>","expects":{"archival_moved_zero":true,"priority_1_untouched":true}}
{"id":"g11","category":"budget","question":"<aggregate measurement>","expects":{"reduction_pct_at_least":30.0}}
{"id":"g12","category":"budget","question":"<per-query cap>","expects":{"per_query_tokens_under":20000}}
```

- [ ] **Step 2: Sanity**

```bash
cd "QueryCopilot V1"
wc -l backend/tests/trap_retrieval_hygiene.jsonl
python -c "
import json
with open('backend/tests/trap_retrieval_hygiene.jsonl', encoding='utf-8') as f:
    rows = [json.loads(l) for l in f if l.strip()]
assert len(rows) == 12
cats = {}
for r in rows: cats[r['category']] = cats.get(r['category'], 0) + 1
print(cats)
"
```

Expected: `12` lines; `{'bundle': 4, 'expansion': 2, 'cycle': 2, 'archive': 2, 'budget': 2}`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/trap_retrieval_hygiene.jsonl
git commit -m "feat(phase-g): trap_retrieval_hygiene suite (12 Qs)"
```

---

### Task 14: CI workflow — gate ninth suite + budget test

**Files:**
- Modify: `.github/workflows/agent-traps.yml`

- [ ] **Step 1: Inspect current workflow**

```bash
cd "QueryCopilot V1"
cat .github/workflows/agent-traps.yml | head -60
```

Confirm the 8-suite matrix pattern installed in Phase F.

- [ ] **Step 2: Add the ninth job**

Open `.github/workflows/agent-traps.yml`. Locate the `strategy.matrix.suite` list (the 8-entry list ending with `trap_correction_pipeline`). Append one entry, and add a dedicated budget-test step:

```yaml
      matrix:
        suite:
          - trap_temporal_scope
          - trap_coverage_grounding
          - trap_name_inference
          - trap_join_scale
          - trap_intent_drop
          - trap_sampling_trust
          - trap_multi_tenant
          - trap_correction_pipeline
          - trap_retrieval_hygiene
```

Then, at the end of the job's `steps` block (after the per-suite run), add:

```yaml
      - name: Retrieval budget exit criterion
        if: matrix.suite == 'trap_retrieval_hygiene'
        working-directory: QueryCopilot V1/backend
        run: |
          python -m pytest tests/test_retrieval_budget.py -v
```

- [ ] **Step 3: Lint YAML syntactically (offline check)**

```bash
cd "QueryCopilot V1"
python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/agent-traps.yml', encoding='utf-8'))"
```

Expected: no exception.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/agent-traps.yml
git commit -m "feat(phase-g): CI gates ninth trap suite + retrieval-budget exit"
```

---

## Track J — Exit gate (serial, last)

### Task 15: Full-suite green + exit-gate commit

- [ ] **Step 1: Run the whole pytest suite**

```bash
cd "QueryCopilot V1/backend"
python -m pytest tests/ -v
```

Expected: ~1735+ pass, 1 skip. **No new failures beyond the Phase G additions.** Pre-existing frontend chart-ir failures out of scope.

- [ ] **Step 2: Run import smoke for Phase A–G**

```bash
cd "QueryCopilot V1/backend"
python -c "
import sys; sys.path.insert(0, '.')
from embeddings.embedder_registry import get_embedder
from data_coverage import DataCoverageCard
from scope_validator import ScopeValidator
from intent_echo import build_echo
from provenance_chip import ProvenanceChip
from tenant_fortress import chroma_namespace
from correction_pipeline import promote_to_examples
from golden_eval_gate import GoldenEvalGate
from adversarial_similarity import AdversarialSimilarity
from depends_on_resolver import DependsOnResolver
from skill_bundles import BUNDLES, resolve_bundles
from query_expansion import QueryExpansion
from skill_archival import archive_dormant_skills
print('Phase A-G imports OK, bundles=', len(BUNDLES))
"
```

Expected: `Phase A-G imports OK, bundles= 4`.

- [ ] **Step 3: Re-run retrieval budget test**

```bash
python -m pytest tests/test_retrieval_budget.py -v
```

Expected: `2 passed`.

- [ ] **Step 4: Verify skill-library topo sort across real tree**

```bash
python -c "
import sys; sys.path.insert(0, '.')
from pathlib import Path
from skill_library import SkillLibrary
from depends_on_resolver import DependsOnResolver
lib = SkillLibrary(Path('../askdb-skills'))
order = DependsOnResolver({n: lib.get(n) for n in lib.all_names()}).topo_sort()
print('topo sort OK over', len(order), 'skills')
"
```

Expected: `topo sort OK over 49 skills`.

- [ ] **Step 5: Exit-gate commit**

```bash
git add -A
git status
git commit --allow-empty -m "chore(phase-g): exit gate - T0-T15 shipped, retrieval budget reduction >=30% measured"
```

---

## Exit Criteria Checklist

- [ ] `backend/depends_on_resolver.py`, `backend/skill_bundles.py`, `backend/query_expansion.py`, `backend/skill_archival.py` all present, imported, tested.
- [ ] `backend/skill_hit.py` has `depends_on` field; `backend/skill_library.py` parses frontmatter.
- [ ] `backend/skill_router.py` consults expansion + bundles + `depends_on` closure under `FEATURE_RETRIEVAL_HYGIENE`.
- [ ] 6 skill files carry `depends_on:` frontmatter; library topo-sorts with no cycles.
- [ ] `.data/retrieval_budget_corpus.jsonl` has 50 queries; `.data/retrieval_budget_baseline.json` committed.
- [ ] `backend/tests/test_retrieval_budget.py` passes — reduction ≥ 30 %, zero per-query cap overflow.
- [ ] `backend/tests/trap_retrieval_hygiene.jsonl` has 12 Qs; `trap_grader.must_not_regress_retrieval_budget` oracle wired.
- [ ] `askdb-skills/archive/.gitkeep` present — archival destination exists.
- [ ] CI workflow gates all 9 suites + retrieval-budget test.
- [ ] Full pytest suite: ~1735+ pass, 1 skip. No new failures.
- [ ] Phase A–G import smoke prints `Phase A-G imports OK, bundles= 4`.

---

## Risk notes & follow-ups

- **`SkillLibrary._by_name` cross-module access** — `skill_router` reads it directly for O(1) name lookup. The underscore prefix is acknowledged; exposing a public `library_index()` accessor is a trivial follow-up but out of scope for Phase G (would be its own commit per YAGNI).
- **Expansion fallback path when Anthropic is down** — `QueryExpansion.expand` is fail-open, but so is the router's entire Phase G block. If Anthropic is degrading AND the router instance has no cached expansion AND bundles don't fire, retrieval regresses to pre-Phase-G behaviour. Acceptable: the 30 % target holds on steady-state; degraded-mode behaviour is no worse than main branch.
- **Bundle definitions are hand-authored** — not mined from audit logs. Phase I may add an offline bundle-miner that clusters retrieval co-occurrences into candidate bundles; treat as enhancement.
- **`depends_on` missing-skill semantics** — `DependsOnResolver.topo_sort()` raises `ValueError` on missing dep, but `SkillRouter` traps every exception to fail-open. This means a typo in `depends_on:` silently no-ops closure for that subgraph. Mitigation: the library load-time topo sanity check (T7 step 8) runs in CI via the smoke import — typos break smoke, not retrieval.
- **Baseline drift when skills change** — `.data/retrieval_budget_baseline.json` is a snapshot. Any new skill added after Phase G ships can raise the off-mode mean, making the 30 % target easier to hit spuriously. Convention: re-record baseline (rerun `record_retrieval_baseline.py`) whenever a new P1/P2 skill lands, commit alongside the skill.
- **Archival is a manual op in Phase G** — `archive_dormant_skills()` is not cron-scheduled; an admin runs it from CLI. Phase I may add a scheduled cron + Slack notification when candidates appear. Keeping it manual for v6 eliminates surprise-deletion risk.
- **Cycle fail-open behaviour** — a cycle in user-added skills silently disables closure for that retrieval. Loud enough? Trap suite `g07` / `g08` catches synthetic cycles; real library passes load-time topo check. If a cycle somehow ships to prod, audit log `retrieved` list shows shrunken skill set → Phase I Alert-Manager observes the closure drop.
- **`QueryExpansion` spends Haiku tokens** — per-tenant cache with 1 h TTL caps spend at ~(distinct questions / hour / tenant) × 200 tokens. Phase E `chaos_isolation.CostBreaker` already caps $1/min per tenant, providing independent cost backstop. No new cost alert needed.
- **`.data/` .gitignore override fragility** — if someone adds a blanket `.data/**` ignore later, the baseline + corpus files become untracked. Mitigation: Phase J closeout doc notes the exception. Phase I may move these to `backend/eval_assets/data/` (out of `.data/` entirely).

---

## Execution note for agentic workers

Five independent backend tracks + frontmatter edits + measurement + trap + CI tail:

- **Track A (foundation, serial):** T0 → T1 → T2.
- **Track B (depends_on resolver, parallel after T2):** T3.
- **Track C (bundles, parallel after T2):** T4.
- **Track D (expansion, parallel after T2):** T5.
- **Track E (archival, parallel after T2):** T6.
- **Track F (frontmatter, parallel after T2):** T7.
- **Track G (router wiring, serial after B+C+D+E+F):** T8.
- **Track H (measurement, serial after G):** T9 → T10 → T11.
- **Track I (trap + CI, serial after H):** T12 → T13 → T14.
- **Track J (exit gate, last):** T15.

Recommended parallel split:

- **Track 1:** T0 → T1 → T2 (foundation).
- After T2 merges, fan out in parallel:
  - **Track 2:** T3 (resolver).
  - **Track 3:** T4 (bundles).
  - **Track 4:** T5 (expansion).
  - **Track 5:** T6 (archival).
  - **Track 6:** T7 (frontmatter).
- After Tracks 2–6 merge: T8 (router wiring).
- After T8: T9 → T10 → T11 (serial — measurement depends on stable router).
- After T11: T12 → T13 → T14 (serial — CI depends on trap file).
- After T14: T15 (exit gate).

Estimated serial time: ~12–16 hours (smaller surface than Phase F — no frontend, no new routes). Estimated parallel time: ~4–5 hours.

---

## Self-review notes (authored with plan)

- **Spec coverage:** Master plan row 254 + trigger "Files the master plan expects" list — `skill_bundles.py` ✓ (T4), `query_expansion.py` ✓ (T5), `skill_archival.py` ✓ (T6), `depends_on_resolver.py` ✓ (T3), `skill_library.py` edit ✓ (T2), `askdb-skills/*.md` frontmatter ✓ (T7), 4 new backend test files ✓ (T3/T4/T5/T6), measurement harness ✓ (T10), `config.py` + `config-defaults.md` ✓ (T0), trap suite ✓ (T13), CI gate ✓ (T14). `skill_router.py` edit ✓ (T8) also in spec.
- **Placeholder scan:** Every code block contains real code. No "TBD" / "fill in" / "similar to…" references. Frontmatter edits list the exact `depends_on:` arrays, not "appropriate deps."
- **Type consistency:** `DependsOnResolver`, `DependsOnCycleError`, `Bundle`, `BUNDLES`, `resolve_bundles`, `QueryExpansion.expand(question, *, tenant_id)`, `archive_dormant_skills(...) → ArchivalResult`, `must_not_regress_retrieval_budget(baseline, current, *, target_pct)`, `SkillHit(..., depends_on=())`, config flag names (`FEATURE_RETRIEVAL_HYGIENE`, `FEATURE_QUERY_EXPANSION`, `FEATURE_SKILL_BUNDLES`, `FEATURE_DEPENDS_ON_RESOLVER`, `QUERY_EXPANSION_MAX_TOKENS`, `RETRIEVAL_BUDGET_REDUCTION_TARGET_PCT`, `SKILL_ARCHIVAL_*`) match across all tasks.
- **Anti-drift rules satisfied:** 30 % target pulled from master (row 254), not invented (T0 / T10 / T12). `depends_on:` shape confirmed by inspecting current frontmatter (T7 anti-drift note reminds executor to `head -15` first). Haiku used via existing `anthropic_provider.complete()` — no new LLM provider (T5). Archival moves, never deletes (T6 explicit + skill_archival.py `shutil.move` + test `test_dry_run_does_not_move`). Bundle cache + expansion cache keyed by `tenant_id` per Ring 6 (T5 `self._cache[(tenant_id, ...)]`, T8 `tenant_id_getter`). Measurement harness is a test command (T10) — "30 %" is hard-asserted, never eyeballed. TDD + bite-sized steps held (every task follows fail-test → impl → pass → commit). Task count = 16 (T0–T15), inside the 15–18 envelope the trigger prescribed.
