---
applies_to: always-on
description: The skill library uses ChromaDB as a semantic retrieval layer. Instead
  of loading all 31+ markdown files into every system prompt (expensive,...
legacy: true
name: chromadb-retrieval-integration
priority: 3
tokens_budget: 2400
---

# ChromaDB Retrieval Integration — AskDB AgentEngine

## Architecture Overview

The skill library uses ChromaDB as a semantic retrieval layer. Instead of loading all 49 markdown files into every system prompt (expensive, slow), the agent retrieves only the 2-4 most relevant skill files per query.

```
User query
    ↓
Query embedding (pure-Python 384-dim n-gram hash; no ML deps; ~5-10ms — research-context §1.3)
    ↓
ChromaDB similarity search (6 collections)
    ↓
Top 2-4 skill file chunks returned
    ↓
Injected into agent context window
    ↓
Agent executes with precise skill knowledge
```

**Latency added:** ~100-300ms per query (negligible vs 1-3s execution)
**Context saved:** ~80% vs loading all files (allows more user conversation history)

## Collection Structure

```python
import chromadb

client = chromadb.PersistentClient(path="./askdb_skills_db")

# Create 6 collections — one per skill category
collections = {
    "core":          client.get_or_create_collection("askdb_core"),
    "sql":           client.get_or_create_collection("askdb_sql"),
    "visualization": client.get_or_create_collection("askdb_visualization"),
    "agent":         client.get_or_create_collection("askdb_agent"),
    "dialects":      client.get_or_create_collection("askdb_dialects"),
    "domain":        client.get_or_create_collection("askdb_domain"),
}
```

## Ingestion Script

```python
import chromadb
import os
from pathlib import Path

def ingest_skill_library(skills_root: str = "./askdb-skills"):
    client = chromadb.PersistentClient(path="./askdb_skills_db")
    
    collection_map = {
        "core":          client.get_or_create_collection("askdb_core"),
        "sql":           client.get_or_create_collection("askdb_sql"),
        "visualization": client.get_or_create_collection("askdb_visualization"),
        "agent":         client.get_or_create_collection("askdb_agent"),
        "dialects":      client.get_or_create_collection("askdb_dialects"),
        "domain":        client.get_or_create_collection("askdb_domain"),
    }
    
    for category, collection in collection_map.items():
        skill_dir = Path(skills_root) / category
        if not skill_dir.exists():
            continue
            
        for md_file in skill_dir.glob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            
            # Chunk by H2 sections (## headers)
            chunks = chunk_by_section(content, max_tokens=800)
            
            for i, chunk in enumerate(chunks):
                doc_id = f"{category}_{md_file.stem}_chunk_{i}"
                collection.add(
                    documents=[chunk["text"]],
                    metadatas=[{
                        "file": md_file.name,
                        "category": category,
                        "section": chunk["header"],
                        "priority": get_priority(md_file.stem)
                    }],
                    ids=[doc_id]
                )
    
    print(f"Ingestion complete.")

def chunk_by_section(content: str, max_tokens: int = 800) -> list[dict]:
    """Split markdown by ## headers, keeping each section as a chunk."""
    chunks = []
    current_header = "Introduction"
    current_text = ""
    
    for line in content.split("\n"):
        if line.startswith("## "):
            if current_text.strip():
                chunks.append({"header": current_header, "text": current_text.strip()})
            current_header = line[3:].strip()
            current_text = line + "\n"
        else:
            current_text += line + "\n"
            
            # If chunk is getting too long, split here
            if len(current_text.split()) > max_tokens:
                chunks.append({"header": current_header, "text": current_text.strip()})
                current_text = ""
    
    if current_text.strip():
        chunks.append({"header": current_header, "text": current_text.strip()})
    
    return chunks

def get_priority(filename: str) -> int:
    """Higher priority = always loaded. 1=always, 2=high, 3=normal."""
    always_load = ["security-rules", "agent-identity-response-format", "confirmation-thresholds"]
    high_priority = ["aggregation-rules", "null-handling", "chart-selection"]
    
    if filename in always_load:
        return 1
    if filename in high_priority:
        return 2
    return 3

if __name__ == "__main__":
    ingest_skill_library("./askdb-skills")
```

## Retrieval Logic

```python
def get_relevant_skills(
    user_query: str,
    schema_context: dict,
    connected_db_engine: str,
    task_type: str,  # "query", "dashboard_build", "chart_create", "voice"
    top_k: int = 4
) -> list[str]:
    
    client = chromadb.PersistentClient(path="./askdb_skills_db")
    retrieved_chunks = []
    
    # ── ALWAYS LOAD (priority=1, from core) ──────────────────────────
    core = client.get_collection("askdb_core")
    always_on = core.get(where={"priority": 1})
    retrieved_chunks.extend(always_on["documents"])
    
    # ── RULE-BASED RETRIEVAL ─────────────────────────────────────────
    # Dialect — based on connected DB engine
    if connected_db_engine:
        dialect_col = client.get_collection("askdb_dialects")
        dialect_results = dialect_col.query(
            query_texts=[connected_db_engine],
            n_results=1
        )
        retrieved_chunks.extend(dialect_results["documents"][0])
    
    # Domain — based on detected schema domain
    detected_domain = detect_domain(schema_context)
    if detected_domain:
        domain_col = client.get_collection("askdb_domain")
        domain_results = domain_col.query(
            query_texts=[detected_domain],
            n_results=1
        )
        retrieved_chunks.extend(domain_results["documents"][0])
    
    # Task type routing
    if task_type == "dashboard_build":
        agent_col = client.get_collection("askdb_agent")
        agent_results = agent_col.query(
            query_texts=["dashboard build protocol planning"],
            n_results=2
        )
        retrieved_chunks.extend(agent_results["documents"][0])
    
    if task_type == "voice":
        agent_col = client.get_collection("askdb_agent")
        voice_results = agent_col.query(
            query_texts=["voice interaction patterns"],
            n_results=1
        )
        retrieved_chunks.extend(voice_results["documents"][0])
    
    # ── SEMANTIC RETRIEVAL ───────────────────────────────────────────
    # Query all SQL and visualization collections semantically
    for collection_name in ["askdb_sql", "askdb_visualization"]:
        col = client.get_collection(collection_name)
        results = col.query(
            query_texts=[user_query],
            n_results=2,
            where={"priority": {"$lte": 3}}
        )
        retrieved_chunks.extend(results["documents"][0])
    
    # Deduplicate and cap at max context budget
    unique_chunks = deduplicate(retrieved_chunks)
    return unique_chunks[:top_k * 3]  # Each skill averages 3 chunks

# detect_domain() is already implemented at backend/behavior_engine.py:193
# Returns: "sales"|"product"|"finance"|"marketing"|"ecommerce"|"hr"|"operations"|"iot"|"general"
# Do NOT re-implement — call behavior_engine.detect_domain(schema_info) directly.
```

## Target Hybrid Retrieval Architecture (research-context §3.2 — Plan 3 implementation)

> **Status:** Not yet implemented. Current system uses pure semantic (n-gram hash) retrieval only. This section documents the Plan 3 target architecture for skill-library retrieval quality improvement.

### Why hybrid retrieval (§3.2 rule 1)

Pure semantic search loses on exact column names and enum literals (e.g., `order_status = 'shipped'`). BM25 keyword search finds exact tokens but misses paraphrases. Hybrid = both.

**Target pipeline:**
```
User query
  → BM25 index (exact token match, per-connection)  ─┐
  → Dense embedding (n-gram hash, current)            ├─ Fuse scores (RRF)
  → Fused top-50 results                              ┘
  → Reranker (cross-encoder: bge-reranker-v2 or Cohere Rerank 3.5)
  → Top-5 chunks injected into context
```

Recall@5 with reranking: ~0.816 vs 0.695 hybrid-only (research-context §3.2 source).

### HyDE warning — skip for schema retrieval (§3.2 rule 3)

HyDE (Hypothetical Document Embeddings) hallucinates column names when generating hypothetical schema documents. **Never use HyDE for schema retrieval.** HyDE is acceptable for NL insight queries but not for table/column name lookup.

### Contextual retrieval — prepend chunk summary (§3.2 rule 5)

Before embedding each skill-file chunk, prepend a one-sentence context summary:

```python
# During ingestion (Plan 3 implementation)
context_prefix = f"This chunk is from {category}/{filename}, section '{section_header}'. "
embedded_text = context_prefix + chunk_text
# Reduces retrieval failures by ~35% (Anthropic Contextual Retrieval Cookbook)
```

### Parent-child chunking for schema tables (§3.2 rule 4)

```
Child chunk  = column description (embed this for retrieval)
Parent chunk = full DDL + sample rows + FK context (return this to agent)
```

Retrieve by child similarity, but inject the parent into the context window. Prevents fragmenting FK context across separate chunks.

## Context Assembly

```python
def assemble_agent_context(
    system_prompt_base: str,
    retrieved_chunks: list[str],
    max_skill_tokens: int = 4000
) -> str:
    
    skill_context = "\n\n---\n\n".join(retrieved_chunks)
    
    # Trim if over budget
    if count_tokens(skill_context) > max_skill_tokens:
        skill_context = trim_to_budget(skill_context, max_skill_tokens)
    
    return f"""{system_prompt_base}

## ACTIVE SKILL CONTEXT
The following operational guidelines apply to this query:

{skill_context}

## END SKILL CONTEXT
Apply the above guidelines when generating SQL, charts, and insights.
"""
```

## Performance Benchmarks

| Operation | Latency | Notes |
|-----------|---------|-------|
| ChromaDB query (in-memory) | 8-25ms | After warm-up |
| ChromaDB query (persistent) | 25-80ms | First access |
| Full retrieval pipeline | 100-200ms | 3-4 collections |
| Context assembly | < 5ms | String ops |
| **Total overhead** | **~150ms** | Negligible vs query execution |

## When to Bypass Retrieval (Always-On Mode)

For these query types, skip retrieval and load core files directly:
```python
BYPASS_RETRIEVAL = [
    "dashboard_rebuild_from_scratch",  # Load everything
    "full_schema_analysis",            # Load all SQL files
    "onboarding_first_session",        # Load identity + all core
]
```

## Monitoring Retrieval Quality

Log these metrics to evaluate skill retrieval effectiveness:
```python
retrieval_log = {
    "query": user_query,
    "files_retrieved": [chunk.metadata["file"] for chunk in results],
    "similarity_scores": results["distances"],
    "query_success": True/False,  # Did the agent answer correctly?
    "correction_needed": True/False,  # Did user correct the answer?
}
# Use this log to tune retrieval queries and identify skill file gaps
```
