"""Celery tasks for long-running ML operations."""
import logging
from celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, queue="ml_training", name="ml_tasks.train_model")
def train_model(self, dataset_path: str, target_column: str, model_names: list,
                task_type: str, user_hash: str):
    """Long-running model training task with progress streaming."""
    import polars as pl
    from ml_engine import MLEngine
    engine = MLEngine()

    self.update_state(state="PROGRESS", meta={"stage": "loading", "progress": 0})
    df = pl.read_parquet(dataset_path)

    self.update_state(state="PROGRESS", meta={"stage": "preparing", "progress": 10})

    total = len(model_names)
    results = []
    for i, model_name in enumerate(model_names):
        self.update_state(state="PROGRESS", meta={
            "stage": "training",
            "current_model": model_name,
            "model_index": i,
            "total_models": total,
            "progress": 10 + int((i / max(total, 1)) * 80),
        })

        result = engine.train_sync(df, target_column, [model_name], task_type)
        if result["models"]:
            model_result = result["models"][0]
            model_id = engine.save_model(model_result, user_hash)
            results.append({
                "model_id": model_id,
                "model_name": model_name,
                "metrics": model_result["metrics"],
            })

    self.update_state(state="PROGRESS", meta={"stage": "complete", "progress": 100})
    return {"models": results, "task_type": task_type}


@celery_app.task(queue="ml_quick", name="ml_tasks.analyze_features")
def analyze_features_task(dataset_path: str):
    """Quick feature analysis task."""
    import polars as pl
    from ml_feature_engine import analyze_features
    df = pl.read_parquet(dataset_path)
    return analyze_features(df)
