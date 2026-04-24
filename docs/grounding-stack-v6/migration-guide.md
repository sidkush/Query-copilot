# Grounding Stack v6 — Migration Guide

This document describes how existing AskDB tenants are automatically migrated to v6. No manual steps are required from end users. Admins should read the rollback section before cutover.

## Automatic migrations

### 1. Tenant id assignment (Phase E)

Legacy user profiles lacking a `tenant_id` field have one minted on the first profile read after v6 deploy. The minted UUID is persisted atomically back to `profile.json` via `user_storage.load_profile_with_tenant()`. Existing ChromaDB collections, Turbo twins, and schema caches that were keyed only by user or connection are re-namespaced under the new `(tenant, conn, user)` composite on next write.

Side effect: first query per user after deploy will miss query-memory (new namespace is empty) and re-profile schema (new cache path). Users see a one-time ~500 ms latency bump on the first query only.

### 2. Coverage-card population (Phase B)

Coverage cards populate in the background after schema profiling completes — not blocking the connect endpoint. On the first query after connect, if cards aren't ready, agent prompts omit the `<data_coverage>` block and fall back to schema-only grounding. Cards appear on the next query.

### 3. Embedding format upgrade (Phase A / H14)

All embedder weights now load from the format mandated by H14. Legacy non-safetensors weight files on disk are ignored by the loader; the loader rejects unsafe weight formats outright. There is no in-place conversion — Phase A's migration script `backend/embeddings/migration.py` re-computes vectors from source text under a versioned collection name, so the old and new collections coexist until the migration completes. The cutover is atomic: the query path reads whichever collection name the `embedder_version` tag on each vector points to.

Admins who have customized the embedder (uncommon) must re-export weights in the H14-approved format before the upgrade. The loader's rejection of unsafe weight formats is non-negotiable and logs a `CRITICAL` line with the offending path.

### 4. Semantic registry seeding (Phase D / H12)

The `SemanticRegistry` JSON store is empty on upgrade. No definition conflicts occur. Admins can populate definitions via `backend/semantic_registry.py::register()` after deploy; the intent-echo card will surface registry hits automatically.

### 5. Pinned receipts (Phase D)

New `PinnedReceiptStore` starts empty per session. Any in-flight session at upgrade time continues with an empty receipt pin list; pins accrue on subsequent intent-echo acceptances.

### 6. Trap baselines

Nine baselines ship committed in `.data/*_baseline.json`. The CI workflow `.github/workflows/agent-traps.yml` runs them on every PR. Regressions vs baseline block merge.

## Configuration migration

`.env` files from v5 continue to work. New flags listed in `docs/claude/config-defaults.md` all default to safe on/off values. No `.env` edits are required unless an admin wants to disable a specific Ring or Hardening Band.

PCI/HIPAA mode flags (`FEATURE_PCI_MODE`, `FEATURE_HIPAA_MODE`) are one-way switches per Phase H — once set to True at boot, demo login hard-rejects and audit logging goes synchronous with fsync. Turning these off requires a restart with the flag removed.

## Rollback

- **Code rollback**: `git checkout v5-last` and restart services. Existing v6 ChromaDB collections + Turbo twins + schema caches will be ignored (new namespaces); v5 reads from the pre-v6 namespaces which are preserved on disk.
- **Data rollback**: never required — v6 writes new keys, never overwrites v5 state.
- **Flag rollback**: toggle any `FEATURE_*` off via `.env` + restart. Each Ring is independently disableable.
- **Config rollback**: remove newly added keys; defaults restore.

## Verification after deploy

Run the following to confirm v6 is live:

```bash
cd backend
python -c "
from scope_validator import ScopeValidator, RuleId
from provenance_chip import ProvenanceChip
from tenant_fortress import resolve_tenant_id
print('v6 live:', len(list(RuleId)) == 10)
"
python -m pytest tests/ -v -q | tail -3
python -m tests.run_traps tests/trap_temporal_scope.jsonl ../.data/eval_baseline.json
```

Expected: `v6 live: True`; pytest green; trap suite 10/10.
