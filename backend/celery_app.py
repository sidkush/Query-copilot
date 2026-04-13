"""Celery configuration for AskDB background tasks."""
from celery import Celery
from config import settings

celery_app = Celery("askdb")

celery_app.conf.update(
    broker_url=settings.CELERY_BROKER_URL,
    result_backend=settings.CELERY_RESULT_BACKEND,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_max_memory_per_child=settings.ML_WORKER_MAX_MEMORY_MB * 1000,
    task_routes={
        "ml_tasks.train_model": {"queue": "ml_training"},
        "ml_tasks.analyze_features": {"queue": "ml_quick"},
        "ml_tasks.prepare_data": {"queue": "ml_quick"},
    },
    task_default_queue="ml_quick",
    task_time_limit=settings.ML_TRAINING_TIMEOUT_SECONDS,
)
