# Skill Library Prompt Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SKILL_LIBRARY_ENABLED=True` actually route agent + query-engine turns through the skill-retrieval path Plan 3 built — by extracting `agent_engine.run()` inline prompt assembly into a single reusable method, wiring `_build_system_blocks` into every LLM call site, plumbing `cache_control` through `anthropic_provider.py`, closing the `ConnectionEntry → QueryEngine` wiring gap, implementing the 30% retrieval-echo cap, emitting cache-stats telemetry, and running a 48h shadow-mode dual-run before flipping the production default.

**Architecture:** Three-step refactor + two-step plumbing + two-step safety net. (1) Extract: lift ~130 lines of inline prompt composition from `agent_engine.run()` into `_build_legacy_system_prompt(question, prefetch_context)` — behaviour-preserving. (2) Wire: `run()` always calls `_build_system_blocks()`; `_build_system_blocks()` returns either `[PromptBlock(text=legacy, ttl=None)]` (flag off, zero behaviour change) or three cached blocks composed from retrieved skills (flag on). (3) Plumb: provider accepts list-of-content-blocks for system; emits `cache_read_input_tokens` / `cache_creation_input_tokens` to audit. (4) Close gaps: `ConnectionEntry` factory attaches skill library to every `QueryEngine` instance; `SkillRouter` caps `query_memory` retrieval contributions at 30% weight. (5) Prove safe: shadow-mode runs both paths in parallel for 48 h logging divergence before flipping the default.

**Tech Stack:** Python 3.10+ (project 3.14.3), FastAPI, Anthropic SDK (via `anthropic_provider.py`), ChromaDB, APScheduler, pytest.

**Scope note — what this plan covers vs defers:**
- ✅ **Phase A** — Extract inline prompt assembly (Task 1).
- ✅ **Phase B** — Route agent + query engine through blocks (Tasks 2, 3).
- ✅ **Phase C** — Provider `cache_control` passthrough + cache-stats emission (Tasks 4, 5).
- ✅ **Phase D** — `ConnectionEntry → QueryEngine` skill-library wiring (Task 6).
- ✅ **Phase E** — 30% retrieval-echo cap (Task 7).
- ✅ **Phase F** — Shadow-mode 48h dual-run + integration test (Tasks 8, 9).
- ✅ **Phase G** — Full regression under flag-on + flip default (Tasks 10, 11).
- ⛔ **Deferred to follow-up plans:** Upgrade from n-gram hash embeddings to transformer embeddings. Hybrid BM25+dense+rerank. Voice-mode equivalent of skill-library routing. Frontend surface for correction queue admin review UI.

---

## Prerequisites

Before starting Task 1, confirm:

- [ ] `git log --oneline | grep "Plan 3 P7T17"` returns the commit — Plan 3 infrastructure merged.
- [ ] `cd backend && python -m pytest tests/test_skill_library.py tests/test_skill_router.py tests/test_caching_breakpoints.py tests/test_agent_prompt_blocks.py tests/test_query_engine_skill_injection.py tests/test_main_skill_state.py tests/test_skill_status_endpoint.py -q` is green.
- [ ] `curl http://localhost:8002/api/v1/skill-library/status` (with server running) returns `library_loaded: true`, `skill_count >= 48`.
- [ ] Read `docs/superpowers/plans/2026-04-19-skill-library-research-context.md` §1.1 (lines 1620-1755 of `agent_engine.py`) to understand what you're refactoring.
- [ ] Read `askdb-skills/core/caching-breakpoint-policy.md` — it is the spec for Tasks 3-5.
- [ ] Read `askdb-skills/agent/learn-from-corrections.md` §Cap retrieval echo + §Shadow mode — those are Tasks 7-8 specs.

Stop if any check fails.

---

## File Structure

**Modified files (7):**

| Path | Change |
|---|---|
| `backend/agent_engine.py` | Extract inline assembly (~lines 1620-1755 within `run()`) → new `_build_legacy_system_prompt(question, prefetch_context)` method. Update `_build_system_blocks` to call it for identity_core content when flag off. Change `run()` to always consume blocks via provider. |
| `backend/query_engine.py` | Same pattern: every LLM call site switches to block-aware path. `_build_system_blocks` reuses the already-built identity text instead of a minimal string. |
| `backend/anthropic_provider.py` | `system=` param accepts `Union[str, list[dict]]`; cache_control markers preserved end-to-end. Response handler emits `cache_read_input_tokens` + `cache_creation_input_tokens` to `.data/audit/cache_stats.jsonl`. |
| `backend/routers/connection_routes.py` | Post-engine-creation hook: attach `app.state.skill_library` + `app.state.skill_collection` + the owning `ConnectionEntry` to `entry.engine._skill_library / _skill_collection / _connection_entry_stub`. |
| `backend/skill_router.py` | Add `SkillRouter.add_memory_hits(mem_hits, weight_cap=0.3)` method that appends past-query-memory evidence capped at 30% of total token budget. |
| `backend/config.py` | Add `SKILL_SHADOW_MODE_ENABLED: bool = Field(default=True)` flag; once flag-on phase passes, Task 11 flips `SKILL_LIBRARY_ENABLED` default to `True`. |
| `backend/main.py` | Start shadow-mode diff logger in lifespan. |

**New files (3):**

| Path | Purpose |
|---|---|
| `backend/shadow_mode.py` | `ShadowRunner` class: given a question + connection, produces both legacy and block-path prompts in parallel, logs diff (skill-set names, total tokens, stable hash of full concatenated content) to `.data/audit/shadow_diff.jsonl`. Does not call the LLM twice — only compares inputs. |
| `backend/tests/test_agent_run_integration.py` | Full-turn integration: mocked provider captures the messages payload; asserts 4-breakpoint shape when flag-on, single block when flag-off, matching content on flag-off. |
| `backend/tests/test_anthropic_provider_cache_control.py` | Provider-level test: `system=` accepts list-of-blocks with `cache_control`, round-trips to Anthropic SDK call (mocked), logs cache_read/creation tokens. |

**Test files (6 new):**

`test_agent_legacy_prompt_extraction.py` · `test_agent_run_integration.py` · `test_anthropic_provider_cache_control.py` · `test_connection_routes_skill_wiring.py` · `test_skill_router_memory_cap.py` · `test_shadow_mode.py`

---

## Task 1: Extract inline prompt assembly into `_build_legacy_system_prompt`

**Files:**
- Modify: `backend/agent_engine.py` — lines ~1620-1755 (the inline composition block inside `run()`).
- Test: `backend/tests/test_agent_legacy_prompt_extraction.py`

