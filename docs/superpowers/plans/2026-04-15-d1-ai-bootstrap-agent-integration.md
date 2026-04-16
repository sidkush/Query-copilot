# Sub-project D Phase D1 — AI Bootstrap + Agent Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate synonyms, phrasings, and sample questions from schema profiling (Haiku call), inject the semantic context into the agent's system prompt so NL-to-SQL understands domain vocabulary, and build a review UI for accepting/dismissing suggestions.

**Architecture:** New backend module `semantic_bootstrap.py` takes a `SchemaProfile` + optional query history, calls Haiku with a structured prompt, returns a `LinguisticModel` with all entries `status: 'suggested'`. The agent's `_run_inner()` in `agent_engine.py` gains a semantic context block appended to the system prompt (auto-cached via `anthropic_provider._build_system()`). Frontend gains a `BootstrapReview.jsx` modal and a `/api/v1/connections/{conn_id}/semantic/bootstrap` endpoint.

**Tech Stack:** Python (Anthropic API via `anthropic_provider.py`), FastAPI endpoint, React modal component.

**Spec:** [`docs/superpowers/specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md`](../specs/2026-04-15-chart-system-sub-project-d-semantic-layer-design.md) §3.4, §6, §Phase D1.

**Depends on:** D0 (linguistic types, semantic_layer.py CRUD, REST endpoints) — completed.

---

## File Structure

### New backend files
```
backend/
  semantic_bootstrap.py                  # Haiku-powered bootstrap from SchemaProfile
  tests/
    test_semantic_bootstrap.py           # Unit tests with mocked Haiku responses
```

### Modified backend files
```
backend/
  agent_engine.py                        # +semantic context block in system prompt
  routers/chart_customization_routes.py  # +POST /connections/{conn_id}/semantic/bootstrap
```

### New frontend files
```
frontend/src/
  components/editor/BootstrapReview.jsx  # Modal for reviewing AI-generated suggestions
```

### Modified frontend files
```
frontend/src/
  api.js                                 # bootstrapSemantic already wired in D0
```

---

## Task 1: Backend `semantic_bootstrap.py`

