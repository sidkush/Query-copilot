# AskDB Global Competitiveness — Design Specification

**Branch:** `askdb-global-comp`
**Date:** 2026-04-13
**Status:** Approved
**Target:** Pre-launch, ship complete before demo/investor stage
**Timeline:** ~22 weeks (6 phases, partially overlapping — see phase headers for week ranges)
**Approach:** Arrow-Native Waterfall (Hybrid B+C) — keep waterfall routing concept, rebuild internals to speak Arrow natively end-to-end

## Executive Summary

Transform AskDB from an NL-to-SQL analytics tool into a full-stack data intelligence platform competing with Tableau/Looker (analytics), DataRobot/H2O (ML), and conversational AI assistants (voice). Five interconnected systems built sequentially, shipped together.

**Core thesis:** Zero-copy Apache Arrow pipeline (DataFusion + DuckDB + Polars) enables supercomputer-level speeds on cheap cloud instances. Combined with agent-guided ML and voice interaction, AskDB becomes the only product offering NL analytics + dashboard builder + AutoML + voice — all in one.

**BYOK/BYOM model:** Users bring own API keys. AskDB hosting cost stays at $55-125/mo for 100 users, scaling to $250-550/mo at 1K users. 99%+ margins.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 FastAPI + WebSocket                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │ REST API │  │SSE Agent │  │ Voice WebSocket       │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬────────────┘  │
│       │              │                   │               │
│  ┌────▼──────────────▼───────────────────▼────────────┐  │
│  │          Unified Agent Engine                       │  │
│  │  Query Context │ Dashboard Context │ ML Context     │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │           WaterfallRouter (evolved)                 │  │
│  │  Schema → Memory → Turbo → DataFusion → Live       │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │               Arrow Data Bridge                     │  │
│  │  DuckDB Twin ←→ Arrow RecordBatch ←→ Polars        │  │
│  └──────┬───────────────┬──────────────────┬──────────┘  │
│         │               │                  │             │
│  ┌──────▼──────┐ ┌──────▼───────┐ ┌───────▼──────────┐  │
│  │ Smart Twin  │ │  DataFusion  │ │    ML Engine      │  │
│  │ (3-layer    │ │  (query plan │ │  (AutoML +        │  │
│  │  locality)  │ │  + pushdown) │ │   Polars +        │  │
│  │             │ │              │ │   Celery)         │  │
│  └─────────────┘ └──────────────┘ └──────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │            Celery + Redis (task queue)                ││
│  │  ML training │ Twin sync │ DataFusion jobs            ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
App.jsx (React Router v7)
├── /dashboard    — Dashboard + Agent Panel (dashboard context)
├── /chat         — Chat Page (query context, full-size agent)
├── /ml-engine    — ML Engine + Agent Panel (ML context)    [NEW]
├── /analytics    — DashboardBuilder + Agent Panel
├── /performance  — System Performance Page                  [NEW]
└── All pages: [🎤] Voice Mode toggle                       [NEW]

Shared Components:
├── AgentStepRenderer (unified, context-agnostic)           [REWRITE]
├── AgentPanel (thin wrapper: dock + size + StepRenderer)   [REWRITE]
├── VoiceButton + VoiceIndicator                            [NEW]
└── PerformancePill (query latency badge)                   [NEW]
```

---

## Phase 1: Arrow Data Bridge + Performance UI (Weeks 1-3)

### 1.1 Arrow Bridge Module

**New file:** `backend/arrow_bridge.py`

Single responsibility: convert between Arrow ↔ DuckDB ↔ Polars ↔ pandas (legacy compat).

```python
# Core API
def duckdb_to_arrow(result: duckdb.DuckDBPyResult) -> pa.RecordBatch
def arrow_to_polars(batch: pa.RecordBatch) -> pl.LazyFrame
def arrow_to_pandas(batch: pa.RecordBatch) -> pd.DataFrame  # legacy compat
def arrow_to_json(batch: pa.RecordBatch) -> list[dict]      # API boundary only
def polars_to_arrow(df: pl.DataFrame) -> pa.RecordBatch
```

All tier results flow through this module. JSON serialization happens ONLY at the API response layer (`agent_routes.py`, `query_routes.py`), never inside tiers.

### 1.2 TierResult Evolution

`TierResult.data` changes:

```python
# Before
data: Optional[dict]  # {"answer": str, "columns": list, "rows": list[list]}