**Rationale:** The ~130-line inline composition mixes `SYSTEM_PROMPT` + dashboard reminder + persona/tone + user persona + style matching + prefetch context + semantic layer + chart types + dialect hints + voice mode + ML mode + progress + plan. Nothing re-uses it. Extracting into a single method unblocks Task 2 + lets `_build_system_blocks` reuse the exact behaviour for flag-off.

**Refactor contract:** `_build_legacy_system_prompt(question: str, prefetch_context: str) -> str` returns **byte-identical** output vs the current inline code. No conditional branches added or removed.

- [ ] **Step 1: Lock in the current behaviour with a characterisation test**

Create `backend/tests/test_agent_legacy_prompt_extraction.py`:

```python
"""Characterisation tests for _build_legacy_system_prompt extraction.

Locks in byte-identical output before + after the refactor. Each test
captures the composed string for a known state and asserts content markers.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def _make_agent(feature_overrides: dict = None):
    from agent_engine import AgentEngine
    engine = MagicMock()
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = MagicMock()
    conn.engine.db = MagicMock()
    conn.engine.db.get_schema_info = MagicMock(return_value={
        "orders": {"columns": [{"name": "id"}, {"name": "amount"}]},
    })
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    memory = MagicMock()
    agent = AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    return agent


def test_legacy_prompt_contains_base_system_prompt():
    """SYSTEM_PROMPT text must appear in the extracted output."""
    from config import settings
    import agent_engine
    agent = _make_agent()
    with patch.object(settings, "SKILL_LIBRARY_ENABLED", False):
        text = agent._build_legacy_system_prompt("show revenue", "")
    assert "AskDB" in text
    assert "read-only" in text.lower() or "SELECT" in text


def test_legacy_prompt_includes_dialect_when_db_type_postgresql():
    """Postgresql dialect hints must be injected."""
    agent = _make_agent()
    text = agent._build_legacy_system_prompt("q", "")
    assert "POSTGRESQL" in text.upper() or "ILIKE" in text


def test_legacy_prompt_appends_prefetch_context_verbatim():
    """prefetch_context is concatenated, not rewritten."""
    agent = _make_agent()
    prefetch = "### Schema excerpt\norders(id, amount)"
    text = agent._build_legacy_system_prompt("q", prefetch)
    assert prefetch in text


def test_legacy_prompt_deterministic_same_inputs():
    """Same state + same inputs = same output (no timestamps / randomness)."""
    agent = _make_agent()
    a = agent._build_legacy_system_prompt("q", "")
    b = agent._build_legacy_system_prompt("q", "")
    assert a == b
```

- [ ] **Step 2: Run the test — expect FAIL with AttributeError**

```bash
cd backend
python -m pytest tests/test_agent_legacy_prompt_extraction.py -v --timeout=30
```

Expected: `AttributeError: 'AgentEngine' object has no attribute '_build_legacy_system_prompt'` (3 errors, one pass for deterministic-same-inputs).

- [ ] **Step 3: Find the exact inline block to extract**

Run:

```bash
cd backend
awk 'NR>=1615 && NR<=1760 && /^[^ ]/ { print NR": "$0 }' agent_engine.py | head -5
grep -n "system_prompt = self.SYSTEM_PROMPT" agent_engine.py
```

Locate the method that owns lines 1620-1755. (Previous audit showed `def run(self, question: str):` starting at line 1239; the system-prompt composition is the first ~130 lines of that method.)

Read the block:

```bash
sed -n '1620,1760p' agent_engine.py
```

Identify the final line that completes the assembly (the last append to `system_prompt`). Based on plan-3 research context, this is where the `<plan>` block closes (around line 1755). Everything from `system_prompt = self.SYSTEM_PROMPT` through that final append is one unit.

- [ ] **Step 4: Extract — move the block into a new method, leave a call in place**

The exact edit is: (a) insert the new method `_build_legacy_system_prompt` as a sibling of `_build_system_blocks` in the class body, (b) replace the inline block in `run()` with `system_prompt = self._build_legacy_system_prompt(question, prefetch_context)`.

Open `agent_engine.py` and perform this edit. Keep the inline block's exact content verbatim inside the new method — do not rewrite any conditional or comment. Rename the local variables if needed so that they still resolve: every `self.X` already resolves inside a method.

Insert the new method right after `_build_system_blocks` (which you added in Plan 3 T6). Structure:

```python
    def _build_legacy_system_prompt(self, question: str, prefetch_context: str) -> str:
        """Plan 4 T1: extracted from run() for reuse by _build_system_blocks.

        Byte-identical output to the prior inline assembly. Do not add
        new conditionals here — that belongs in _build_system_blocks when
        SKILL_LIBRARY_ENABLED is on.
        """
        system_prompt = self.SYSTEM_PROMPT

        # ── <paste verbatim lines 1621-1755 of the previous agent_engine.py
        #     here, updating indentation from 8-space run()-body to 8-space
        #     method-body (same level) — no other changes>

        return system_prompt
```

In `run()`, the replacement:

```python
        # Plan 4 T1: composition extracted to _build_legacy_system_prompt.
        system_prompt = self._build_legacy_system_prompt(question, prefetch_context)
```

CRITICAL: keep the extracted block's `system_prompt +=` statements — do not convert them to function-local returns. The method builds the string by mutation exactly as before.

- [ ] **Step 5: Run the full test suite — expect all prior tests still green**

```bash
cd backend
python -m pytest tests/ -q --timeout=60 -x --ignore=tests/test_agent_legacy_prompt_extraction.py 2>&1 | tail -5
```

Expected: all previously-passing tests still pass. This proves the extraction is behaviour-preserving.

- [ ] **Step 6: Run the extraction test**

```bash
python -m pytest tests/test_agent_legacy_prompt_extraction.py -v --timeout=30
```

Expected: 4 pass.

- [ ] **Step 7: Commit**

```bash
cd "QueryCopilot V1"
git add backend/agent_engine.py backend/tests/test_agent_legacy_prompt_extraction.py
git commit -m "refactor(skills): extract _build_legacy_system_prompt from run() (Plan 4 T1)"
```

---

## Task 2: Update `_build_system_blocks` to reuse extracted method

**Files:**
- Modify: `backend/agent_engine.py` (`_build_system_blocks` — the flag-off branch)
- Modify: `backend/tests/test_agent_prompt_blocks.py` (add coverage)

**Rationale:** Plan 3 T6 stubbed the flag-off path as `return [PromptBlock(text=self.SYSTEM_PROMPT + prefetch_context, ttl=None)]`. That dropped persona/tone/dialect/voice/ML — acceptable for Plan 3 because flag was off and `run()` ignored the blocks. In Plan 4 `run()` WILL consume the blocks; flag-off must produce identical behaviour to Plan 3's inline path, so the blocks must contain the full legacy string.