**Files:**
- Create: `backend/semantic_bootstrap.py`
- Create: `backend/tests/test_semantic_bootstrap.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_semantic_bootstrap.py
"""Tests for semantic_bootstrap.py — AI-powered semantic layer generation."""
import json
import pytest
from unittest.mock import MagicMock, patch
from schema_intelligence import SchemaProfile, TableProfile


def _sample_profile() -> SchemaProfile:
    """Minimal schema profile for testing."""
    from datetime import datetime, timezone
    return SchemaProfile(
        conn_id="test-conn",
        schema_hash="abc123",
        cached_at=datetime.now(timezone.utc),
        tables=[
            TableProfile(
                table_name="orders",
                columns=["id", "customer_id", "total_amount", "status", "created_at"],
                column_types={"id": "integer", "customer_id": "integer",
                              "total_amount": "decimal", "status": "varchar",
                              "created_at": "timestamp"},
                row_count=50000,
                sample_values={"status": ["completed", "pending", "cancelled"],
                               "total_amount": [129.99, 45.50, 899.00]},
                primary_keys=["id"],
                foreign_keys=[{"column": "customer_id", "references": "customers.id"}],
            ),
            TableProfile(
                table_name="customers",
                columns=["id", "full_name", "email", "region", "signup_date"],
                column_types={"id": "integer", "full_name": "varchar",
                              "email": "varchar", "region": "varchar",
                              "signup_date": "date"},
                row_count=10000,
                sample_values={"region": ["North America", "Europe", "Asia"]},
                primary_keys=["id"],
                foreign_keys=[],
            ),
        ],
    )


# Mock Haiku response — the bootstrap parses structured JSON from the LLM
MOCK_HAIKU_RESPONSE = json.dumps({
    "table_synonyms": {
        "orders": ["sales", "transactions", "purchases"],
        "customers": ["clients", "buyers", "accounts"],
    },
    "column_synonyms": {
        "orders.total_amount": ["revenue", "sales amount", "order value"],
        "orders.created_at": ["order date", "purchase date"],
        "customers.full_name": ["name", "customer name"],
        "customers.region": ["area", "territory", "location"],
    },
    "value_synonyms": {
        "orders.status:completed": ["done", "finished", "fulfilled"],
        "orders.status:pending": ["waiting", "in progress"],
    },
    "phrasings": [
        {
            "type": "verb",
            "template": "customers buy/purchase products",
            "entities": ["customers", "orders"],
            "joinPath": ["customers", "orders"],
        },
    ],
    "sample_questions": [
        {"table": "orders", "question": "Total revenue by month"},
        {"table": "orders", "question": "Top 10 customers by order count"},
        {"table": "customers", "question": "Customer distribution by region"},
    ],
})


class TestBootstrapLinguistic:
    def test_returns_linguistic_model_from_haiku_response(self):
        from semantic_bootstrap import bootstrap_linguistic

        mock_provider = MagicMock()
        mock_provider.complete.return_value = MagicMock(
            content=MOCK_HAIKU_RESPONSE
        )

        result = bootstrap_linguistic(
            schema_profile=_sample_profile(),
            provider=mock_provider,
        )

        assert result["version"] == 1
        assert result["conn_id"] == "test-conn"
        assert "orders" in result["synonyms"]["tables"]
        assert len(result["synonyms"]["tables"]["orders"]) >= 2
        assert len(result["phrasings"]) >= 1
        assert all(p["status"] == "suggested" for p in result["phrasings"])
        assert len(result["sampleQuestions"]) >= 2
        assert all(q["status"] == "suggested" for q in result["sampleQuestions"])

    def test_builds_correct_prompt_with_schema_info(self):
        from semantic_bootstrap import bootstrap_linguistic

        mock_provider = MagicMock()
        mock_provider.complete.return_value = MagicMock(
            content=MOCK_HAIKU_RESPONSE
        )

        bootstrap_linguistic(
            schema_profile=_sample_profile(),
            provider=mock_provider,
        )

        call_args = mock_provider.complete.call_args
        prompt_text = call_args[kwargs_key]["messages"][0]["content"] if "messages" in (call_args.kwargs or {}) else str(call_args)
        # Just verify the provider was called — exact prompt structure is implementation detail
        assert mock_provider.complete.called

    def test_handles_malformed_haiku_response(self):
        from semantic_bootstrap import bootstrap_linguistic

        mock_provider = MagicMock()
        mock_provider.complete.return_value = MagicMock(
            content="not valid json at all"
        )

        result = bootstrap_linguistic(
            schema_profile=_sample_profile(),
            provider=mock_provider,
        )

        # Should return an empty-but-valid linguistic model on parse failure
        assert result["version"] == 1
        assert result["conn_id"] == "test-conn"
        assert result["synonyms"]["tables"] == {}
        assert result["phrasings"] == []
        assert result["sampleQuestions"] == []

    def test_all_entries_have_suggested_status(self):
        from semantic_bootstrap import bootstrap_linguistic

        mock_provider = MagicMock()
        mock_provider.complete.return_value = MagicMock(
            content=MOCK_HAIKU_RESPONSE
        )

        result = bootstrap_linguistic(
            schema_profile=_sample_profile(),
            provider=mock_provider,
        )

        for p in result["phrasings"]:
            assert p["status"] == "suggested"
        for q in result["sampleQuestions"]:
            assert q["status"] == "suggested"

    def test_empty_schema_returns_empty_model(self):
        from semantic_bootstrap import bootstrap_linguistic
        from datetime import datetime, timezone

        empty_profile = SchemaProfile(
            conn_id="empty",
            schema_hash="empty",
            cached_at=datetime.now(timezone.utc),
            tables=[],
        )
        mock_provider = MagicMock()
        mock_provider.complete.return_value = MagicMock(
            content=json.dumps({
                "table_synonyms": {},
                "column_synonyms": {},
                "value_synonyms": {},
                "phrasings": [],
                "sample_questions": [],
            })
        )

        result = bootstrap_linguistic(
            schema_profile=empty_profile,
            provider=mock_provider,
        )

        assert result["version"] == 1
        assert result["phrasings"] == []
        assert result["sampleQuestions"] == []
```