# After  
data: Optional[dict]  # {"answer": str, "record_batch": Optional[pa.RecordBatch]}
# JSON columns/rows derived at API boundary via arrow_to_json()
# .to_pylist() helper for backward compat in existing tests
```

### 1.3 PII Masking on Arrow

**Modified file:** `backend/pii_masking.py`

New function `mask_record_batch(batch: pa.RecordBatch) -> pa.RecordBatch`:
- Column-name pattern match on Arrow schema (same patterns as `mask_dataframe`)
- Value scan on Arrow string arrays (regex on `pa.StringArray`)
- Returns new RecordBatch with masked columns
- Falls back to pandas path for edge cases (compound column names requiring row-level inspection)

`BaseTier._apply_masking()` updated to call `mask_record_batch()` when data is Arrow, `mask_dataframe()` when pandas (legacy).

### 1.4 DuckDB Twin Arrow Output

**Modified file:** `backend/duckdb_twin.py`

`query_twin()` changes:
```python
# Before
result = conn.execute(sql).fetchall()
columns = [desc[0] for desc in conn.description]
return {"columns": columns, "rows": result, ...}

# After
arrow_table = conn.execute(sql).fetch_arrow_table()
record_batch = arrow_table.to_batches()[0]  # single batch for <10K rows
return {"record_batch": record_batch, "query_ms": elapsed, ...}
```

### 1.5 Performance UI

**New component:** `PerformancePill.jsx`
- Displayed on every query result
- Shows: tier name, latency, data transfer method, rows scanned
- Format: `⚡ 12ms · Turbo Mode · Arrow zero-copy · 45K rows scanned`

**New route:** `/performance` (or tab within `/analytics`)
- Query latency histogram (ECharts)
- Tier hit distribution pie chart
- Twin sync status per connection
- Active Celery workers + queue depth (for ML, added in Phase 2)

**Enhanced AgentStepFeed:** `tier_hit` step shows Arrow metadata:
```
🟢 Answered from Turbo Mode (8ms) — zero-copy Arrow, 0 bytes serialized
```

### 1.6 Dependencies

```
pyarrow          # already transitive via pandas, pin version
polars           # DataFrame engine
```

### 1.7 Config Additions

```python
# config.py
ARROW_BRIDGE_ENABLED: bool = True          # feature flag for gradual rollout
ARROW_FALLBACK_TO_PANDAS: bool = True      # safety net during migration
PERFORMANCE_TRACKING_ENABLED: bool = True  # collect latency metrics
```

---

## Phase 2: Agent Chat Experience — Claude Code-Style (Weeks 2-5)

*Overlaps with Phase 1 — frontend work starts week 2 while Arrow bridge stabilizes.*

### 2.1 Unified AgentStepRenderer

**Rewrite:** `frontend/src/components/agent/AgentStepFeed.jsx`

Context-agnostic renderer. Renders ANY step type the same way. Backend decides what steps to emit based on context.

**Step type rendering:**

| Step Type | Rendering |
|-----------|-----------|
| `thinking` | Subtle gray italic bubble, 1-2 sentence summary, subtle pulse animation |
| `plan` | Animated checklist — items check off with micro-animation (Framer Motion) |
| `tool_call` | Specific icon + description: "🔍 Scanning 3 tables...", collapsible detail |
| `tier_routing` | Animated tier waterfall — each tier lights up as checked |
| `tier_hit` | Celebration micro-animation: "⚡ Answered in 8ms" |
| `progress` | Smooth animated bar with elapsed/estimated time |
| `result` | Progressive render — table rows slide in, chart animates |
| `ask_user` | Polished inline card with suggested responses |
| `error` | Contextual error card with retry action |
| `ml_progress` | Training progress bars per model with live metrics |
| `ml_evaluation` | Model comparison table + charts |
| `dashboard_action` | "Moving tile 'Revenue KPI' to row 2" with icon |

**UX principles:**
- Never a dead state — always animating or updating
- Collapsible detail — thinking and tool calls collapse by default, expandable
- Time awareness — elapsed time on long operations
- Smooth Framer Motion transitions for step entry/exit

### 2.2 AgentPanel Rewrite

**Rewrite:** `frontend/src/components/agent/AgentPanel.jsx`

Gutted to thin wrapper: docking controls + responsive sizing + `<AgentStepRenderer />` inside. No separate rendering logic.

**Three contexts, one renderer:**

```
AgentStepRenderer (shared)
├── Chat Page — full-width, query context
├── Dashboard Agent Panel — compact, docked, dashboard tool steps
├── ML Engine Agent Panel — compact, docked, ML tool steps
```

### 2.3 Backend SSE Enhancements

**Modified:** `backend/agent_engine.py`

1. **Richer `thinking` steps:** Add `brief_thinking` field — 1-2 sentence summary extracted from Claude's thinking block.

2. **Guaranteed checklist:** Every agent run emits a `plan` step with checklist within first 2 seconds. Dynamic based on context (query vs dashboard vs ML).

3. **Tier routing detail:** `tier_routing` step includes: tiers checked, latency per tier, hit/miss reason.

4. **Progressive result streaming:** `result` step streams rows in chunks (50 at a time) for progressive table rendering.

### 2.4 Store Updates

**Modified:** `frontend/src/store.js`

Agent slice additions:
```javascript
voiceActive: false,
voiceConfig: { sttProvider: 'browser', ttsProvider: 'browser', voiceId: null },
performanceMetrics: { latencyHistogram: [], tierDistribution: {} },
```

---

## Phase 3: Smart Twin + DataFusion (Weeks 4-9)

### 3.1 Smart Twin — 3-Layer Locality

**Modified:** `backend/duckdb_twin.py`

#### Layer 1: Full Local Tables

Tables below threshold copied entirely. No sampling.

```python
FULL_COPY_THRESHOLD = 50_000  # rows

