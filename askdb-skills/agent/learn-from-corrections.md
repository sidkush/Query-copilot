---
name: learn-from-corrections
depends_on:
  - session-memory-protocol
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
