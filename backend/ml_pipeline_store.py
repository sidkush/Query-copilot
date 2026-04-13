"""ML Pipeline workflow persistence — file-based CRUD with atomic writes."""
import os
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

_STAGE_KEYS = ["ingest", "clean", "features", "train", "evaluate", "results"]


def _user_dir(user_hash: str) -> str:
    d = os.path.join(settings.ML_PIPELINES_DIR, user_hash)
    os.makedirs(d, exist_ok=True)
    return d


def _pipeline_path(user_hash: str, pipeline_id: str) -> str:
    return os.path.join(_user_dir(user_hash), f"{pipeline_id}.json")


def create_pipeline(user_hash: str, name: str, conn_id: str, tables: list = None, target_column: str = None) -> dict:
    """Create a new pipeline workflow."""
    pipeline_id = f"pipe_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    pipeline = {
        "id": pipeline_id,
        "name": name or "Untitled Workflow",
        "conn_id": conn_id,
        "tables": tables or [],
        "target_column": target_column,
        "created_at": now,
        "updated_at": now,
        "stages": {
            key: {"status": "idle", "config": {}, "output_summary": None}
            for key in _STAGE_KEYS
        },
    }
    _atomic_write(_pipeline_path(user_hash, pipeline_id), pipeline)
    return pipeline


def list_pipelines(user_hash: str) -> list:
    """List all pipelines for a user (metadata only)."""
    d = _user_dir(user_hash)
    result = []
    for fname in os.listdir(d):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fname)) as f:
                p = json.load(f)
            result.append({
                "id": p["id"],
                "name": p.get("name", "Untitled"),
                "conn_id": p.get("conn_id"),
                "target_column": p.get("target_column"),
                "created_at": p.get("created_at"),
                "updated_at": p.get("updated_at"),
                "stage_summary": {k: v.get("status", "idle") for k, v in p.get("stages", {}).items()},
            })
        except Exception:
            continue
    result.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return result


def load_pipeline(user_hash: str, pipeline_id: str) -> Optional[dict]:
    """Load full pipeline workflow."""
    path = _pipeline_path(user_hash, pipeline_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def update_pipeline(user_hash: str, pipeline_id: str, updates: dict) -> Optional[dict]:
    """Update pipeline fields (name, target_column, stage configs)."""
    pipeline = load_pipeline(user_hash, pipeline_id)
    if not pipeline:
        return None
    for key in ["name", "target_column", "tables"]:
        if key in updates:
            pipeline[key] = updates[key]
    if "stages" in updates:
        for stage_key, stage_update in updates["stages"].items():
            if stage_key in pipeline["stages"]:
                pipeline["stages"][stage_key].update(stage_update)
    pipeline["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(_pipeline_path(user_hash, pipeline_id), pipeline)
    return pipeline


def update_stage(user_hash: str, pipeline_id: str, stage_key: str, update: dict) -> Optional[dict]:
    """Update a single stage's status, config, or output_summary."""
    pipeline = load_pipeline(user_hash, pipeline_id)
    if not pipeline or stage_key not in pipeline.get("stages", {}):
        return None
    pipeline["stages"][stage_key].update(update)
    pipeline["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write(_pipeline_path(user_hash, pipeline_id), pipeline)
    return pipeline


def delete_pipeline(user_hash: str, pipeline_id: str) -> bool:
    """Delete a pipeline workflow."""
    path = _pipeline_path(user_hash, pipeline_id)
    if os.path.exists(path):
        os.unlink(path)
        return True
    return False


def _atomic_write(path: str, data: dict):
    """Write JSON atomically (write-then-rename)."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
