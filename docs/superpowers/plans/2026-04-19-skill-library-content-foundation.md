# Skill Library Content Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine critical content gaps in `askdb-skills/` identified by the 2026-04-19 audit + research sweep, split the one overloaded file, and extract a shared metric glossary — producing a gap-closed, redundancy-trimmed, 2025-2026-aligned skill library ready for the retrieval-infra plan that follows.

**Architecture:** Pure content work — markdown file creation and restructuring inside `askdb-skills/`. Each new skill file follows the Anthropic Agent Skills open-standard frontmatter (`name` + trigger `description`), has a concrete Examples section, and fits within the per-file token budgets set by `MASTER_INDEX.md`. Tests enforce structure (frontmatter present, token budget met, examples block exists) via a small `pytest` suite that parses every file in `askdb-skills/`.

**Tech Stack:** Markdown. Python 3.10+ with `pytest`, `tiktoken` (or a word-count approximation), and `python-frontmatter` for the structure validator.

**Scope note — what this plan covers vs defers**
- ✅ **Tier A:** Nine new skill files that close gaps found in the audit (LLM error recovery, data-quality trust scoring, caching breakpoints, streaming/progressive results, batch query optimization, skill-library meta, schema-linking evidence, self-repair error taxonomy, accessibility WCAG).
- ✅ **Tier C:** Split `context-compaction-teach-by-correction.md` into two single-responsibility skills; extract `shared/metric-definitions-glossary.md` from domain overlap.
- ⛔ **Deferred to follow-up plans:** Updates to existing skill files (Tier B), retrieval infrastructure code (Tier D infra), prompt-injection integration in `agent_engine.py` / `query_engine.py` (Tier D integration), self-learning correction queue + golden eval harness (Tier E).

---

## Prerequisites

Before starting Task 1, confirm these are true:

- [ ] You are in the `QueryCopilot V1/` working tree (the git repo).
- [ ] `python -m pytest --version` works from `backend/`.
- [ ] The folder `C:/Users/sid23/Documents/Agentic_AI/files/QueryCopilot V1/askdb-skills/` exists and contains the 37 existing `.md` files plus `MASTER_INDEX.md`.
- [ ] You have read `docs/claude/security-core.md`, `docs/claude/arch-backend.md`, and `askdb-skills/MASTER_INDEX.md`.

If any check fails, stop and resolve before continuing.

---

## File Structure

**New skill files (Tier A — 9 total):**

| Path | Category | Approx tokens |
|---|---|---|
| `askdb-skills/core/llm-error-recovery.md` | core | ~1500 |
| `askdb-skills/core/data-quality-trust-scoring.md` | core | ~1300 |
| `askdb-skills/core/caching-breakpoint-policy.md` | core | ~1200 |
| `askdb-skills/agent/streaming-progressive-results.md` | agent | ~1100 |
| `askdb-skills/agent/batch-query-optimization.md` | agent | ~900 |
| `askdb-skills/agent/skill-library-meta.md` | agent | ~1400 |
| `askdb-skills/sql/schema-linking-evidence.md` | sql | ~1600 |
| `askdb-skills/sql/self-repair-error-taxonomy.md` | sql | ~1500 |
| `askdb-skills/visualization/accessibility-wcag.md` | visualization | ~1300 |

**New shared content (Tier C):**

| Path | Purpose |
|---|---|
| `askdb-skills/shared/metric-definitions-glossary.md` | Single source for business metric defs referenced by all domain skills |
| `askdb-skills/agent/session-persistence.md` | Compaction + resume half of the split |
| `askdb-skills/agent/learn-from-corrections.md` | Teach-by-correction half of the split, with ICRH safeguards |

**Modified files:**

| Path | Change |
|---|---|
| `askdb-skills/agent/context-compaction-teach-by-correction.md` | **Deleted** after content split |
| `askdb-skills/domain/domain-sales.md` | Replace duplicated metric defs with references to `shared/metric-definitions-glossary.md` |
| `askdb-skills/domain/domain-product-finance-marketing-ecommerce.md` | Same dereferencing |
| `askdb-skills/MASTER_INDEX.md` | Update file map (now 44 files), retrieval trigger matrix, version entry |

**Test infrastructure:**

| Path | Purpose |
|---|---|
| `backend/tests/test_skill_library_structure.py` | pytest suite validating frontmatter, token budget, Examples section, no forbidden placeholders |
| `backend/requirements.txt` | Add `python-frontmatter` + `tiktoken` pins (dev deps) |

---

## Skill File Authoring Contract

Every new skill file **must** conform to this structure. The test suite (Task 0) enforces it.

```markdown
---
name: <kebab-case slug matching filename without .md>
description: <single-line trigger description, <=160 chars, written for embedding match — starts with a verb or noun phrase the agent would think when the skill applies>
priority: <1 | 2 | 3>
tokens_budget: <integer, approximate>
applies_to: <comma-sep list of actions e.g. "sql-generation, error-recovery">
---

# <Title> — AskDB AgentEngine

## <Section 1>
<Rules as bullets or short paragraphs>

## <Section 2+>
<More rules, SQL examples where applicable>

---

## Examples
<3–5 concrete input → output examples, minimum 3>
```

**Hard rules enforced by tests:**
1. Frontmatter block present with all five keys.
2. `name` matches filename stem.
3. `description` between 20 and 160 chars (forces tight trigger phrasing — Anthropic Skills convention).
4. `priority` ∈ {1, 2, 3}.
5. `tokens_budget` ≤ 2500 and ≥ 300.
6. File body actual tokens within `tokens_budget ± 25%`.
7. `## Examples` section present with ≥ 3 examples (counted by `^\*\*Input:\*\*` occurrences OR `### Example N` headings).
8. No occurrence of the strings `TODO`, `TBD`, `FIXME`, `<fill`, `lorem ipsum`.

---

## Task 0: Structure-Validation Test Harness

**Files:**
- Create: `backend/tests/test_skill_library_structure.py`
- Modify: `backend/requirements.txt` (append two deps)

- [ ] **Step 1: Add dependencies**

Append these two lines to `backend/requirements.txt`:

```text
python-frontmatter==1.1.0
tiktoken==0.8.0
```

- [ ] **Step 2: Install dependencies**

Run from `backend/`:

```bash
pip install python-frontmatter==1.1.0 tiktoken==0.8.0
```

Expected: both packages install without errors.

- [ ] **Step 3: Write the failing test**

Create `backend/tests/test_skill_library_structure.py` with this content:

```python
"""Structure validator for askdb-skills/ markdown files.

Enforces the Skill File Authoring Contract defined in
docs/superpowers/plans/2026-04-19-skill-library-content-foundation.md.
"""
from __future__ import annotations

import re
from pathlib import Path

import frontmatter
import pytest
import tiktoken

SKILLS_ROOT = Path(__file__).resolve().parents[2] / "askdb-skills"
REQUIRED_KEYS = {"name", "description", "priority", "tokens_budget", "applies_to"}
FORBIDDEN_SUBSTRINGS = ("TODO", "TBD", "FIXME", "<fill", "lorem ipsum")
ENCODER = tiktoken.get_encoding("cl100k_base")

# Files exempt from frontmatter (index/manifest docs)
EXEMPT = {"MASTER_INDEX.md"}


def _iter_skill_files():
    for path in SKILLS_ROOT.rglob("*.md"):
        if path.name in EXEMPT:
            continue
        yield path


@pytest.fixture(scope="module")
def skill_files():
    return list(_iter_skill_files())


def test_skills_root_exists():
    assert SKILLS_ROOT.is_dir(), f"askdb-skills root not found at {SKILLS_ROOT}"


@pytest.mark.parametrize("path", list(_iter_skill_files()), ids=lambda p: str(p.relative_to(SKILLS_ROOT)))
def test_skill_file_structure(path: Path):
    post = frontmatter.load(path)
    meta = post.metadata

    missing = REQUIRED_KEYS - set(meta.keys())
    assert not missing, f"{path.name}: missing frontmatter keys {missing}"

    expected_name = path.stem
    assert meta["name"] == expected_name, (
        f"{path.name}: frontmatter name={meta['name']!r} != stem {expected_name!r}"
    )

    desc = str(meta["description"])
    assert 20 <= len(desc) <= 160, f"{path.name}: description length {len(desc)} out of [20,160]"

    assert meta["priority"] in (1, 2, 3), f"{path.name}: priority must be 1|2|3"

    tb = int(meta["tokens_budget"])
    assert 300 <= tb <= 2500, f"{path.name}: tokens_budget {tb} out of [300,2500]"

    body = post.content
    actual_tokens = len(ENCODER.encode(body))
    low, high = int(tb * 0.75), int(tb * 1.25)
    assert low <= actual_tokens <= high, (
        f"{path.name}: actual tokens {actual_tokens} outside budget window [{low},{high}] for tokens_budget={tb}"
    )

    assert re.search(r"^## Examples\s*$", body, re.MULTILINE), (
        f"{path.name}: missing '## Examples' section"
    )

    example_count = len(re.findall(r"(?m)^\*\*Input:\*\*|^### Example \d", body))
    assert example_count >= 3, f"{path.name}: only {example_count} examples, need >= 3"

    for bad in FORBIDDEN_SUBSTRINGS:
        assert bad not in body, f"{path.name}: forbidden substring {bad!r} present"


def test_master_index_lists_all_skills():
    """MASTER_INDEX.md must reference every skill file by path."""
    index_path = SKILLS_ROOT / "MASTER_INDEX.md"
    text = index_path.read_text(encoding="utf-8")
    missing = []
    for path in _iter_skill_files():
        rel = path.relative_to(SKILLS_ROOT).as_posix()
        slug = path.name
        if slug not in text and rel not in text:
            missing.append(rel)
    assert not missing, f"MASTER_INDEX missing entries: {missing}"
```

- [ ] **Step 4: Run test to verify it fails**

Run from `backend/`:

```bash
python -m pytest tests/test_skill_library_structure.py -v
```

Expected: Multiple FAIL results — every existing skill file in `askdb-skills/` will fail the frontmatter check because the existing files do not yet have frontmatter. This is the correct failure state — we're adding frontmatter + new content in subsequent tasks. The test `test_skills_root_exists` must PASS.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add backend/tests/test_skill_library_structure.py backend/requirements.txt
git commit -m "feat(skills): add structure validator test harness (Plan 1 T0)"
```

---

## Migration Step: Backfill Frontmatter on Existing 37 Files

**Rationale:** The structure validator expects frontmatter on every file. The nine new files will be born with it, but the existing 37 files need it retroactively so the test suite can stay green end-to-end. This task is mechanical — derive `name` from filename, write a short trigger description based on the file's current H1 + first paragraph, assign priority from MASTER_INDEX, estimate `tokens_budget` from current size.

**Files:**
- Modify: all 37 existing `.md` files under `askdb-skills/` except `MASTER_INDEX.md`
- Create: `scripts/backfill_skill_frontmatter.py` (one-shot helper)

- [ ] **Step 1: Write the failing test (already exists from T0)**

No new test — T0's `test_skill_file_structure` already asserts frontmatter on every file. Currently failing for all 37 existing files.

- [ ] **Step 2: Create the backfill script**

Create `scripts/backfill_skill_frontmatter.py`:

```python
"""One-shot: add frontmatter to existing askdb-skills/ files.

Idempotent — skips files that already have frontmatter.
Run once from repo root: python scripts/backfill_skill_frontmatter.py
"""
from __future__ import annotations

import re
from pathlib import Path

import frontmatter
import tiktoken

ROOT = Path(__file__).resolve().parents[1] / "askdb-skills"
ENCODER = tiktoken.get_encoding("cl100k_base")