def _should_full_copy(table: str, schema_profile: SchemaProfile) -> bool:
    return schema_profile.row_counts.get(table, 0) <= FULL_COPY_THRESHOLD
```

Fixes broken JOINs on lookup tables (countries, categories, status codes).

#### Layer 2: Query-Pattern-Aware Sampling

Feed `.data/query_patterns/{conn_id}.json` into twin sync:

```python
def _smart_sample_query(table, schema_profile, query_patterns):
    # 1. Find most-queried columns (WHERE clause frequency)
    # 2. Bias sample toward recent dates (if date column in patterns)
    # 3. Increase sample size for high-frequency tables
    # 4. Return sampling SQL with weighted strategy
```

#### Layer 3: Materialized Aggregates

Pre-compute common rollups during twin sync:

```python
def _create_aggregates(conn, tables, query_patterns):
    # Analyze query patterns for GROUP BY frequency
    # Auto-generate aggregate tables:
    #   _agg_{table}_{frequency} (daily, weekly, monthly)
    # Store in twin alongside raw data
    # Schema tier recognizes aggregate questions → routes here
```

**Config additions:**
```python
SMART_TWIN_FULL_COPY_THRESHOLD: int = 50_000
SMART_TWIN_AGGREGATE_ENABLED: bool = True
SMART_TWIN_PATTERN_AWARE: bool = True
```

### 3.2 DataFusion Integration

**New file:** `backend/datafusion_engine.py`

DataFusion replaces `query_decomposer.py` for query optimization. Does NOT replace waterfall routing.

```python
class DataFusionEngine:
    def __init__(self):
        self.ctx = datafusion.SessionContext()
    
    def register_twin(self, conn_id: str, twin_path: str):
        """Register DuckDB twin as DataFusion table provider"""
        
    def register_remote(self, conn_id: str, db_connector):
        """Register remote DB as federated table provider"""
    
    def plan_query(self, sql: str, conn_id: str) -> ExecutionPlan:
        """Build optimized plan — decides local vs pushdown vs hybrid"""
        
    def execute(self, plan: ExecutionPlan) -> pa.RecordBatch:
        """Execute plan, return Arrow results"""
