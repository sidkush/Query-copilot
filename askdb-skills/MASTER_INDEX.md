# AskDB Skill Library — Master Index
**Version:** 1.2 | **Files:** 48 | **Collections:** 7
**Built:** April 2026 | **Last updated:** 2026-04-20 (Plan 2 Tier B — research-derived rules for 14 existing files)
**Covers:** BigQuery, Snowflake, PostgreSQL, DuckDB, MySQL, SQL Server, Redshift, Databricks

---

## Quick Reference: File Map

```
askdb-skills/
├── core/                              # Always partially loaded
│   ├── security-rules.md             ★ Priority 1 — always in context
│   ├── agent-identity-response-format.md  ★ Priority 1 — always in context
│   ├── confirmation-thresholds.md    ★ Priority 1 — always in context
│   ├── caching-breakpoint-policy.md  ★ Priority 1 — 4-breakpoint Anthropic caching layout (NEW v1.1)
│   ├── error-handling.md             Priority 2
│   ├── query-lifecycle-budget.md     Priority 2
│   ├── llm-error-recovery.md         Priority 2 — API error taxonomy + repair playbook (NEW v1.1)
│   ├── data-quality-trust-scoring.md Priority 2 — NULL/outlier/cardinality trust score (NEW v1.1)
│   └── chromadb-retrieval-integration.md  (this file's companion — for devs)
│
├── sql/                               # Retrieved on query generation
│   ├── schema-profiling.md           FK inference, cardinality, naming patterns
│   ├── schema-linking-evidence.md    Evidence packet + FK graph + cardinality tags (NEW v1.1)
│   ├── join-intelligence.md          Join types, fan-out, many-to-many, self-ref
│   ├── aggregation-rules.md          COUNT DISTINCT, HAVING, pre-agg, division
│   ├── time-intelligence.md          Period definitions, POP comparison, timezones
│   ├── null-handling.md              NULL semantics, COALESCE, soft deletes
│   ├── window-functions.md           ROWS vs RANGE, LAG/LEAD, top-N per group
│   ├── ambiguity-resolution.md       Metric conflicts, pronouns, negation
│   ├── calculation-patterns.md       MRR, churn, cohort, LTV, funnel SQL
│   ├── performance-optimization.md   Tier selection, anti-patterns, pushdown
│   ├── self-repair-error-taxonomy.md 12 SQL error classes + repair templates (NEW v1.1)
│   ├── sql-validation-rules.md       6-layer validator, what each layer catches
│   └── data-types-and-subqueries.md  Currency, casting, CTEs, EXISTS, recursive
│
├── visualization/                     # Retrieved on chart/dashboard creation
│   ├── chart-selection.md            Decision tree: data shape → chart type
│   ├── dashboard-aesthetics.md       10-second rule, layout hierarchy, color rules
│   ├── dashboard-layout-patterns.md  6 layout templates, grid system, tile sizing
│   ├── insight-generation.md         Summary structure, headlines, anomaly language
│   ├── chart-formatting.md           Axis format, tooltips, labels, annotations
│   ├── color-system.md               All 4 theme palettes with CSS variables
│   ├── accessibility-wcag.md         WCAG 2.2 AA contrast + alt-text + keyboard nav (NEW v1.1)
│   └── vizql-capabilities-progressive-disclosure.md  RSR, 30 calcs, LOD, WebGL
│
├── agent/                             # Retrieved for complex agentic tasks
│   ├── skill-library-meta.md         ★ Priority 1 — retrieval rules + self-consistency + anti-hallucination (NEW v1.1)
│   ├── dashboard-build-protocol.md   5-phase build sequence, quality checklist
│   ├── multi-step-planning.md        When to plan, budget allocation, failure handling
│   ├── voice-interaction-patterns.md  Voice vs text, pronoun resolution, TTS format
│   ├── session-memory-protocol.md    SQLite persistence, resume protocol, preferences
│   ├── session-persistence.md        Split from context-compaction: SQLite + compaction + resume (NEW v1.1)
│   ├── learn-from-corrections.md     Split from context-compaction: ICRH-safe correction queue (NEW v1.1)
│   ├── streaming-progressive-results.md SSE cadence + sampled previews + cancel (NEW v1.1)
│   ├── batch-query-optimization.md   Parallel vs serial + dependency DAG + pool limits (NEW v1.1)
│   └── screenshot-interpretation.md  Layout detection, panel mapping, sketch reading
│
├── dialects/                          # One retrieved per connected DB engine
│   ├── dialect-bigquery.md           QUALIFY, APPROX functions, partition cost
│   ├── dialect-snowflake-postgres-duckdb.md  VARIANT, JSONB, ASOF, PIVOT
│   └── dialect-mysql-sqlserver-redshift-databricks.md  DATE_FORMAT, T-SQL, Delta
│
├── domain/                            # One retrieved per detected data domain
│   ├── domain-sales.md               CRM schema, funnel, pipeline, win rate SQL
│   ├── domain-product-finance-marketing-ecommerce.md  DAU, P&L, CAC, GMV SQL
│   ├── domain-hr-operations.md       Headcount, attrition, MTTR, SLA SQL
│   └── domain-iot-timeseries.md      Downsampling, ASOF, gap detection, anomaly SQL
│
└── shared/                            # Referenced by multiple domain skills (NEW v1.1)
    └── metric-definitions-glossary.md  Canonical revenue/churn/AOV/CAC/LTV/cohort defs
```