# Priority tier from MASTER_INDEX.md (1 = always on, 2 = frequent, 3 = on trigger)
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
    """Compose a 20–160 char trigger phrase."""
    cleaned = re.sub(r"\s+", " ", first_para).strip()
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
    # Extract H1 + first non-empty paragraph
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
```

- [ ] **Step 3: Run the backfill**

From the `QueryCopilot V1/` repo root:

```bash
python scripts/backfill_skill_frontmatter.py
```

Expected: Console prints "updated: <path>" for all 37 files, then "37 files updated".

- [ ] **Step 4: Run the validator test**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -v
```

Expected: All 37 existing-file tests now PASS on the frontmatter check. The `test_master_index_lists_all_skills` still PASSES because MASTER_INDEX already references every existing file by path.

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1"
git add scripts/backfill_skill_frontmatter.py askdb-skills/
git commit -m "feat(skills): backfill Anthropic Skills frontmatter on existing 37 files (Plan 1 T-migrate)"
```

---

## Task 1: Create `core/llm-error-recovery.md`

**Files:**
- Create: `askdb-skills/core/llm-error-recovery.md`

**Rationale (from audit gap #1 + research finding "error-taxonomy playbook"):** No current skill explains what the agent does when Claude API errors, rate-limits, or token-limits hit, or when the circuit breaker (`anthropic_provider.py` 5-failure → 30s cooldown) opens. Scattered across `error-handling.md` but deserves a dedicated, agent-facing skill because it's a Priority-2 retrieval whenever an error surfaces.

- [ ] **Step 1: Confirm test will fail**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "llm-error-recovery" -v
```

