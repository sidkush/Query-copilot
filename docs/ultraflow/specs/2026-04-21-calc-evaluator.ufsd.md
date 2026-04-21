# UFSD — Calc Editor Evaluator ("disabled" errors)

## Summary
approach=flag-flip+row-propagation | confidence=7 | session=2026-04-21 | outcome=RESOLVED

## Debug Session 2026-04-21
Decisions:
- Picked H1 (FEATURE_ANALYST_PRO=False default) over H2 (raw-error UI polish): the UI text "sample rows disabled" / "calc evaluate disabled" was verbatim from backend 404 detail; polishing would hide a real feature-gate mismatch.
- Flipped config.py default to True instead of documenting an env override — the frontend `NEW_CHART_EDITOR_ENABLED=True` default already exposes Analyst Pro; backend should match.
- Handled the revealed multi-causal bug (row data lost at onSelectRow boundary) atomically in the same session — same subsystem, same user flow.

Fix summary:
- `config.py:263` FEATURE_ANALYST_PRO default False → True.
- `CalcTestValues.jsx` onSelectRow callback signature changed from `(idx)` → `(idx, rowObject)`; added auto-fire effect that emits the default row once sample data arrives.
- `CalcEditorDialog.jsx` sampleRow setter merges real row fields (not just `__idx`).
- `CalcTestValues.test.jsx` updated to assert the new callback payload.

Assumption outcomes:
- ASSUMPTION: flag should be True for Analyst Pro surface | VALIDATED: yes | IMPACT: drove the fix direction.
- ASSUMPTION: backend error detail is what the UI shows | VALIDATED: yes | IMPACT: proved flag was the root cause, not UI code.
- ASSUMPTION: sample row dict flowed through to evaluator | VALIDATED: no | IMPACT: exposed H3 multi-causal bug.

Unvalidated assumptions (risk items): none.

Cascade paths verified:
- 11 FEATURE_ANALYST_PRO call sites in backend/routers — all flipped by the single config change (Pattern Exhaustion).
- `AnalystProCalcEditorMount` → CalcEditorDialog → CalcTestValues → onSelectRow → CalcResultPreview/CalcDebugPanel — verified via `grep "onSelectRow" frontend/src` (single caller, single callee).
- 17 backend tests gated on FEATURE_ANALYST_PRO — all green post-flip (tests that need the gate CLOSED monkeypatch it explicitly).
