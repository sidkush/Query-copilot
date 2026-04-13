"""Tests for ML pipeline workflow persistence."""
import pytest
import tempfile
import os


class TestMLPipelineStore:
    def test_create_and_load(self):
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                p = store.create_pipeline("test_user", "My Workflow", "conn123", ["table1"])
                assert p["name"] == "My Workflow"
                assert p["conn_id"] == "conn123"
                assert "ingest" in p["stages"]
                assert p["stages"]["ingest"]["status"] == "idle"

                loaded = store.load_pipeline("test_user", p["id"])
                assert loaded["id"] == p["id"]
                assert loaded["name"] == "My Workflow"
            finally:
                settings.ML_PIPELINES_DIR = orig

    def test_list_pipelines(self):
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                store.create_pipeline("test_user", "Workflow A", "conn1")
                store.create_pipeline("test_user", "Workflow B", "conn2")
                pipelines = store.list_pipelines("test_user")
                assert len(pipelines) == 2
                names = {p["name"] for p in pipelines}
                assert "Workflow A" in names
                assert "Workflow B" in names
            finally:
                settings.ML_PIPELINES_DIR = orig

    def test_update_pipeline(self):
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                p = store.create_pipeline("test_user", "Original", "conn1")
                updated = store.update_pipeline("test_user", p["id"], {"name": "Renamed"})
                assert updated["name"] == "Renamed"
                loaded = store.load_pipeline("test_user", p["id"])
                assert loaded["name"] == "Renamed"
            finally:
                settings.ML_PIPELINES_DIR = orig

    def test_update_stage(self):
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                p = store.create_pipeline("test_user", "Test", "conn1")
                updated = store.update_stage("test_user", p["id"], "ingest", {
                    "status": "complete",
                    "output_summary": {"rows": 1000},
                })
                assert updated["stages"]["ingest"]["status"] == "complete"
                assert updated["stages"]["ingest"]["output_summary"]["rows"] == 1000
            finally:
                settings.ML_PIPELINES_DIR = orig

    def test_delete_pipeline(self):
        import ml_pipeline_store as store
        from config import settings
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                p = store.create_pipeline("test_user", "To Delete", "conn1")
                assert store.delete_pipeline("test_user", p["id"]) is True
                assert store.load_pipeline("test_user", p["id"]) is None
                assert store.delete_pipeline("test_user", p["id"]) is False
            finally:
                settings.ML_PIPELINES_DIR = orig


class TestTargetColumnFromConfig:
    def test_target_column_extracted_from_stage_config(self):
        """When target_column is in stage config, pipeline should be updated."""
        import ml_pipeline_store as store
        from config import settings
        import tempfile
        orig = settings.ML_PIPELINES_DIR
        with tempfile.TemporaryDirectory() as tmp:
            settings.ML_PIPELINES_DIR = tmp
            try:
                p = store.create_pipeline("test_user", "Test", "conn1")
                assert p["target_column"] is None

                # Simulate what run_stage does: update pipeline with target_column
                updated = store.update_pipeline("test_user", p["id"], {"target_column": "member_casual"})
                assert updated["target_column"] == "member_casual"

                loaded = store.load_pipeline("test_user", p["id"])
                assert loaded["target_column"] == "member_casual"
            finally:
                settings.ML_PIPELINES_DIR = orig