```

**Integration point — LiveTier:**

```python
# waterfall_router.py LiveTier._answer()
# Before: query_decomposer.can_decompose() → manual split → serial execution
# After:  datafusion_engine.plan_query() → parallel execution → Arrow output

class LiveTier(BaseTier):
    async def _answer(self, question, sql, conn_id, ...):
        if settings.DATAFUSION_ENABLED and self._datafusion:
            plan = self._datafusion.plan_query(sql, conn_id)
            if plan.is_optimizable:
                return self._datafusion.execute(plan)  # Arrow RecordBatch
        # Fallback to existing agent loop
        return await self._agent_fallback(question, sql, ...)
```

**Federated pushdown:** `RemoteDBProvider` wraps SQLAlchemy connections (~200 lines). DataFusion pushes heavy aggregations to remote DB, lightweight filtering to local twin.

**Fallback:** If DataFusion plan fails, route to existing `query_decomposer.py`. Feature-flagged via `DATAFUSION_ENABLED`.

### 3.3 Twin Management UI

**Enhanced connection settings — Turbo Mode section:**

```
[Toggle] Enable Turbo Mode

Sync Strategy: ● Smart (recommended)  ○ Full  ○ Minimal

Tables:
┌──────────────┬────────┬──────────┬────────────┐
│ Table        │ Rows   │ In Twin  │ Strategy   │
├──────────────┼────────┼──────────┼────────────┤
│ countries    │ 240    │ 240/240  │ Full copy  │
│ customers    │ 45K    │ 45K/45K  │ Full copy  │
│ orders       │ 1.2M   │ 50K/1.2M │ Smart sample│
│ order_items  │ 8.4M   │ 50K/8.4M │ Smart sample│
└──────────────┴────────┴──────────┴────────────┘

Aggregates: 3 auto-generated
Twin size: 48MB / 500MB limit
Last sync: 2 hours ago  [Refresh]

⚡ Query Coverage: ~87% of queries answerable locally
```

**Agent DataFusion visibility:**

```
🧠 DataFusion planning...
   Strategy: hybrid — aggregate on remote, join locally
   ├── Push to remote: GROUP BY region, SUM(revenue)
   └── Join local: countries lookup (full copy, 240 rows)
   Estimated: 340ms (vs 4.2s full remote scan)

✅ Executed in 287ms — 92% faster than full scan
```

### 3.4 Config Additions

```python
DATAFUSION_ENABLED: bool = True
DATAFUSION_TIMEOUT_MS: int = 5000          # per-provider timeout
DATAFUSION_FALLBACK_TO_DECOMPOSER: bool = True  # safety net
```

### 3.5 Dependencies

```
datafusion        # Apache DataFusion Python bindings
```

---

## Phase 4: ML Engine — Full AutoML Suite (Weeks 8-16)

*Overlaps with Phase 3 — ML module development starts while DataFusion stabilizes.*

### 4.1 Backend Modules

#### `backend/celery_app.py` — Task Queue Configuration

```python
from celery import Celery

celery_app = Celery('askdb')
celery_app.config_from_object({
    'broker_url': settings.CELERY_BROKER_URL,  # redis://localhost:6379/0
    'result_backend': settings.CELERY_RESULT_BACKEND,
    'task_serializer': 'json',
    'task_track_started': True,
    'worker_max_memory_per_child': 512_000,  # 512MB, restart worker after
    'task_queues': {
        'ml_quick': {'exchange': 'ml', 'routing_key': 'ml.quick'},      # <30s tasks
        'ml_training': {'exchange': 'ml', 'routing_key': 'ml.training'}, # long training
        'twin_sync': {'exchange': 'infra', 'routing_key': 'infra.sync'},
    }
})
```

#### `backend/ml_engine.py` — ML Pipeline Orchestrator

```python
class MLEngine:
    def ingest(self, conn_id: str, tables: list[str], target: str) -> pl.LazyFrame:
        """Pull data from DuckDB twin → Arrow → Polars LazyFrame (zero-copy)"""

    def analyze_features(self, df: pl.LazyFrame) -> FeatureReport:
        """Auto-detect types, missing %, correlations, PII exclusion"""

    def prepare(self, df: pl.LazyFrame, config: PrepConfig) -> PreparedDataset:
        """Clean, encode, scale, split. Returns train/test Polars DataFrames."""

    def train(self, dataset: PreparedDataset, models: list[str], task_type: str) -> str:
        """Submit Celery training job. Returns task_id."""

    def evaluate(self, task_id: str) -> EvaluationReport:
        """Retrieve training results, metrics, charts."""

    def predict(self, model_id: str, new_data: pl.DataFrame) -> pl.DataFrame:
        """Run inference with trained model."""