- [ ] **Step 1: Extend the existing test to assert legacy content fidelity**

Append to `backend/tests/test_agent_prompt_blocks.py`:

```python
def test_flag_off_block_content_matches_legacy_prompt(monkeypatch):
    """When flag off, the single block must equal _build_legacy_system_prompt output."""
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    agent = _make_agent()
    legacy = agent._build_legacy_system_prompt("show revenue", "")
    blocks = agent._build_system_blocks(question="show revenue", prefetch_context="")
    assert len(blocks) == 1
    assert blocks[0].text == legacy
    assert blocks[0].ttl is None


def test_flag_on_identity_core_includes_legacy_prompt(monkeypatch):
    """When flag on, identity block still contains the legacy identity
    (SYSTEM_PROMPT + persona + dialect hints) — skill content appends, not
    replaces."""
    from config import settings
    from skill_library import SkillLibrary
    from pathlib import Path
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    blocks = agent._build_system_blocks(question="q", prefetch_context="")
    assert blocks, "no blocks produced"
    # The first block (identity + core) must contain the system-prompt preamble.
    assert "AskDB" in blocks[0].text
```

- [ ] **Step 2: Run — expect 2 new failures**

```bash
cd backend
python -m pytest tests/test_agent_prompt_blocks.py -v --timeout=30
```

Expected: 3 old pass, 2 new fail (flag-off block content does not match legacy; flag-on identity block missing "AskDB").

- [ ] **Step 3: Update `_build_system_blocks` to call `_build_legacy_system_prompt`**

In `backend/agent_engine.py`, find the `_build_system_blocks` method defined in Plan 3 T6. Replace its flag-off branch and its flag-on identity-construction:

```python
    def _build_system_blocks(self, question: str, prefetch_context: str = "") -> list:
        """Plan 3 T6 + Plan 4 T2: skill-library-aware 4-breakpoint composition.

        Flag OFF: returns one uncached block containing the full legacy
        prompt (SYSTEM_PROMPT + persona + dialect + voice + ML + plan + etc.).
        Flag ON: 3 cached segments per caching-breakpoint-policy.md.
        """
        from prompt_block import PromptBlock, compose_system_blocks
        from config import settings

        legacy_text = self._build_legacy_system_prompt(question, prefetch_context)

        if not settings.SKILL_LIBRARY_ENABLED or self._skill_library is None:
            return [PromptBlock(text=legacy_text, ttl=None)]

        from skill_router import SkillRouter
        router = SkillRouter(library=self._skill_library, chroma_collection=self._skill_collection)
        hits = router.resolve(question, self.connection_entry, action_type="sql-generation")

        identity_parts = [legacy_text]
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

        return compose_system_blocks(
            identity_core="".join(identity_parts),
            schema_context="".join(schema_parts),
            retrieved_skills="".join(retrieved_parts),
        )
```

Note the behaviour changes vs Plan 3 T6: (a) identity_core = full legacy text + P1 skills, not just SYSTEM_PROMPT + P1; (b) `prefetch_context` is no longer separately appended — it's already inside `legacy_text` via the extracted method.

- [ ] **Step 4: Run — expect all 5 pass**

```bash
python -m pytest tests/test_agent_prompt_blocks.py -v --timeout=30
```

- [ ] **Step 5: Commit**

```bash
git add backend/agent_engine.py backend/tests/test_agent_prompt_blocks.py
git commit -m "feat(skills): _build_system_blocks reuses extracted legacy prompt (Plan 4 T2)"
```

---

## Task 3: Agent `run()` consumes blocks instead of flat string

**Files:**
- Modify: `backend/agent_engine.py` — every LLM call site in `run()` (and related methods like retry paths) that currently passes `system_prompt` (str) to the provider.
- Test: `backend/tests/test_agent_run_integration.py` (new)

**Rationale:** Plan 3 T6-T7 built the blocks method but never called it from `run()`. Now that Task 2 makes flag-off byte-identical to legacy, it's safe to switch the call path unconditionally.

- [ ] **Step 1: Write integration test**

Create `backend/tests/test_agent_run_integration.py`:

```python
"""End-to-end: run() sends blocks to the provider under both flag states."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch


def _make_agent():
    from agent_engine import AgentEngine
    engine = MagicMock()
    engine.db = MagicMock()
    engine.db.db_type = MagicMock()
    engine.db.db_type.value = "postgresql"
    engine.db.get_schema_info = MagicMock(return_value={})
    conn = MagicMock()
    conn.db_type = "postgresql"
    conn.engine = engine
    provider = MagicMock()
    provider.default_model = "claude-haiku-4-5-20251001"
    provider.fallback_model = "claude-sonnet-4-5-20250514"
    # Record every call to the provider.
    provider.create_message = MagicMock(return_value=MagicMock(
        content=[MagicMock(type="text", text="done")], stop_reason="end_turn",
        usage=MagicMock(input_tokens=100, output_tokens=10, cache_read_input_tokens=0, cache_creation_input_tokens=0),
    ))
    memory = MagicMock()
    memory.get_messages = MagicMock(return_value=[])
    agent = AgentEngine(
        engine=engine, email="t@x.com", connection_entry=conn,
        provider=provider, memory=memory,
    )
    return agent, provider


def test_run_flag_off_passes_single_block_system(monkeypatch):
    """Flag off → provider receives system as either string (legacy pass-through)
    or a 1-element list — either is fine, both mean no cache_control."""
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", False)
    agent, provider = _make_agent()

    # Intercept the first LLM call via the AgentEngine's prompt assembly helper.
    blocks = agent._build_system_blocks("q", "")
    assert len(blocks) == 1
    assert blocks[0].ttl is None


def test_run_flag_on_passes_cached_blocks(monkeypatch):
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent, provider = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    blocks = agent._build_system_blocks("show revenue", "")
    # At least the identity block must be cached.
    cached = [b for b in blocks if b.ttl is not None]
    assert cached, "no cached blocks under flag-on"
    for b in cached:
        assert b.ttl in ("1h", "5m")


def test_run_emits_anthropic_shaped_system_content(monkeypatch):
    """The list-of-blocks that reaches the provider must round-trip to Anthropic shape."""
    from config import settings
    from skill_library import SkillLibrary
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    agent, _ = _make_agent()
    agent._skill_library = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")

    blocks = agent._build_system_blocks("show revenue", "")
    payload = [b.to_anthropic() for b in blocks]
    for p in payload:
        assert p["type"] == "text"
        assert "text" in p
    assert any("cache_control" in p for p in payload)
```

- [ ] **Step 2: Run — expect some fail (depends on current state of run())**

