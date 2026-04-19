# ChromaDB Retrieval Integration — AskDB AgentEngine

## Architecture Overview

The skill library uses ChromaDB as a semantic retrieval layer. Instead of loading all 31+ markdown files into every system prompt (expensive, slow), the agent retrieves only the 2-4 most relevant skill files per query.

```
User query
    ↓
Query embedding (all-MiniLM-L6-v2 or similar)
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

def detect_domain(schema_context: dict) -> str:
    """Infer data domain from table/column names in schema."""
    table_names = " ".join(schema_context.get("tables", []))
    column_names = " ".join(schema_context.get("columns", []))
    all_names = f"{table_names} {column_names}".lower()
    
    DOMAIN_SIGNALS = {
        "sales": ["opportunity", "deal", "pipeline", "lead", "account", "win_rate", "close_date"],
        "product": ["event", "session", "retention", "dau", "mau", "feature", "experiment"],
        "finance": ["gl_entry", "invoice", "budget", "mrr", "arr", "revenue_recognition"],
        "marketing": ["campaign", "utm", "impression", "click", "lead", "mql", "sql"],
        "ecommerce": ["order", "sku", "cart", "inventory", "return", "fulfillment"],
        "hr": ["employee", "headcount", "tenure", "attrition", "compensation"],
        "operations": ["incident", "ticket", "uptime", "latency", "sla", "queue"],
        "iot": ["sensor", "device", "telemetry", "reading", "measurement"],
    }
    
    domain_scores = {}
    for domain, signals in DOMAIN_SIGNALS.items():
        score = sum(1 for signal in signals if signal in all_names)
        if score > 0:
            domain_scores[domain] = score
    
    return max(domain_scores, key=domain_scores.get) if domain_scores else None
```

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
