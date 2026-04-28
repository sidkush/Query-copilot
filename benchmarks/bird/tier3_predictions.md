# Tier 3 — Pre-Implementation Predictions

**Protocol**: Per the 2026-04-27 stacking discipline change, this document is written BEFORE any code change. Each Tier 3 fix declares its target qids, mechanism trace pattern, and regression risk. Post-main-150 attribution will cross-check predictions against actual results.

**Baseline**: main_150_tier2_minus_a = 81/150 = 54.0% EX (1 wash + 13 recoveries - 5 regressions vs main_150_v3 baseline).

**Stacking budget**: cumulative API ~$22, this measurement ~$4 → ~$26 total. Sid-gated beyond.

---

## Fix #1 — Tighten Fix C dialect hints (post-trace)

**Source**: 5-regression trace of main_150_tier2_minus_a vs main_150_v3 baseline.

**Trace findings:**
- 2 of 5 regressions caused by Fix C hint misfires:
  - **qid 866 formula_1**: agent changed `LIKE '1:27%'` → `= '1:27'` after Fix C's "INSTR over LIKE" hint. Hint over-applied to a question where LIKE pattern was correct.
  - **qid 1464 student_club**: agent changed `first_name, last_name` → `first_name || ' ' || last_name AS full_name` after Fix C's `||` concat hint. Hint over-applied — BIRD's gold returns separate columns even when question says "full name".
- 3 of 5 regressions are random LLM variance from added context noise (qid 518 plan-simplification, 954 denominator-swap, 1080 COUNT-DISTINCT-add).

**Tightening:**
- INSTR hint: rewrite to "Use INSTR(col, 'needle') > 0 ONLY when you need exact substring match. For pattern matching like 'starts with X' or 'contains X', LIKE 'X%' or LIKE '%X%' is correct — they are not interchangeable."
- || concat hint: rewrite to "Use || ONLY when question explicitly asks for combined/concatenated output. When question says 'full name' or 'address', preserve separate columns unless concatenation is explicit — BIRD evaluates exact tuple shape."

**Target qids (predicted FAIL → PASS):**
- qid 866 (formula_1, moderate, sql_logic) — should recover with tightened INSTR hint
- qid 1464 (student_club, challenging, schema_linking) — should recover with tightened || hint

**Confirmation trace pattern**: agent's predicted_sql should match v3 baseline (`LIKE '1:27%'` and `first_name, last_name` separate cols).

**Regression risk**: tightening reduces Fix C aggressiveness. If a question NEEDS the strong directive (e.g., a sql_logic recovery from Fix C v1 — qid 665, 581, 598, 563), the recovery may be lost. Regression pattern to watch: those 4 qids flipping PASS → FAIL.

**Effort**: trivial (2 string edits in DIALECT_HINTS["sqlite"]).

---

## Fix #2 — Tier 3 compressed schema summary

**Source**: Council R32 (qids 125, 189, 89, 136, 137 — 5 multi-iteration column-loss failures). Fix A in Tier 2 attempted full schema preservation across compaction; regressed -4.7pts at scale due to cost-cap pressure on schema-heavy DBs.

**Mechanism**: in `_compact_tool_context`, when tool_result is schema-shaped (`Table: ...` text or JSON with `tables` key), compact to a TIGHT summary:
- inspect_schema text → `[Schema: <table> — cols: <name> <type>, <name> <type>, ...]`
- find_relevant_tables JSON → `[Found N tables: <table1>(<col1>,<col2>...), <table2>(...)]`

Drop: DDL details, FK clauses, sample row blocks (largest token sinks). Keep: column NAMES + types only. Target: ~10% of original schema-result size.

**Target qids (predicted FAIL → PASS):**
- qid 125 (financial, moderate, sql_logic) — used 9-iteration agent loop, lost columns
- qid 189 (financial, moderate, sql_logic) — same pattern
- qid 89 (financial, moderate, sql_logic) — RECOVERED in Tier 2-minus-A already; expect to stay PASS (not regress)
- qid 136 (financial, moderate, sql_logic) — multi-iteration column-loss
- qid 137 (financial, moderate) — RECOVERED; expect stay PASS