```

#### `backend/ml_feature_engine.py` — Automated Feature Engineering

- Auto-detect column types: numeric, categorical, datetime, text, PII
- PII columns auto-excluded (reuses `pii_masking.py` column-name patterns)
- Missing value strategies: mean, median, mode, drop, forward-fill (time series)
- Encoding: one-hot, label encoding, target encoding (for high-cardinality)
- Scaling: StandardScaler, MinMaxScaler, RobustScaler
- Date feature extraction: day_of_week, month, quarter, is_weekend, days_since
- Text features: TF-IDF (lightweight), sentence-transformers embeddings (NLP tasks)

#### `backend/ml_models.py` — Model Catalog

| Task Type | Models |
|-----------|--------|
| Classification | XGBoost, LightGBM, RandomForest, LogisticRegression, SVM |
| Regression | XGBoost, LightGBM, RandomForest, LinearRegression, ElasticNet |
| Clustering | KMeans, DBSCAN, Hierarchical, GaussianMixture |
| Anomaly Detection | IsolationForest, LocalOutlierFactor, OneClassSVM |
| Time Series | Prophet, statsforecast (AutoARIMA, ETS), XGBoost temporal |
| NLP | sentence-transformers + sklearn classifiers, spaCy NER |

#### `backend/ml_tasks.py` — Celery Training Tasks

```python
@celery_app.task(bind=True, queue='ml_training')
def train_model(self, dataset_path: str, model_config: dict):
    """
    Long-running training task.
    - Streams progress via self.update_state(state='PROGRESS', meta={...})
    - Redis pub/sub for real-time UI updates
    - Saves model to .data/ml_models/{user_hash}/{model_id}/model.joblib
    - Saves metrics to evaluation.json
    """
```

#### `backend/routers/ml_routes.py` — ML API Endpoints

```
POST   /api/v1/ml/ingest             — load data from twin
POST   /api/v1/ml/analyze            — feature analysis
POST   /api/v1/ml/prepare            — data preparation
POST   /api/v1/ml/train              — submit training job (returns task_id)
GET    /api/v1/ml/status/{task_id}   — poll training progress
GET    /api/v1/ml/models             — list trained models for user
GET    /api/v1/ml/models/{model_id}  — model details + metrics
POST   /api/v1/ml/predict            — run inference
POST   /api/v1/ml/tune/{model_id}    — hyperparameter tuning
GET    /api/v1/ml/models/{id}/export — download model (.joblib)
DELETE /api/v1/ml/models/{model_id}  — delete model
```

### 4.2 Agent ML Tools

Added to `agent_engine.py` tool catalog when in ML context:

```
ml_ingest_data       — load data from twin into Polars
ml_analyze_features  — auto-detect types, missing values, correlations
ml_prepare_data      — clean, encode, scale, split
ml_select_models     — recommend models for task type
ml_train             — submit Celery training job
ml_check_progress    — poll training status
ml_evaluate          — compare trained models
ml_predict           — run inference on new data
ml_tune_hyperparams  — grid/random search on best model
ml_export_model      — download trained model
```

### 4.3 Data Flow (Zero-Copy)

```
DuckDB Twin (.duckdb)
  → conn.execute().fetch_arrow_table()        # Arrow RecordBatch
  → pl.from_arrow(arrow_table)                # Polars LazyFrame (zero-copy)
  → feature engineering (Polars lazy ops)     # all lazy, executes on .collect()
  → .to_numpy()                               # for sklearn/xgboost (one copy, unavoidable)
  → model.fit(X, y)                           # training
  → results → Polars → Arrow → JSON           # response