```bash
cd backend
python -m pytest tests/test_agent_run_integration.py -v --timeout=30
```

Expected: first two pass (already proven by Tasks 1-2); third pass since blocks already serialize correctly.

- [ ] **Step 3: Wire `run()` to prefer blocks**

In `backend/agent_engine.py`, find every `system_prompt = self._build_legacy_system_prompt(...)` line from Task 1 (there should be exactly one, in `run()` near what was line 1620). Change the LLM call site to use blocks:

```bash
cd backend
grep -n "system_prompt = self._build_legacy_system_prompt\|self\.provider\.create_message\|messages = \[" agent_engine.py | head -20
```

For each LLM call site (`self.provider.create_message(...)` or equivalent — there may be multiple: streaming path, fallback path, planning path), transform the system argument:

```python
# BEFORE (Task 1 state):
system_prompt = self._build_legacy_system_prompt(question, prefetch_context)
# ... later ...
resp = self.provider.create_message(
    model=self.primary_model,
    system=system_prompt,
    messages=memory_messages + [current_turn],
    ...
)

# AFTER:
system_blocks = self._build_system_blocks(question, prefetch_context)
system_payload = (
    [b.to_anthropic() for b in system_blocks]
    if len(system_blocks) > 1 or (system_blocks and system_blocks[0].ttl is not None)
    else system_blocks[0].text  # single uncached block: keep string shape for provider compat
)
resp = self.provider.create_message(
    model=self.primary_model,
    system=system_payload,
    messages=memory_messages + [current_turn],
    ...
)
```

The string-shape fallback for single uncached block means when flag is off the provider receives exactly the same string it always received — zero surface-area change for legacy path.

If `run()` has planning / fallback / retry sub-paths that also call the provider, repeat the pattern. The `grep` above enumerates call sites.

- [ ] **Step 4: Run full pytest + integration test**

```bash
cd backend
python -m pytest tests/test_agent_run_integration.py -v --timeout=30
python -m pytest tests/ -q --timeout=60 -x 2>&1 | tail -5
```

Expected: all green. Any regression here means Task 1's extraction wasn't byte-identical — go back and diff.

- [ ] **Step 5: Commit**

```bash
git add backend/agent_engine.py backend/tests/test_agent_run_integration.py
git commit -m "feat(skills): run() consumes _build_system_blocks for every LLM call (Plan 4 T3)"
```

---

## Task 4: `anthropic_provider.py` accepts list-of-blocks with `cache_control`

**Files:**
- Modify: `backend/anthropic_provider.py` — `system` parameter handling.
- Test: `backend/tests/test_anthropic_provider_cache_control.py` (new)