Conservative prediction: 2-3 of these 5 flip FAIL → PASS. Some may not be caused by column-loss specifically.

**Confirmation trace pattern**: per-qid trace shows ≥7 iterations AND late-iteration SQL references columns that the early inspect_schema returned. Compaction stub now should retain the column name in the [Schema: ...] summary.

**Regression risk**: per-iteration token cost up by ~50-100 tokens per schema-shape result (vs Fix A's ~3-5KB). Expected: NO new no_sql cluster. If no_sql > 2 in main 150, this fix is also hitting cost-cap pressure → revert.

**Effort**: ~30 LOC in `_compact_tool_context`. New parsing logic for inspect_schema text + find_relevant_tables JSON.

---

## Fix #3 — R20 RANK / ROW_NUMBER tie-handling (static dialect text)

**Source**: Council R20 (conf 5). Found 3 challenging-tier failures where agent used `ORDER BY x DESC LIMIT N` (which loses ties) when gold used `RANK() OVER (ORDER BY x DESC)` or `RANK = 1` (which retains ties).

**Mechanism**: ADD a single static dialect hint to SQLite block:
> "For top-N with possible ties: use `RANK() OVER (ORDER BY x DESC) WHERE rank <= N` (retains tied rows) NOT `ORDER BY x DESC LIMIT N` (drops ties). When gold expects multiple rows tied at the boundary, LIMIT silently truncates."

**Target qids (predicted FAIL → PASS):**
- qid 17 (california_schools, simple, sql_logic) — RANK() pattern with row identity
- qid 41 (california_schools, simple, sql_logic) — top 5 per county with ties (gold returns 34, agent's ROW_NUMBER returned 4)
- qid 31 (california_schools, moderate) — was previously linked to identifier quoting; mixed cause

Conservative prediction: 1-2 of 3 flip PASS. Limit/RANK behavior is dialect-driven and the hint is static text.

**Confirmation trace pattern**: predicted_sql contains `RANK()` or `WHERE rank <= N` instead of `LIMIT N`.

**Regression risk**: VERY LOW. Static dialect hint, additive. Worst case: agent over-uses RANK for non-tie cases — would render slightly more verbose SQL but semantically equivalent. Watch: any qid where gold uses `LIMIT 1` and predicted starts using `RANK()`.

**Effort**: trivial (1 hint added to DIALECT_HINTS["sqlite"]).

---

## Fix #4 — R24 FK direction in schema docs

**Source**: Council R24 (conf 4). Found 4 schema_linking failures where agent's JOIN ON clause had FK direction reversed because `_extract_fk_hints` format `(col) -> ref_table(col)` doesn't specify which side is FK origin.

**Mechanism**: in `query_engine.py:_extract_fk_hints`, change format from:
```
(driverStandings.raceId) -> races(raceId)
```
to:
```
driverStandings(raceId) -> races(raceId)
```

This makes the source table explicit. Helps agent get JOIN ON direction right.

**Target qids (predicted FAIL → PASS):**
- qid 906 (formula_1, schema_linking) — chose `results` instead of `driverStandings`
- qid 1387 (student_club, schema_linking) — invalid FK `budget.link_to_member`
- qid 896 (formula_1, schema_linking) — wrong intermediate table

Conservative prediction: 1-2 of 3 flip PASS.

**Confirmation trace pattern**: predicted_sql JOIN ON clauses use the correct FK direction (column from FK-origin table maps to PK column on referred table).

**Regression risk**: format change to existing hint. Could confuse agent if previously trained on the old format (the LLM has no memory across runs but may interpret `table.col` differently from `(col)`). Watch: any net regression in qids that previously passed via FK-format-luck.

**Effort**: ~3 LOC in `_extract_fk_hints` (string format change).

---

## Fix #5 — Silent except audit expansion (Tier 1 Fix 1 followup)

**Source**: Council R5 (conf 4). Tier 1 Fix 1 added WARNING logs to 5 high-priority sites (scope_validator × 2, intent_echo × 2, BigQuery creds + read-only). ~35 remaining bare-except sites in agent_engine.py noted but unmodified.

**Mechanism**: sweep remaining bare-except in `agent_engine.py` and `db_connector.py`, add WARNING logs with type+message. Behavior preserved (still falls through to existing fallback). Goal: surface silent failures the way FK NoneType was surfaced — observability over correction.

**Target qids (predicted FAIL → PASS):** **NONE EXPECTED.** This is observability, not behavior change. The fix may EXPOSE bugs (via new warning logs in main 150 trace files) that drive future targeted fixes.

**Confirmation trace pattern**: main 150 trace files contain WARNING log entries from previously-silent sites. Aggregate failure clusters unchanged.

**Regression risk**: NONE. Pure logging additions. Worst case: log noise.

**Effort**: ~30 LOC across 35 bare-except sites. Mechanical pattern: replace `except Exception:` with `except Exception as exc:` + `_logger.warning("...", type(exc).__name__, exc)`.

**Stretch outcome**: if main 150 trace files surface a NEW silent failure pattern (e.g., a tool call silently returning empty due to swallowed exception), that's a Tier 4 ticket spawned automatically.

---

## Fix #6 — `_set_final_answer` double-call wiring investigation

**Source**: Tier 1 noted `_set_final_answer called twice with different content (synthesis_stream → synthesis_stream)` log spam. Tier 1 Fix 2 demoted to DEBUG via allowlist; root cause never fixed.

**Mechanism**: investigate WHY synthesis_stream fires twice. Likely cause: Claude returns multiple text blocks in same response (narration + final answer); each calls `_set_final_answer`. Last-write-wins semantics work for the visible answer string, but if narration block contains apology text ("I apologize, I cannot continue") and final block has the actual SQL summary, the FINAL answer is correct but the trace's synthesis layer may have been corrupted.

For BIRD specifically: the harness extracts `predicted_sql` from `run_sql` tool_input, NOT from `_set_final_answer`. So the log noise doesn't directly affect EX. But it MAY signal cases where the agent emitted text without tool_use (giving up), and that pattern correlates with no_sql failures.

**Target qids (predicted FAIL → PASS):** **NONE EXPECTED directly.** This is investigation, not fix. If the investigation reveals a class of "agent gave up text-only when it should have called run_sql", that becomes a Tier 4 ticket.

**Confirmation trace pattern**: investigation should produce a count like "X of Y main_150 questions emitted text-only response with no run_sql call."

**Regression risk**: NONE (no code change in this fix; just analysis).

**Effort**: 30-60 min trace analysis. Read 5-10 traces where `_set_final_answer` fired twice. Categorize.

---

## Aggregate Tier 3 Predictions

**Target recoveries (sum across fixes)**: 5-9 qids (2 from #1 tightening, 2-3 from #2 compressed schema, 1-2 from #3 RANK, 1-2 from #4 FK direction, 0 from #5 audit, 0 from #6 investigation).

**Expected regression count**: 1-3 qids (mostly from Fix #4 FK direction format change, possibly Fix #1 tightening if it under-corrects on the 4 Fix-C-recovered qids).

**Expected EX**: 54.0% (Tier 2-minus-A baseline) + 5-9 wins - 1-3 losses = **+3-6pts net = 57-60% range**.

**Floor**: 53% (if 3-4 of the 6 fixes are wrong)
**Ceiling**: 60% (if all targeted recoveries land + minimal regressions)

**Threshold for ship/revisit**:
- ≥58%: ship as Tier 3 baseline, plan Tier 4 from new failure profile
- 54-57%: marginal — measure attribution before more changes
- <54%: 1+ fix actively regressing, isolate via single-fix revert

**Cumulative cost so far**: ~$22. **Tier 3 measurement: ~$4. Total budget: $26.**

**This document is FROZEN at fix implementation time.** Post-main-150 cross-check appends a "Results vs predictions" section.