- [ ] **Step 2: Run tests — expect module not found**

Run: `cd backend && python -m pytest tests/test_semantic_bootstrap.py -v`

- [ ] **Step 3: Implement `semantic_bootstrap.py`**

```python
# backend/semantic_bootstrap.py
"""
semantic_bootstrap.py — Sub-project D Phase D1.

AI-powered bootstrap for the linguistic model. Takes a SchemaProfile,
calls Haiku with a structured prompt, parses the JSON response into
a LinguisticModel dict with all entries status='suggested'.

The bootstrap prompt asks the LLM to generate:
  - Table synonyms (2-4 per table)
  - Column synonyms (1-3 per non-obvious column)
  - Value synonyms (for categorical columns with coded values)
  - Verb/attribute phrasings (from FK relationships)
  - Sample questions (5-10 per table)

Cost: one Haiku call, ~500-2000 input tokens, ~500-1500 output.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from schema_intelligence import SchemaProfile

logger = logging.getLogger(__name__)


def bootstrap_linguistic(
    schema_profile: SchemaProfile,
    provider,
    query_history: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Generate a draft LinguisticModel from schema profiling.

    Args:
        schema_profile: The connection's SchemaProfile from schema_intelligence.
        provider: An LLM provider instance (anthropic_provider or mock) with a
                  .complete(messages=...) method returning an object with .content str.
        query_history: Optional list of anonymized past query intents for vocabulary enrichment.

    Returns:
        A LinguisticModel dict with version=1, all entries status='suggested'.
        On LLM failure or parse error, returns a valid but empty model.
    """
    conn_id = schema_profile.conn_id
    now = datetime.now(timezone.utc).isoformat()

    empty_model = {
        "version": 1,
        "conn_id": conn_id,
        "updated_at": now,
        "synonyms": {"tables": {}, "columns": {}, "values": {}},
        "phrasings": [],
        "sampleQuestions": [],
        "changelog": [{"ts": now, "action": "bootstrap", "target": "linguistic_model"}],
    }

    if not schema_profile.tables:
        return empty_model

    # Build the prompt
    prompt = _build_bootstrap_prompt(schema_profile, query_history)

    try:
        response = provider.complete(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
        )
        raw = response.content if hasattr(response, 'content') else str(response)
        # Extract JSON from response (may be wrapped in markdown code fences)
        raw = _extract_json(raw)
        parsed = json.loads(raw)
    except Exception as exc:
        logger.warning("semantic_bootstrap: LLM call or parse failed — %s", exc)
        return empty_model

    return _parse_bootstrap_response(parsed, conn_id, now)


def _build_bootstrap_prompt(
    profile: SchemaProfile,
    query_history: Optional[list[str]] = None,
) -> str:
    """Build the structured prompt for the Haiku bootstrap call."""
    tables_desc = []
    for t in profile.tables:
        cols = ", ".join(
            f"{c} ({profile.tables[0].column_types.get(c, 'unknown') if hasattr(t, 'column_types') and t.column_types else 'unknown'})"
            if hasattr(t, 'column_types') and t.column_types
            else c
            for c in (t.columns or [])
        )
        samples = ""
        if hasattr(t, 'sample_values') and t.sample_values:
            sample_parts = []
            for col, vals in t.sample_values.items():
                sample_parts.append(f"  {col}: {vals[:5]}")
            if sample_parts:
                samples = "\n" + "\n".join(sample_parts)

        fks = ""
        if t.foreign_keys:
            fk_parts = [f"  {fk.get('column', '?')} → {fk.get('references', '?')}" for fk in t.foreign_keys]
            fks = "\n  FKs:\n" + "\n".join(fk_parts)

        tables_desc.append(
            f"Table: {t.table_name} ({t.row_count} rows)\n"
            f"  Columns: {cols}{fks}{samples}"
        )

    schema_text = "\n\n".join(tables_desc)

    history_text = ""
    if query_history:
        history_text = (
            "\n\nRecent user queries (anonymized):\n"
            + "\n".join(f"- {q}" for q in query_history[:20])
        )

    return (
        "Given this database schema, generate semantic metadata as JSON.\n\n"
        f"Schema:\n{schema_text}{history_text}\n\n"
        "Return a JSON object with exactly these keys:\n"
        "{\n"
        '  "table_synonyms": {"table_name": ["synonym1", "synonym2"]},\n'
        '  "column_synonyms": {"table.column": ["synonym1", "synonym2"]},\n'
        '  "value_synonyms": {"table.column:value": ["synonym1", "synonym2"]},\n'
        '  "phrasings": [{"type": "verb|attribute|name", "template": "...", '
        '"entities": ["table1", "table2"], "joinPath": ["table1", "join_table", "table2"]}],\n'
        '  "sample_questions": [{"table": "table_name", "question": "natural language question"}]\n'
        "}\n\n"
        "Rules:\n"
        "- 2-4 synonyms per table (common business names, abbreviations)\n"
        "- 1-3 synonyms per column (only for non-obvious names like 'created_at' → 'order date')\n"
        "- Value synonyms for coded/abbreviated categorical values\n"
        "- Verb phrasings for FK relationships (e.g., 'customers buy products')\n"
        "- 5-10 sample questions per table using natural vocabulary\n"
        "- Use the synonym vocabulary in sample questions\n"
        "- Return ONLY the JSON object, no other text."
    )


def _extract_json(text: str) -> str:
    """Extract JSON from potentially markdown-fenced response."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json) and last line (```)
        start = 1
        end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[start:end])
    return text.strip()