---

## Retrieval Trigger Matrix

Use this to decide which collections to query for a given user action:

| User action | Core | SQL | Viz | Agent | Dialect | Domain |
|-------------|------|-----|-----|-------|---------|--------|
| Single NL query | Always | ✅ | — | — | ✅ | ✅ |
| Dashboard build | Always | ✅ | ✅ | ✅ | ✅ | ✅ |
| Chart type change | Always | — | ✅ | — | — | — |
| Voice command | Always | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schema question | Always | ✅ | — | — | ✅ | — |
| Error recovery | Always | ✅ | — | ✅ | ✅ | — |
| Session resume | Always | — | — | ✅ | — | — |
| Screenshot upload | Always | — | ✅ | ✅ | — | — |
| Export request | Always | — | — | — | ✅ | — |

---

## Files by Scenario — Fast Reference

### Scenario: "Show me revenue by region"
Load: `aggregation-rules.md` + `time-intelligence.md` + `chart-selection.md` + dialect file

### Scenario: "Build me a sales dashboard"
Load: `dashboard-build-protocol.md` + `dashboard-layout-patterns.md` + `dashboard-aesthetics.md` + `domain-sales.md` + `chart-selection.md` + dialect file

### Scenario: "Why is this chart wrong?" (user correcting agent)
Load: `aggregation-rules.md` + `null-handling.md` + `sql-validation-rules.md` + `context-compaction-teach-by-correction.md`

### Scenario: Voice command in LiveOps mode
Load: `voice-interaction-patterns.md` + `domain-hr-operations.md` (or ops domain) + dialect file + `chart-formatting.md`

### Scenario: Screenshot uploaded — "Rebuild this Tableau dashboard"
Load: `screenshot-interpretation.md` + `dashboard-build-protocol.md` + `dashboard-layout-patterns.md` + `chart-selection.md`

### Scenario: Complex join failure
Load: `join-intelligence.md` + `schema-profiling.md` + `sql-validation-rules.md` + dialect file

### Scenario: IoT sensor data question
Load: `domain-iot-timeseries.md` + `performance-optimization.md` + `time-intelligence.md` + dialect file

---

## Priority System

```
Priority 1 (ALWAYS in context — small, critical):
  • security-rules.md (~2K tokens)
  • agent-identity-response-format.md (~1.5K tokens)
  • confirmation-thresholds.md (~1.5K tokens)
  Total always-on: ~5K tokens

Priority 2 (Retrieved frequently):
  • aggregation-rules.md
  • null-handling.md
  • chart-selection.md
  • error-handling.md
  • query-lifecycle-budget.md

Priority 3 (Retrieved on specific triggers):
  • Everything else
```

---

## Maintenance Guide

### When to update a skill file:
- **After any production error the skill should have prevented** → Add to Examples section of relevant file
- **After user correction that reveals a new pattern** → Add to Examples + consider generalizing rule
- **After adding a new chart type or tile type** → Update `chart-selection.md` and `vizql-capabilities-progressive-disclosure.md`
- **After adding a new database engine** → Create new dialect file OR extend existing

