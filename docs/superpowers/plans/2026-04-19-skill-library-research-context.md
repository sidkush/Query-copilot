# Skill Library Integration — Research & Audit Context

> **Purpose:** Single source of truth for the 2026-04-19 audit + web research that drives the three-plan skill-library integration series. Plan 1 (`2026-04-19-skill-library-content-foundation.md`) already uses this doc. Plan 2 + Plan 3 (to be authored via scheduled tasks) MUST re-read this before writing tasks — it prevents re-doing the audit or fabricating facts.

**Date:** 2026-04-19
**Author:** initial session (pre-Plan 1 authoring)
**Scope covered by this doc:** codebase audit, skill-file audit, NL-to-SQL + RAG research, visualization research, gap analysis, proposed architecture.

---

## 1. Codebase audit — what AskDB already has

Verified by direct reads of `backend/` files on 2026-04-19. Every claim below has a file:line citation.

### 1.1 System prompt assembly

- `backend/agent_engine.py:1620-1755` — `_build_system_prompt()` is the central prompt-composition function. Stacks (in order): base `SYSTEM_PROMPT` (lines 682-720, ~40 lines of workflow + execution rules + response formatting), dashboard capability reminder (gated on `FEATURE_AGENT_DASHBOARD`), analyst-tone paragraph (gated on `FEATURE_ANALYST_TONE`, sourced from `behavior_engine.detect_domain()` + `get_analyst_tone()`), user-selected persona (gated on `FEATURE_PERSONAS`), style-matching instructions (gated on `FEATURE_STYLE_MATCHING`), prefetch context, semantic-layer context, chart-type context, dialect hints (below), voice-mode block, ML-engine block, progress block, plan block.
- `backend/query_engine.py` — non-agent path also assembles a system prompt for the single-shot NL-to-SQL flow. Injection points mirror the agent path.

### 1.2 Dialect awareness (hardcoded)

- `backend/agent_engine.py:645-680` — `DIALECT_HINTS` dict keyed on `db_type.lower()`. Covers only 5 dialects: `bigquery`, `snowflake`, `mysql`, `mssql`, `postgresql`. Missing: sqlite, mariadb, cockroachdb, redshift, databricks, clickhouse, duckdb, trino, oracle, sap_hana, ibm_db2, supabase (12 more supported by `DBType` enum in `config.py`).
- Injection at line `agent_engine.py:1687-1691` — dict lookup, joined as bullets into system prompt.

### 1.3 ChromaDB / RAG

- 3 per-connection namespaced collections (seen in `query_engine.py:168-180` + `query_memory.py`):
  - `schema_<conn_id>` — table DDL + metadata
  - `examples_<conn_id>` — user-confirmed SQL examples (positive feedback only)
  - `query_memory_<conn_id>` — anonymized SQL intent summaries (Tier 1 MemoryTier cache)
- **Embedding model:** pure-Python 384-dim n-gram hash (no ML deps). Fast (~5-10 ms per embed) but weaker than transformer-based embeddings. Lives in the ChromaDB client config.
- `query_memory.py:390` — `find_similar(conn_id, question, threshold=0.75)` returns best match above threshold.
- `query_memory.py:479` — `boost_confidence()` +0.1 per re-hit, capped at 1.0.
- **No hybrid retrieval (BM25 + dense), no reranker, no contextual-retrieval prefix, no quantization.**

### 1.4 Feedback loop — asymmetric (positive only)

- `backend/routers/query_routes.py:435-451` — `POST /api/queries/feedback` endpoint.
- `backend/query_engine.py:735` — `record_feedback(question, sql, is_correct)`:
  ```python
  def record_feedback(self, question: str, sql: str, is_correct: bool) -> None:
      if is_correct:
          self.add_example(question=question, sql=sql, description="User-confirmed correct query")
  ```
- Only positive feedback is stored. **User corrections are discarded.** There is no correction queue, no human review, no shadow mode, no golden eval. This is the single biggest gap for a self-learning system.

### 1.5 Domain detection (already works, underused)

- `backend/behavior_engine.py:193` — `detect_domain(schema_info: dict) -> str`. Pattern-scored over table + column names. Returns one of `sales | product | finance | marketing | ecommerce | hr | operations | iot | general`. Already returns non-`general` for typical schemas.
- `behavior_engine.py:216` — `get_analyst_tone(domain)` returns a tone paragraph. Used only to compose the persona block, NEVER to route skills.
- **Integration hook:** domain skill routing can reuse this existing function with zero new code.