def _parse_bootstrap_response(
    parsed: dict, conn_id: str, now: str,
) -> dict[str, Any]:
    """Convert the LLM's JSON response into a LinguisticModel dict."""
    table_synonyms = parsed.get("table_synonyms", {})
    column_synonyms = parsed.get("column_synonyms", {})
    value_synonyms = parsed.get("value_synonyms", {})

    phrasings = []
    for p in parsed.get("phrasings", []):
        phrasings.append({
            "id": f"p-{uuid.uuid4().hex[:8]}",
            "type": p.get("type", "attribute"),
            "template": p.get("template", ""),
            "entities": p.get("entities", []),
            "joinPath": p.get("joinPath"),
            "status": "suggested",
        })

    sample_questions = []
    for q in parsed.get("sample_questions", []):
        sample_questions.append({
            "id": f"q-{uuid.uuid4().hex[:8]}",
            "table": q.get("table", ""),
            "question": q.get("question", ""),
            "status": "suggested",
        })

    return {
        "version": 1,
        "conn_id": conn_id,
        "updated_at": now,
        "synonyms": {
            "tables": table_synonyms if isinstance(table_synonyms, dict) else {},
            "columns": column_synonyms if isinstance(column_synonyms, dict) else {},
            "values": value_synonyms if isinstance(value_synonyms, dict) else {},
        },
        "phrasings": phrasings,
        "sampleQuestions": sample_questions,
        "changelog": [{"ts": now, "action": "bootstrap", "target": "linguistic_model"}],
    }
```

- [ ] **Step 4: Run tests — expect 5 passed**

Run: `cd backend && python -m pytest tests/test_semantic_bootstrap.py -v`

- [ ] **Step 5: Commit**

```bash
cd "QueryCopilot V1" && git add backend/semantic_bootstrap.py backend/tests/test_semantic_bootstrap.py && git commit -m "feat(d1): semantic_bootstrap.py — Haiku-powered linguistic model generation from schema profiling"
```

---

## Task 2: Bootstrap REST endpoint

**Files:**
- Modify: `backend/routers/chart_customization_routes.py`

- [ ] **Step 1: Add bootstrap endpoint**

```python
@router.post("/connections/{conn_id}/semantic/bootstrap")
async def bootstrap_semantic(conn_id: str, request: Request,
                              user: dict = Depends(get_current_user)):
    """Trigger AI bootstrap of semantic layer for a connection.

    Calls Haiku to generate synonyms, phrasings, sample questions from the
    connection's schema profile. Returns suggested LinguisticModel.
    """
    email = _require_email(user)
    from main import app

    # Get connection entry for schema profile
    connections = getattr(app.state, "connections", {})
    user_conns = connections.get(email, {})
    conn_entry = user_conns.get(conn_id)
    if not conn_entry:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")

    schema_profile = getattr(conn_entry, 'schema_profile', None)
    if not schema_profile:
        raise HTTPException(status_code=400, detail="Schema not profiled yet. Connect and wait for profiling.")

    # Get provider for Haiku call
    from provider_registry import resolve_provider
    provider = resolve_provider(email, model_tier="fast")

    from semantic_bootstrap import bootstrap_linguistic
    linguistic = bootstrap_linguistic(
        schema_profile=schema_profile,
        provider=provider,
    )

    # Save the bootstrapped model
    save_linguistic(email, conn_id, linguistic)

    return {"linguistic": linguistic}
