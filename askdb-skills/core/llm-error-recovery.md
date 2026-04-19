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
