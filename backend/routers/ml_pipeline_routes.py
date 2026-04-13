"""ML Pipeline workflow routes — CRUD + manual stage execution."""
import hashlib
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
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
async def run_stage(pipeline_id: str, stage_key: str, req: RunStageRequest, user=Depends(get_current_user)):
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

    # Mark stage as active
    store.update_stage(uh, pipeline_id, stage_key, {"status": "active", "config": merged_config})

    try:
        output = _execute_stage(stage_key, conn_id, tables, target_column, merged_config, pipeline, uh)
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


def _execute_stage(stage_key: str, conn_id: str, tables: list, target_column: str, config: dict, pipeline: dict, user_hash: str) -> dict:
    """Execute a pipeline stage and return output summary."""
    from ml_engine import MLEngine
    from ml_feature_engine import analyze_features, detect_column_types, prepare_dataset
    import polars as pl

    engine = MLEngine()

    if stage_key == "ingest":
        df = engine.ingest_from_twin(conn_id, tables or [])
        if isinstance(df, list):
            df = df[0]
        features = analyze_features(df)
        return {
            "row_count": len(df),
            "column_count": len(df.columns),
            "features": features,
            "columns": df.columns,
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
        df = engine.ingest_from_twin(conn_id, tables or [])
        if isinstance(df, list):
            df = df[0]
        model_names = config.get("models", [])
        task_type = config.get("task_type")
        params = config.get("params")
        result = engine.train_sync(df, target_column, model_names, task_type, params)
        saved = []
        for m in result["models"]:
            mid = engine.save_model(m, user_hash)
            saved.append({"model_id": mid, "name": m["model_name"], "metrics": m["metrics"]})
        return {"task_type": result["task_type"], "models": saved}

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