### How to add a new skill file:
1. Create `.md` file in appropriate collection folder
2. Follow structure: Title → Rules/Guidelines → Examples (mandatory)
3. Run `ingest_skill_library()` to update ChromaDB
4. Add to this index (file map + retrieval trigger matrix)
5. Test retrieval: run 3 queries that should trigger it, verify it's retrieved

### File naming convention:
```
{category}-{topic}.md           # sql/aggregation-rules.md
dialect-{engine}.md             # dialects/dialect-bigquery.md  
domain-{domain}.md              # domain/domain-sales.md
```

---

## Token Budget Reference

| File | Approx tokens | Load cost |
|------|--------------|-----------|
| Always-on core (3 files) | ~5,000 | Every query |
| Typical SQL file | ~2,000–3,000 | Per query |
| Typical viz file | ~2,000–2,500 | Per chart |
| Typical domain file | ~2,000–3,000 | Per session |
| Full library (all 48 files) | ~95,000 | Never load all at once |
| Typical session load (smart retrieval) | ~15,000–20,000 | 4-6 files + always-on |

**Context budget math:**
- Claude context: 200K tokens
- Always-on skills: 5K
- Retrieved skills: 15K
- User conversation: 50K (long session)
- Available for data/schema/results: ~130K ✅

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | April 2026 | Initial release — 33 files, 6 collections |
| 1.1 | 2026-04-19 | Plan 1 Tier A+C: +9 new skills (llm-error-recovery, data-quality-trust-scoring, caching-breakpoint-policy, streaming-progressive-results, batch-query-optimization, skill-library-meta, schema-linking-evidence, self-repair-error-taxonomy, accessibility-wcag), +metric-definitions-glossary (new `shared/` collection), split context-compaction-teach-by-correction → session-persistence + learn-from-corrections. 33 → 48 files, 6 → 7 collections. Existing 37 files retro-backfilled with Anthropic Skills frontmatter + `legacy: true` flag; Plan 2 (Tier B) drops legacy flag per-file as each is brought fully up to the authoring contract. |
| 1.2 | 2026-04-20 | Plan 2 Tier B: Updated 14 existing files with 2025-2026 research-derived rules (§3.1–§3.8 of research-context). **3 dialect** (§3.5 cross-dialect gotchas: DOW indexing, `\|\|`/concat semantics, quoted-identifier casing, GROUP BY strictness, `IGNORE NULLS`, NVL portability, `QUALIFY`, LIMIT/TOP, integer division). **4 SQL** (join-intelligence: cardinality tagging 1:1/1:N/N:M + bridge-table detection + post-exec fan-out sanity; time-intelligence: DOW dialect table + leap-year Feb-29 clamp + ISO vs US week-start + date-dim preference; aggregation-rules: absorbed `COUNT(*) - COUNT(col)` NULL-count pattern; null-handling: trimmed redundant agg section, now semantics-only). **5 visualization** (chart-selection: 5-second rule + dual-axis BAN + pie>5 slices + log-scale >2 orders; dashboard-aesthetics: 5-sec correction + 12-col grid + F-pattern reading + 20-30% whitespace + OkLCH CSS + received theme palettes; color-system: Viridis/Cividis CVD + OkLCH custom ramps + 8% CVD + removed theme palettes; chart-formatting: `Intl.NumberFormat` compact/en-IN lakh + tabular-nums + annotation copy rules; vizql-capabilities: Vega-Lite limitations table + server-side workarounds + renderer mark-count thresholds). **2 agent** (multi-step-planning: schema-link-first decomposition + self-consistency voting N≥3; screenshot-interpretation: confirmed no-op). **1 core** (chromadb-retrieval: fixed embedding-model description + file count, removed re-implemented `detect_domain()` now referencing `behavior_engine.py:193`, added target hybrid BM25+rerank + HyDE warning + contextual retrieval + parent-child chunking as Plan 3 forward-looking). File count: 48 (unchanged). |

---

## Contribution Notes

Every file follows this structure:
```markdown
# [Topic Name] — AskDB AgentEngine

## [Section 1]
[Rules/guidance]

## [Section 2]
[Rules/guidance with SQL examples where applicable]

---

## Examples
[3-5 concrete input → output examples]
```

The **Examples section is mandatory** in every file. This is what makes retrieval work — the embedding model matches user query language to example language, not abstract rule language.