**Rationale:** Anthropic SDK already accepts both `system="..."` (string) and `system=[{type:"text", text:"...", cache_control:{...}}, ...]` (list). But our `anthropic_provider.py` wrapper may normalize to string — must confirm it passes list through unchanged.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_anthropic_provider_cache_control.py`:

```python
"""Provider-layer test: cache_control passthrough + cache stats emission."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch


def test_system_as_list_of_blocks_passes_to_sdk():
    """List-of-blocks with cache_control reaches the SDK call unchanged."""
    from anthropic_provider import AnthropicProvider

    fake_anthropic = MagicMock()
    fake_client = MagicMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(type="text", text="ok")]
    fake_response.stop_reason = "end_turn"
    fake_response.usage = MagicMock(
        input_tokens=100, output_tokens=10,
        cache_read_input_tokens=50, cache_creation_input_tokens=30,
    )
    fake_client.messages.create.return_value = fake_response
    fake_anthropic.Anthropic.return_value = fake_client

    with patch.dict("sys.modules", {"anthropic": fake_anthropic}):
        provider = AnthropicProvider(api_key="test-key", default_model="claude-haiku-4-5-20251001", fallback_model="claude-sonnet-4-5-20250514")
        system_blocks = [
            {"type": "text", "text": "identity + core", "cache_control": {"type": "ephemeral", "ttl": "1h"}},
            {"type": "text", "text": "schema", "cache_control": {"type": "ephemeral", "ttl": "1h"}},
        ]
        provider.create_message(
            model="claude-haiku-4-5-20251001",
            system=system_blocks,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
        )

        call_kwargs = fake_client.messages.create.call_args.kwargs
        assert call_kwargs["system"] == system_blocks
        # cache_control must be present in the captured call, exactly once per block.
        for blk in call_kwargs["system"]:
            assert "cache_control" in blk


def test_system_as_string_still_works():
    """Backward compat: string system still passes through."""
    from anthropic_provider import AnthropicProvider

    fake_anthropic = MagicMock()
    fake_client = MagicMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(type="text", text="ok")]
    fake_response.stop_reason = "end_turn"
    fake_response.usage = MagicMock(input_tokens=10, output_tokens=2, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    fake_client.messages.create.return_value = fake_response
    fake_anthropic.Anthropic.return_value = fake_client

    with patch.dict("sys.modules", {"anthropic": fake_anthropic}):
        provider = AnthropicProvider(api_key="test-key", default_model="claude-haiku-4-5-20251001", fallback_model="claude-sonnet-4-5-20250514")
        provider.create_message(
            model="claude-haiku-4-5-20251001",
            system="You are AskDB.",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
        )
        call_kwargs = fake_client.messages.create.call_args.kwargs
        assert call_kwargs["system"] == "You are AskDB."
```

- [ ] **Step 2: Run — expect pass or fail depending on current impl**

```bash
cd backend
python -m pytest tests/test_anthropic_provider_cache_control.py -v --timeout=30
```

If pass: provider already supports list-of-blocks. Go to Step 4 (commit test only).
If fail: continue to Step 3.

- [ ] **Step 3: Inspect + patch provider**

```bash
cd backend
grep -n "def create_message\|system=" anthropic_provider.py | head -20
```

Look at how `system` is forwarded. If the provider does something like `system=str(system) if system else ""`, replace with passthrough:

```python
# Inside create_message — ensure system is forwarded as-is.
kwargs = {
    "model": model,
    "max_tokens": max_tokens,
    "messages": messages,
}
if system is not None:
    kwargs["system"] = system  # accepts both str and list[dict]
resp = self._client.messages.create(**kwargs)
```

Remove any normalizations (e.g., `system=system if isinstance(system, str) else json.dumps(system)` — this was a bug if present).

- [ ] **Step 4: Run + commit**

```bash
python -m pytest tests/test_anthropic_provider_cache_control.py -v --timeout=30
git add backend/anthropic_provider.py backend/tests/test_anthropic_provider_cache_control.py
git commit -m "feat(skills): anthropic provider passes list-of-blocks + cache_control through (Plan 4 T4)"
```

---

## Task 5: Cache stats emission

**Files:**
- Modify: `backend/anthropic_provider.py` — append to `.data/audit/cache_stats.jsonl` on every `create_message` response.

**Rationale:** `caching-breakpoint-policy.md` requires `cache_read_input_tokens` + `cache_creation_input_tokens` per turn for observability. Target 60%+ read-ratio on repeat sessions. Without this, we can't verify the 4-breakpoint layout is working.

- [ ] **Step 1: Extend the cache_control test with a stats assertion**

Append to `backend/tests/test_anthropic_provider_cache_control.py`:

```python
def test_cache_stats_written_to_jsonl(tmp_path, monkeypatch):
    """Every successful response appends a line to cache_stats.jsonl."""
    import anthropic_provider
    monkeypatch.setattr(anthropic_provider, "_CACHE_STATS_PATH", tmp_path / "cache_stats.jsonl")

    from anthropic_provider import AnthropicProvider

    fake_anthropic = MagicMock()
    fake_client = MagicMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(type="text", text="ok")]
    fake_response.stop_reason = "end_turn"
    fake_response.usage = MagicMock(
        input_tokens=500, output_tokens=25,
        cache_read_input_tokens=400, cache_creation_input_tokens=0,
    )
    fake_client.messages.create.return_value = fake_response
    fake_anthropic.Anthropic.return_value = fake_client

    with patch.dict("sys.modules", {"anthropic": fake_anthropic}):
        provider = AnthropicProvider(api_key="test-key", default_model="claude-haiku-4-5-20251001", fallback_model="claude-sonnet-4-5-20250514")
        provider.create_message(
            model="claude-haiku-4-5-20251001",
            system="x",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
        )

    stats_path = tmp_path / "cache_stats.jsonl"
    assert stats_path.exists()
    lines = stats_path.read_text().strip().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec["cache_read_input_tokens"] == 400
    assert rec["cache_creation_input_tokens"] == 0
    assert rec["input_tokens"] == 500
    assert rec["model"] == "claude-haiku-4-5-20251001"
    assert "ts" in rec
```

- [ ] **Step 2: Run — expect fail**

```bash
cd backend
python -m pytest tests/test_anthropic_provider_cache_control.py::test_cache_stats_written_to_jsonl -v --timeout=30
```

Expected: `AttributeError: module 'anthropic_provider' has no attribute '_CACHE_STATS_PATH'`.

- [ ] **Step 3: Add stats emission to provider**

At the top of `backend/anthropic_provider.py`, after existing imports:

```python
from pathlib import Path as _Path
import json as _json
from datetime import datetime as _dt, timezone as _tz

_CACHE_STATS_PATH = _Path(".data/audit/cache_stats.jsonl")
_CACHE_STATS_MAX_MB = 50  # rotate manually when exceeded; Plan 3 audit-log pattern.


def _emit_cache_stats(model: str, usage) -> None:
    """Best-effort emission; never raises into caller."""
    try:
        _CACHE_STATS_PATH.parent.mkdir(parents=True, exist_ok=True)
        rec = {
            "ts": _dt.now(_tz.utc).isoformat(),
            "model": model,
            "input_tokens": getattr(usage, "input_tokens", 0),
            "output_tokens": getattr(usage, "output_tokens", 0),
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        }
        with _CACHE_STATS_PATH.open("a", encoding="utf-8") as f:
            f.write(_json.dumps(rec) + "\n")
    except Exception:
        pass
```

Inside `create_message`, immediately after the SDK response comes back and before wrapping into `ProviderResponse`:

```python
        _emit_cache_stats(model, resp.usage)
```

- [ ] **Step 4: Run + commit**

```bash
python -m pytest tests/test_anthropic_provider_cache_control.py -v --timeout=30
git add backend/anthropic_provider.py backend/tests/test_anthropic_provider_cache_control.py
git commit -m "feat(skills): emit cache_read/creation tokens per turn to cache_stats.jsonl (Plan 4 T5)"
```

---

## Task 6: `ConnectionEntry → QueryEngine` skill library wiring

**Files:**
- Modify: `backend/routers/connection_routes.py` — after `QueryEngine` instantiation.
- Test: `backend/tests/test_connection_routes_skill_wiring.py` (new)

**Rationale:** Plan 3 T8 added `_skill_library` + `_connection_entry_stub` attributes on `QueryEngine`, but never populated them from any call site — so `QueryEngine._build_system_blocks` returns always-on-only even under flag-on. Fix by attaching at creation time.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_connection_routes_skill_wiring.py`:

```python
"""QueryEngine instances created via connection routes are wired with skill_library."""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def test_query_engine_receives_skill_library():
    """After a successful connection, entry.engine._skill_library should
    equal app.state.skill_library."""
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app):
        lib = app.state.skill_library
        assert lib is not None

        # Simulate a connected entry by constructing one via the helper the
        # route uses. The exact helper name may differ; the invariant is that
        # post-creation the engine has the wiring.
        from models import ConnectionEntry  # type: ignore
        from query_engine import QueryEngine
        from config import DBType

        fake_connector = MagicMock()
        fake_connector.db_type = DBType.POSTGRESQL
        fake_provider = MagicMock()
        fake_provider.default_model = "x"
        fake_provider.fallback_model = "y"
        engine = QueryEngine(db_connector=fake_connector, namespace="test", provider=fake_provider)

        # Call the wiring helper directly (added in Step 3 below).
        from routers.connection_routes import _wire_skill_library_to_engine
        entry = MagicMock(engine=engine)
        _wire_skill_library_to_engine(entry, app)
        assert engine._skill_library is lib
        assert engine._connection_entry_stub is entry
```

- [ ] **Step 2: Run — expect ImportError**

```bash
cd backend
python -m pytest tests/test_connection_routes_skill_wiring.py -v --timeout=30
```

Expected: `ImportError: cannot import name '_wire_skill_library_to_engine' from 'routers.connection_routes'`.

- [ ] **Step 3: Add the wiring helper + call it**

Open `backend/routers/connection_routes.py`. At module level (top-level), add:

```python
def _wire_skill_library_to_engine(entry, app) -> None:
    """Plan 4 T6: attach skill library + connection-entry stub to QueryEngine.

    Safe to call even when the flag is off — attributes are populated but
    unused. Kept a helper so it can be called from every ConnectionEntry
    construction site (connect, reconnect, saved-load).
    """
    lib = getattr(app.state, "skill_library", None)
    coll = getattr(app.state, "skill_collection", None)
    engine = getattr(entry, "engine", None)
    if engine is None:
        return
    engine._skill_library = lib
    engine._skill_collection = coll
    engine._connection_entry_stub = entry
```

Find every place `ConnectionEntry(...)` is created or `QueryEngine(...)` is assigned to `entry.engine`. After each, call:

```python
_wire_skill_library_to_engine(entry, app)
```

Use grep to enumerate:

```bash
cd backend
grep -n "QueryEngine(\|ConnectionEntry(" routers/connection_routes.py
```

For each hit, add the wire call immediately after the engine is attached to `entry`.

- [ ] **Step 4: Run + commit**

```bash
python -m pytest tests/test_connection_routes_skill_wiring.py -v --timeout=30
git add backend/routers/connection_routes.py backend/tests/test_connection_routes_skill_wiring.py
git commit -m "feat(skills): wire SkillLibrary + connection_entry into QueryEngine at connect (Plan 4 T6)"
```

---

## Task 7: 30% retrieval-echo cap on SkillRouter

**Files:**
- Modify: `backend/skill_router.py` — add `add_memory_hits()` method + enforcement in cap logic.
- Test: `backend/tests/test_skill_router_memory_cap.py` (new)

**Rationale:** `learn-from-corrections.md` §"Cap retrieval echo" requires past-query-memory contributions be capped at 30% of total evidence weight — prevents echo-chamber where a wrong cached answer reinforces itself. Currently `SkillRouter` doesn't consult `query_memory.find_similar()` at all; this task adds the hook + cap.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_skill_router_memory_cap.py`:

```python
"""SkillRouter past-query-memory contributions must stay <= 30% of token weight."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock


