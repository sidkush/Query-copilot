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
