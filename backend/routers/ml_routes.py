"""ML Engine API routes."""
import os
import json
import hashlib
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import settings
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ml", tags=["ml"])


class TrainRequest(BaseModel):
    conn_id: str
    tables: list[str] = []
    target_column: str
    model_names: list[str] = []
    task_type: Optional[str] = None


class PredictRequest(BaseModel):
    model_id: str
    data: dict


def _get_user_hash(user: dict) -> str:
    return hashlib.sha256(user["email"].encode()).hexdigest()[:8]


@router.post("/train")
async def train_models(req: TrainRequest, user=Depends(get_current_user)):
    """Submit ML training job."""
    if not settings.ML_ENGINE_ENABLED:
        raise HTTPException(503, "ML Engine is not enabled")

    from ml_engine import MLEngine
    engine = MLEngine()
    df = engine.ingest_from_twin(req.conn_id, req.tables)
    if isinstance(df, list):
        df = df[0]

    user_hash = _get_user_hash(user)
    dataset_dir = os.path.join(settings.ML_MODELS_DIR, user_hash)
    os.makedirs(dataset_dir, exist_ok=True)
    dataset_path = os.path.join(dataset_dir, "dataset.parquet")
    df.write_parquet(dataset_path)

    task_type = req.task_type or engine.detect_task_type(df, req.target_column)
    model_names = req.model_names
    if not model_names:
        from ml_models import get_models_for_task
        model_names = [m.name for m in get_models_for_task(task_type)]

    from ml_tasks import train_model
    task = train_model.delay(dataset_path, req.target_column, model_names, task_type, user_hash)
    return {"task_id": task.id, "task_type": task_type, "model_names": model_names}


@router.get("/status/{task_id}")
async def training_status(task_id: str, user=Depends(get_current_user)):
    from celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "state": result.state,
        "meta": result.info if isinstance(result.info, dict) else {},
    }


@router.get("/models")
async def list_models(user=Depends(get_current_user)):
    user_hash = _get_user_hash(user)
    models_dir = os.path.join(settings.ML_MODELS_DIR, user_hash)
    if not os.path.exists(models_dir):
        return {"models": []}
    models = []
    for entry in os.listdir(models_dir):
        meta_path = os.path.join(models_dir, entry, "metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                models.append(json.load(f))
    return {"models": models}


@router.get("/models/{model_id}")
async def get_model(model_id: str, user=Depends(get_current_user)):
    user_hash = _get_user_hash(user)
    meta_path = os.path.join(settings.ML_MODELS_DIR, user_hash, model_id, "metadata.json")
    if not os.path.exists(meta_path):
        raise HTTPException(404, "Model not found")
    with open(meta_path) as f:
        return json.load(f)


@router.delete("/models/{model_id}")
async def delete_model(model_id: str, user=Depends(get_current_user)):
    import shutil
    user_hash = _get_user_hash(user)
    model_dir = os.path.join(settings.ML_MODELS_DIR, user_hash, model_id)
    if not os.path.exists(model_dir):
        raise HTTPException(404, "Model not found")
    shutil.rmtree(model_dir)
    return {"deleted": model_id}
