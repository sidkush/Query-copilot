# Grounding Stack v6

## What changed

AskDB now grounds every answer in the actual contents of your database, not the names we see in it. Six defensive layers run between your question and the result:

1. **Coverage cards.** When you connect a database, we profile each table's real row count, real date range, and real distinct values. If a table is called `january_trips` but contains two years of data, we use that two-year range — not the name.

2. **Pre-execution checks.** Before any SQL runs, ten deterministic rules catch name-vs-data mismatches, fan-out inflation, subquery-LIMIT-before-outer-ORDER, timezone drift, soft-delete omissions, negation-as-join, dialect fallthrough, view prefilter masks, absurd selectivity, and unverified expression predicates.

3. **Intent echo.** When a question has more than one reasonable interpretation ("active customers", "churn", "recent"), you see a one-line card with the chosen definition before the answer streams. Pick a different one in one click; your choice is remembered.

4. **Trust chip.** Every answer now carries a tag telling you how it was produced — live, turbo-cached (and how stale), sampled (with margin of error), or unverified-scope.

5. **Tenant isolation.** Every cache, every namespace, every session key now includes an immutable tenant id. Signed-in viewers of a shared dashboard use their own keys, never the owner's.

6. **Continuous measurement.** Nine regression trap suites (~120 parameterized questions) run on every model/embedder/skill change. Regressions surface before users hit them.

## What this fixes

The original failure: a user asked about casual-rider churn. The agent saw a table named `january_trips` and refused, assuming the data was limited to one month. In reality the table held two years of data. The v6 stack makes that class of failure impossible through four independent checks.

## What stays the same

Your SQL still runs read-only through the same six-layer validator. PII masking runs before any data leaves the backend. The two-step query flow (generate → review → execute) is unchanged. Every existing dashboard, saved query, and connection continues to work without migration effort on your part.

## What you'll notice first

- A small trust chip next to each answer.
- Occasional interpretation cards for ambiguous questions.
- Noticeably shorter time-to-first-answer on repeat questions (per-tenant caches now isolate cleanly).
- No behavior change on simple, unambiguous queries.
