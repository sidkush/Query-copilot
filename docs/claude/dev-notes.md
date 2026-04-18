## Scope

Development workflow notes, reference-document index, graphify knowledge-graph pointer. **On-demand** — read before a non-trivial code change or when you need the journal index.

### Reference Documents (`/docs`)

`PROJECT_JOURNAL.md` — full engineering history (architecture decisions, blockers, resolutions). `DASHBOARD_DEEP_DIVE.md` — detailed dashboard subsystem design. `docs/journal-2026-04-11-adversarial-hardening.md` — adversarial testing journal with root cause analysis, prevention playbook, test coverage map. `docs/ultraflow/specs/UFSD-2026-04-10-adversarial-testing.md` — adversarial testing spec with all findings and verdicts. `docs/` — session journals, design brainstorms, audit reports. Read-only reference, not config.


## Development Notes

- **Adding new router:** create in `routers/`, register via `app.include_router()` in `main.py`, inherit shared security guards (auth dependency, rate limiting).
- When fixing bugs, verify fix end-to-end (run app/tests) — never just check code looks correct.
- When renaming/rebranding, account for string splits across JSX tags (e.g., `Data<span>Lens</span>`), template literals, dynamic string construction.
- Before starting servers, check zombie processes on required ports (e.g., `lsof -i :8002`).
- Full-stack SaaS app (JS frontend + Python backend). Check both sides when changing.

## graphify

Curated knowledge graph at `C:/Users/sid23/knowledge/graphify-out/graph.json` (external to repo). Captures architecture decisions, security model, data flow, design constraints.

Rules:
- If `graphify-out/` exists in repo, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure before answering architecture questions
- If `graphify-out/wiki/index.md` exists, navigate it instead of raw files
- Source knowledge docs at `C:/Users/sid23/knowledge/*.md` — run `/graphify` to rebuild after edits

## See also
- `security-core.md` — "When fixing bugs, verify fix end-to-end" intersects with the coding-rules here.
- `setup.md` — adding a router overlaps with the test-suite conventions.