### 1.6 6-layer SQL validator (code-verified)

`backend/sql_validator.py:61-150`:
1. Empty + multi-statement check (line 63) — rejects empty, rejects semicolons.
2. Keyword blocklist (line 70) — regex `\b` word-boundary vs `BLOCKED_KEYWORDS` (force-appended set: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, MERGE).
3. Dangerous-function scan (line 76) — substring check for pg_sleep, load_file, dblink, copy, etc.
4. sqlglot AST parse (line 81) — dialect-aware; rejects syntax errors + multi-statements.
5. SELECT-only enforcement (line 91) — walks AST; rejects INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/GRANT/MERGE anywhere including subqueries.
6. Table allowlist (line 104, optional when `SQL_ALLOWLIST_MODE=true`).
Plus OFFSET sanitization (line 112) and LIMIT capping (line 128, ceiling 50K).

### 1.7 15 agent tools

From `backend/agent_engine.py` `TOOL_DEFINITIONS`:
- **6 core:** `find_relevant_tables`, `inspect_schema`, `run_sql`, `suggest_chart`, `ask_user`, `summarize_results`.
- **9 dashboard (gated on `FEATURE_AGENT_DASHBOARD`):** `list_dashboards`, `get_dashboard_tiles`, `create_dashboard_tile`, `update_dashboard_tile`, `delete_dashboard_tile`, `create_custom_metric`, `create_section`, `move_tile`, `rename_section`, `set_dashboard_mode`, `set_dashboard_theme`.
- Plus ML tools in ML mode: `ml_analyze_features`, `ml_train`, `ml_evaluate`.

### 1.8 Clean integration hooks (5 identified)

1. `agent_engine._build_system_prompt()` lines 1620-1755 — append skill-retrieved content here.
2. `DIALECT_HINTS` dict line 645 — replace with skill-library lookup.
3. `QueryEngine._retrieve_examples()` line 780 — filter by domain tag for ranking.
4. `QueryEngine._retrieve_schema()` line 750 — inject evidence packet.
5. `waterfall_router.build_default_router()` + `agent_routes.py:142` — parallel skill retrieval with schema fetch.

---

## 2. Skill files audit (current state on 2026-04-19)

**Actual count:** 37 skill files + 1 `MASTER_INDEX.md`. MASTER_INDEX states `Files: 33` — **stale by 4**.

### 2.1 Directory layout

```
askdb-skills/
├── MASTER_INDEX.md
├── core/        (6 files)  — security, identity, confirmation, error, query-lifecycle, chromadb-retrieval
├── sql/         (11 files) — schema-profiling, join, aggregation, time, null, window, ambiguity, calculation, perf-optim, validation, data-types
├── visualization/ (7 files) — chart-selection, aesthetics, layout-patterns, insight-gen, chart-formatting, color-system, vizql-capabilities
├── agent/       (6 files)  — dashboard-build, multi-step-planning, voice, session-memory, context-compaction-teach-by-correction, screenshot-interpretation
├── dialects/    (3 files)  — bigquery, snowflake-postgres-duckdb, mysql-sqlserver-redshift-databricks
└── domain/      (4 files)  — sales, product-finance-marketing-ecommerce, hr-operations, iot-timeseries
```

### 2.2 Top 5 redundancies (audit finding)

1. Dialect files — 40% overlap between `dialect-snowflake-postgres-duckdb.md` and `dialect-mysql-sqlserver-redshift-databricks.md` (shared syntax tables).
2. NULL handling ↔ aggregation rules — 35% overlap on "NULL in aggregations" section.
3. Color system ↔ dashboard aesthetics — 32% overlap on palette content.
4. Context-compaction ↔ session-memory — 35% overlap (separate concerns conflated into one file).
5. Domain metric defs — domain-sales and domain-product-finance-marketing-ecommerce both define revenue, conversion, AOV independently.

### 2.3 Top 5 content gaps (audit finding)

