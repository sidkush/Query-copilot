"""ML Pipeline workflow routes — CRUD + manual stage execution."""
import hashlib
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import settings
from auth import get_current_user
import ml_pipeline_store as store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ml/pipelines", tags=["ml-pipelines"])


def _hash(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()[:8]


class CreatePipelineRequest(BaseModel):
    name: str = "Untitled Workflow"
    conn_id: str
    tables: list[str] = []
    target_column: Optional[str] = None


class UpdatePipelineRequest(BaseModel):
    name: Optional[str] = None
    target_column: Optional[str] = None
    tables: Optional[list[str]] = None
    stages: Optional[dict] = None


class RunStageRequest(BaseModel):
    config: dict = {}


class AnalyzeRequest(BaseModel):
    conn_id: str
    tables: list[str] = []


@router.post("")
async def create_pipeline(req: CreatePipelineRequest, user=Depends(get_current_user)):
    uh = _hash(user["email"])
    pipeline = store.create_pipeline(uh, req.name, req.conn_id, req.tables, req.target_column)
    return pipeline


@router.get("")
async def list_pipelines(user=Depends(get_current_user)):
    uh = _hash(user["email"])
    return {"pipelines": store.list_pipelines(uh)}


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str, user=Depends(get_current_user)):
    uh = _hash(user["email"])
    p = store.load_pipeline(uh, pipeline_id)
    if not p:
        raise HTTPException(404, "Pipeline not found")
    return p


@router.put("/{pipeline_id}")
async def update_pipeline(pipeline_id: str, req: UpdatePipelineRequest, user=Depends(get_current_user)):
    uh = _hash(user["email"])
    p = store.update_pipeline(uh, pipeline_id, req.model_dump(exclude_none=True))
    if not p:
        raise HTTPException(404, "Pipeline not found")
    return p


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str, user=Depends(get_current_user)):
    uh = _hash(user["email"])
    if not store.delete_pipeline(uh, pipeline_id):
        raise HTTPException(404, "Pipeline not found")
    return {"deleted": pipeline_id}


@router.post("/{pipeline_id}/stages/{stage_key}/run")
async def run_stage(pipeline_id: str, stage_key: str, req: RunStageRequest, request: Request, user=Depends(get_current_user)):
    """Execute a single pipeline stage manually."""
    uh = _hash(user["email"])
    pipeline = store.load_pipeline(uh, pipeline_id)
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    if stage_key not in pipeline.get("stages", {}):
        raise HTTPException(400, f"Invalid stage: {stage_key}")

    conn_id = pipeline["conn_id"]
    tables = pipeline.get("tables", [])
    target_column = pipeline.get("target_column")

    # Merge request config with existing stage config
    stage = pipeline["stages"][stage_key]
    merged_config = {**stage.get("config", {}), **req.config}

    # If target_column provided in config, update pipeline-level field
    if merged_config.get("target_column") and not target_column:
        target_column = merged_config["target_column"]
        store.update_pipeline(uh, pipeline_id, {"target_column": target_column})
    elif merged_config.get("target_column"):
        target_column = merged_config["target_column"]

    # Mark stage as active
    store.update_stage(uh, pipeline_id, stage_key, {"status": "active", "config": merged_config})

    try:
        output = _execute_stage(stage_key, conn_id, tables, target_column, merged_config, pipeline, uh, request, user_email=user["email"])
        store.update_stage(uh, pipeline_id, stage_key, {
            "status": "complete",
            "config": merged_config,
            "output_summary": output,
        })
        updated = store.load_pipeline(uh, pipeline_id)
        return {"status": "complete", "stage": stage_key, "output": output, "pipeline": updated}
    except Exception as e:
        logger.exception(f"Stage {stage_key} failed")
        store.update_stage(uh, pipeline_id, stage_key, {"status": "error", "output_summary": {"error": str(e)[:200]}})
        raise HTTPException(500, f"Stage execution failed: {str(e)[:200]}")


