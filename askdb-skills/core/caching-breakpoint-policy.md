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