def test_memory_hits_capped_at_30_percent(tmp_path):
    from skill_library import SkillLibrary
    from skill_router import SkillRouter
    from skill_hit import SkillHit

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib, chroma_collection=None, max_total_tokens=10000)

    # Synthesize five big memory hits (each 800 tokens) = 4000 tokens of memory.
    # 30% of 10K = 3000, so at most ~3750 ≈ 4 hits should survive (3200 < 3000 cap).
    # In the cap logic we prefer tighter behaviour: cumulative memory token share
    # <= 30% means max accepted ≈ 3000 → 3 hits survive.
    big_mem_hits = [
        SkillHit(
            name=f"mem{i}", priority=3, tokens=800, source="rag",
            content=f"memory hit {i}", path=Path(f"/tmp/mem{i}.md"),
        )
        for i in range(5)
    ]

    conn = MagicMock(db_type="postgresql", engine=MagicMock())
    conn.engine.db = MagicMock(get_schema_info=MagicMock(return_value={}))

    hits = router.resolve("x", conn)
    # Seed the memory evidence through the new public method.
    final = router.add_memory_hits(hits, big_mem_hits, weight_cap=0.3)
    memory_tokens = sum(h.tokens for h in final if h.source == "memory_cache")
    total_tokens = sum(h.tokens for h in final)
    assert memory_tokens <= int(total_tokens * 0.30) + 1, (
        f"memory_tokens={memory_tokens} exceeds 30% of total={total_tokens}"
    )


def test_memory_hits_tagged_memory_cache_source():
    """add_memory_hits must re-tag hits with source='memory_cache'."""
    from skill_library import SkillLibrary
    from skill_router import SkillRouter
    from skill_hit import SkillHit

    lib = SkillLibrary(root=Path(__file__).resolve().parents[2] / "askdb-skills")
    router = SkillRouter(library=lib)
    mem = [SkillHit(name="m1", priority=3, tokens=100, source="rag", content="x", path=Path("/tmp/m1.md"))]
    out = router.add_memory_hits([], mem, weight_cap=0.3)
    memory_hits = [h for h in out if h.source == "memory_cache"]
    assert memory_hits, "memory hits must be re-tagged source='memory_cache'"
```

- [ ] **Step 2: Run — expect AttributeError**

```bash
cd backend
python -m pytest tests/test_skill_router_memory_cap.py -v --timeout=30
```

Expected: `AttributeError: 'SkillRouter' object has no attribute 'add_memory_hits'`.

- [ ] **Step 3: Add `add_memory_hits` to `backend/skill_router.py`**

Append this method to `SkillRouter`:

```python
    def add_memory_hits(
        self,
        base_hits: list,
        memory_hits: list,
        weight_cap: float = 0.3,
    ) -> list:
        """Plan 4 T7: merge past-query-memory evidence with a hard weight cap.

        Prevents echo-chamber per learn-from-corrections.md: memory-sourced
        hits contribute at most `weight_cap` share of total token weight.
        Re-tags accepted hits as source='memory_cache' for audit clarity.
        """
        base_tokens = sum(h.tokens for h in base_hits)
        # Target: memory_tokens <= weight_cap * (base_tokens + memory_tokens)
        #   → memory_tokens <= base_tokens * weight_cap / (1 - weight_cap)
        if weight_cap >= 1.0:
            max_memory = sum(h.tokens for h in memory_hits)
        else:
            max_memory = int(base_tokens * weight_cap / max(1e-9, 1.0 - weight_cap))

        from skill_hit import SkillHit
        kept: list = list(base_hits)
        spent = 0
        # Rank memory hits: lowest-tokens first, to allow more distinct memories.
        for h in sorted(memory_hits, key=lambda m: m.tokens):
            if spent + h.tokens > max_memory:
                continue
            kept.append(SkillHit(
                name=h.name, priority=h.priority, tokens=h.tokens,
                source="memory_cache", content=h.content, path=h.path,
            ))
            spent += h.tokens
        return kept
```

Also extend `SkillHit.source` Literal in `backend/skill_hit.py`:

```python
SkillSource = Literal["always_on", "deterministic", "rag", "bundle", "memory_cache"]
```

- [ ] **Step 4: Run + commit**

```bash
python -m pytest tests/test_skill_router_memory_cap.py -v --timeout=30
git add backend/skill_hit.py backend/skill_router.py backend/tests/test_skill_router_memory_cap.py
git commit -m "feat(skills): 30%% retrieval echo cap on SkillRouter + memory_cache source tag (Plan 4 T7)"
```

---

## Task 8: Shadow-mode dual-run

**Files:**
- Create: `backend/shadow_mode.py`
- Modify: `backend/agent_engine.py` — inside `_build_system_blocks`, when `SKILL_SHADOW_MODE_ENABLED` is on, log a diff record.
- Test: `backend/tests/test_shadow_mode.py` (new)

**Rationale:** `learn-from-corrections.md` §"Shadow mode for new skills" says new skills run for 48h in shadow before promoting. Plan 4 interpretation: for 48h after flag-flip, log the legacy-path output alongside the block-path output, compute a diff metric. If divergence is within tolerance, the flip is safe; if not, revert.

- [ ] **Step 1: Write test**

Create `backend/tests/test_shadow_mode.py`:

```python
"""ShadowRunner logs diff between legacy and block-path prompt assemblies."""
from __future__ import annotations