1. **LLM error recovery** — no file covers API rate limits, circuit breaker, token-limit recovery.
2. **Data quality / trust scoring** — no explicit rules for flagging unreliable results (NULL %, cardinality mismatch).
3. **Streaming & progressive results** — no guidance on SSE cadence, cancellation, sampled previews.
4. **Accessibility (WCAG 2.2)** — only colorblind mentioned; nothing on contrast ratios, alt-text, keyboard nav.
5. **Batch query optimization** — no parallel-vs-serial rules for multi-tile dashboard builds.

### 2.4 File-quality scorecard (audit sample — for calibration, auditor is somewhat harsh)

- **Strong (examples-dense, actionable rules):** join-intelligence, aggregation-rules, time-intelligence, sql-validation-rules, chart-selection, dashboard-aesthetics, insight-generation, color-system, chart-formatting, error-handling, security-rules, window-functions, null-handling, ambiguity-resolution, domain-iot-timeseries, screenshot-interpretation, dashboard-build-protocol.
- **Adequate:** multi-step-planning, session-memory-protocol, voice-interaction-patterns, confirmation-thresholds, dialect-bigquery, dialect-snowflake-postgres-duckdb, schema-profiling, data-types-and-subqueries, domain-sales, domain-product-finance-marketing-ecommerce, dashboard-layout-patterns, performance-optimization, query-lifecycle-budget, vizql-capabilities-progressive-disclosure.
- **Thin (per auditor, but spot-checks show agent-identity is actually decent — treat this tier with skepticism):** agent-identity-response-format, chromadb-retrieval-integration, dialect-mysql-sqlserver-redshift-databricks, domain-hr-operations, calculation-patterns.

---

## 3. Research findings (2025-2026 state of the art)

### 3.1 NL-to-SQL + agent skill libraries — sources + rules

