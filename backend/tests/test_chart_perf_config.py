"""Tests for sub-project B chart performance config flags."""
from config import settings


def test_chart_downsample_enabled_default_true():
    assert settings.CHART_DOWNSAMPLE_ENABLED is True


def test_chart_downsample_default_target_points():
    assert settings.CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS == 4000
    assert settings.CHART_DOWNSAMPLE_DEFAULT_TARGET_POINTS > 0


def test_chart_stream_batch_rows_default():
    assert settings.CHART_STREAM_BATCH_ROWS == 5000


def test_chart_frame_budgets():
    assert settings.CHART_FRAME_BUDGET_TIGHT_MS == 16
    assert settings.CHART_FRAME_BUDGET_LOOSE_MS == 33
    assert settings.CHART_FRAME_BUDGET_TIGHT_MS < settings.CHART_FRAME_BUDGET_LOOSE_MS


def test_chart_instance_pool_max():
    assert settings.CHART_INSTANCE_POOL_MAX == 12
    assert settings.CHART_INSTANCE_POOL_MAX >= 6


def test_chart_perf_enabled_default_true():
    """B feature flag — gates RSR injection + downsampling. Flipped to True in B5."""
    assert settings.CHART_PERF_ENABLED is True
