# AskDB Grounding Stack v6 — Announcement Draft

> Draft for user review. Not auto-published. Edit before posting.

## Headline

AskDB v6: every answer now grounded in what your database actually contains.

## Lede (2–3 sentences)

We rebuilt how AskDB reasons about your data. Instead of guessing scope from table names, the agent now reads the actual contents of each table — row counts, date ranges, distinct values — and grounds every answer against them. When a question has more than one reasonable meaning, you see the interpretation before the answer arrives and can change it in one click.

## Why it matters (one example, one paragraph)

A beta user asked *"why are casual riders churning from certain stations?"* against a table the previous owner had named `january_trips`. The older agent saw the name, assumed the data was limited to January, and refused the analysis. The table actually held two years of data. v6 catches this four independent ways: the coverage card shows the real date range, the prompt invariant tells the agent not to trust names, the pre-execution validator cross-checks the SQL against the card, and a trust chip on every answer makes the actual coverage visible.

## What's new (bullets, no jargon)

- Every answer carries a trust tag — live, cached-with-staleness, sampled-with-margin, or unverified.
- Ambiguous questions show their interpretation before the answer streams; one-click correction.
- Ten deterministic pre-execution checks catch common SQL mistakes regardless of which model generated the SQL.
- Per-tenant isolation on every cache, namespace, and key.
- Nine regression-test suites run on every deploy.

## What isn't changing

Your SQL still runs read-only through the same six-layer validator. PII masking is unchanged. The generate-then-execute review step is unchanged. Every existing dashboard, connection, and saved query continues to work.

## Availability

Rolling out to all tenants over the coming week. No action required on your end.

## Learn more

- Overview: `docs/grounding-stack-v6/overview.md`
- Admin guide: `docs/grounding-stack-v6/admin-guide.md`
- Migration guide: `docs/grounding-stack-v6/migration-guide.md`