Expected: Empty collection (file doesn't exist yet) — or no failure, just no match. Proceed.

- [ ] **Step 2: Create the skill file**

Write `askdb-skills/core/llm-error-recovery.md` with this exact content:

````markdown
---
name: llm-error-recovery
description: LLM API error, rate limit, token-limit, circuit-breaker and malformed-response recovery playbook for the AskDB agent loop
priority: 2
tokens_budget: 1500
applies_to: multi-step-agent, sql-generation, error-recovery
---

# LLM Error Recovery — AskDB AgentEngine

## When to load this skill

Always retrievable on any phase where an LLM call has failed or may fail: agent thinking, planning, SQL generation, summarization. `waterfall_router` should also load it when Tier 2b (LiveTier) error count in the session exceeds 1.

## Error taxonomy

Every LLM failure falls into exactly one of these classes. Classify before reacting.

| Class | Trigger signal | User-visible severity | Required action |
|---|---|---|---|
| `rate_limit` | HTTP 429 from provider; `x-ratelimit-*` headers; error body contains "rate_limit" | soft | Exponential backoff starting 2 s, jitter ±30%, cap 3 retries, then degrade |
| `token_limit_input` | 400 "prompt is too long" / `max_tokens_exceeded` on request | hard | Compact session memory → retry once; if still over, reply with plain-text apology + manual refinement prompt |
| `token_limit_output` | Stop reason `max_tokens`, truncated tool-use JSON | soft | Retry with same prompt but `max_tokens` raised by 50%; if still truncated, summarize partial output and continue |
| `invalid_request` | 400 with `invalid_request_error` | hard | **Never retry.** Log full prompt hash + error, degrade to plain-English error message. |
| `overloaded` | HTTP 529 / `overloaded_error` | soft | Backoff 5 s, retry up to 2, fall back to `FALLBACK_MODEL` |
| `circuit_breaker_open` | `anthropic_provider` raises `CircuitBreakerOpenError` | hard | Wait for cooldown (30 s default) + jitter, surface user-facing "service cooling down" message |
| `malformed_tool_use` | `tool_use` block missing required field, unparseable JSON, invalid tool name | hard | Discard the assistant turn, log raw response, re-prompt with "Your previous tool call was malformed: <error>. Retry using a valid tool from the available list." |
| `hallucinated_tool` | Tool name not in current `active_tools` list | hard | Same as `malformed_tool_use` + explicitly list available tools |
| `empty_response` | assistant message with zero content blocks | hard | Retry once with system-prompt reminder "You must produce a tool call or a final response." |
| `content_filter` | `stop_reason: refusal` | hard | Do not retry. Surface the refusal text, ask user for clarification. |

## Backoff policy

All soft classes use **full-jitter exponential backoff**:

```python
delay = random.uniform(0, min(cap, base * 2 ** attempt))
# base=2s, cap=30s, max_attempts=3
```

Never retry hard classes. Never retry identical prompts more than `MAX_SQL_RETRIES=3` total in a turn (see `agent_engine.py`).

## Fallback model escalation

When primary (`claude-haiku-4-5-20251001`) fails with `overloaded` or `token_limit_output`:
1. Retry once on primary.
2. Escalate to fallback (`claude-sonnet-4-5-20250514`).
3. If fallback also fails: degrade to cached Tier-0/Tier-1 answer if `query_memory.find_similar(threshold=0.7)` returns a hit; otherwise surface plain-English apology.

Do not escalate on `invalid_request` or `content_filter` — they are prompt bugs, not capacity bugs.

## Circuit breaker interaction

`anthropic_provider.py` opens the per-API-key breaker after 5 failures within 60 s, cools down 30 s ±10% jitter. While open:
- Do not call the LLM.
- Check `query_memory` first; if a similar high-confidence answer exists, serve it with a `staleness_warning` flag in the summary.
- Otherwise queue the request for 1 retry after cooldown, then fail.

BYOK users have per-key breakers; do not let one user's failures affect another's.

## User-facing error language

Never surface raw provider error messages. Translate:

| Class | User message |
|---|---|
| `rate_limit` | "High traffic right now. Trying again in a few seconds…" |
| `token_limit_input` | "This conversation got too long for me to process in one go. I'll summarize what we've covered and start a fresh pass." |
| `overloaded` | "The AI service is under heavy load. Retrying with a backup model." |
| `circuit_breaker_open` | "Temporarily pausing to recover from a series of errors. Retrying in 30 seconds." |
| `invalid_request` / `malformed_tool_use` | "I hit a technical snag on my side. Let me try a different approach." |
| `content_filter` | "I'm not able to answer that as-phrased. Could you rephrase the question?" |

## Logging

Every error path emits one `audit_trail` record with: `ts, user_hash, error_class, model, prompt_hash, retry_count, final_outcome`. Never log the full prompt (may contain PII).

## Invariants

- Read-only DB invariant is untouched by error recovery — never re-enable writes to "retry differently."
- Never bypass `sql_validator` on retry.
- Never silently switch models without emitting a `model_fallback` SSE event.

---

## Examples

**Input:** Primary model returns HTTP 529 during SQL generation.
**Output:** Log `class=overloaded`, backoff 5 s with jitter, retry on primary; if fails again, escalate to Sonnet; emit SSE `model_fallback` event; final SQL goes through `sql_validator` as normal.

**Input:** User conversation has grown to 190K tokens, next turn returns 400 `prompt is too long`.
**Output:** Call `SessionMemory.compact()` to shrink to ~8K, retry the turn once. If it still fails, return user-facing message "Conversation got too long — starting fresh context. Your goal so far: <summary>."

**Input:** Assistant turn produces `tool_use` referencing `delete_user_table`, which is not in `active_tools`.
**Output:** Class = `hallucinated_tool`. Discard turn. Re-prompt with "`delete_user_table` is not an available tool. Available tools: [list]. Please retry using one of these."

**Input:** Circuit breaker opens for BYOK user `alice@corp.com`.
**Output:** Check `query_memory.find_similar(question, threshold=0.7)` — hit found, confidence 0.84. Serve the cached answer with `staleness_warning: "Cached from 14 minutes ago while the AI service recovers."` Never spill to `bob@corp.com`'s breaker state.
````

- [ ] **Step 3: Run validator**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "llm-error-recovery" -v
```

Expected: PASS (frontmatter present, tokens within budget, 4 examples, no forbidden substrings).

- [ ] **Step 4: Commit**

```bash
cd "QueryCopilot V1"
git add askdb-skills/core/llm-error-recovery.md
git commit -m "feat(skills): add llm-error-recovery skill (Plan 1 T1)"
```

---

## Task 2: Create `core/data-quality-trust-scoring.md`

**Files:**
- Create: `askdb-skills/core/data-quality-trust-scoring.md`

**Rationale (audit gap #3):** No current skill teaches the agent to assign a trust/confidence score to a result based on data health signals (NULL %, cardinality mismatch, outlier share, sample coverage). Explicit scoring framework closes a whole class of silent-wrong-answer bugs.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/core/data-quality-trust-scoring.md`:

````markdown
---
name: data-quality-trust-scoring
description: Rules for scoring result trust based on NULL rate, cardinality, outliers, coverage; when to flag or downgrade an answer
priority: 2
tokens_budget: 1300
applies_to: sql-generation, summary-generation, dashboard-build
---

# Data Quality & Trust Scoring — AskDB AgentEngine

## The trust score

Every result returned to the user carries an implicit trust score in `[0.0, 1.0]`. 1.0 = "as sure as the source data allows"; below 0.7 triggers a user-visible `⚠ data quality warning` in the NL summary.

## Signals that reduce trust

Deduct from 1.0 in this order; clip at 0.0.

| Signal | Threshold | Deduction |
|---|---|---|
| NULL rate in a measured column | > 10% | −0.10 |
| NULL rate in a measured column | > 30% | −0.25 |
| NULL rate in a filter/join column | > 1% | −0.15 |
| Row count < 30 (statistical thinness) | — | −0.10 |
| Row count < 5 | — | −0.40 |
| Outlier share (|z| > 4) | > 2% | −0.10 |
| Cardinality mismatch on join (fan-out detected post-exec, rows > 10× source) | — | −0.30 |
| Sample mode active (Turbo twin or `LIMIT X` applied implicitly) | — | −0.10 |
| Aggregation spans a known soft-delete (`deleted_at IS NOT NULL` rows not excluded) | — | −0.20 |
| Currency / unit mix detected (multiple currencies in SUM) | — | −0.30 |
| Timezone ambiguity (mix of UTC + local in filter) | — | −0.15 |

Multiple signals stack.

## User-visible warning thresholds

| Score | Surface |
|---|---|
| ≥ 0.85 | No warning |
| 0.70 – 0.84 | Footnote: "Note: <reason>" (single sentence) |
| 0.40 – 0.69 | Inline banner above chart: "⚠ Data quality reduced trust — <reasons>" |
| < 0.40 | **Refuse to chart.** Return only the table with a header explaining why. Ask user to confirm or adjust. |

## Detection patterns (agent-side)

### NULL-rate pre-check
Before generating SQL for an aggregation, inspect the target column's `null_ratio` in the cached schema profile (`.data/schema_cache/{conn_id}.json`). If > 30%, rewrite to wrap in `COALESCE` or add `WHERE col IS NOT NULL` and note it.

### Fan-out detection (post-exec)
After executing a join + aggregate, compare `result_rows` vs `MAX(source_table_rows)` from the schema profile. Ratio > 10 ⇒ fan-out. Re-run with pre-aggregation CTE.

### Cardinality check
Any join on a column where `distinct_ratio < 0.1` on either side AND neither is an FK is suspect. Warn in summary.

### Outlier flag
For SUM/AVG over > 100 rows, compute `STDDEV_POP` + flag rows with |z| > 4. Report count in summary if > 2%.

### Currency mix
If aggregating an `amount`-like column and the table has a sibling `currency` column, require `GROUP BY currency` or a single-currency `WHERE`.

## What NOT to trust-score

- Schema metadata queries (`SHOW TABLES`, `DESCRIBE`) — always 1.0.
- User-provided raw SQL (runs through validator but trust is user's responsibility — label `user_provided: true` in audit).
- Empty result on a filter query — not a quality problem, it's a valid answer; score 1.0.

## Interaction with PII masking

PII masking does not affect trust score. Masked rows are still counted — the numbers are truthful, only the labels are hidden.

## Cross-skill references

- `sql/null-handling.md` — rules for NULL-safe aggregation.
- `sql/join-intelligence.md` — fan-out detection algorithm.
- `visualization/insight-generation.md` — how warnings phrase in AI summaries.

---

## Examples

**Input:** User asks "What's our average order value?" on `orders` table where `amount` is 38% NULL.
**Output:** Trust score = 1.0 − 0.25 = 0.75. SQL uses `AVG(amount) FILTER (WHERE amount IS NOT NULL)`. Summary ends: "Note: 38% of orders have no amount recorded — this average covers the 62% with known values."

**Input:** Query joins `orders` (1M rows) to `order_items` (4M rows) and returns 14M rows when grouping by customer.
**Output:** Fan-out detected (14M > 10 × 4M false; but grouping collapsed to 8K customers which is fine). Rerun without fan-out check — actual issue was double-sum. Trust 0.70 = 1.0 − 0.30 (fan-out). Rewrite with pre-aggregation CTE: `SELECT c, SUM(amt) FROM (SELECT customer_id, SUM(item_amt) amt FROM order_items GROUP BY 1,2) ...`

**Input:** Query returns 3 rows (small store, early in quarter).
**Output:** Trust = 1.0 − 0.40 = 0.60. Banner shown: "⚠ Only 3 matching rows — trend is not statistically meaningful."

**Input:** SUM over `orders.amount` where orders contain USD, EUR, and GBP rows.
**Output:** Trust 0.70. Agent rewrites query with `GROUP BY currency` and returns three totals instead of a mixed sum. Summary names each currency total separately.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "data-quality-trust-scoring" -v
cd "../"
git add askdb-skills/core/data-quality-trust-scoring.md
git commit -m "feat(skills): add data-quality-trust-scoring skill (Plan 1 T2)"
```

Expected test result: PASS.

---

## Task 3: Create `core/caching-breakpoint-policy.md`

**Files:**
- Create: `askdb-skills/core/caching-breakpoint-policy.md`

**Rationale (research finding, Anthropic 2026 prompt caching):** Four cache breakpoints, ordered stable-to-volatile, cut repeat-session cost ~90% and cut p50 latency measurably. No existing skill documents the policy — critical before we hook the skill library into `agent_engine`.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/core/caching-breakpoint-policy.md`:

````markdown
---
name: caching-breakpoint-policy
description: Four-breakpoint Anthropic prompt caching layout and TTL policy for skill + schema + conversation prompts
priority: 1
tokens_budget: 1200
applies_to: prompt-construction, agent-runtime
---

# Caching Breakpoint Policy — AskDB AgentEngine

## Why this exists

Anthropic prompt caching (2026): 5-min default TTL, 1-hour extended TTL, write cost 1.25× / 2× input, read cost 0.1× input. Minimum cacheable segment: 1024 tokens (Sonnet/Opus), 2048 tokens (Haiku). Up to **4 breakpoints** per request. **Order matters** — any change invalidates everything downstream.

## The four breakpoints (order is load-bearing)

| # | Segment | Typical size | TTL | Why here |
|---|---|---|---|---|
| 1 | Anthropic-identity header + `security-core` invariants + Priority-1 core skills (`security-rules`, `agent-identity-response-format`, `confirmation-thresholds`) | 5–7K | **1 hour** | Changes at deploy time only |
| 2 | Per-connection stable context: schema DDL block, FK graph, dialect skill, domain skill, semantic layer | 6–12K | **1 hour** | Changes when user reconnects or schema rotates |
| 3 | Dynamic retrieved skills (Priority-2/3) + session memory compacted summary | 4–8K | **5 min** | Changes per turn cluster |
| 4 | Full conversation history + latest user turn | variable | no cache | Changes every turn |

## Implementation contract

In `agent_engine._build_system_prompt` (to be modified in the retrieval-infra plan), each breakpoint gets a `cache_control: {"type": "ephemeral", "ttl": "1h" | "5m"}` marker:

```python
messages = [
    {"role": "system", "content": [
        {"type": "text", "text": IDENTITY + CORE_SKILLS, "cache_control": {"type": "ephemeral", "ttl": "1h"}},
        {"type": "text", "text": SCHEMA + DIALECT + DOMAIN,  "cache_control": {"type": "ephemeral", "ttl": "1h"}},
        {"type": "text", "text": RETRIEVED_SKILLS + MEMORY, "cache_control": {"type": "ephemeral", "ttl": "5m"}},
    ]},
    *conversation_history,
    {"role": "user", "content": latest_turn},
]
```

The fourth breakpoint is implicit — the conversation itself is not cached.

## Break-even rules

- **1-hour TTL:** break-even at **2 cache hits**. Use only when reuse is near-certain within the hour (active session).
- **5-minute TTL:** break-even at **1 cache hit**. Default choice for dynamic content.
- **Never mark segments < 1024 tokens for Haiku (< 2048).** Pad with FK graph or sample rows if sparse; otherwise drop the breakpoint.

## Invalidation traps

- **Any change to Breakpoint 1 invalidates 2, 3, 4.** Treat P1 core skills as frozen between deploys — ship updates via feature flag, not in-session.
- **Rotating the fallback model ID invalidates Breakpoint 1** (model is part of request signature). Do not hot-swap models.
- **User-specific variable interpolation** (name, timestamp, plan tier) must live in Breakpoint 3 or later — otherwise per-user cache fragmentation.

## PII hygiene

Do not cache PII. Schema sample rows in Breakpoint 2 must go through `mask_dataframe()` before being inserted into the prompt. The `.chroma/` collection already masks; we are guarding against raw DDL leakage in rare "column comment" fields.

## Monitoring

Emit `cache_read_input_tokens` and `cache_creation_input_tokens` per turn to `audit_trail`. Healthy read-ratio on an active session (> 3 turns): **≥ 0.60**. Below that, investigate — usually a Breakpoint 1 invalidation.

## Interaction with BYOK

As of Feb 2026, Anthropic isolates caches per API key / workspace. BYOK users each pay their own write cost; there is no shared cache across tenants. Plan token budgets per-user accordingly.

---

## Examples

**Input:** New user session, connects to a fresh DB.
**Output:** Turn 1: writes all three cached breakpoints (BP1 + BP2 + BP3). Total write cost = ~1.25× input tokens. Turn 2 onward: BP1+BP2 hit (0.1×), BP3 partial hit.

**Input:** Turn 5 of session, user asks a dashboard question — agent retrieves 3 new Priority-3 viz skills.
**Output:** BP1 and BP2 cache-hit (1-hour TTL still alive). BP3 invalidates + re-writes because retrieved skill set changed. BP4 (conversation) grows as normal.

**Input:** Admin deploys a new version of `security-rules.md`.
**Output:** Next request: BP1 rewrites (new content in cacheable segment). All downstream BPs also rewrite on first turn. Cache warms again from turn 2.

**Input:** User waits 65 minutes between turns.
**Output:** BP1 and BP2 1-hour TTL expired. Full rewrite. Expected.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "caching-breakpoint-policy" -v
cd ..
git add askdb-skills/core/caching-breakpoint-policy.md
git commit -m "feat(skills): add caching-breakpoint-policy skill (Plan 1 T3)"
```

---

## Task 4: Create `agent/streaming-progressive-results.md`

**Files:**
- Create: `askdb-skills/agent/streaming-progressive-results.md`

**Rationale (audit gap #2 + existing SSE infrastructure):** AskDB already streams SSE events (agent_routes.py), but no skill file teaches the agent when to stream partial results, when to offer sampled previews, when to cancel, or how to phrase progressive status.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/agent/streaming-progressive-results.md`:

````markdown
---
name: streaming-progressive-results
description: SSE streaming cadence, sampled-preview decisions, cancellation and progressive rendering rules for long-running queries and builds
priority: 3
tokens_budget: 1100
applies_to: multi-step-agent, dashboard-build, large-result-handling
---

# Streaming & Progressive Results — AskDB AgentEngine

## When to stream progressively

Every tool phase emits an SSE event via `agent_routes.py` — but whether the **user sees intermediate progress** depends on duration and action class.

| Class | Stream intermediate? | Cadence |
|---|---|---|
| Schema inspect | No (usually < 2 s) | Final result only |
| SQL generation | Yes — stream thinking tokens | Token-by-token |
| SQL execution < 5 s expected | No | Final table + chart |
| SQL execution 5–30 s expected | Yes | Progress updates every 2 s ("Scanning 3.2M rows…") |
| SQL execution > 30 s expected | Yes + offer cancel | Progress + cancel button |
| Multi-tile dashboard build | Yes | One SSE event per tile completion |
| ML training | Yes | Per-stage events (ingest → features → train → evaluate) |

## Progress phrasing

Short, concrete, truthful. Never fabricate progress.

- ✅ "Scanning orders table (3.2M rows)…"
- ✅ "Tile 2 of 5 complete: Top Customers by Revenue"
- ❌ "Working on your request…" (vague)
- ❌ "Almost done…" (lying if you don't know)

## Sampled-preview decisions

When expected result rows > `MAX_ROWS` (default 1000, ceiling 50000), do **not** stream every row. Instead:

1. Run a quick `SELECT COUNT(*)` pre-query (< 200 ms typical) to estimate size.
2. If count > `MAX_ROWS`:
   - Generate full SQL.
   - Run with `LIMIT MAX_ROWS`.
   - Return table with header: "Showing first 1,000 of ~45,000 rows — download full CSV?" (link to `/api/queries/export`).
3. For charts, stream aggregated version only (e.g., `GROUP BY` before charting); never render > 5,000 marks in Vega-Lite (see `visualization/vizql-capabilities-progressive-disclosure.md`).

## Cancellation

Every agent run is interruptible via `POST /api/v1/agent/cancel` (to be implemented in retrieval-infra plan). The agent MUST:
- Check `self._cancel_requested` before each tool call.
- On cancellation: abort the current tool (SQL execution via driver-level cancel if available), emit `{"type":"cancelled","reason":"user"}`, persist session state via `agent_session_store.save()`, and exit cleanly.
- Do **not** roll back already-completed tile creations (user asked to stop, not undo). Offer undo as a separate follow-up message.

## Partial result handling

If an SSE connection drops mid-stream:
- Session state must already be persisted in `agent_sessions.db` (WAL mode autosaves).
- `/api/v1/agent/sessions/{chat_id}` returns the full collected steps list on reconnect.
- Frontend reconstructs the UI from collected steps — never assumes streaming continuity.

## Progressive dashboard build

For multi-tile builds, follow the sequence in `agent/dashboard-build-protocol.md`:
1. Emit plan checklist (5 tiles).
2. Build tiles in parallel where data-independent (see `agent/batch-query-optimization.md`), sequential where dependent.
3. Per completed tile: emit `{"type":"tile_created","id":"...","insight":"..."}` + push to UI.
4. Final SSE event: `{"type":"complete","dashboard_id":"..."}`

If a tile errors: emit `{"type":"tile_error","index":i,"message":"..."}` and continue to next tile. Never fail the whole dashboard because one tile broke.

## Timeouts

- Per-tool soft timeout: 60 s (schema), 30 s (SQL gen), 300 s (DB exec), 30 s (summarize).
- Per-segment cap: 600 s.
- Session hard cap: 1800 s.
- On timeout: treat as cancellation + emit `{"type":"timeout","phase":"..."}`. Do NOT retry automatically — ask user.

See `backend/config.py` (`AGENT_SESSION_HARD_CAP` etc.) for authoritative values.

## What never to stream

- PII in progress messages ("Looking up user alice@corp.com…" → "Looking up user…").
- Raw SQL until it's passed validation.
- Prompt internals (never "I'm thinking about using <tool>…" verbatim; translate to action).

---

## Examples

**Input:** Agent starts SQL execution estimated 12 s.
**Output:** Emits every 2 s: `{"type":"progress","message":"Scanning orders table (3.2M rows)..."}`. On completion: `{"type":"result","rows":3247,"elapsed_ms":11420}`.

**Input:** User clicks cancel at t=4 s of a 12 s query.
**Output:** Agent calls driver cancel (`cursor.cancel()` for PG; `bq.cancel_job()` for BigQuery), emits `{"type":"cancelled","reason":"user"}`, saves session, returns.

**Input:** Query returns 45,000 rows.
**Output:** COUNT(*) pre-query returns 45823. Full SQL executes with `LIMIT 1000`. Table shows first 1000. Footer: "Showing first 1,000 of ~45,000 rows. [Download full CSV]".

**Input:** Dashboard build: 5 tiles, tile 3 errors.
**Output:** Tiles 1, 2 complete SSE; tile 3 emits `tile_error` with message; tiles 4, 5 continue and complete. Final SSE: `{"type":"complete","tiles_created":4,"tiles_failed":1}`.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "streaming-progressive-results" -v
cd ..
git add askdb-skills/agent/streaming-progressive-results.md
git commit -m "feat(skills): add streaming-progressive-results skill (Plan 1 T4)"
```

---

## Task 5: Create `agent/batch-query-optimization.md`

**Files:**
- Create: `askdb-skills/agent/batch-query-optimization.md`

**Rationale (audit gap #7):** Dashboard builds with 10+ tiles currently run queries sequentially. No skill teaches when to parallelize, how to respect connection pool limits, or how to build a dependency DAG.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/agent/batch-query-optimization.md`:

````markdown
---
name: batch-query-optimization
description: When to run queries in parallel vs serial, connection pool limits, dependency DAGs for multi-tile dashboard builds and multi-step analysis
priority: 3
tokens_budget: 900
applies_to: dashboard-build, multi-step-agent
---

# Batch Query Optimization — AskDB AgentEngine

## Serial vs parallel decision

Default to **serial**. Go parallel only when:
1. Queries are independent (no shared CTE, no output-of-A-feeds-B).
2. Connection pool has capacity (see limits below).
3. User-perceived latency is actually the bottleneck (e.g., dashboard build with > 3 tiles).

## Connection pool limits

Concrete from `config-defaults.md`:
- `THREAD_POOL_MAX_WORKERS` = 32 (bounded 4–256).
- Per-user active agent sessions = 2.
- Per-user connections = 10.

**Per-dashboard-build cap: 4 parallel queries.** Higher risks starving other users' sessions on the shared pool. Adjustable via feature flag `AGENT_DASHBOARD_PARALLELISM` (default 4).

## Dependency DAG

For each batch, build a DAG:
- Nodes = queries / tiles.
- Edges = "B requires A's result" (e.g., tile 2 filters by customer IDs from tile 1).

Execute **topological layers in parallel**; serialize across layers.

Algorithm (pseudo):
```
layers = toposort(dag)
for layer in layers:
    asyncio.gather(*[run_query(n) for n in layer], max_concurrency=4)
```

Most dashboards collapse to a single layer (all independent KPIs). Funnel dashboards often have 2 layers (stage-1 query feeds stage-2 filter).

## Backpressure

If pool at capacity:
- Queue new queries (in-memory `asyncio.Queue` scoped to session).
- Surface SSE `{"type":"queued","position":n}` to user.
- On timeout waiting for slot (> 10 s): fall back to serial for this batch.

## Per-DB-type tuning

| DB | Parallelism sweet spot | Notes |
|---|---|---|
| PostgreSQL | 4 per session | Connection-expensive; reuse from pool |
| BigQuery | 6 per session | Query-slot billing — cheap, go wider |
| Snowflake | 4 per session | Warehouse concurrency matters more than connection count |
| DuckDB (Turbo Twin) | 2 per session | Single-process — parallel mostly thread-level |
| MySQL / MSSQL | 3 per session | Pool more fragile under load |

## When to NOT batch

- If the first query errors, do not fire the rest — the DB may be degraded.
- If user cancelled.
- If the result of a pending query might change the plan (e.g., "if count > 100, build separate cohort tiles").
- If the queries touch a write-throttled warehouse (rare in read-only mode, but BigQuery slot exhaustion counts).

## Budget accounting

Each parallel query counts against the agent's tool-call budget individually — parallelism saves wall clock, not calls. A 5-tile dashboard still costs 5 `run_sql` calls in the budget.

## Interaction with Turbo Twin (Tier 2a)

If multiple queries in a batch could route to the DuckDB twin, prefer twin for 1–2 of them and live for the rest — twin is single-process and saturates fast. Route the simplest aggregates to twin; complex multi-join to live.

---

## Examples

**Input:** Dashboard build with 6 independent KPI tiles (revenue, customers, orders, AOV, refund rate, active users).
**Output:** DAG = single layer, 6 nodes. `asyncio.gather` with `max_concurrency=4`. First 4 fire; next 2 queue; first to complete triggers next queued. Total wall: ~2× slowest query instead of sum.

**Input:** Funnel dashboard: tile 1 "leads count", tile 2 "conversion rate of those leads", tile 3 "LTV of converted".
**Output:** DAG = 3 layers (2 depends on 1; 3 depends on 2). Serial execution — no parallelism gain.

**Input:** User has 3 agent sessions + 10 connections already. Starts a 5-tile dashboard build.
**Output:** Per-user session cap = 2. Reject the 3rd session with 429. In-session, tile builds proceed with `max_concurrency=4`.

**Input:** BigQuery dashboard with 10 tiles.
**Output:** `max_concurrency` bumped to 6 (BQ sweet spot). Still only 4 `asyncio` workers because global cap is 4 — per-DB tuning is aspirational, global cap wins.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "batch-query-optimization" -v
cd ..
git add askdb-skills/agent/batch-query-optimization.md
git commit -m "feat(skills): add batch-query-optimization skill (Plan 1 T5)"
```

---

## Task 6: Create `agent/skill-library-meta.md`

**Files:**
- Create: `askdb-skills/agent/skill-library-meta.md`

**Rationale:** Meta-skill teaching the agent about its own skill library — how retrieval works, what to do if retrieval returns nothing, how not to hallucinate skills. Directly addresses Context Rot concern from research.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/agent/skill-library-meta.md`:

````markdown
---
name: skill-library-meta
description: How the AskDB skill library itself works — retrieval rules, budget caps, self-consistency, never-hallucinate-a-skill guardrails
priority: 1
tokens_budget: 1400
applies_to: always-on
---

# Skill Library — Meta Rules — AskDB AgentEngine

## What the skill library is

A library of curated markdown files under `askdb-skills/`, indexed in ChromaDB collection `skills_v1`. Each file teaches the agent one area — SQL correctness, chart selection, dialect syntax, domain terminology, error recovery, etc. Skills are not code; they are retrieved plaintext that augments the system prompt.

## How retrieval runs

Every user turn:
1. **Always-on (Priority 1)** skills are injected unconditionally — they live in cache breakpoint #1. Total budget 5–7K tokens.
2. **Deterministic routing** picks:
   - 1 dialect skill from `askdb-skills/dialects/` based on `connection.db_type`.
   - 1 domain skill from `askdb-skills/domain/` based on `behavior_engine.detect_domain(schema_info)`.
3. **Dynamic retrieval** (Priority 2/3): a short regex+embedding pass over `skills_v1` returns top-k (default 3) skill files relevant to the current turn. Deduplicated across the recent window — a skill already in context is not re-injected.

## Hard caps

- Max total resident skill tokens per turn: **20K**. If retrieval would exceed, drop lowest-scored Priority-3 skills.
- Max skill files per turn (including always-on + deterministic): **9**.
- Context Rot risk: when resident skill tokens exceed 20K the agent's answer quality *drops*, not rises. Trimming is mandatory, not optional.

## What the agent never does

- **Never reference a skill name that's not in the injected context.** If the context says "see `sql/window-functions.md`" but that file wasn't retrieved this turn, do not pretend to have read it. Ask the user or reason from first principles.
- **Never modify a skill file in-flight.** Skill edits go through the `learn-from-corrections.md` queue; never write to `askdb-skills/` during a user turn.
- **Never quote a rule verbatim** unless the user asks for the source — apply the rule, summarize briefly.
- **Never fall back to "general knowledge"** on a topic covered by a retrieved skill. If the skill gives a rule, the rule wins.

## Conflict resolution

Two skills disagree (rare):
1. Priority 1 beats Priority 2 beats Priority 3.
2. Within same priority, the more specific skill wins (`dialect-bigquery` beats `sql-generation-generic`).
3. Security rules (`core/security-rules.md`) always win. No exceptions.

## Self-consistency for hard SQL

When generating SQL for a query flagged as hard (join depth ≥ 3 OR ambiguity score ≥ 0.6 from the classifier — see `sql/ambiguity-resolution.md`):
1. Generate 3 candidates at temperature 0.3, 0.5, 0.7.
2. Pass each through `sql_validator`.
3. Execute each on Turbo Twin (sampled) if available.
4. Vote: result-sets agree ⇒ return the median candidate. Disagree ⇒ surface both with warning.
5. If 1 of 3 fails validation, pick among the two that passed (prefer lower temp).
6. If 2 of 3 fail, fall back to fresh Sonnet call with error feedback.

## Cost of retrieval

Each retrieval call: ~30–50 ms (ChromaDB namespace lookup) + ~10 ms embedding. Deterministic routing: 0 ms (dict lookup). Total per-turn retrieval latency: < 60 ms p95. If any single retrieval exceeds 200 ms, log slow-query alert.

## Interaction with `behavior_engine`

`detect_domain()` is authoritative for domain routing. If it returns `"general"`, no domain skill is injected — generic SQL rules apply. `get_analyst_tone()` runs independently and produces the persona paragraph in the system prompt (existing behavior, unchanged).

## Audit

Every turn writes to `.data/audit/skill_retrieval.jsonl`:
```json
{"ts": "...", "session_id": "...", "question_hash": "...", "retrieved": ["core/...", "sql/..."], "latency_ms": 42, "total_tokens": 17320}
```
Rotated at 50 MB.

## Failure modes

- **Retrieval returns zero Priority-3 hits:** Proceed with always-on + deterministic only. Log it (`retrieved_dynamic: 0`). If this happens > 20% of turns in a session, the embeddings are underperforming — investigate.
- **ChromaDB collection missing:** Fall back to the file-system skill library (in-memory dict of all files, loaded at startup). Serve deterministic + always-on; skip dynamic.
- **Budget exceeded:** Drop Priority-3 lowest-scored first, then Priority-2 lowest, never drop Priority-1.

---

## Examples

**Input:** User asks "show me sales trend last quarter".
**Output:** Always-on: 3 core skills. Deterministic: `dialect-postgres` (based on connection), `domain-sales`. Dynamic: `sql/time-intelligence`, `visualization/chart-selection`, `sql/aggregation-rules`. Total: 8 skills, ~18K tokens. Under 20K cap.

**Input:** User asks a hard 5-table join question flagged by ambiguity classifier at 0.7.
**Output:** Self-consistency triggers. Three SQL candidates generated. Two pass validator + agree on result. Median returned. If the third's different result surfaces a legit ambiguity, user gets both options.

**Input:** Retrieval service has a Chroma outage.
**Output:** Fall back to file-system dict. Always-on + deterministic skills still serve. Dynamic retrieval skipped for this session. SSE event `skill_retrieval_degraded` logged but user never sees it.

**Input:** Candidate SQL references `sql/window-functions.md` rules but that skill wasn't retrieved.
**Output:** Agent does NOT cite the skill. Applies reasoning from always-on rules only. If the resulting SQL fails validation on a window-specific issue, `self-repair-error-taxonomy` triggers retrieval of `window-functions` on retry.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "skill-library-meta" -v
cd ..
git add askdb-skills/agent/skill-library-meta.md
git commit -m "feat(skills): add skill-library-meta skill (Plan 1 T6)"
```

---

## Task 7: Create `sql/schema-linking-evidence.md`

**Files:**
- Create: `askdb-skills/sql/schema-linking-evidence.md`

**Rationale (research finding — evidence generation is the #1 BIRD benchmark lever):** No current file covers the evidence-generation pattern (pre-computed join keys, enum values, synonyms) that turns generic SQL generation into schema-aware SQL generation. This is a Priority-2 skill that should retrieve on every SQL-generation turn.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/sql/schema-linking-evidence.md`:

````markdown
---
name: schema-linking-evidence
description: Schema linking rules + evidence-generation patterns that precede SQL drafting — FK graph, enum values, synonyms, cardinality tags
priority: 2
tokens_budget: 1600
applies_to: sql-generation
---

# Schema Linking & Evidence Generation — AskDB AgentEngine

## Why schema linking first

Top BIRD/Spider systems (2025–2026) run a dedicated schema-linking pass **before** drafting SQL. The schema linker returns a short list of candidate tables + columns + join keys; SQL generation restricts itself to that slate. This cuts hallucinated column names to near-zero.

## The evidence packet

Every SQL-generation turn receives an **evidence packet** assembled from cached schema profile + the question:

```
evidence = {
  "candidate_tables": [...],          # top 3 tables by embedding + FK proximity
  "candidate_columns": {tbl: [col]},  # 3–5 cols per candidate
  "join_keys": [(a.id, b.a_id), ...], # from FK graph
  "enum_values": {col: [v1, v2, ...]},# distinct values for low-cardinality cols
  "synonyms": {user_term: col_name},  # from schema_profile alias map
  "cardinality_tags": {col: "1:1" | "1:N" | "N:M"},
  "sample_rows": [{col: v, ...}],     # 3 masked rows per candidate table
}
```

Inject this packet between schema DDL and the final user question in the prompt. It is the single biggest lever on NL-to-SQL accuracy.

## Schema linker algorithm

1. Embed user question (existing ChromaDB pipeline).
2. Top-10 candidate columns by cosine over `schema_<conn_id>` collection.
3. Group by table → top-5 tables.
4. Expand each table: add all FK-connected neighbors (1-hop) as candidates.
5. Rank tables by `(col_match_score × 2 + fk_proximity + name_match)`.
6. Keep top-3 tables, top-5 columns per table.

## FK graph injection

Represent the FK graph as a compact edge list in the prompt, not a big diagram:

```
FK edges:
  orders.customer_id  →  customers.id       (N:1)
  order_items.order_id →  orders.id         (N:1)
  order_items.product_id → products.id      (N:1)
  customers.region_id →  regions.id         (N:1)
```

One line per edge. LLMs parse this faster than DDL.

## Cardinality tags

Every FK gets a tag: `1:1` | `1:N` | `N:M`. Tags come from schema profiling (`distinct_ratio` on both sides). **Never let the LLM draft a SUM/AVG across an N:M join without an explicit pre-aggregation directive** — see `sql/join-intelligence.md`. Bridge tables (two FKs, no measures) are auto-detected and tagged `bridge`.

## Enum hinting

Low-cardinality columns (distinct ≤ 20, e.g. `status`, `region`, `tier`) get their enum set pre-injected:

```
enum_hints:
  status: ["active", "churned", "trial", "paused"]
  region: ["NA", "EMEA", "APAC", "LATAM"]
```

This eliminates `WHERE status = 'Active'` (correct: `'active'`) and `WHERE region = 'North America'` (correct: `'NA'`) hallucinations.

## Synonym map

Business terms ≠ column names. Maintain a per-connection map:

```
synonym_hints:
  "revenue"  ->  orders.amount, invoices.total
  "customer" ->  customers, accounts
  "churn"    ->  customers.is_churned, subscriptions.cancelled_at IS NOT NULL
```

Generated during schema profiling from column-comment metadata + regex rules (`amount|total|revenue` → revenue). User can override via `/api/v1/schema/synonyms` (to be implemented).

## Sample rows

Inject 3 masked rows per candidate table. Rows pass through `mask_dataframe()`. Purpose: teach the LLM typical value formats (is `date` a string or timestamp? is `amount` in cents?).

Limit to 3 rows × 3 tables = 9 rows max to stay within budget.

## Cost awareness

- Schema linking pass: ~40 ms (embedding + kNN in Chroma).
- Evidence-packet assembly: ~10 ms (dict composition).
- Total pre-SQL overhead: < 60 ms p95.

If schema profile is stale (> `SCHEMA_CACHE_MAX_AGE_MINUTES = 60`), background refresh is triggered but the stale profile is still used for this turn.

## When to skip evidence generation

- Pure metadata queries (`SHOW TABLES`, `DESCRIBE`).
- User-provided raw SQL.
- Queries routed to Tier 1 Memory (already has a cached answer).

## Interaction with `sql/ambiguity-resolution.md`

If the evidence packet has **two candidate columns with equal score** for the same user term (e.g. "revenue" maps to both `orders.amount` and `invoices.total`):
- If ambiguity score > 0.6, `ask_user` before generating SQL.
- Otherwise, pick the more-recently-populated one and disclose the choice in the summary.

## Anti-patterns

- Do NOT inject the full 500-column schema "just in case" — this causes Context Rot and tanks accuracy.
- Do NOT skip evidence on "simple" queries — the overhead is uniform and cheap.
- Do NOT HyDE (hypothetical document embeddings) for schema retrieval — it hallucinates column names.

---

## Examples

**Input:** User: "total revenue by region last quarter".
**Output evidence:**
```
candidate_tables: [orders, customers, regions]
candidate_columns: {
  orders: [amount, created_at, customer_id],
  customers: [id, region_id],
  regions: [id, name]
}
join_keys: [(orders.customer_id, customers.id), (customers.region_id, regions.id)]
enum_hints: {region.name: ["NA", "EMEA", "APAC", "LATAM"]}
cardinality_tags: {orders.customer_id: "N:1", customers.region_id: "N:1"}
synonym_hints: {revenue: orders.amount}
```
SQL draft uses region names in lowercase (from enum hint), joins through customer, groups by region.

**Input:** User: "customers who bought product X".
**Output evidence:** `candidate_tables: [customers, orders, order_items, products]`, join keys including the bridge `order_items`, cardinality tag on `order_items.product_id` = `N:1`. SQL uses `WHERE EXISTS` over order_items (not INNER JOIN) to avoid duplicates.

**Input:** Schema has two "revenue" candidates — `orders.amount` (40% populated) and `invoices.total` (95% populated).
**Output:** `invoices.total` wins evidence rank due to populated ratio. Summary notes: "Using invoices.total as the revenue source — orders.amount was 60% null."

**Input:** Stale schema profile (> 60 min old) + user query arrives.
**Output:** Current turn uses stale profile (acknowledged in log); background thread triggers `profile_connection()`; next turn uses fresh.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "schema-linking-evidence" -v
cd ..
git add askdb-skills/sql/schema-linking-evidence.md
git commit -m "feat(skills): add schema-linking-evidence skill (Plan 1 T7)"
```

---

## Task 8: Create `sql/self-repair-error-taxonomy.md`

**Files:**
- Create: `askdb-skills/sql/self-repair-error-taxonomy.md`

**Rationale (research finding — guided error taxonomy):** SQL generation fails in predictable ways. An error-class → repair-template playbook beats generic "retry with error context."

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/sql/self-repair-error-taxonomy.md`:

````markdown
---
name: self-repair-error-taxonomy
description: SQL error classification + targeted repair templates — fan-out, missing CAST, dialect mismatch, missing GROUP BY, null-unsafe aggregation, ambiguous column
priority: 2
tokens_budget: 1500
applies_to: sql-generation, error-recovery
---

# Self-Repair Error Taxonomy — AskDB AgentEngine

## When this loads

On any `run_sql` failure. Also retrieved proactively during the generation turn for complex queries (join depth ≥ 3) to pre-empt the most common classes.

## Error classes

Classify the failure into exactly one class before attempting repair. Classification drives repair template.

| Class | Detection signal | Example error text |
|---|---|---|
| `fan_out` | Post-exec row count > 10× source; aggregate shows inflated number | (runs; result wrong, detected by `data-quality-trust-scoring`) |
| `missing_cast` | Error contains `invalid input syntax for type`, `cannot cast` | "operator does not exist: text = integer" |
| `dialect_mismatch` | Error references a function/keyword not in active dialect | "function NVL does not exist" on PG |
| `missing_group_by` | Error contains `must appear in GROUP BY`, `not in aggregate` | "column 'c.name' must appear in GROUP BY" |
| `ambiguous_column` | Error contains `ambiguous reference` | "column reference 'id' is ambiguous" |
| `null_unsafe_aggregation` | Result contains `NaN` or division-by-zero error | "division by zero" |
| `nonexistent_column` | Error: `column does not exist` | "column 'rev' does not exist" |
| `nonexistent_table` | Error: `relation does not exist` | "relation 'Orders' does not exist" |
| `permission_denied` | Error: `permission denied`, `access denied` | "permission denied for table users" |
| `timeout` | Driver raises timeout before result | "canceling statement due to statement timeout" |
| `syntax_error` | `syntax error at or near`, sqlglot parse fail | "syntax error at or near ')'" |
| `unknown` | None of the above | anything |

## Repair templates

### `fan_out`
Rewrite with pre-aggregation CTE. If the draft was:
```sql
SELECT c.name, SUM(oi.qty)
FROM customers c JOIN orders o ON c.id=o.customer_id JOIN order_items oi ON o.id=oi.order_id
GROUP BY c.name
```
Repair to:
```sql
WITH order_totals AS (
  SELECT o.customer_id, SUM(oi.qty) AS total_qty
  FROM orders o JOIN order_items oi ON o.id=oi.order_id
  GROUP BY o.customer_id
)
SELECT c.name, ot.total_qty
FROM customers c JOIN order_totals ot ON c.id=ot.customer_id
```

### `missing_cast`
Wrap the mismatched operand in `CAST(x AS target_type)`. For PG-specific `::`, convert: `col::text` on PG, `CAST(col AS VARCHAR)` portable.

### `dialect_mismatch`
Look up the function in the active dialect skill (`dialects/dialect-<db>.md`). Common swaps:
- `NVL(x, y)` → `COALESCE(x, y)`
- `SUBSTR(x, start, len)` → `SUBSTRING(x FROM start FOR len)` on PG
- `NOW()` → `CURRENT_TIMESTAMP` (BigQuery doesn't support bare NOW())
- `DATE_SUB(d, INTERVAL 1 DAY)` → `d - INTERVAL '1 day'` on PG

### `missing_group_by`
Add every non-aggregated selected column to GROUP BY. On MySQL (ONLY_FULL_GROUP_BY=OFF) also add them defensively — code should be portable.

### `ambiguous_column`
Qualify the column with its table alias: `id` → `c.id` or `o.id`. Re-examine the draft for which side was intended.

### `null_unsafe_aggregation`
Wrap divisor in `NULLIF(denom, 0)`. Wrap numerator in `COALESCE(num, 0)` if SUM-based. Example:
```sql
SUM(revenue) / NULLIF(COUNT(*), 0)
```

### `nonexistent_column`
Consult the evidence packet's `candidate_columns`. Fuzzy-match the attempted name (Levenshtein ≤ 2) against actual columns. If unique match, swap. If no match, re-retrieve schema for this table and retry.

### `nonexistent_table`
Likely case sensitivity. For PG, wrap in double-quotes: `"Orders"`. For Snowflake unquoted identifier, ensure uppercase. Otherwise fuzzy-match and retry.

### `permission_denied`
Do NOT retry with escalated privileges. Surface to user: "I don't have access to `<table>`. Please ask your admin to grant SELECT."

### `timeout`
- First timeout: retry once with stricter LIMIT (halve it) + warn.
- Second timeout: offer sampled execution on Turbo Twin if available.
- Third timeout: give up, ask user to refine.

### `syntax_error`
Parse with sqlglot transpiler → emit canonical SQL in the current dialect. If transpiler also fails, surface error with line number to user and ask for clarification.

## Retry budget

`MAX_SQL_RETRIES = 3` (from `agent_engine.py`). After 3 failed repairs on the same turn, escalate to Sonnet fallback once. After that: surface error to user.

## Never-retry conditions

- `permission_denied`
- `content_filter`
- User cancelled
- Same error class + same repair already attempted (would loop)

## Telemetry

Every repair logs to `.data/audit/sql_repair.jsonl`:
```json
{"ts":"...","session_id":"...","question_hash":"...","error_class":"fan_out","repair_template":"pre_agg_cte","attempts":1,"final_outcome":"success"}
```
Aggregate by `error_class` weekly to identify which skills need strengthening.

## Self-consistency tie-in

If `skill-library-meta.md` triggered self-consistency (3 candidates), and 2 fail with `fan_out` while 1 passes: return the passing one and log that the fan-out skill needs reinforcement.

---

## Examples

**Input:** Draft SQL: `SELECT c.name, SUM(oi.quantity) FROM customers c JOIN orders o USING(customer_id) JOIN order_items oi USING(order_id) GROUP BY c.name`. Post-exec row-count check shows fan-out (4× expected).
**Output:** Class = `fan_out`. Rewrite with pre-aggregation CTE. Validated. Re-executed. Correct total returned. Log class = `fan_out`, repair = `pre_agg_cte`, outcome = `success`.

**Input:** Error: `function NVL does not exist` on PostgreSQL connection.
**Output:** Class = `dialect_mismatch`. Lookup: `NVL` → `COALESCE`. Swap globally in draft. Retry. Success.

**Input:** Error: `division by zero` in `conversion_rate = conversions / visits`.
**Output:** Class = `null_unsafe_aggregation`. Wrap denominator: `NULLIF(visits, 0)`. Retry. NULLs returned for zero-visit days — correct behavior. Summary notes: "Days with zero visits show null conversion rate."

**Input:** Error: `relation "Orders" does not exist` on PostgreSQL where table is `orders` (lowercase).
**Output:** Class = `nonexistent_table`. Schema cache shows `orders` exists. Case mismatch. Repair: lowercase + unquoted `orders`. Retry. Success.

**Input:** Timeout after 300 s on a 12-table join on BigQuery.
**Output:** Class = `timeout`. Halve LIMIT → 500, retry. Completes in 85 s with partial result. Summary notes sampled result.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "self-repair-error-taxonomy" -v
cd ..
git add askdb-skills/sql/self-repair-error-taxonomy.md
git commit -m "feat(skills): add self-repair-error-taxonomy skill (Plan 1 T8)"
```

---

## Task 9: Create `visualization/accessibility-wcag.md`

**Files:**
- Create: `askdb-skills/visualization/accessibility-wcag.md`

**Rationale (audit gap #5):** Color-system skill mentions colorblind safety only. No existing skill covers WCAG 2.2 contrast, alt-text, screen reader labels, keyboard nav for interactive charts — all of which the agent's generated Vega-Lite specs should enforce.

- [ ] **Step 1: Create the skill file**

Write `askdb-skills/visualization/accessibility-wcag.md`:

````markdown
---
name: accessibility-wcag
description: WCAG 2.2 AA accessibility rules for AI-generated charts — contrast, alt-text, screen reader labels, keyboard nav, reduced-motion
priority: 3
tokens_budget: 1300
applies_to: chart-selection, dashboard-build
---

# Accessibility — WCAG 2.2 AA — AskDB AgentEngine

## Why accessibility is a hard requirement

AskDB serves enterprise customers (some with government + finance clients) where WCAG 2.2 AA is contractually required. Generated charts must pass automated audits (axe, WAVE) at least at AA; AAA where cheap.

## Contrast thresholds

| Element | Minimum contrast ratio (WCAG 2.2 AA) |
|---|---|
| Regular text (< 18 pt or < 14 pt bold) vs background | **4.5 : 1** |
| Large text (≥ 18 pt or ≥ 14 pt bold) vs background | **3 : 1** |
| Non-text UI (chart bars, lines, markers, focus ring) vs background | **3 : 1** |
| Non-text UI vs adjacent fill (bar against neighbor bar) | **3 : 1** |
| Focus indicators | **3 : 1** against both background and the element it surrounds |

Use a contrast checker at generation time. Reject palettes that fail.

## Alt-text pattern for generated charts

Every Vega-Lite spec emitted by the agent includes `"description"` at the top level:

```json
{
  "description": "Bar chart of revenue by region, Q1 2026. North America leads at $8.2M; APAC trails at $1.1M. Data table available below.",
  "title": "Revenue Growing 12% — Driven by NA Expansion",
  ...
}
```

Pattern: `[chart type] of [metric] by [dimension], [timeframe]. [1–2 sentence insight]. Data table available below.` Max 300 chars.

## Tabular equivalent (WCAG 1.1.1)

Every chart tile renders a tabular equivalent (HTML `<table>` with `<caption>`) below the chart OR a "Show as table" toggle. Frontend already has this plumbing (see `ChartEditor`); agent-emitted specs must set `include_data_table: true` in tile metadata (to be wired in retrieval-infra plan).

## Color is never the only encoding

For categorical series:
- Pair color with a secondary encoding: shape (scatter), pattern (bars for print), or direct label.
- For line charts with ≥ 2 series, always label lines at their endpoint (Vega-Lite `layer` with `mark: "text"`).

For diverging / sequential scales:
- Always show the legend with labeled stops.
- Provide tooltip with exact value (not just a color chip).

## Colorblind-safe palettes

Default categorical palettes pass all three CVD types (deuteranopia, protanopia, tritanopia):
- **Okabe-Ito 8** (`#E69F00`, `#56B4E9`, `#009E73`, `#F0E442`, `#0072B2`, `#D55E00`, `#CC79A7`, `#000000`).
- **Tableau 10 Colorblind** (for Tableau-parity).
- **ColorBrewer Set2** (pastel, 8 hues).

Sequential: **Viridis** or **Cividis** (Cividis passes blue-yellow deuteranopia best). Never rainbow.

## Keyboard navigation (interactive dashboards)

Every chart mark is reachable by keyboard:
- `Tab` / `Shift+Tab` between tiles.
- Inside a tile, arrow keys move between marks.
- `Enter` activates drill-through.
- `Esc` exits chart focus.
- Focus ring: 2 px solid, contrast ≥ 3 : 1.

Vega-Lite spec sets `"usermeta": {"keyboardNav": true}` — our renderer (`VegaRenderer.tsx`) wires the handlers.

## Prefers-reduced-motion

Respect `prefers-reduced-motion: reduce`:
- Disable entry animations (`"config": {"view": {"transform": {"duration": 0}}}` via userMeta flag).
- Tooltip transitions become instant.

The renderer handles this globally; agent ensures specs do not hardcode animation durations.

## Font sizes

- Chart title: 14–18 pt (satisfies "large text" threshold at 14 pt bold).
- Axis labels: 11 pt minimum (regular text threshold — must hit 4.5 : 1 contrast).
- Legend text: 11 pt minimum.
- Tooltip body: 12 pt.

## Screen reader announcements

Tooltip content (on focus-triggered, not hover) lives in `aria-live="polite"`. Format: `"<category>: <formatted value>, <delta if any>, <unit>"`.

## What to refuse

- Red/green only to encode pass/fail (add a shape or icon).
- Low-contrast gray text (common "#9CA3AF on white" fails at 4.5 : 1 for < 18 pt).
- Pie chart with > 5 slices (fails comprehensibility + accessibility).
- Interactive-only content without a static equivalent (drill-down must be possible via keyboard, not just hover).

## Cross-skill references

- `visualization/color-system.md` — CVD-safe palettes.
- `visualization/chart-formatting.md` — label sizes + tooltip patterns.
- `visualization/dashboard-aesthetics.md` — typography scale.

---

## Examples

**Input:** Agent emits a bar chart spec with `color: "#90EE90"` for bars against white background.
**Output:** Contrast check: `#90EE90` vs white = 1.66 : 1. Fails 3 : 1 for non-text UI. Replace with Okabe-Ito `#009E73` (contrast 2.74 : 1 — still fails, but darker). Use `#006644` instead (4.12 : 1, passes).

**Input:** Agent generates alt-text: `"This chart shows the data."`.
**Output:** Reject. Regenerate: `"Bar chart of revenue by region, Q1 2026. North America leads at $8.2M; APAC trails at $1.1M. Data table available below."` Length 134 chars, passes pattern.

**Input:** Dashboard with 4 red/green KPI deltas (no shape, no label).
**Output:** Inject up/down triangle icons (▲ / ▼) and numeric delta next to color. Now color is decorative; meaning carries through shape + text.

**Input:** User on Windows high-contrast mode.
**Output:** Renderer switches to system colors (handled at CSS level). Spec sets `"background": null` so system background shines through. Contrast automatically satisfied.
````

- [ ] **Step 2: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "accessibility-wcag" -v
cd ..
git add askdb-skills/visualization/accessibility-wcag.md
git commit -m "feat(skills): add accessibility-wcag skill (Plan 1 T9)"
```

---

## Task 10: Create `shared/metric-definitions-glossary.md`

**Files:**
- Create: `askdb-skills/shared/metric-definitions-glossary.md`
- Modify: `askdb-skills/domain/domain-sales.md` (remove duplicated defs, add reference link)
- Modify: `askdb-skills/domain/domain-product-finance-marketing-ecommerce.md` (same)

**Rationale (Top-5 redundancy #5):** "Revenue", "active user", "conversion rate", "cohort retention" etc. are defined in 2+ domain files. Extract canonical defs; domain files reference.

- [ ] **Step 1: Create the shared glossary**

Write `askdb-skills/shared/metric-definitions-glossary.md`:

````markdown
---
name: metric-definitions-glossary
description: Canonical definitions of business metrics used across sales, finance, product, marketing, ecommerce, HR, ops domains — revenue, active users, churn, cohort retention, AOV, CAC, LTV, funnel stages
priority: 3
tokens_budget: 1400
applies_to: sql-generation
---

# Metric Definitions Glossary — AskDB AgentEngine

Canonical, dialect-agnostic metric definitions. Domain skills reference this file instead of redefining.

## Revenue

- **Gross revenue** = SUM of all invoiced amounts before refunds/credits/discounts. `SUM(invoices.total)`.
- **Net revenue** = Gross − refunds − credits − discounts. `SUM(invoices.total) - SUM(refunds.amount) - SUM(credits.amount)`.
- **Recognized revenue** = Portion of contract-value recognized in the current period (ASC 606). Requires a `revenue_schedule` table. Do NOT infer from invoice date alone.
- **Booked revenue** = Contract value signed this period, independent of when recognized. `SUM(contracts.acv) WHERE signed_at IN period`.
- **MRR** = Monthly recurring revenue. For subscription SaaS: `SUM(active subscriptions.monthly_price)` on the last day of the month.
- **ARR** = Annual recurring revenue = `MRR × 12`.

Default when ambiguous: **net revenue**. Always disclose choice in summary.

## Customers / Users

- **Customer** = organization entity (one row in `customers` / `accounts`). Many users per customer common in B2B.
- **User** = individual login (one row in `users`). A customer with 10 users is still 1 customer.
- **Active user** = user with ≥ 1 session or ≥ 1 qualifying event in the window. "Qualifying" is product-defined; default = any event in `events` table.
- **DAU / WAU / MAU** = daily/weekly/monthly active users over a rolling window. `COUNT(DISTINCT user_id) WHERE event_date IN window`.
- **Stickiness** = `DAU / MAU`. Target 0.2 = visit 20% of days.
- **New user** = first event / first login / first purchase within window, depending on product.
- **Returning user** = not a new user in window.

## Churn

- **Gross churn rate** = `(customers lost in period) / (customers at start of period)`. SaaS convention: monthly.
- **Net revenue retention (NRR)** = `(starting MRR + expansion − contraction − churn) / starting MRR`. Good SaaS: > 100%.
- **Gross revenue retention (GRR)** = same but excluding expansion. Cap at 100%.
- **Logo churn** = customer count churn (ignoring revenue).
- **Revenue churn** = `(MRR lost to churn) / (starting MRR)`.
- **Soft churn** = inactive ≥ 30 days but not officially cancelled. Default: treat as churned for DAU but not for revenue until cancelled.

## Order / Transaction

- **AOV** (average order value) = `SUM(order_total) / COUNT(DISTINCT order_id)`.
- **ARPU** (average revenue per user) = `SUM(revenue) / COUNT(DISTINCT user_id)`.
- **Basket size** = items per order. `SUM(items) / COUNT(DISTINCT order_id)`.

## Conversion / Funnel

- **Conversion rate** = `(converters) / (entrants to funnel step)`. Always specify the two steps.
- **Top-of-funnel** = entrants (sessions / leads).
- **Bottom-of-funnel** = final-step completers (paid customers / closed-won).
- **Stage conversion** = conversion between adjacent stages.
- **Overall conversion** = top-to-bottom.
- Funnel stages default: awareness → interest → consideration → purchase → retention. Product-specific events override.

## Cohort retention

- **Cohort** = users grouped by their acquisition period (e.g., `signup_month`).
- **Retention at week N** = `(cohort users active in week N) / (cohort size at week 0)`.
- **Classic cohort table** = rows = cohort period, columns = elapsed weeks, cell = retention %. Use `FIXED` LOD in Tableau or `FIRST_VALUE(signup_date) OVER (PARTITION BY user_id ORDER BY event_date)` in SQL.

## Unit economics

- **CAC** (customer acquisition cost) = `SUM(marketing spend + sales spend) / (new customers acquired)` in period.
- **LTV** (lifetime value) = `(AOV × purchase frequency × customer lifespan)` OR, for SaaS: `ARPU / churn rate`.
- **LTV/CAC ratio** = target ≥ 3.
- **Payback period** = `CAC / (ARPU × gross margin)`. Target ≤ 18 months SaaS.
- **Gross margin** = `(revenue − COGS) / revenue`.

## Marketing

- **CTR** (click-through rate) = `clicks / impressions`.
- **CPC** (cost per click) = `spend / clicks`.
- **CPM** (cost per thousand impressions) = `spend × 1000 / impressions`.
- **ROAS** (return on ad spend) = `attributed revenue / ad spend`.
- **Attribution** defaults to last-touch unless overridden. Multi-touch requires `FIXED` cohort calc.

## HR / Ops

- **Headcount** = active employees on a given date. Point-in-time metric, not period-summed.
- **Attrition rate** = `(departures in period) / (avg headcount in period)`. Annualized.
- **MTTR** (mean time to recovery) = `AVG(resolved_at − created_at)` for incidents/tickets.
- **SLA compliance** = `(tickets within SLA) / (tickets total)`.

## Time periods

- **YTD** = from Jan 1 of reference year through reference date.
- **PYTD** = Jan 1 of year−1 through (reference date − 1 year), Feb 29 clamped to Feb 28.
- **QTD** = from quarter_start(reference) through reference date.
- **Rolling 30d** = `reference − 29d` through reference (inclusive both ends = 30 days).
- **Fiscal year** = requires `fiscal_year_start_month` parameter; never assume calendar.

See `sql/time-intelligence.md` for the SQL patterns.

## Disambiguation rule

When user says a metric name ambiguous across definitions ("revenue"), pick the default (net) AND disclose the choice:

> "Computed net revenue (gross − refunds). If you want gross, say 'gross revenue'."

## Override mechanism

Users can declare company-specific definitions via `/api/v1/schema/metrics` (to be implemented). Overrides live in `.data/user_data/{hash}/metric_overrides.json`. Override takes precedence over glossary defaults.

---

## Examples

**Input:** User: "What's our revenue this quarter?"
**Output:** Apply default = **net revenue**. SQL: `SUM(invoices.total) - COALESCE(SUM(refunds.amount),0) - COALESCE(SUM(credits.amount),0)` scoped to quarter. Summary: "Net revenue (gross − refunds − credits) for Q1 2026: $8.2M."

**Input:** User: "churn rate for March".
**Output:** Ambiguous. Apply disambiguation: default = gross churn (customer count). Disclose: "Gross customer churn in March: 4.2% (142 of 3,380 customers). If you wanted revenue churn, let me know."

**Input:** User: "cohort retention by signup week".
**Output:** Use cohort-table pattern. `WITH cohorts AS (SELECT user_id, DATE_TRUNC('week', signup_date) AS cohort FROM users), activity AS (SELECT c.cohort, DATE_TRUNC('week', e.event_date) AS week, COUNT(DISTINCT e.user_id) AS active FROM cohorts c JOIN events e USING (user_id) GROUP BY 1,2) SELECT cohort, week, active*1.0/FIRST_VALUE(active) OVER (PARTITION BY cohort ORDER BY week) AS retention FROM activity`.

**Input:** User has company override `MRR = SUM(subscriptions.mrr) WHERE status='active'` in metric_overrides.json.
**Output:** Use override verbatim. Summary notes: "Using your custom MRR definition."
````

- [ ] **Step 2: Remove duplicated defs from domain files**

Edit `askdb-skills/domain/domain-sales.md` — find any section that redefines "revenue", "conversion rate", "funnel stage", "AOV" and replace with:

```markdown
## Sales-specific metrics

For canonical metric definitions (revenue, AOV, conversion, funnel stages, CAC, LTV), see `shared/metric-definitions-glossary.md`. This file only covers sales-specific extensions:
```

Keep all CRM-schema patterns, Salesforce/HubSpot layouts, rep-performance SQL, stuck-deal queries — those are sales-unique.

Repeat for `askdb-skills/domain/domain-product-finance-marketing-ecommerce.md`: remove duplicates of the shared defs, keep domain-unique content (DAU calculation specifics, GAAP P&L structure, ROAS SQL, GMV, inventory turnover, etc.).

- [ ] **Step 3: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -k "metric-definitions-glossary or domain-sales or domain-product-finance" -v
cd ..
git add askdb-skills/shared/metric-definitions-glossary.md askdb-skills/domain/
git commit -m "feat(skills): extract metric-definitions-glossary, dedupe domain files (Plan 1 T10)"
```

---

## Task 11: Split `context-compaction-teach-by-correction.md`

**Files:**
- Delete: `askdb-skills/agent/context-compaction-teach-by-correction.md`
- Create: `askdb-skills/agent/session-persistence.md`
- Create: `askdb-skills/agent/learn-from-corrections.md`

**Rationale:** The existing file conflates two responsibilities (context compaction + teach-by-correction). Research (ICRH) says the teach-by-correction half needs explicit safeguards to avoid feedback-loop reward hacking.

- [ ] **Step 1: Create `agent/session-persistence.md`**

Write `askdb-skills/agent/session-persistence.md`:

````markdown
---
name: session-persistence
description: Session memory compaction rules, SQLite persistence protocol, resume-after-disconnect flow and version conflict resolution
priority: 2
tokens_budget: 900
applies_to: multi-step-agent
---

# Session Persistence — AskDB AgentEngine

## Storage

Agent sessions persist to `.data/agent_sessions.db` (SQLite, WAL mode). Auto-save triggers:
- Every SSE `complete` event.
- On disconnect detection (SSE connection closed).
- On explicit `ask_user` pause (to survive user walking away).
- Every 6 tool calls (sliding checkpoint).

Per-user session cap = 50 (from `config-defaults.md`). Oldest auto-purged.

## Compaction

When running session memory exceeds ~8K tokens, `SessionMemory.compact()` summarizes old turns to 1-line each, keeping:
- System prompt (untouched).
- Last 3 turns verbatim.
- All user-authored text verbatim (never compact user content).
- Summary of older turns: "User asked about X; agent ran 3 queries; found Y."

Target compacted size: ~4K tokens, leaving 4K headroom.

## Sliding compaction

Every 6 tool calls, old `tool_result` content (large DB rows, schema dumps) gets summarized to one line:
- Before: full 30-row table inline.
- After: `tool_result[3]: returned 30 rows for orders sample (masked)`.

This is *additive* to session compaction — it runs more frequently but only on tool outputs.

## Resume protocol

On `/api/v1/agent/continue`:
1. Load the saved session from SQLite.
2. Rebuild `collected_steps` up to `MAX_COLLECTED_STEPS` (oldest evicted).
3. Rebuild `progress` dict (`{goal, completed, pending}`).
4. Inject progress block into system prompt: "`<progress>...</progress>` Resume from the next pending task."
5. Resume from the first pending task.

## Version conflict resolution

If two tabs/clients resume the same session concurrently:
1. Last-writer-wins on the SQLite row (no locking).
2. On next save, the losing client sees `version_mismatch` and prompts user: "Your session was updated in another tab. Reload?"
3. Never attempt to merge — LLM state is not mergeable.

## What never to persist

- Plaintext PII (passes through `mask_dataframe` before storage).
- API keys (never in session state).
- Full raw result rows (compacted during save).
- Error stack traces (audit only).

---

## Examples

**Input:** User closes browser mid-dashboard-build after 3 tiles complete.
**Output:** Auto-save at last SSE event captured progress = `{completed: [tile1, tile2, tile3], pending: [tile4, tile5]}`. User returns, clicks "Continue" → agent resumes at tile 4.

**Input:** Session hits 12K tokens.
**Output:** Compact triggered. Turns 1–5 collapsed to summary lines. Turn 6 onward + last 3 turns kept verbatim. Next turn proceeds at 6K total.

**Input:** User opens session in two tabs, both make tool calls.
**Output:** Last save wins. Losing tab sees `version_mismatch`, prompts reload. User reloads in active tab.

**Input:** Agent made a `run_sql` call that returned 200 rows. 6 tool calls later.
**Output:** Sliding compaction replaces the 200-row `tool_result` with `"returned 200 rows for <table> (masked, first col: customer_id)"`. Context shrinks ~3K tokens.
````

- [ ] **Step 2: Create `agent/learn-from-corrections.md`**

Write `askdb-skills/agent/learn-from-corrections.md`:

````markdown
---
name: learn-from-corrections
description: Safe teach-by-correction protocol with ICRH safeguards — correction queue, human review, shadow mode, golden eval gating
priority: 3
tokens_budget: 1200
applies_to: feedback, system-maintenance
---

# Learn from Corrections — AskDB AgentEngine

## Why safeguards matter

In-Context Reward Hacking (ICRH, Pan et al. 2024) shows feedback loops at inference time produce self-reinforcing wrong answers. **Never auto-ingest user corrections into the live retrieval store.** Every correction must pass through a review queue.

## Correction event types (tiered)

| Tier | Event | Weight |
|---|---|---|
| T1 | Explicit thumbs-up on result | 1.0 |
| T1 | User edits SQL and re-runs same question | 1.0 |
| T2 | User accepts answer without comment | 0.3 |
| T2 | User reruns same question unchanged (implicit confirm) | 0.3 |
| T3 | User asks a follow-up drilling into result | 0.1 |
| T3 | User session ends without error | 0.0 (no signal) |

Only T1 enters the correction queue. T2/T3 inform ranking weights, never schema.

## Correction queue

Location: `.data/corrections_pending/{user_hash}/{ts_iso}.json`

Schema:
```json
{
  "ts": "2026-04-19T14:32:00Z",
  "user_hash": "sha256 prefix",
  "question": "Show me revenue by region",
  "original_sql": "SELECT ...",
  "corrected_sql": "SELECT ...",
  "user_note": "You forgot to exclude test accounts",
  "connection_id": "...",
  "status": "pending_review",
  "tier": "T1_explicit_edit"
}
```

**Never written directly into ChromaDB `examples_<conn_id>` or any retrieval store.**

## Review pipeline (async, human-in-loop)

1. **Hourly scan:** A background job enumerates new queue entries.
2. **Auto-classify:** Lightweight classifier tags each as `safe_dedup` (minor edit), `schema_change` (used different tables), or `semantic_change` (meaning shifted).
3. **Auto-promote:** `safe_dedup` entries only auto-promote to ChromaDB examples after 3 independent users make the same correction (majority vote across corrections).
4. **Flag for review:** `schema_change` and `semantic_change` go to an admin queue. If unreviewed > 7 days, email admin.
5. **Manual promote or reject:** Admin decision gets logged.

## Golden eval gate

Before any promoted correction takes effect in retrieval:
1. Run the frozen golden eval set (`backend/eval/golden_nl_sql_200.jsonl`, to be created) against the current system.
2. Promote the correction into a shadow store.
3. Re-run golden eval against the shadow store.
4. If regression > 2% on any category, **reject** the promotion.
5. Otherwise, promote to live store.

## Shadow mode for new skills

When a new skill file or edited skill ships:
- For 48 h, it runs in shadow: retrieval returns normal results; new skill's retrieval path is logged but not injected.
- Diff logging: for each shadow-retrieved turn, compare the retrieved skill set vs baseline, measure answer divergence (result-set equality for SQL turns; BERT-score for summary turns).
- After 48 h, if no regression > 2%, promote.

## Distribution-shift monitor

Daily job computes action distribution across all sessions:
- Tables-hit histogram.
- Chart-type histogram.
- Average join depth.
- Average tokens per turn.

Compute KL divergence vs 7-day baseline. Divergence > 0.3 → alert admin. This catches systemic drift from a silently-introduced bad skill.

## Cap retrieval echo

When retrieving similar past queries from memory (`query_memory.find_similar`):
- Top-3 max per turn.
- Weight capped at 0.3 of total retrieval weight (the rest comes from curated skills).
- Never surface the same past query's SQL as the single dominant evidence — at least one other source must agree.

This prevents echo-chamber: a wrong answer that became a "cached correct" can't self-reinforce because it can only contribute 30% of the evidence.

## Forbidden patterns

- Auto-append corrections to `examples_<conn_id>` on `/api/queries/feedback` (the current behavior — to be refactored).
- Retrain embeddings on user data without explicit consent.
- Let a session's own wrong answers enter next turn's retrieval context as "helpful prior answer".

## Audit

Every promotion/rejection writes `.data/audit/correction_decisions.jsonl` with full reasoning. Retain 1 year.

---

## Examples

**Input:** User runs "revenue by region", agent returns SQL including test accounts. User edits SQL to add `WHERE NOT is_test_account`, re-runs with the edit.
**Output:** T1 correction logged to queue. Auto-classifier tags `schema_change` (new column reference). Queued for admin review. No immediate effect on retrieval.

**Input:** 3 different users independently add `WHERE NOT is_test_account` to revenue queries on the same connection.
**Output:** Majority vote threshold met on `safe_dedup`. Golden eval runs against shadow with new example. No regression. Promoted to live examples store. Summary to admin: "3 users agreed; promoted."

**Input:** Admin adds new skill `sql/advanced-window-patterns.md`.
**Output:** File goes live but retrieval runs in shadow for 48 h. Divergence monitored. After 48 h: average answer divergence 0.4% (well under 2%). Promoted.

**Input:** Daily monitor shows KL divergence 0.45 vs baseline on join-depth distribution (suddenly deeper joins).
**Output:** Alert admin. Investigate: find a new synonym hint pointed "customer" to a denormalized view, causing over-joining. Revert hint.
````

- [ ] **Step 3: Delete the old combined file**

```bash
git rm "askdb-skills/agent/context-compaction-teach-by-correction.md"
```

- [ ] **Step 4: Update MASTER_INDEX to reflect split**

Modify `askdb-skills/MASTER_INDEX.md`:
- In `agent/` section: remove the `context-compaction-teach-by-correction.md` entry; add `session-persistence.md` (3-line summary) and `learn-from-corrections.md` (3-line summary).
- Update top-line counts: `Files: 45` (was 33 — accounting for migration + splits + 9 new + 1 shared + 2 split halves − 1 deleted).
- Add a new Version History entry: `| 1.1 | 2026-04-19 | +9 new skills, extracted glossary, split context-compaction |`.

- [ ] **Step 5: Validate + commit**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -v
cd ..
git add askdb-skills/agent/session-persistence.md askdb-skills/agent/learn-from-corrections.md askdb-skills/MASTER_INDEX.md
git rm "askdb-skills/agent/context-compaction-teach-by-correction.md"
git commit -m "feat(skills): split context-compaction into session-persistence + learn-from-corrections (Plan 1 T11)"
```

Expected test result: All files PASS structure validation; `test_master_index_lists_all_skills` PASSES.

---

## Task 12: Final Validation Sweep

**Files:**
- Run: `backend/tests/test_skill_library_structure.py` (full suite)
- Potentially modify any skill file that fails on token-budget drift

- [ ] **Step 1: Run full suite**

```bash
cd backend
python -m pytest tests/test_skill_library_structure.py -v --tb=short
```

Expected: All tests PASS. If any fail on token-budget drift (±25% window), adjust `tokens_budget` in the failing file's frontmatter to reflect the actual encoded token count (round to nearest 100). No content changes; just the budget marker.

- [ ] **Step 2: Manual eyeball check**

From the repo root, list the final skill library:

```bash
find askdb-skills -name "*.md" -type f | sort
```

Expected output (46 entries):

```
askdb-skills/MASTER_INDEX.md
askdb-skills/agent/batch-query-optimization.md
askdb-skills/agent/dashboard-build-protocol.md
askdb-skills/agent/learn-from-corrections.md
askdb-skills/agent/multi-step-planning.md
askdb-skills/agent/screenshot-interpretation.md
askdb-skills/agent/session-memory-protocol.md
askdb-skills/agent/session-persistence.md
askdb-skills/agent/skill-library-meta.md
askdb-skills/agent/streaming-progressive-results.md
askdb-skills/agent/voice-interaction-patterns.md
askdb-skills/core/agent-identity-response-format.md
askdb-skills/core/caching-breakpoint-policy.md
askdb-skills/core/chromadb-retrieval-integration.md
askdb-skills/core/confirmation-thresholds.md
askdb-skills/core/data-quality-trust-scoring.md
askdb-skills/core/error-handling.md
askdb-skills/core/llm-error-recovery.md
askdb-skills/core/query-lifecycle-budget.md
askdb-skills/core/security-rules.md
askdb-skills/dialects/dialect-bigquery.md
askdb-skills/dialects/dialect-mysql-sqlserver-redshift-databricks.md
askdb-skills/dialects/dialect-snowflake-postgres-duckdb.md
askdb-skills/domain/domain-hr-operations.md
askdb-skills/domain/domain-iot-timeseries.md
askdb-skills/domain/domain-product-finance-marketing-ecommerce.md
askdb-skills/domain/domain-sales.md
askdb-skills/shared/metric-definitions-glossary.md
askdb-skills/sql/aggregation-rules.md
askdb-skills/sql/ambiguity-resolution.md
askdb-skills/sql/calculation-patterns.md
askdb-skills/sql/data-types-and-subqueries.md
askdb-skills/sql/join-intelligence.md
askdb-skills/sql/null-handling.md
askdb-skills/sql/performance-optimization.md
askdb-skills/sql/schema-linking-evidence.md
askdb-skills/sql/schema-profiling.md
askdb-skills/sql/self-repair-error-taxonomy.md
askdb-skills/sql/sql-validation-rules.md
askdb-skills/sql/time-intelligence.md
askdb-skills/sql/window-functions.md
askdb-skills/visualization/accessibility-wcag.md
askdb-skills/visualization/chart-formatting.md
askdb-skills/visualization/chart-selection.md
askdb-skills/visualization/color-system.md
askdb-skills/visualization/dashboard-aesthetics.md
askdb-skills/visualization/dashboard-layout-patterns.md
askdb-skills/visualization/insight-generation.md
askdb-skills/visualization/vizql-capabilities-progressive-disclosure.md
```

Total: 49 (1 MASTER_INDEX + 48 skill files).

- [ ] **Step 3: Token accounting**

```bash
python -c "
from pathlib import Path
import frontmatter, tiktoken
enc = tiktoken.get_encoding('cl100k_base')
root = Path('askdb-skills')
total = 0
p1 = 0
for p in root.rglob('*.md'):
    if p.name == 'MASTER_INDEX.md': continue
    post = frontmatter.load(p)
    toks = len(enc.encode(post.content))
    total += toks
    if post.metadata.get('priority') == 1:
        p1 += toks
print(f'total tokens: {total:,}')
print(f'priority-1 always-on tokens: {p1:,}')
"
```

Expected: `total tokens: ~80,000–95,000`, `priority-1 always-on tokens: ~5,500–7,500`. If Priority-1 exceeds 7,500, one of the always-on files is too big — trim it.

- [ ] **Step 4: Commit validation artifacts (if any)**

If Step 1 required budget-number fixes, commit them:

```bash
git add askdb-skills/
git commit -m "chore(skills): reconcile tokens_budget metadata with actual encoding (Plan 1 T12)"
```

Otherwise: no commit needed for Task 12.

---

## Self-Review Checklist

Run this after completing all tasks. Do not skip.

- [ ] **Spec coverage:** Every gap in the audit's "Top 5 Gaps" has a corresponding new skill file:
  - Gap 1 LLM failure mitigation → Task 1 (`llm-error-recovery`).
  - Gap 2 Data quality trust → Task 2 (`data-quality-trust-scoring`).
  - Gap 3 Streaming/progressive → Task 4 (`streaming-progressive-results`).
  - Gap 4 Accessibility → Task 9 (`accessibility-wcag`).
  - Gap 5 Batch optimization → Task 5 (`batch-query-optimization`).
  - Plus research-driven additions: caching policy (T3), skill-library meta (T6), schema-linking evidence (T7), self-repair taxonomy (T8).
  - Plus Tier C: shared glossary (T10), split context file (T11).

- [ ] **Placeholder scan:** No `TODO`, `TBD`, `FIXME`, `<fill`, `lorem ipsum` anywhere. Enforced by test.

- [ ] **Type consistency:** References across skills use consistent names — `mask_dataframe()`, `SessionMemory.compact()`, `agent_sessions.db`, `behavior_engine.detect_domain()`, `query_memory.find_similar()`. All match actual code from `backend/`.

- [ ] **MASTER_INDEX synchronization:** Index lists all 48 skill files. Test enforced.

- [ ] **Frontmatter consistency:** Every new file uses the same frontmatter shape. Test enforced.

- [ ] **Dead references:** Cross-skill references in new files (`sql/join-intelligence.md`, `shared/metric-definitions-glossary.md`, etc.) all point to files that exist.

If any item fails, fix inline before handing off.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-skill-library-content-foundation.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