**Primary sources (saved URLs):**
- [AutoLink arXiv 2511.17190](https://arxiv.org/html/2511.17190) — schema-linking recall 91.2%, EX 34.9% on Spider 2.0-Lite
- [SQL-of-Thought arXiv 2509.00581](https://arxiv.org/abs/2509.00581) — multi-agent decomposition
- [SEED evidence arXiv 2506.07423](https://arxiv.org/html/2506.07423v1) — evidence generation biggest BIRD lever
- [Anthropic Agent Skills engineering post](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — open standard launched Oct 2025, formalized Dec 2025
- [Claude Skills docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Context Rot analysis](https://www.mindstudio.ai/blog/context-rot-claude-code-skills-bloated-files) — 13-85% reasoning degradation with irrelevant tokens
- [Snowflake-Anthropic partnership](https://www.anthropic.com/news/snowflake-anthropic-expanded-partnership) — Claude-based text-to-SQL > 90% on internal bench
- [Spider 2.0](https://spider2-sql.github.io/)

**Rules extracted:**
1. **Schema-link before drafting.** Dedicated retrieval pass returns candidate tables/columns; reject columns the linker didn't surface.
2. **Evidence hints** — pre-compute + inject join keys, enum values, synonyms, typical filters per table. Single biggest BIRD lever.
3. **Decompose tasks:** schema-link → subproblem ID → NL plan → SQL → self-repair.
4. **Self-consistency vote** on hard queries — N≥3 candidates at varying temps, vote by result-set equivalence.
5. **Guided error taxonomy** (fan-out, wrong JOIN key, missing CAST, dialect mismatch) with per-class repair templates.
6. **Execute-and-repair loop** — on failure pass error class + first 3 rows, not raw stderr.
7. **Two-tier model routing** — Haiku primary, Sonnet on validator failure (matches existing).
8. **Progressive disclosure** — name+description always resident, body on match, scripts on-demand.
9. **Skill frontmatter must be tight** — trigger-oriented description; avoid verbose.
10. **Cap resident skill tokens at <5% of context window.**
11. **Single-responsibility skills** prevent over-triggering.
12. **Archive skills with 30-day zero hit-rate.**
13. **Prefer scripts over prose for deterministic logic** (validators, regex, SQL-AST checks).

### 3.2 RAG optimization — sources + rules

**Primary sources:**
- [Advanced RAG BM25+rerank](https://dev.to/kuldeep_paul/advanced-rag-from-naive-retrieval-to-hybrid-search-and-re-ranking-4km3) — Recall@5 0.816 with rerank vs 0.695 hybrid-only
- [Qdrant Hybrid](https://qdrant.tech/articles/hybrid-search/)
- [Anthropic Contextual Retrieval Cookbook](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide) — ~35% fewer retrieval failures

**Rules:**
1. **Hybrid = BM25 + dense, always.** Pure semantic loses on exact column names + enum literals.
2. **Always rerank top-50 → top-5.** Cross-encoder (bge-reranker-v2, Cohere Rerank 3.5). Biggest single quality lever.
3. **Skip HyDE for schema retrieval.** Schemas need exact token match; HyDE hallucinates column names.
4. **Parent-child chunking for tables.** Child = column description; parent = DDL + sample rows + FK context. Retrieve child, return parent.
5. **Contextual retrieval** — prepend per-chunk summary ("This column tracks X in orders table") before embedding.
6. **Cache embeddings + BM25 index per-connection.** ChromaDB namespacing matches AskDB's current pattern.
7. **Recompute fusion weights (α) quarterly** as schema + query distribution drifts.
8. **Quantize embeddings (int8)** when > 1M vectors; negligible recall loss; skip for < 100k.

### 3.3 Self-learning feedback loops — ICRH hazards + safeguards

**Primary sources:**
- [ICRH Feedback Loops arXiv 2402.06627](https://arxiv.org/html/2402.06627v2) — Pan et al., feedback-loop reward hacking at inference time
- [Self-improving agents guide](https://datagrid.com/blog/7-tips-build-self-improving-ai-agents-feedback-loops)

**Rules:**
1. **Never auto-ingest corrections into live prompt.** Queue for human review.
2. **Tag feedback tiers:** explicit thumbs-up > edited-SQL re-run > implicit accept.
3. **Distribution-shift monitor** on daily action distribution (tables hit, join depth, agg types). Alert on KL divergence spike.
4. **Golden eval set** (200+ NL→SQL pairs, frozen). Re-run on every skill/prompt change. Block > 2% regression.
5. **Shadow mode 48 h** for new skills before promote.
6. **Cap memory influence** at top-3, max 30% of total retrieval weight — prevents echo chamber.
7. **Never optimize on reward model alone** — held-out human-labeled eval required.
8. **Detect self-fulfilling patterns** — same wrong SQL recurring may indicate retrieval surfacing previous wrong answer.

### 3.4 Prompt caching economics (Anthropic 2026)

**Primary sources:**
- [Anthropic Prompt Caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [2026 guide](https://aicheckerhub.com/anthropic-prompt-caching-2026-cost-latency-guide)

**Rules:**
1. **4 breakpoints layout:** (1) system + security + core skills, (2) schema + dialect + domain context, (3) retrieved dynamic skills + compacted memory, (4) conversation + latest turn.
2. **1-hour TTL** on breakpoints 1 + 2 (schema changes rarely); **5-minute TTL** on breakpoint 3 (per-turn churn).
3. **Break-even = 1 hit for 5-min, 2 hits for 1-hour.** Below: caching costs more.
4. Min cache size: 1024 tokens Sonnet/Opus; 2048 tokens Haiku. Pad with FK graph / sample rows.
5. Target cache-read ratio on repeat session: ≥ 0.60. Below: breakpoint layout broken.
6. **Don't cache PII** — masked content only.
7. BYOK workspace isolation (Feb 2026) — caches don't cross tenants. Budget per-user.
8. Rotating model ID invalidates breakpoint 1. Do not hot-swap models mid-session.

### 3.5 SQL dialect gotchas (12 specific)

**Primary sources:**
- [BigQuery from Snowflake migration](https://cloud.google.com/bigquery/docs/migration/snowflake-sql)
- [Daasity BigQuery syntax](https://www.daasity.com/post/bigquery-sql-syntax)
- [Retool dates across dialects](https://retool.com/blog/formatting-and-dealing-with-dates-in-sql)

**The 12 specific rules:**
1. **Date truncation:** PG/Snowflake `DATE_TRUNC('month', d)`; BigQuery `DATE_TRUNC(d, MONTH)` (args reversed, unit unquoted); MySQL has no DATE_TRUNC — use `DATE_FORMAT(d,'%Y-%m-01')`.
2. **Date arithmetic:** PG `d + INTERVAL '1 day'`; Snowflake `DATEADD(day,1,d)`; BigQuery `DATE_ADD(d, INTERVAL 1 DAY)`; MySQL `DATE_ADD(d, INTERVAL 1 DAY)`.
3. **Timezone:** BigQuery TIMESTAMP always UTC (no TZ split); PG has both `TIMESTAMPTZ` + `TIMESTAMP`.
4. **NULL coalesce:** Use `COALESCE` everywhere; `NVL` is Oracle/Snowflake only — not in BigQuery.
5. **String concat:** PG/Snowflake `||` or `CONCAT`; BigQuery `CONCAT` only (`||` errors); MySQL `CONCAT` only (`||` is OR).
6. **Quoted identifiers:** PG/Snowflake `"col"`; BigQuery/MySQL backtick. Snowflake default-uppercases unquoted; PG lowercases.
7. **QUALIFY:** BigQuery/Snowflake support `QUALIFY` on windows; PG/MySQL need subquery.
8. **GROUP BY strictness:** PG/BigQuery/Snowflake require every non-aggregated SELECT col in GROUP BY; MySQL with `ONLY_FULL_GROUP_BY` off permits "any value" → LLMs generate non-portable SQL.
9. **Window NULL handling:** BigQuery/Snowflake support `IGNORE NULLS`/`RESPECT NULLS` on `LAG/LEAD/FIRST_VALUE`. PG 16+ yes; older PG no.
10. **DOW (day-of-week):** PG `EXTRACT(dow)` 0=Sun; BigQuery `EXTRACT(DAYOFWEEK)` 1=Sun; Snowflake `DAYOFWEEK` 0=Sun by default but configurable.
11. **Integer division:** PG/Snowflake int/int = int; BigQuery returns float. Cast explicitly.
12. **LIMIT vs TOP vs FETCH:** Snowflake/PG/BigQuery/MySQL all support `LIMIT`; SQL Server uses `TOP` / `FETCH NEXT`.

### 3.6 Join correctness — sources + rules

**Primary sources:**
- [Aggregation consistency errors arXiv](https://arxiv.org/pdf/2307.00417) — top-4 LLM SQL errors
- [Databrain LLM SQL eval](https://www.usedatabrain.com/blog/llm-sql-evaluation)
- [Timbr knowledge graphs for SQL](https://medium.com/timbr-ai/llms-write-bad-sql-heres-how-knowledge-graphs-fix-it-4341debbd1d1)

**Rules:**
1. **Never SUM after a many-to-many join** without pre-aggregating one side. Detect: fact → fact or fact → bridge → fact. Rewrite as CTE.
2. **Explicit FK graph in schema context.** Don't let LLM guess join keys — inject `orders.customer_id = customers.id` as evidence.
3. **Prefer star-schema joins (fact ↔ dimension).** Fact ↔ fact needs disambiguation or shared dimension.
4. **Detect bridge tables** (2 FKs, no measures) — require GROUP BY on both sides.
5. **Post-exec row-count sanity:** result > 10× source → flag fan-out.
6. **Left vs inner default:** LEFT from fact to dimension preserves fact grain; INNER between dimensions fine.
7. **Semi-join for existence** — "customers who bought X" → `WHERE EXISTS`, not INNER JOIN.
8. **Cardinality tagging** — every FK as 1:1 / 1:N / N:M in metadata; refuse N:M joins without explicit aggregation directive.

### 3.7 Time intelligence correctness — sources + rules

**Primary sources:**
- [Tableau YTD/PYTD LOD](https://vizzendata.com/2019/02/03/fun-with-date-calculations-dynamic-ytd-and-prior-year-comparisons/)
- [Tableau fiscal year](https://www.encorebusiness.com/blog/measure-fiscal-year-tableau/)
- [InterWorks YoY guide](https://interworks.com/blog/rteufel/2019/07/11/the-ultimate-guide-to-year-over-year-comparisons-in-tableau/)

**Rules:**
1. **Anchor to reference date consistently.** Never mix `NOW()` and `CURRENT_DATE` in same query.
2. **YTD** = Jan 1 of year(ref) to ref. **PYTD** = same day/month prior year; clamp Feb 29 → Feb 28 on leap years.
3. **Fiscal year** requires `fiscal_year_start_month` parameter. Never assume calendar.
4. **Period-over-period:** prior window = same length ending the day before current-period start.
5. **WoW/MoM/YoY pattern:** `LAG(metric) OVER (ORDER BY period)` + `(curr-prior)/NULLIF(prior,0)`. Always `NULLIF` denominator.
6. **QTD:** derive via `DATE_TRUNC('quarter', ref)`; don't hardcode quarter months.
7. **Rolling N-day:** `BETWEEN ref - INTERVAL '29 days' AND ref` for "last 30 days" inclusive.
8. **Date-dim table preferred** over inline math (Tableau/Looker best practice).
9. **Timezone policy declared once** per connection. BigQuery forces UTC — convert at query time if business uses local.
10. **Week starts:** ISO (Mon) vs US (Sun) — never assume. PG `DATE_TRUNC('week',d)` is Mon.

### 3.8 Visualization / dashboard research — sources + rules

**Primary sources:**
- [NN/g Dashboards: preattentive attributes](https://www.nngroup.com/articles/dashboards-preattentive/)
- [Stephen Few — Information Dashboard Design (PDF)](https://public.magendanz.com/Temp/Information%20Dashboard%20Design.pdf)
- [Perceptual Edge formatting + layout](https://www.perceptualedge.com/articles/Whitepapers/Formatting_and_Layout_Matter.pdf)
- [Vega-Lite Composition](https://vega.github.io/vega-lite/docs/composition.html)
- [Vega-Lite Transform](https://vega.github.io/vega-lite/docs/transform.html)
- [Datawrapper log scale](https://www.datawrapper.de/blog/weeklychart-logscale2)
- [Datawrapper axis labels](https://academy.datawrapper.de/article/239-why-datawrapper-does-not-include-axis-labels-for-many-charts)
- [Amanda Cox on chart titles](https://www.datawrapper.de/blog/amanda-cox-bloomberg)
- [Viridis colormap](https://sjmgarnier.github.io/viridis/)
- [Smashing designing for colorblindness](https://www.smashingmagazine.com/2024/02/designing-for-colorblindness/)
- [OkLCH in CSS](https://uploadcare.com/blog/oklch-in-css/)
- [Okay, Color Spaces](https://ericportis.com/posts/2024/okay-color-spaces/)
- [WCAG 2.2 overview](https://www.accessibility.works/blog/wcag-2-2-guide/)
- [Alt-text for charts](https://testparty.ai/blog/alt-text-guide)
- [Information Access Group accessible charts](https://informationaccessgroup.com/making-graphs-and-charts-more-accessible/)
- [Tableau LOD Expressions](https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod.htm)
- [Tableau LOD overview](https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod_overview.htm)
- [Flerlage Twins 20 LOD uses](https://www.flerlagetwins.com/2020/02/lod-uses.html)
- [BANs VizMasters](https://vizmasters.substack.com/p/big-ass-numbers-bans-why-they-belong)
- [Practical Reporting pie slices](https://www.practicalreporting.com/blog/2024/7/25/how-many-slices-can-you-put-in-a-pie-chart)
- [EU Data Viz Guide pie charts](https://data.europa.eu/apps/data-visualisation-guide/guidelines-for-pie-charts)
- [Tooltips in dashboards](https://nastengraph.medium.com/tooltips-in-dashboards-b0200980300d)
- [Innovative Tableau whitespace](https://www.oreilly.com/library/view/innovative-tableau/9781492075646/ch63.html)
- [Metabase chart guide](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/visualization/chart-guide)

**Rules — chart selection:**
1. Single number → BAN with sparkline.
2. 1 numeric over time continuous → line chart, x-axis chronological.
3. 1 numeric across < 8 categories → horizontal bar, sort descending.
4. 1 numeric 8–30 categories → horizontal bar scroll OR top-N + Other.
5. 1 numeric > 30 categories → treemap / packed bubbles / filter UI.
6. Parts of whole ≤ 5 → donut/pie acceptable; > 5 → stacked bar or treemap; never pie > 5.
7. Distribution → histogram / box plot / violin / strip (by n).
8. Correlation 2 numerics → scatter; > 5K points → hex-bin.
9. 3+ numerics → SPLOM / parallel coords / bubble.
10. Geographic → choropleth (rates), graduated symbol (counts). Never choropleth raw counts.
11. Time with gaps → breaks (`defined()`) or dots; no interpolation.
12. Mixed scales → small multiples. **Dual-axis BANNED by NN/g.**
13. **Avoid:** 3D, radar, dual-axis, rainbow for quantitative, stacked bars when comparing non-bottom, donut < 2 or > 6 slices.

**Rules — layout:**
1. Top-left = most important (F-pattern reading).
2. 12-column grid, 16-24 px gutters, tile widths snap to 3/6/9/12.
3. **5-second rule** (NN/g) — not 10. Main message in 5s or fails.
4. Max 5-9 tiles per dashboard.
5. Whitespace 20-30% of canvas.
6. Drill-down: max 2 levels.
7. Filters / legends pinned consistently across pages.

**Rules — color:**
1. Categorical max 7 hues.
2. Sequential: Viridis / Cividis (passes all CVD) or single-hue ramps.
3. Diverging: RdBu / BrBG / PiYG — only when meaningful midpoint.
4. **OkLCH 2024-2026 standard** for custom ramps (perceptually equal steps).
5. Reserve red/green for semantic loss/gain.
6. Dark mode: invert lightness only; cap saturation ~60%.
7. Color is NEVER the sole encoding — pair with shape/label/position.

**Rules — typography + formatting:**
1. **Title = insight, not label** (Cox rule). "Revenue up 12%" beats "Revenue by Quarter."
2. Subtitle = methodology/time/unit.
3. Abbreviate numbers: `Intl.NumberFormat` with `notation: "compact"` (locale-aware, supports lakh/crore `en-IN`).
4. Annotate anomalies directly on chart, not footnote.
5. Title ≤ 70 chars; subtitle ≤ 120.
6. Min text 11 px web, 12 pt print.
7. Y-axis starts at 0 for bars; lines may truncate when 0 meaningless.
8. Log scale when data > 2 orders magnitude.
9. Gridlines horizontal only, light gray, none vertical on time series.
10. Legend top-right ≤ 4 series; inline direct labeling for line charts; omit for single series.
11. Bar sort descending; time chronological; ordinal preserve natural order.
12. Truncate long labels ~20 chars with tooltip.

**Rules — accessibility (WCAG 2.2 AA):**
1. Text ≥ 4.5 : 1 (< 18 pt), ≥ 3 : 1 (≥ 18 pt / 14 pt bold).
2. Non-text UI ≥ 3 : 1 vs background and vs adjacent fills.
3. Focus ring ≥ 2 px, ≥ 3 : 1 contrast.
4. Alt-text: `[chart type] of [metric] by [dim], [timeframe]. [key insight]. Data table below.` ≤ 300 chars.
5. Tabular equivalent beneath every chart (`<table>` + `<caption>`).
6. Keyboard nav: Tab between tiles, arrows within, Enter drill, Esc exit.
7. `prefers-reduced-motion` disables entry animations.
8. Tooltip content in `aria-live="polite"` on focus.

**Rules — Vega-Lite (strengths + workarounds):**
- **Strengths:** layering, faceting, `params` + `selection`, composable transforms.
- **Weaknesses:** > 50K rows inline sluggish → pre-aggregate server-side; no LOD equivalent; bin+agg awkward; no native pivot beyond `fold`; canvas renderer for > 5K marks (SVG slow > 2K).
- Use `timeUnit` + `aggregate` instead of pre-bucketed date strings.
- `url`-based data > inline for > 1 MB.

**Tableau-parity gaps most tools miss:**
1. Calculated fields.
2. **LOD expressions (FIXED / INCLUDE / EXCLUDE)** — implement via SQL windows / CTEs.
3. Table calculations (running total, % of total, rank).
4. **Parameters** — user-controlled scalars wired into filters + titles + reference lines.
5. **Actions** — filter / highlight / URL / parameter / set actions.
6. **Set controls** — user-editable named sets.
7. Reference lines / bands (avg, median, target).
8. Drill path (Year → Quarter → Month → Day).
9. Context filters.
10. Data blending / relationships.

---

## 4. Integration architecture (agreed with user, reference for Plans 2 + 3)

### 4.1 Three-tier skill retrieval

```
[ALWAYS-ON]   Priority-1 core (~5K tok) → system prompt, 1-hour cache
              core/{security-rules,agent-identity,confirmation-thresholds,
                    skill-library-meta,caching-breakpoint-policy}
   ↓
[DETERMINISTIC]  Router logic (~0 ms retrieval)
              dialect: connection.db_type → dialects/dialect-<db>.md
              domain:  behavior_engine.detect_domain() → domain/domain-<d>.md
              (resolved once per session, cached per ConnectionEntry)
   ↓
[DYNAMIC RAG]  Chroma lookup, 1-hour or 5-min cache
              sql/* + visualization/* + agent/* based on intent
              top-k = 3 (max 9 total skills per turn, 20K token cap)
```

### 4.2 Performance budget

| Stage | Target |
|---|---|
| Always-on load | 0 ms (in prompt, cached) |
| Dialect + domain | 0 ms (from ConnectionEntry) |
| Intent classify | < 2 ms (regex) |
| Chroma RAG | 20-40 ms (parallel with schema fetch → 0 added wall-clock) |
| Total added latency | **< 5 ms median** |
| Cold path | ~50 ms (first query of session) |

### 4.3 Token budget

| Component | Tokens | Cached |
|---|---|---|
| Priority-1 core | 5K | 1-hour |
| Dialect | 2-3K | 1-hour |
| Domain | 2-3K | 1-hour |
| Dynamic retrieved (top-3) | 6-9K | 5-min |
| **Per-query total** | **~20K** | mostly hit |
| Headroom for schema/convo/data | **~180K** | ✅ |

### 4.4 Plan-numbered scope

- **Plan 1 (`2026-04-19-skill-library-content-foundation.md`, authored 2026-04-19):** Tier A — 9 new gap-closing files + Tier C — redundancy split + metric glossary extraction. Pure content work.
- **Plan 2 (to be authored by scheduled trigger):** Tier B — updates to the 15 existing skill files with research-derived rules. Pure content.
- **Plan 3 (to be authored by scheduled trigger):** Tier D + E — retrieval infra code (`skill_library.py`, `skill_ingest.py`, `skill_router.py`), prompt injection in `_build_system_prompt`, 4-breakpoint caching layout, correction queue, golden eval harness, shadow mode, distribution-shift monitor.

---

## 5. Ground-truth references (read before any skill work)

These are the authoritative docs — if this research-context disagrees with any of them, **they win**:

- `QueryCopilot V1/CLAUDE.md` — top-level guidance
- `QueryCopilot V1/docs/claude/overview.md` — 4-tier waterfall skeleton
- `QueryCopilot V1/docs/claude/security-core.md` — 11 coding rules, security invariants
- `QueryCopilot V1/docs/claude/arch-backend.md` — backend module map
- `QueryCopilot V1/docs/claude/config-defaults.md` — every numeric constant
- `QueryCopilot V1/docs/claude/constraints-agent-auth.md` — agent + auth rules
- `QueryCopilot V1/askdb-skills/MASTER_INDEX.md` — skill library index (but count is stale — 37 files not 33)
- `QueryCopilot V1/backend/agent_engine.py:1620-1755` — the prompt assembly function
- `QueryCopilot V1/backend/behavior_engine.py:193` — `detect_domain`
- `QueryCopilot V1/backend/sql_validator.py:61-150` — the 6-layer validator

---

## 6. Facts the triggers / future sessions MUST NOT fabricate

If any of these are uncertain, re-verify from ground-truth docs — do NOT invent:

- Model IDs (`claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250514`, `claude-sonnet-4-6`). `.env.example` + `config.py` disagree — see `config-defaults.md`.
- Port numbers (backend 8002 local, 8000 Docker; frontend 5173).
- Token budget limits (see §4.3).
- Skill library file count — 37 as of 2026-04-19, stale in MASTER_INDEX as 33.
- Anthropic Skills open standard frontmatter shape — see `core/agent-identity-response-format.md` current shape + Plan 1's five-key frontmatter contract.
- Validator layer count = 6, exact as listed in §1.6.
- Agent tool count = 15, listed in §1.7.
- Domain detection already exists at `behavior_engine.detect_domain()` — do not re-implement.

---

## 7. Changelog

- 2026-04-19 — initial authoring, Plan 1 published, triggers scheduled for Plan 2 + Plan 3.
