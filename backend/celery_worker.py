"""Celery worker entry point.

Run: celery -A celery_worker worker --loglevel=info --queues=ml_quick,ml_training
"""
from celery_app import celery_app

# Import tasks to register them
try:
    import ml_tasks  # noqa: F401
except ImportError:
    pass  # ml_tasks not yet created
