# ChromaDB + pandas Native DLL Segfault — Root Cause & Fix

**Date:** 2026-04-03
**Symptom:** "The onnxruntime python package is not installed. Please install it with pip install onnxruntime in upsert" when connecting to PostgreSQL
**Actual root cause:** Two layered bugs — one in ChromaDB embedding function inheritance, one in Windows native DLL load order between pandas/numpy and ChromaDB's Rust bindings

---

## What the User Saw

Every attempt to connect to a PostgreSQL database from the QueryCopilot UI failed with:
> "The onnxruntime python package is not installed. Please install it with pip install onnxruntime in upsert."

This error appeared during the `/api/connections/connect` flow, specifically when `train_schema()` called ChromaDB's `upsert()`.

---

## Why It Happened — Two Layered Bugs

### Bug 1: `_HashEmbeddingFunction` not recognized by ChromaDB 1.5.5

The codebase had a custom `_HashEmbeddingFunction` in `query_engine.py` — a pure-Python character n-gram embedder designed to **avoid** the onnxruntime dependency. It was a plain callable class:

```python
class _HashEmbeddingFunction:       # ← plain class, not a ChromaDB subclass
    def __call__(self, input: List[str]) -> List[List[float]]:
        ...
```

In **ChromaDB < 1.0**, passing any callable as `embedding_function` worked fine. But `requirements.txt` specified `chromadb>=1.0`, and **ChromaDB 1.5.5** (the installed version) requires the embedding function to inherit from `chromadb.EmbeddingFunction`. When it doesn't, ChromaDB silently falls back to its default ONNX-based embedding model — which requires `onnxruntime`.

Since `onnxruntime` was either not installed or failed to install, the fallback crashed with the error the user saw.

### Bug 2: pandas/numpy + ChromaDB native DLL conflict on Windows

After fixing Bug 1, a **segfault** (Windows access violation) appeared. This was the deeper, hidden bug.

**Root cause:** On Windows with Python 3.10 (Microsoft Store), `pandas` (via `numpy`) loads native C extension DLLs at import time. ChromaDB 1.5.5 uses Rust-based native bindings (PyO3) for its SQLite backend. When pandas/numpy's C extensions are loaded **before** ChromaDB initializes its Rust native code, the DLLs conflict and cause a segfault during `upsert()`.

**Critical finding:** The crash is **import-order dependent**. If ChromaDB initializes first and pandas is imported afterward, everything works. The problem was that `db_connector.py`, `query_engine.py`, and `pii_masking.py` all had `import pandas as pd` at module level. Since Python evaluates all module-level imports when the module is first imported, pandas was always loaded before ChromaDB's `upsert()` ran.

---

## Why It Wasn't an Issue Before

This broke when **ChromaDB was upgraded to >= 1.0** (specifically 1.5.5 was installed). The combination of factors:

1. **ChromaDB 1.5.5** introduced stricter embedding function typing AND switched to Rust-based native bindings (PyO3)
2. **The custom `_HashEmbeddingFunction`** was written for the old ChromaDB API (< 1.0) where any callable worked
3. **pandas at module level** was always there, but it didn't matter with older ChromaDB versions that used pure-Python SQLite or different native code
4. **Windows-specific:** This DLL conflict doesn't reproduce on Linux/macOS where shared library loading works differently

So the upgrade path was: `chromadb < 1.0` (everything works) → `chromadb >= 1.0` (custom EF silently ignored → onnxruntime error) → fix EF inheritance → segfault from DLL conflict that was always latent but never triggered.

---

## Debugging Process — How the Solution Was Found

### Step 1: Identify the onnxruntime error origin
Read `query_engine.py` and saw `_HashEmbeddingFunction` was meant to replace the default ONNX model. Noticed it didn't inherit from `chromadb.EmbeddingFunction`. Also noticed `onnxruntime` was in `requirements.txt` (contradicting the custom EF's purpose). Fixed the inheritance and removed onnxruntime from requirements.

### Step 2: Hit the segfault wall
After fixing Bug 1, the server crashed with a segfault during `train_schema()` → `upsert()`. The onnxruntime error was gone, but now there was a native crash.

### Step 3: Isolate ChromaDB vs. the full app
Tested ChromaDB upsert in isolation (without any project imports) — **worked fine**. Tested inside uvicorn — **segfault**. This proved ChromaDB itself was fine; the conflict was with something else loaded in the process.

### Step 4: Binary search for the conflicting import
Systematically added imports one at a time:
- `psycopg2` + chromadb → OK
- `psycopg2` + `anthropic` + `sqlalchemy` + chromadb → OK
- Added `from db_connector import DatabaseConnector` → **SEGFAULT**
- `db_connector`'s own imports manually replicated → narrowed to `import pandas as pd`
- Just `import pandas` + chromadb upsert → **SEGFAULT**
- Just `import psycopg2` + chromadb upsert → OK (psycopg2 was a red herring)

### Step 5: Test import order hypothesis
Based on the theory that native DLL load order matters:
- ChromaDB upsert FIRST, then `import pandas` → **OK, no crash**
- `import pandas` FIRST, then ChromaDB upsert → **SEGFAULT**

This confirmed the fix: ensure ChromaDB initializes before pandas is loaded.

### Step 6: Lazy-import pandas
Moved `import pandas as pd` from module level to inside the functions that actually use it:
- `db_connector.py` → inside `execute_query()`
- `query_engine.py` → inside `QueryResult.to_dict()`
- `pii_masking.py` → inside `mask_dataframe()`

This ensures that when `main.py` imports all routers (which import query_engine, db_connector, etc.), pandas is NOT loaded. ChromaDB gets to initialize its Rust bindings first. pandas is only loaded later when `execute_query()` or `mask_dataframe()` is called — by which point ChromaDB's native code is already safely initialized.

---

## Files Changed

| File | Change |
|---|---|
| `query_engine.py` | `_HashEmbeddingFunction` inherits `EmbeddingFunction[Documents]`, added `__init__`, pandas lazy-imported |
| `db_connector.py` | pandas lazy-imported inside `execute_query()` |
| `pii_masking.py` | pandas lazy-imported inside `mask_dataframe()` |
| `requirements.txt` | Removed `onnxruntime>=1.16` (no longer needed) |

---

## Verification

Tested end-to-end: started uvicorn, called `/api/connections/connect` with the Supabase PostgreSQL credentials, got back 8 tables with full schema introspection, server stayed healthy. No onnxruntime error, no segfault.

**Why the fix works:** The lazy import ensures ChromaDB's Rust native code initializes in a clean DLL environment. pandas/numpy DLLs are loaded only when query execution needs them — after ChromaDB is already stable.

**One-time cleanup needed:** Delete `.chroma/querycopilot/` once (stale collections from the old broken EF), then restart the backend.
