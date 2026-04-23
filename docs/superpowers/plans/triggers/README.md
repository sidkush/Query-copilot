# Phase Triggers (F → J)

Each trigger in this directory is a **self-contained session starter**. Paste the full file contents into a new Claude Code session's first message. The session will:

1. Verify prior-phase state by running commands (not trusting the trigger's claims).
2. Read the master plan + prior phase plans before authoring.
3. Invoke the `superpowers:writing-plans` skill.
4. Save a new plan file at the path the trigger specifies.

## Usage order

Triggers must be executed in order because each reads the state produced by the previous phase:

1. `phase-f.md` — Correction Pipeline (P6 + P10 gated + H15)
2. `phase-g.md` — Retrieval Hygiene (P9 skill bundles + query expansion + archival)
3. `phase-h.md` — Hardening Bands H19–H27 + Observability
4. `phase-i.md` — Operations Layer (P11 Alert Manager + Graphify + dashboard)
5. `phase-j.md` — Closeout (P12 docs + changelog + GA announce)

## Anti-drift protocol (shared across all triggers)

Every trigger enforces these invariants so a fresh session cannot hallucinate:

- **Verify, don't assume.** Each trigger starts with a pre-flight block that runs specific shell commands; if any output doesn't match, the session MUST STOP and ask the user, not proceed.
- **Read, don't summarize.** Required files are listed by path. The session must open each file before drafting tasks.
- **Master plan is the north star.** `docs/superpowers/plans/2026-04-22-grounding-stack-v6-master.md` defines Rings + Hardening Bands authoritatively. If the trigger and the master diverge, the master wins.
- **Prior plans are the format template.** Earlier phase plans (A-E) show the exact TDD task granularity and header format to match.
- **If a prerequisite module is missing, stop.** Do NOT re-implement anything from an earlier phase; ask the user to verify that phase shipped.