```

### 4.4 ML Model Storage

```
.data/ml_models/{user_hash}/
  ├── {model_id}/
  │   ├── model.joblib            — trained model artifact
  │   ├── metadata.json           — task type, features, metrics, timestamps
  │   ├── feature_config.json     — encoding/scaling pipeline (for inference)
  │   └── evaluation.json         — full metrics, confusion matrix, feature importance
  └── models_index.json           — list of all models for this user
```

Per-user model cap (plan-based): free=3, pro=10, enterprise=unlimited. Auto-purge oldest when exceeded.

### 4.5 Frontend — ML Engine Page

**New route:** `/ml-engine` (protected, with AppLayout sidebar, requires active DB connection with Turbo Mode enabled — ML operates on twin data)

**Layout:** Main workspace (left) + Agent Panel (right, docked, ML context)

**ML-specific visualizations (ECharts):**
- Feature importance — horizontal bar chart
- Confusion matrix — heatmap
- ROC curve — line chart with AUC shading
- Training progress — animated line chart (loss/accuracy per epoch, builds in real-time)
- Cluster visualization — scatter plot with colored groups
- Time series forecast — line chart with confidence bands
- Anomaly detection — scatter with highlighted outliers

**Training animations:**
- Data flowing into pipeline (animated dots/particles)
- Progress bars per model with live accuracy updates
- Epoch counter with loss curve building in real-time
- Model completion celebration micro-animation

### 4.6 Dependencies

```
polars              # already added in Phase 1
scikit-learn        # ML algorithms
xgboost             # gradient boosting
lightgbm            # gradient boosting
prophet             # time series
statsforecast       # AutoARIMA, ETS
sentence-transformers  # NLP embeddings
spacy               # NER, text processing
celery[redis]       # task queue
joblib              # model serialization (included with sklearn)
```

### 4.7 Config Additions

```python
# Celery
CELERY_BROKER_URL: str = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

# ML Engine
ML_ENGINE_ENABLED: bool = True
ML_MAX_MODELS_FREE: int = 3
ML_MAX_MODELS_PRO: int = 10
ML_TRAINING_TIMEOUT_SECONDS: int = 3600    # 1 hour hard cap
ML_WORKER_MAX_MEMORY_MB: int = 512
ML_MAX_CONCURRENT_TRAINING_PER_USER: int = 2
ML_AUTO_EXCLUDE_PII: bool = True           # always True, but explicit
```

---

## Phase 5: Voice Mode — Continuous Conversation (Weeks 14-19)

### 5.1 Backend — WebSocket Endpoint

**New file:** `backend/routers/voice_routes.py`

```python
@router.websocket("/api/v1/voice/ws/{chat_id}")
async def voice_session(websocket: WebSocket, chat_id: str):
    # 1. Authenticate via token in query param
    # 2. Same SessionMemory as text agent
    # 3. Receive text transcripts from browser STT
    # 4. Route through AgentEngine.run() with voice_mode=True
    # 5. Stream steps back via WebSocket (same step format as SSE)
    # 6. Send response text for browser TTS
```

**No server-side STT/TTS by default.** Browser Web Speech API handles both:
- Zero cost to platform and user
- No audio leaves browser (privacy)
- Only TEXT flows over WebSocket

**Premium BYOK voice (optional):**
- STT: OpenAI Whisper API (user's key)
- TTS: OpenAI TTS or ElevenLabs (user's key)
- Configured per-user in voice settings

### 5.2 WebSocket Message Protocol

```json
// Client → Server
{"type": "transcript", "text": "show me revenue by region", "is_interim": false}
{"type": "transcript", "text": "show me reven...", "is_interim": true}
{"type": "cancel"}
{"type": "voice_config", "tts_provider": "browser", "stt_provider": "browser"}

