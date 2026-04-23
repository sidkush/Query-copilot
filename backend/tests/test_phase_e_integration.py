"""End-to-end smoke — chip attached to tier results + skew guard wires."""
import pytest


def test_waterfall_exposes_chip_builder():
    import waterfall_router
    assert hasattr(waterfall_router, "build_tier_chip")


def test_waterfall_build_tier_chip_live():
    from waterfall_router import build_tier_chip
    from provenance_chip import TrustStamp
    chip = build_tier_chip(tier="live", row_count=42)
    assert chip.trust is TrustStamp.LIVE
    assert chip.row_count == 42


def test_waterfall_build_tier_chip_turbo_with_staleness():
    from waterfall_router import build_tier_chip
    from provenance_chip import TrustStamp
    chip = build_tier_chip(tier="turbo", row_count=100, staleness_seconds=600)
    assert chip.trust is TrustStamp.TURBO
    assert chip.staleness_seconds == 600


def test_summary_generator_surfaces_median_when_skewed():
    from summary_generator import maybe_force_median
    prompt = "Report the average trip duration."
    out = maybe_force_median(prompt, p50=100, p99=1500)
    assert "median" in out.lower()


def test_summary_generator_unchanged_when_balanced():
    from summary_generator import maybe_force_median
    prompt = "Report the average trip duration."
    out = maybe_force_median(prompt, p50=100, p99=110)
    assert out == prompt
