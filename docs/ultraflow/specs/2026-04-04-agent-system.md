# Spec: QueryCopilot Agent System (Medium Agent)

**Date:** 2026-04-04  
**Status:** Approved  
**Next:** Council → Planning → Building

## One-Line
Replace single-shot LLM calls with a Claude tool-use agent loop that can explore schemas, generate/fix SQL, execute queries, suggest charts, and interact with users — with session memory, auto-compaction, and a dockable agent panel.

## Key Decisions
- **Architecture:** Claude Tool Use API (native `tool_use`), no external SDK dependency
- **Tools (6):** `find_relevant_tables` (ChromaDB), `inspect_schema` (live DDL), `run_sql` (validate → execute → PII mask), `suggest_chart`, `ask_user`, `summarize_results`
- **Guardrails:** Conservative — max 6 tool calls, 30s timeout, max 3 SQL retries
- **Big data strategy:** Schema via ChromaDB (no full table scans), DB engine does computation, LIMIT 5000 enforced, agent never reads raw data. Must handle Databricks LFS, BigQuery, Snowflake at TB scale.
- **Model:** Haiku primary, Sonnet fallback on failure
- **Memory:** Session memory with auto-compaction (summarize after ~10 exchanges or 8K tokens)
- **SQL approval:** Auto-execute with user opt-out toggle (read-only + validator = safety net)
- **UX contexts:**
  - Chat page → streaming agent steps in chat panel
  - Dashboard → floating progress overlay + dockable/draggable agent panel (resizable, movable, like VS Code/Cursor panels)
  - Replace dashboard command bar with agent panel

## Scope IN
- Agent loop in `query_engine.py` with tool definitions
- Streaming agent responses via SSE to frontend
- Session memory with compaction in chat context
- Dockable/draggable agent panel component for dashboard
- Agent progress UI (step indicator, expandable details, inline choice buttons)
- Auto-execute toggle in user settings
- Error self-correction (SQL fix → retry loop)
- Big data performance optimization (ChromaDB-first schema, query pushdown, no client-side processing)

## Scope OUT
- Persistent cross-session memory (future full-agent phase)
- Agent writing to database (read-only enforcement stays)
- Agent managing connections or settings
- Agent SDK migration (future phase)
- Mobile-optimized agent panel

## Performance Requirements (Big Data)
- Schema exploration: ChromaDB vector search first (< 100ms), live DDL only as fallback
- SQL execution: All computation pushed to database engine (no client-side aggregation)
- Result cap: LIMIT 5000 enforced at SQL validator level
- Agent timeout: 30s hard cap including all tool calls
- Streaming: Progressive results shown as agent works (not blocked until completion)
- Connection reuse: Agent reuses existing connection pool, never creates new connections

## Success Criteria
1. Agent self-corrects failed SQL at least 70% of the time (vs current 0%)
2. Agent queries on multi-table joins succeed 50%+ more often than single-shot
3. Agent response time <= 15s for simple queries, <= 30s for complex (with streaming progress)