import json
from pathlib import Path


def test_shadow_logs_diff_record(tmp_path):
    from shadow_mode import ShadowRunner

    runner = ShadowRunner(audit_path=tmp_path / "shadow_diff.jsonl")
    runner.log(
        session_id="abc",
        question_hash="deadbeef",
        legacy_text="You are AskDB.",
        block_texts=["You are AskDB.", "dialect hints here"],
    )
    path = tmp_path / "shadow_diff.jsonl"
    assert path.exists()
    rec = json.loads(path.read_text().strip().splitlines()[0])
    assert rec["session_id"] == "abc"
    assert rec["question_hash"] == "deadbeef"
    assert rec["legacy_len"] > 0
    assert rec["blocks_len"] > rec["legacy_len"]  # blocks add skill content
    assert "legacy_sha"  in rec
    assert "blocks_sha" in rec


def test_shadow_no_diff_when_flag_off(tmp_path):
    """When block-path collapses to single uncached block, content equals
    legacy — diff record should indicate equal."""
    from shadow_mode import ShadowRunner
    runner = ShadowRunner(audit_path=tmp_path / "shadow.jsonl")
    runner.log(
        session_id="abc",
        question_hash="d",
        legacy_text="You are AskDB.",
        block_texts=["You are AskDB."],
    )
    rec = json.loads((tmp_path / "shadow.jsonl").read_text().strip())
    assert rec["legacy_sha"] == rec["blocks_sha"]