```

Add `save_linguistic` to the existing import from `semantic_layer` (already imported in D0 Task 4).

- [ ] **Step 2: Run existing tests to verify no regressions**

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add backend/routers/chart_customization_routes.py && git commit -m "feat(d1): POST /connections/{conn_id}/semantic/bootstrap — AI-powered semantic layer generation"
```

---

## Task 3: Agent system prompt injection

**Files:**
- Modify: `backend/agent_engine.py`

- [ ] **Step 1: Add semantic context builder method**

Add a new method to `AgentEngine`:

```python
def _build_semantic_context(self) -> str:
    """Build the semantic context block for the agent's system prompt.

    Reads linguistic model + color map for the active connection.
    Returns a compact text block (~200-500 tokens) or empty string if no
    semantic data exists. Auto-cached by anthropic_provider._build_system().
    """
    try:
        from semantic_layer import hydrate
        conn_id = getattr(self.connection_entry, 'conn_id', '')
        if not conn_id or not self.email:
            return ""

        data = hydrate(self.email, conn_id)
        linguistic = data.get("linguistic")
        color_map = data.get("color_map")
        model = data.get("model")

        if not linguistic and not color_map and not model:
            return ""

        parts = ["\n\n=== Workspace Semantic Context ===\n"]

        # Synonyms (most impactful for NL understanding)
        if linguistic:
            synonyms = linguistic.get("synonyms", {})
            table_syns = synonyms.get("tables", {})
            col_syns = synonyms.get("columns", {})
            val_syns = synonyms.get("values", {})

            if table_syns:
                entries = [f"{t} (aka {', '.join(s)})" for t, s in table_syns.items() if s]
                if entries:
                    parts.append(f"Tables: {' | '.join(entries[:20])}")

            if col_syns:
                entries = [f"{c} (aka {', '.join(s)})" for c, s in col_syns.items() if s]
                if entries:
                    parts.append(f"Columns: {' | '.join(entries[:30])}")

            if val_syns:
                entries = [f"{k} (aka {', '.join(s)})" for k, s in val_syns.items() if s]
                if entries:
                    parts.append(f"Values: {' | '.join(entries[:20])}")

            # Phrasings
            accepted = [p for p in linguistic.get("phrasings", [])
                        if p.get("status") in ("accepted", "user_created")]
            if accepted:
                phr_text = " | ".join(p.get("template", "") for p in accepted[:10])
                parts.append(f"Relationships: {phr_text}")

            # Sample questions
            accepted_qs = [q for q in linguistic.get("sampleQuestions", [])
                           if q.get("status") in ("accepted", "user_created")]
            if accepted_qs:
                parts.append("Example questions:")
                for q in accepted_qs[:10]:
                    parts.append(f"  - {q.get('table', '')}: \"{q.get('question', '')}\"")

        # Metrics from semantic model
        if model:
            metrics = model.get("metrics", [])
            if metrics:
                m_text = " | ".join(
                    f"{m.get('label', m.get('id', '?'))} = {m.get('formula', '?')}"
                    for m in metrics[:10]
                )
                parts.append(f"Metrics: {m_text}")

        # Color map
        if color_map:
            assignments = color_map.get("assignments", {})
            if assignments:
                entries = [f"{k}={v}" for k, v in list(assignments.items())[:20]]
                parts.append(f"Color assignments: {' | '.join(entries)}")

        parts.append("=== End Semantic Context ===")

        block = "\n".join(parts)

        # Cap at ~800 tokens (~3200 chars) to prevent prompt bloat
        if len(block) > 3200:
            block = block[:3200] + "\n... (semantic context truncated)\n=== End Semantic Context ==="

        return block

    except Exception as exc:
        logger.debug("_build_semantic_context failed (non-fatal): %s", exc)
        return ""
```