def _execute_stage(stage_key: str, conn_id: str, tables: list, target_column: str, config: dict, pipeline: dict, user_hash: str, request=None, user_email: str = "") -> dict:
    """Execute a pipeline stage and return output summary."""
    from ml_engine import MLEngine
    from ml_feature_engine import analyze_features, detect_column_types, prepare_dataset
    import polars as pl

    engine = MLEngine()

    if stage_key == "ingest":
        data_source = config.get("data_source", "twin")

        if data_source in ("full", "sample") and request and settings.ML_FULL_DATASET_ENABLED:
            # Get live connector from app.state
            connector = None
            if hasattr(request.app.state, 'connections') and request.app.state.connections:
                for email_key, conns in request.app.state.connections.items():
                    if conn_id in conns:
                        connector = conns[conn_id].connector
                        break
                    for cid, entry in conns.items():
                        if hasattr(entry, 'connector') and entry.connector:
                            connector = entry.connector
                            break
                    if connector:
                        break

            # If no live connector, try auto-reconnect from saved configs
            if not connector and user_email:
                try:
                    from user_storage import load_connection_configs, decrypt_password
                    from db_connector import DatabaseConnector
                    from config import DBType
                    from routers.connection_routes import _build_uri_from_config
                    configs = load_connection_configs(user_email)
                    logger.info(f"ML auto-reconnect: {len(configs)} saved configs for {user_email}")
                    for cfg in configs:
                        logger.info(f"ML auto-reconnect: trying config id={cfg.get('id')}, db_type={cfg.get('db_type')}")
                        try:
                            working = dict(cfg)
                            if working.get("password"):
                                working["password"] = decrypt_password(working["password"])
                            if working.get("token"):
                                working["token"] = decrypt_password(working["token"])
                            db_type = DBType(working["db_type"])
                            uri = _build_uri_from_config(working)
                            temp_connector = DatabaseConnector(
                                db_type=db_type,
                                connection_uri=uri,
                                credentials_path=working.get("credentials_path"),
                            )
                            temp_connector.connect()
                            connector = temp_connector
                            logger.info(f"ML ingest: auto-reconnected to {cfg.get('db_type')}")
                            break
                        except Exception as cfg_err:
                            logger.warning(f"ML auto-reconnect: config {cfg.get('id')} failed: {cfg_err}")
                            continue
                except Exception as e:
                    logger.warning(f"ML ingest: auto-reconnect setup failed: {e}")

            if connector:
                sample_size = config.get("sample_size") if data_source == "sample" else None
                logger.info(f"ML ingest: data_source={data_source}, sample_size={sample_size}")
                df = engine.ingest_from_source(connector, tables or [], sample_size=sample_size)
            else:
                raise ValueError(
                    f"No active database connection for '{data_source}' mode. "
                    "Go to Dashboard, reconnect your database, then try again. "
                    "Or select 'Twin (Quick)' to use cached data."
                )
        else:
            logger.info(f"ML ingest: data_source=twin, using DuckDB twin")
            df = engine.ingest_from_twin(conn_id, tables or [])

        if isinstance(df, list):
            df = df[0]
        features = analyze_features(df)

        # Store data_source at pipeline level for downstream stages
        pipeline_id = pipeline.get("id")
        if pipeline_id:
            store.update_pipeline(user_hash, pipeline_id, {"data_source": data_source})

        return {
            "row_count": len(df),
            "column_count": len(df.columns),
            "features": features,
            "columns": list(df.columns),
            "data_source": data_source,
        }

    elif stage_key == "clean":
        # Get ingest output
        ingest_out = pipeline["stages"].get("ingest", {}).get("output_summary", {})
        features = ingest_out.get("features", [])
        with_missing = [f for f in features if (f.get("missing_pct", 0) > 0)]
        imputation = config.get("imputation", "median")
        quality = round(100 - sum(f.get("missing_pct", 0) for f in features) / max(len(features), 1))
        return {
            "quality_score": quality,
            "imputation_strategy": imputation,
            "missing_columns": len(with_missing),
            "total_columns": len(features),
            "missing_details": [{"column": f["name"], "percent": f["missing_pct"]} for f in with_missing],
        }

    elif stage_key == "features":
        ingest_out = pipeline["stages"].get("ingest", {}).get("output_summary", {})
        features = ingest_out.get("features", [])
        include = config.get("include", [f["name"] for f in features if f.get("type") != "pii"])
        exclude = config.get("exclude", [f["name"] for f in features if f.get("type") == "pii"])
        selected = [f for f in features if f["name"] in include and f["name"] not in exclude]
        return {
            "total_features": len(features),
            "selected_features": len(selected),
            "excluded_features": len(exclude),
            "selected": [{"name": f["name"], "type": f["type"]} for f in selected],
            "excluded_names": exclude,
        }

    elif stage_key == "train":
        if not target_column:
            raise ValueError("target_column is required for training")

        # Read data_source from pipeline level (set during ingest)
        data_source = pipeline.get("data_source", config.get("data_source", "twin"))

        if data_source in ("full", "sample") and request and settings.ML_FULL_DATASET_ENABLED:
            # Get live connector from app.state
            connector = None
            if hasattr(request.app.state, 'connections') and request.app.state.connections:
                for email, conns in request.app.state.connections.items():
                    if conn_id in conns:
                        connector = conns[conn_id].connector
                        break
                    for cid, entry in conns.items():
                        if hasattr(entry, 'connector') and entry.connector:
                            connector = entry.connector
                            break
                    if connector:
                        break

            if connector:
                sample_size = config.get("sample_size") if data_source == "sample" else None
                df = engine.ingest_from_source(
                    connector, tables or [],
                    sample_size=sample_size,
                    stratify_column=target_column
                )
            else:
                raise ValueError(
                    "No active database connection for full dataset training. "
                    "Reconnect database on Dashboard first, or use Twin mode."
                )
        else:
            # Default: use twin data
            df = engine.ingest_from_twin(conn_id, tables or [])

        if isinstance(df, list):
            df = df[0]

        row_count = len(df)
        model_names = config.get("models", [])
        task_type = config.get("task_type")
        params = config.get("params")
        result = engine.train_sync(df, target_column, model_names, task_type, params)
        saved = []
        for m in result["models"]:
            mid = engine.save_model(m, user_hash)
            saved.append({"model_id": mid, "name": m["model_name"], "metrics": m["metrics"]})
        return {"task_type": result["task_type"], "models": saved, "rows_trained": row_count, "data_source": data_source}

    elif stage_key == "evaluate":
        train_out = pipeline["stages"].get("train", {}).get("output_summary", {})
        models = train_out.get("models", [])
        if not models:
            return {"models": [], "best_model": None}
        best = max(models, key=lambda m: m.get("metrics", {}).get("f1", m.get("metrics", {}).get("r2", 0)))
        return {"models": models, "best_model": best}

    elif stage_key == "results":
        eval_out = pipeline["stages"].get("evaluate", {}).get("output_summary", {})
        return {"best_model": eval_out.get("best_model"), "status": "complete"}

    return {}


@router.get("/catalog")
async def get_model_catalog(user=Depends(get_current_user)):
    """Return the full model catalog with task types and default params."""
    from ml_models import MODEL_CATALOG
    catalog = {}
    for task_type, models in MODEL_CATALOG.items():
        catalog[task_type] = [
            {
                "name": m.name,
                "library": m.library,
                "description": m.description,
                "default_params": m.default_params,
            }
            for m in models
        ]
    return {"catalog": catalog, "task_types": list(MODEL_CATALOG.keys())}


# Standalone analyze endpoint (no workflow needed)
@router.post("/analyze")
async def analyze_data(req: AnalyzeRequest, user=Depends(get_current_user)):
    """Quick feature analysis without creating a workflow."""
    from ml_engine import MLEngine
    from ml_feature_engine import analyze_features
    engine = MLEngine()
    df = engine.ingest_from_twin(req.conn_id, req.tables or [])
    if isinstance(df, list):
        df = df[0]
    features = analyze_features(df)
    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "features": features,
        "columns": df.columns,
    }
