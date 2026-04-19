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