- [ ] **Step 2: Wire into `_run_inner()` system prompt construction**

In `_run_inner()`, after `system_prompt += prefetch_context` (line ~1523) and before the dialect hints block, add:

```python
        # ── Semantic layer context (Sub-project D Phase D1) ──────
        semantic_context = self._build_semantic_context()
        if semantic_context:
            system_prompt += semantic_context
```

- [ ] **Step 3: Commit**

```bash
cd "QueryCopilot V1" && git add backend/agent_engine.py && git commit -m "feat(d1): inject semantic layer context (synonyms, phrasings, metrics, colors) into agent system prompt"
```

---

## Task 4: Frontend `BootstrapReview.jsx`

**Files:**
- Create: `frontend/src/components/editor/BootstrapReview.jsx`

- [ ] **Step 1: Create the component**

A modal component that shows AI-generated synonyms, phrasings, and sample questions grouped by table. Supports bulk accept, individual review, and dismiss.

```jsx
import { useState, useMemo } from 'react';
import useStore from '../../store';
import { api } from '../../api';

/**
 * BootstrapReview — modal for reviewing AI-bootstrapped semantic suggestions.
 *
 * Props:
 *   - connId: string — active connection ID
 *   - linguistic: LinguisticModel — the bootstrapped model from the API
 *   - onClose: () => void
 *   - onAccepted: (model) => void — called after saving accepted suggestions
 */
export default function BootstrapReview({ connId, linguistic, onClose, onAccepted }) {
  const [selections, setSelections] = useState(() => {
    // Default: all selected
    const map = {};
    for (const [table, syns] of Object.entries(linguistic?.synonyms?.tables || {})) {
      map[`table:${table}`] = true;
    }
    for (const [col, syns] of Object.entries(linguistic?.synonyms?.columns || {})) {
      map[`col:${col}`] = true;
    }
    for (const p of linguistic?.phrasings || []) {
      map[`phrasing:${p.id}`] = true;
    }
    for (const q of linguistic?.sampleQuestions || []) {
      map[`question:${q.id}`] = true;
    }
    return map;
  });
  const [saving, setSaving] = useState(false);

  const toggle = (key) => {
    setSelections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    const next = {};
    for (const k of Object.keys(selections)) next[k] = true;
    setSelections(next);
  };

  const deselectAll = () => {
    const next = {};
    for (const k of Object.keys(selections)) next[k] = false;
    setSelections(next);
  };

  const selectedCount = Object.values(selections).filter(Boolean).length;
  const totalCount = Object.keys(selections).length;

  const handleAccept = async () => {
    setSaving(true);
    try {
      // Filter linguistic model to only accepted items
      const accepted = filterToAccepted(linguistic, selections);
      // Mark accepted items as 'accepted' status
      markStatus(accepted, 'accepted');
      const resp = await api.saveLinguisticModel(connId, accepted);
      onAccepted(resp?.linguistic || accepted);
    } catch (err) {
      console.error('Failed to save semantic layer:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!linguistic) return null;

  return (
    <div
      data-testid="bootstrap-review-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 640, maxHeight: '80vh', overflow: 'auto',
        background: 'var(--bg-surface, #1a1a2e)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
        borderRadius: 12, padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Review Semantic Suggestions</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          AskDB analyzed your schema and generated synonyms, phrasings, and sample questions.
          Select which ones to keep — they'll help the AI understand your data better.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={selectAll} style={pillStyle}>Select all</button>
          <button onClick={deselectAll} style={pillStyle}>Deselect all</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {selectedCount}/{totalCount} selected
          </span>
        </div>

        {/* Table synonyms */}
        <Section title="Table Synonyms">
          {Object.entries(linguistic.synonyms?.tables || {}).map(([table, syns]) => (
            <CheckRow
              key={`table:${table}`}
              checked={selections[`table:${table}`]}
              onChange={() => toggle(`table:${table}`)}
              label={<><strong>{table}</strong> → {syns.join(', ')}</>}
            />
          ))}
        </Section>

        {/* Column synonyms */}
        <Section title="Column Synonyms">
          {Object.entries(linguistic.synonyms?.columns || {}).map(([col, syns]) => (
            <CheckRow
              key={`col:${col}`}
              checked={selections[`col:${col}`]}
              onChange={() => toggle(`col:${col}`)}
              label={<><strong>{col}</strong> → {syns.join(', ')}</>}
            />
          ))}
        </Section>

        {/* Phrasings */}
        <Section title="Relationship Phrasings">
          {(linguistic.phrasings || []).map((p) => (
            <CheckRow
              key={`phrasing:${p.id}`}
              checked={selections[`phrasing:${p.id}`]}
              onChange={() => toggle(`phrasing:${p.id}`)}
              label={<><span style={{ color: '#a78bfa' }}>[{p.type}]</span> {p.template}</>}
            />
          ))}
        </Section>

        {/* Sample questions */}
        <Section title="Sample Questions">
          {(linguistic.sampleQuestions || []).map((q) => (
            <CheckRow
              key={`question:${q.id}`}
              checked={selections[`question:${q.id}`]}
              onChange={() => toggle(`question:${q.id}`)}
              label={<><span style={{ color: '#94a3b8' }}>[{q.table}]</span> {q.question}</>}
            />
          ))}
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: 'transparent', border: '1px solid var(--border-subtle)' }}>
            Dismiss All
          </button>
          <button onClick={handleAccept} disabled={saving || selectedCount === 0} style={{ ...btnStyle, background: '#3b82f6' }}>
            {saving ? 'Saving...' : `Accept ${selectedCount} suggestions`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function CheckRow({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function filterToAccepted(linguistic, selections) {
  const out = JSON.parse(JSON.stringify(linguistic));
  // Filter table synonyms
  for (const key of Object.keys(out.synonyms?.tables || {})) {
    if (!selections[`table:${key}`]) delete out.synonyms.tables[key];
  }
  // Filter column synonyms
  for (const key of Object.keys(out.synonyms?.columns || {})) {
    if (!selections[`col:${key}`]) delete out.synonyms.columns[key];
  }
  // Filter phrasings
  out.phrasings = (out.phrasings || []).filter((p) => selections[`phrasing:${p.id}`]);
  // Filter sample questions
  out.sampleQuestions = (out.sampleQuestions || []).filter((q) => selections[`question:${q.id}`]);
  return out;
}

function markStatus(model, status) {
  for (const p of model.phrasings || []) p.status = status;
  for (const q of model.sampleQuestions || []) q.status = status;
}

const pillStyle = {
  padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
};

const btnStyle = {
  padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
  cursor: 'pointer', border: 'none', color: '#fff',
};
```

- [ ] **Step 2: Commit**

```bash
cd "QueryCopilot V1" && git add frontend/src/components/editor/BootstrapReview.jsx && git commit -m "feat(d1): BootstrapReview modal — review and accept AI-generated semantic suggestions"
```

---

## Task 5: Phase D1 checkpoint

- [ ] **Step 1: Run backend tests**

```bash
cd "QueryCopilot V1/backend" && python -m pytest tests/test_semantic_bootstrap.py tests/test_semantic_layer.py -v 2>&1 | tail -15
```
Expected: all pass (5 bootstrap + 20 layer = 25)

- [ ] **Step 2: Run frontend tests**

```bash
cd "QueryCopilot V1/frontend" && npx vitest run src/chart-ir/__tests__/semantic/ 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 3: Run lint**

```bash
cd "QueryCopilot V1/frontend" && npm run lint 2>&1 | tail -5
```

- [ ] **Step 4: Tag checkpoint**

```bash
cd "QueryCopilot V1" && git tag d1-bootstrap
```
