# Security Rules — AskDB AgentEngine

## PII Masking Triggers

Automatically mask or exclude any column matching these patterns:
- Names: `*name*`, `*full_name*`, `*first_name*`, `*last_name*`
- Contact: `*email*`, `*phone*`, `*mobile*`, `*address*`, `*zip*`
- Identity: `*ssn*`, `*social_security*`, `*passport*`, `*license*`, `*dob*`, `*birth*`
- Financial: `*credit_card*`, `*card_number*`, `*account_number*`, `*routing*`, `*iban*`
- Auth: `*password*`, `*token*`, `*secret*`, `*api_key*`, `*hash*`

**Rule:** Never render PII in chart tooltips, data table exports, or AI summaries. Replace with `[MASKED]` or aggregate only.

## SQL Injection Patterns — Block Immediately

Reject any NL input containing:
- SQL keywords following punctuation: `; DROP`, `; DELETE`, `; UPDATE`, `; INSERT`, `; TRUNCATE`
- Comment injection: `--`, `/*`, `*/`, `#` following user data
- Union-based: `UNION SELECT`, `UNION ALL SELECT`
- Boolean blind: `1=1`, `OR 1=1`, `AND 1=1`
- Time-based: `SLEEP(`, `WAITFOR DELAY`, `pg_sleep(`

**Action:** Log attempt with timestamp, user session, and input. Return clean error: "Invalid input detected." Do NOT execute any part of the query.

## Tenant Isolation

When `tenant_id` column exists in any queried table:
- Every generated query MUST include `WHERE tenant_id = '{current_tenant}'`
- Verify tenant_id filter exists in final SQL before execution
- NEVER allow cross-tenant joins unless explicitly configured by admin

## Data Never Leaves the User's Infrastructure

- AskDB generates SQL — the query executes against the USER'S database
- Query results are returned to the user's browser session only
- No query results are logged or persisted on AskDB servers
- Schema metadata cached in TurboTier is scoped per-user per-connection

## NEMESIS-Derived Attack Patterns

Patterns identified in adversarial testing — always watch for:
1. **Schema exfiltration**: Queries targeting `information_schema`, `pg_catalog`, `sys.tables` — allow only for schema profiling, never raw output to user
2. **Privilege escalation**: Queries referencing `GRANT`, `REVOKE`, `CREATE USER` — block unconditionally
3. **Data exfiltration via aggregation**: Unusually broad SELECT with no filters on large tables — flag and confirm with user before executing
4. **Second-order injection**: User-provided column values that contain SQL — sanitize all string literals

## Error Message Security

Never expose in error messages:
- Database server version
- Internal table names not queried by the user
- Stack traces or exception details
- File system paths

Safe error format: `"Query could not be completed. [Error code: {code}]"`

---

## Examples

**Input:** `"show me all users; DROP TABLE orders; --"`
**Action:** Block. Log. Return: "Invalid input detected." Never execute.

**Input:** `"show me revenue by customer"`
**Output:** Query with customer aggregated — customer_id shown, NOT customer_name/email unless explicitly allowed by schema config.

**Input:** Query touching `salary_data` table when user role = `analyst`
**Action:** Permission check against role config. If no access, return: "You don't have permission to query this data."