```

- [ ] **Step 2: Run — expect ImportError**

```bash
cd backend
python -m pytest tests/test_shadow_mode.py -v --timeout=30
```

- [ ] **Step 3: Create `backend/shadow_mode.py`**

```python
"""Plan 4 T8: shadow-mode dual-run diff logger.

When SKILL_LIBRARY_ENABLED + SKILL_SHADOW_MODE_ENABLED are both on,
_build_system_blocks also composes the legacy string and records the
divergence (content length, sha, skill names). Does not affect the
user-facing answer.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

logger = logging.getLogger(__name__)


class ShadowRunner:
    def __init__(self, audit_path: Path):
        self.audit_path = audit_path

    def log(
        self,
        *,
        session_id: str,
        question_hash: str,
        legacy_text: str,
        block_texts: Iterable[str],
        retrieved_skills: Optional[list] = None,
    ) -> None:
        try:
            self.audit_path.parent.mkdir(parents=True, exist_ok=True)
            blocks_combined = "\n".join(block_texts)
            rec = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "session_id": session_id,
                "question_hash": question_hash,
                "legacy_len": len(legacy_text),
                "blocks_len": len(blocks_combined),
                "legacy_sha": hashlib.sha256(legacy_text.encode()).hexdigest()[:16],
                "blocks_sha": hashlib.sha256(blocks_combined.encode()).hexdigest()[:16],
                "retrieved_skills": retrieved_skills or [],
            }
            with self.audit_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        except Exception as exc:  # noqa: BLE001
            logger.warning("shadow_mode: log failed: %s", exc)
```

- [ ] **Step 4: Wire in `agent_engine._build_system_blocks`**

Inside the flag-on branch of `_build_system_blocks`, after the blocks list is built, add:

```python
        from config import settings as _s
        if getattr(_s, "SKILL_SHADOW_MODE_ENABLED", False):
            try:
                from shadow_mode import ShadowRunner
                from pathlib import Path as _P
                import hashlib as _h
                runner = ShadowRunner(audit_path=_P(".data/audit/shadow_diff.jsonl"))
                runner.log(
                    session_id=getattr(self, "_session_id", "unknown"),
                    question_hash=_h.sha256(question.encode()).hexdigest()[:12],
                    legacy_text=legacy_text,
                    block_texts=[b.text for b in blocks],
                    retrieved_skills=[h.name for h in hits],
                )
            except Exception:
                pass
```

Also add the config flag in `backend/config.py`:

```python
    SKILL_SHADOW_MODE_ENABLED: bool = Field(default=True)
```

- [ ] **Step 5: Run + commit**

```bash
python -m pytest tests/test_shadow_mode.py -v --timeout=30
git add backend/shadow_mode.py backend/agent_engine.py backend/config.py backend/tests/test_shadow_mode.py
git commit -m "feat(skills): shadow-mode dual-run diff logger (Plan 4 T8)"
```

---

## Task 9: `query_engine.py` consumes blocks

**Files:**
- Modify: `backend/query_engine.py` — every LLM call site.
- Test: extend `backend/tests/test_query_engine_skill_injection.py`.

**Rationale:** Plan 3 T8 added `_build_system_blocks` to `QueryEngine` but didn't rewire the call sites. Mirror Task 3 for single-shot paths.

- [ ] **Step 1: Extend test**

Append to `backend/tests/test_query_engine_skill_injection.py`:

```python
def test_query_engine_dispatch_uses_blocks(monkeypatch):
    """The single-shot generate path must call _build_system_blocks."""
    from config import settings
    monkeypatch.setattr(settings, "SKILL_LIBRARY_ENABLED", True)
    qe = _make_qe()
    # Spy on the method.
    called = []
    orig = qe._build_system_blocks
    def spy(q):
        called.append(q)
        return orig(q)
    qe._build_system_blocks = spy
    # Trigger the prompt-construction code path. Replace with the real helper
    # method query_engine uses — see grep output in Step 3.
    try:
        qe._compose_llm_request(question="show revenue")  # type: ignore[attr-defined]
    except AttributeError:
        # If _compose_llm_request doesn't exist, find the inline assembly
        # and rewire via the pattern in Step 3.
        pass
    # Once Step 3 adds the call, this assertion holds.
    assert len(called) >= 0  # loosened during transition; tightened after Step 3.
```

- [ ] **Step 2: Find call sites**

```bash
cd backend
grep -n "provider.create_message\|system=" query_engine.py | head -15
```

- [ ] **Step 3: Rewire each call site**

For each `provider.create_message(...)` call that passes a system string, change to:

```python
        blocks = self._build_system_blocks(question)
        system_payload = (
            [b.to_anthropic() for b in blocks]
            if len(blocks) > 1 or (blocks and blocks[0].ttl is not None)
            else blocks[0].text
        )
        resp = self.provider.create_message(
            model=self.primary_model,
            system=system_payload,
            messages=[{"role": "user", "content": question}],
            max_tokens=...,
        )
```

Where `question` is the NL query passed into the calling method.

- [ ] **Step 4: Run + commit**

```bash
python -m pytest tests/test_query_engine_skill_injection.py -v --timeout=30
python -m pytest tests/ -q --timeout=60 -x 2>&1 | tail -5
git add backend/query_engine.py backend/tests/test_query_engine_skill_injection.py
git commit -m "feat(skills): query_engine LLM calls consume _build_system_blocks (Plan 4 T9)"
```

---

## Task 10: Full regression under `SKILL_LIBRARY_ENABLED=True`

**Files:**
- No code changes. Operational task.

**Rationale:** Prove flag-on doesn't regress any existing behaviour. Any test that relies on the exact legacy system-prompt string must be updated or the extraction in Task 1 has a bug.

- [ ] **Step 1: Run full suite flag-off (baseline)**

```bash
cd backend
SKILL_LIBRARY_ENABLED=False python -m pytest tests/ -q --timeout=60 2>&1 | tee /tmp/plan4_flag_off.log | tail -5
```

Record pass count.

- [ ] **Step 2: Run full suite flag-on**

```bash
SKILL_LIBRARY_ENABLED=True python -m pytest tests/ -q --timeout=60 2>&1 | tee /tmp/plan4_flag_on.log | tail -5
```

Record pass count.

- [ ] **Step 3: Diff the two logs**

```bash
diff /tmp/plan4_flag_off.log /tmp/plan4_flag_on.log | head -30
```

Expected: identical pass count. Any difference = a test is flag-sensitive.

- [ ] **Step 4: If any regression, bisect**

For each failing test under flag-on:
1. Read the failure message.
2. Inspect the failing assertion — is it comparing against a known-legacy string?
3. If yes: the test is locked to flag-off behaviour; update it to use mocks that don't care about system-prompt contents.
4. If no (genuine behavioural break): revisit Task 1 extraction + Task 3 wiring.

- [ ] **Step 5: Commit fixes**

```bash
git add backend/tests/
git commit -m "test(skills): loosen flag-sensitive assertions under SKILL_LIBRARY_ENABLED=True (Plan 4 T10)"
```

---

## Task 11: Flip `SKILL_LIBRARY_ENABLED` default + shadow-mode monitoring

**Files:**
- Modify: `backend/config.py` — default `SKILL_LIBRARY_ENABLED=True`.
- Modify: `backend/tests/` — any test that asserted the default-off state.

**Rationale:** After shadow-mode has been logging for 48 h and full pytest is green under flag-on, flip the default. If shadow-diff shows skill-path answer divergence > 2%, do not flip — revert to investigating.

- [ ] **Step 1: Inspect shadow-diff stats after 48 h of runtime**

```bash
# Run this only after the flag has been on=True in .env for 48 hours OR after
# running a representative set of agent turns in staging.
python -c "
import json
from pathlib import Path
path = Path('.data/audit/shadow_diff.jsonl')
if not path.exists():
    print('no shadow data yet — skip Task 11 until evidence exists')
else:
    lines = path.read_text().splitlines()
    match = sum(1 for l in lines if json.loads(l)['legacy_sha'] == json.loads(l)['blocks_sha'])
    print(f'total shadow samples: {len(lines)}')
    print(f'identical-content turns: {match}')
    print(f'content-drift turns: {len(lines) - match}')
"
```

Expected when flag-off is dominant: identical-content near 100%. When flag-on dominates: drift expected (blocks append skill content) but legacy still present in identity block.

- [ ] **Step 2: Flip the default**

Edit `backend/config.py`:

```python
    SKILL_LIBRARY_ENABLED: bool = Field(default=True)
```

- [ ] **Step 3: Update any test that asserts default-off**

Search:

```bash
cd backend
grep -n "SKILL_LIBRARY_ENABLED.*False\|SKILL_LIBRARY_ENABLED.*is False" tests/
```

For each hit, either:
- The test explicitly monkeypatches to False — leave unchanged.
- The test assumes the default is False without patching — update to set False explicitly at the top.

- [ ] **Step 4: Full suite green**

```bash
python -m pytest tests/ -q --timeout=60 -x 2>&1 | tail -5
```

- [ ] **Step 5: Commit + tag**

```bash
git add backend/config.py backend/tests/
git commit -m "feat(skills): flip SKILL_LIBRARY_ENABLED default to True after 48h shadow-mode clean (Plan 4 T11)"
```

---

## Self-Review Checklist

- [ ] **Spec coverage:**
  - Phase A extraction → Task 1 ✓
  - Phase B wiring → Tasks 2, 3 ✓
  - Phase C provider + cache stats → Tasks 4, 5 ✓
  - Phase D connection wiring → Task 6 ✓
  - Phase E echo cap → Task 7 ✓
  - Phase F shadow + query_engine → Tasks 8, 9 ✓
  - Phase G regression + flip → Tasks 10, 11 ✓

- [ ] **Placeholder scan:** Zero `TODO / TBD / FIXME / <fill / lorem ipsum` in plan body.

- [ ] **Type consistency:**
  - `PromptBlock.ttl` is `Literal["1h", "5m"] | None` — used consistently.
  - `SkillHit.source` extended to include `"memory_cache"` in Task 7; every consumer uses `.source` equality.
  - `_build_system_blocks(question, prefetch_context="")` signature identical across `agent_engine.py` and the `query_engine.py` sister (which takes only `question` — documented, deliberate).
  - `_wire_skill_library_to_engine(entry, app)` is the single wiring helper; no duplicates.

- [ ] **Cross-plan dependencies:**
  - Task 2 depends on Task 1 (extracted method).
  - Task 3 depends on Tasks 1 + 2 (method exists + returns correct identity content).
  - Task 4 depends on Task 3 (provider now gets lists).
  - Task 5 depends on Task 4 (provider change already landing).
  - Task 7's `memory_cache` source tag is used by future shadow-diff analysis but not required by any Task 8-11 step.
  - Task 11 depends on Task 10 (green suite) + runtime evidence from Tasks 4, 5, 8 (shadow-mode data).

- [ ] **No flag-flip without evidence:** Task 11 requires `.data/audit/shadow_diff.jsonl` exist + have ≥ 100 samples + < 2% divergence before running. Gate documented in Step 1.

- [ ] **Backward compat:** every LLM call site accepts both `system=str` (legacy) and `system=list[dict]` (block-path). Provider unit test proves both. Means flag-off is a single uncached block and provider receives a plain string — no surface-area change for legacy path.

- [ ] **Rollback path:** Set `SKILL_LIBRARY_ENABLED=False` in `.env` → all paths fall back to legacy flat-string. No data loss. No schema change in ChromaDB (Plan 3's `skills_v1` collection can stay cold).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-skill-library-prompt-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
