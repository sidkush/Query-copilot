# VizQL Dialect Emitters (Plan 7d)

`BaseDialect` in `../dialect_base.py` walks `SQLQueryFunction` from Plan 7c.
Each concrete dialect here overrides the 22 `format_*` hooks documented in
`Build_Tableau.md §IV.5`.

## Coverage

| DBType                      | Dialect class        | Notes |
|-----------------------------|----------------------|-------|
| `DUCKDB`                    | `DuckDBDialect`      | First-class; powers Turbo Mode. |
| `POSTGRESQL`, `COCKROACHDB`, `REDSHIFT` | `PostgresDialect`    | Subclasses DuckDB; swaps cast / interval / datediff. |
| `BIGQUERY`                  | `BigQueryDialect`    | Backtick idents; DATE_TRUNC args reversed; SAFE_CAST. |
| `SNOWFLAKE`                 | `SnowflakeDialect`   | Double-quoted case-sensitive idents; DATEDIFF unquoted part. |
| `MYSQL`, `MARIADB`, `SQLITE`, `MSSQL`, `CLICKHOUSE`, `TRINO`, `ORACLE`, `SAP_HANA`, `IBM_DB2`, `DATABRICKS` | — (fallback) | Routed to DuckDB dialect with a single-shot warning. See roadmap Phase 4 follow-ups. |

## Known gaps

- **MDX / DAX** — deferred to Phase 12 Analytics Extensions. `BaseDialect`
  leaves hooks like `FormatSelectMember` / `FormatCurrentMember` /
  `FormatDAXAggregation` unimplemented; add a sibling class when those
  providers land.
- **MSSQL `TOP n`** — MSSQL uses `SELECT TOP n`, not `LIMIT`. Fallback
  dialect emits `LIMIT` which MSSQL rejects. Tracked as a follow-up task.
- **Oracle `FETCH FIRST n ROWS ONLY`** — same as above.
- **LOCKING / ISOLATION** — `format_set_isolation_level` is a stub in
  DuckDB/BigQuery (these engines don't expose transaction isolation that
  the emitter can set). Postgres + Snowflake emit correct syntax.
- **PIVOT / UNPIVOT native syntax** — BaseDialect renders a CASE-based
  rewrite by default. DuckDB + BigQuery + Snowflake all support native
  PIVOT; overriding `format_pivot` is a roadmap follow-up once a PIVOT AST
  node exists (Plan 8 Analytics Pane).

## Security

Every emission goes through `backend.sql_validator.SQLValidator.validate()`
via `backend.vizql.emit_validated()`. Dialect selection does **not**
bypass the 6-layer validator. See `docs/claude/security-core.md`.

## Performance

Target: pure string building, < 10 ms per 200-node plan on a laptop
(`test_vizql_dialect_bench.py`).