// Server → Client
{"type": "agent_step", "step": {"type": "thinking", "content": "..."}}
{"type": "voice_response", "text": "Here's revenue by region...", "speak": true}
{"type": "listening", "active": true}
```

### 5.3 Agent Voice Adaptation

When `voice_mode=True`, system prompt addition:

```
Respond conversationally and concisely. Lead with the key insight.
Keep responses under 3 sentences when possible.
Always end with a follow-up question to guide the conversation.
Numbers: say "2.4 million" not "$2,400,000".
```

Same agent pipeline, same tools, same security — only response style changes.

### 5.4 Session Continuity

Voice and text share same `chat_id` and `SessionMemory`. Users can:
- Start voice → switch to typing mid-conversation
- Type a question → agent responds with voice
- Close browser → training/queries continue → resume later

WebSocket auto-reconnects with exponential backoff. No state lost.

### 5.5 Frontend — Voice UI

**VoiceButton component** — available everywhere agent exists:
- Chat page: next to text input
- Agent panel (dashboard/ML): in panel header
- Same component, same behavior across all contexts

**Voice-active state:**
- Waveform visualization while listening/speaking
- Interim transcript fades in as user speaks
- TTS indicator while agent speaks
- Interrupt detection: new speech stops TTS immediately

**Voice settings (in Profile):**
```
Input:  ● Browser (free)  ○ Whisper (requires OpenAI key)
Output: ● Browser (free)  ○ OpenAI TTS  ○ ElevenLabs
Voice:  [Alloy ▾]         (premium only)
Auto-listen: [toggle]      Resume after response
Speed:  [1.0x ▾]
```

### 5.6 Dependencies

None additional. Web Speech API is browser-native. Premium voice uses existing BYOK key infrastructure. `websockets` already included via FastAPI/uvicorn.

### 5.7 Config Additions

```python
VOICE_MODE_ENABLED: bool = True
VOICE_WS_MAX_CONNECTIONS_PER_USER: int = 2
VOICE_PREMIUM_STT_PROVIDERS: list = ["whisper"]
VOICE_PREMIUM_TTS_PROVIDERS: list = ["openai_tts", "elevenlabs"]
VOICE_RESPONSE_MAX_CHARS: int = 500        # for TTS cost control
VOICE_INTERIM_DEBOUNCE_MS: int = 300       # debounce partial transcripts
```

---

## Phase 6: Hardening + Launch Prep (Weeks 20-22)

### 6.1 Testing

- Expand pytest suite: Arrow bridge, DataFusion, ML pipeline, voice WebSocket
- Adversarial testing round on new surfaces (ML input validation, voice injection)
- Load testing: concurrent training jobs, WebSocket connections, Arrow throughput
- Security audit: ML model storage permissions, voice transcript handling, Arrow data boundaries

### 6.2 Performance Benchmarking

- Arrow vs legacy path: latency comparison across query types
- DataFusion vs query_decomposer: parallel execution speedup
- Smart twin vs random sampling: query coverage improvement
- ML training: Polars vs pandas data prep speed

### 6.3 Demo Preparation

- Demo dataset with realistic data (customers, orders, support, churn labels)
- Scripted demo flow: NL query → dashboard build → ML training → voice interaction
- Performance page showing real metrics

---

## Security Invariants (Inherited + New)

All existing security invariants preserved. New additions:

| # | Invariant | Module |
|---|-----------|--------|
| S1 | Arrow RecordBatches MUST pass through `mask_record_batch()` before reaching user or LLM | `arrow_bridge.py`, `pii_masking.py` |
| S2 | ML features auto-exclude PII columns (reuses `pii_masking.py` patterns) | `ml_feature_engine.py` |
| S3 | Celery workers run with memory limits. OOM kills worker, not API. | `celery_app.py` |
| S4 | Trained models stored with `0o600` permissions (owner-only) | `ml_tasks.py` |
| S5 | Voice transcripts never persisted to disk. Only processed text in SessionMemory. | `voice_routes.py` |
| S6 | WebSocket auth via token in query param, validated on connect. No anonymous voice sessions. | `voice_routes.py` |
| S7 | DataFusion RemoteDBProvider uses same read-only enforcement as direct queries | `datafusion_engine.py` |
| S8 | ML prediction inputs validated through SQLValidator (if SQL-based) and PII masked | `ml_engine.py` |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| `datafusion-python` binding gaps | Medium | Medium | Feature-flagged. Fallback to `query_decomposer.py`. |
| Polars → numpy copy bottleneck for large ML | Low | Low | DuckDB twin caps at 500MB. Polars chunks if needed. |
| Browser Speech API quality varies | Medium | Low | Works well in Chrome/Edge. Premium BYOK fallback. |
| Long ML training blocks workers | Medium | High | Separate Celery queues. Concurrency caps per plan. Worker memory limits with auto-restart. |
| Smart twin aggregates go stale | Medium | Medium | Refreshed with twin sync. Staleness tracked. ValidationGate checks hash. |
| WebSocket scaling at high concurrency | Low (pre-launch) | High (at scale) | Per-user connection limit. Upgrade to dedicated WS server at 1K+ concurrent. |
| Model produces garbage results | Medium | Medium | Auto train/test split. Minimum metric thresholds. User reviews before deploy. |

---

## Cost Summary

### Development: $0 (all open-source)

### Production Monthly Cost

| Scale | Infra Cost | Revenue (at $20/mo sub) | Margin |
|-------|-----------|------------------------|--------|
| 100 users | $55-125/mo | $2,000/mo | 94-97% |
| 1K users | $250-550/mo | $20,000/mo | 97-99% |
| 10K users | $400-800/mo + BYOC | $200,000/mo | 99.6% |

### User Cost (BYOK)

| Service | Per Query | Per ML Training | Per Voice Minute |
|---------|-----------|-----------------|------------------|
| LLM (Haiku) | ~$0.001 | N/A | ~$0.001 |
| LLM (Sonnet fallback) | ~$0.01 | N/A | ~$0.01 |
| Voice (browser) | Free | N/A | Free |
| Voice (premium) | N/A | N/A | ~$0.02/min |

---

## File Manifest — New and Modified

### New Files

```
backend/arrow_bridge.py              — Arrow ↔ DuckDB ↔ Polars conversions
backend/datafusion_engine.py         — DataFusion query planner + federated pushdown
backend/ml_engine.py                 — ML pipeline orchestrator
backend/ml_feature_engine.py         — automated feature engineering
backend/ml_models.py                 — model catalog + training logic
backend/ml_tasks.py                  — Celery training tasks
backend/celery_app.py                — Celery configuration
backend/celery_worker.py             — worker entry point
backend/routers/ml_routes.py         — ML API endpoints
backend/routers/voice_routes.py      — Voice WebSocket endpoint

