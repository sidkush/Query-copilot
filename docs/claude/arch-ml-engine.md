## Scope

AutoML pipeline (6 modules + 2 routers + Celery worker), ingest modes, Arrow bridge, BigQuery perf path. **On-demand** — read when touching ML.

### ML Engine — AutoML Pipeline (`/backend` — 6 modules + 2 routers + Celery)

Optional AutoML subsystem layered onto the same connection model. Polars-native (no pandas in feature engineering — see commit `34a57a5`). Six fixed stages drive both direct training and persisted workflows.

**Modules:**
- `ml_engine.py` — `MLEngine` orchestrator. Methods: `ingest_from_twin()` (pulls DuckDB twin via Arrow zero-copy), `ingest_from_source()` (live DB query bypassing twin sampling — for >50K row training), `ingest_dataframe()`, plus train/evaluate/predict.
- `ml_feature_engine.py` — `detect_column_types()`, `analyze_features()`, `prepare_dataset()`. Handles scaling, power transforms, outlier removal, one-hot/label encoding, custom feature creation. String target columns auto-encoded for classification (LabelEncoder).
- `ml_models.py` — model catalog (`ModelConfig` dataclass). Per-task lists: classification (XGBoost, LightGBM, RandomForest, LogReg), regression (XGBoost, LightGBM, RandomForest), with default hyperparams.
- `ml_pipeline_store.py` — file-based pipeline workflow CRUD with atomic writes. Stages = `["ingest", "clean", "features", "train", "evaluate", "results"]`. Each stage holds `{status, config, output_summary}`.
- `ml_tasks.py` + `celery_app.py` + `celery_worker.py` — Celery async training jobs (worker process separate from FastAPI). Required for long-running training that exceeds request timeouts.
- `arrow_bridge.py` + `datafusion_engine.py` — zero-copy Arrow data movement between DuckDB / Polars / DataFusion. Lets ML pipeline reuse warehouse data without serialization.

**Three ingest modes** (Data Source selector in Training stage):
1. **Twin** — sampled DuckDB replica (fast, capped at twin size)
2. **Sample** — stratified sample from live source via `ingest_from_source(stratify_column=...)`
3. **Full Dataset** — full live source query bypassing twin (`ML_FULL_DATASET_ENABLED`, capped by `ML_MAX_TRAINING_ROWS`). On connector lookup miss, falls back to any active connection for same user (`67397ca`). Errors loudly instead of silent twin fallback when Full Dataset connector unavailable (`3ac69be`).

**PII handling:** `ML_AUTO_EXCLUDE_PII=True` drops PII-flagged columns before training. Uses same masking detection as query path.

**Routers:**
- `ml_routes.py` (`/api/v1/ml`) — direct one-shot endpoints: `POST /train` (synchronous train + persist), `POST /predict`. Gated on `ML_ENGINE_ENABLED`.
- `ml_pipeline_routes.py` (`/api/v1/ml/pipelines`) — workflow CRUD + per-stage manual execution. `update_pipeline` field whitelist must include `data_source` and cached URI fields (`255df79`) — extend whitelist when adding new stage config keys.

**BigQuery perf path** (`db_connector.py`): BigQuery uses `google.cloud.bigquery.Client.query().to_arrow()` (Storage Read API) instead of SQLAlchemy REST — 10–50× faster on >10M row ingests. Requires `google-cloud-bigquery-storage`. ML ingest does column pruning (`SELECT col1, col2 …` not `SELECT *`, commit `1b5e092`) and uses `TABLESAMPLE SYSTEM` with dataset-qualified table names (`4e63c0b`). When extending other warehouses, prefer native Arrow paths over SQLAlchemy.

## See also
- `config-defaults.md` — `ML_*` flags, quotas, timeouts.
- `arch-backend.md` — ML routers layer onto the same `ConnectionEntry` model.
- `security-core.md` — `ML_AUTO_EXCLUDE_PII` drops PII-flagged columns before training.