frontend/src/pages/MLEngine.jsx      — ML Engine page
frontend/src/pages/Performance.jsx   — System performance dashboard
frontend/src/components/agent/AgentStepRenderer.jsx  — unified step renderer
frontend/src/components/voice/VoiceButton.jsx        — mic toggle
frontend/src/components/voice/VoiceIndicator.jsx     — waveform + status
frontend/src/components/voice/VoiceSettings.jsx      — voice config panel
frontend/src/components/PerformancePill.jsx           — query latency badge
```

### Modified Files

```
backend/waterfall_router.py      — TierResult Arrow output, DataFusion in LiveTier
backend/duckdb_twin.py           — Arrow output, smart sampling, materialized aggregates
backend/pii_masking.py           — mask_record_batch() for Arrow
backend/agent_engine.py          — ML tools, voice_mode flag, richer thinking steps
backend/config.py                — new feature flags + config values
backend/main.py                  — Celery startup, ML router, voice router registration
backend/requirements.txt         — new dependencies
frontend/src/App.jsx             — /ml-engine and /performance routes
frontend/src/store.js            — voice, performance, ML state slices
frontend/src/api.js              — ML and voice API functions
frontend/src/components/agent/AgentPanel.jsx      — thin wrapper rewrite
frontend/src/components/agent/AgentStepFeed.jsx   — delegates to AgentStepRenderer
frontend/src/components/agent/AgentQuestion.jsx   — polished card design
frontend/src/components/AppSidebar.jsx            — ML Engine nav item
```
