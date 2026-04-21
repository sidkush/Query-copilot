"""Plan 9e — BoxPlotSpec dataclass.

Composes via Plan 9a ReferenceDistributionSpec: emits 5 aggregated rows
(q1 / median / q3 / whisker_low / whisker_high) plus an optional outlier
detail query when show_outliers=True. See Build_Tableau §XIII.1 +
Appendix B (PERCENTILE_CONT).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from .proto import v1_pb2 as pb


_VALID_AXES = frozenset({"x", "y"})
_VALID_METHODS = frozenset({"tukey", "min-max", "percentile"})
_VALID_SCOPES = frozenset({"entire", "pane", "cell"})


@dataclass(frozen=True, slots=True)
class BoxPlotSpec:
    axis: str
    whisker_method: str
    whisker_percentile: Optional[Tuple[int, int]]
    show_outliers: bool
    fill_color: str
    fill_opacity: float
    scope: str

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {sorted(_VALID_AXES)}")
        if self.whisker_method not in _VALID_METHODS:
            raise ValueError(
                f"whisker_method must be one of {sorted(_VALID_METHODS)}"
            )
        if self.whisker_method == "percentile":
            if self.whisker_percentile is None:
                raise ValueError(
                    "whisker_percentile required when whisker_method='percentile'"
                )
            lo, hi = self.whisker_percentile
            if lo >= hi:
                raise ValueError(
                    f"whisker_percentile low ({lo}) must be < high ({hi})"
                )
            if not (1 <= lo <= 49):
                raise ValueError(
                    f"whisker_percentile low out of [1,49]: {lo}"
                )
            if not (51 <= hi <= 99):
                raise ValueError(
                    f"whisker_percentile high out of [51,99]: {hi}"
                )
        if self.whisker_method == "min-max" and self.show_outliers:
            raise ValueError(
                "min-max whisker_method cannot combine with show_outliers=True "
                "(every row fits inside MIN..MAX)"
            )
        if not 0.0 <= self.fill_opacity <= 1.0:
            raise ValueError(f"fill_opacity out of [0,1]: {self.fill_opacity}")
        if self.scope not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {sorted(_VALID_SCOPES)}")

    def to_proto(self) -> pb.BoxPlotSpec:
        has_wp = self.whisker_percentile is not None
        lo, hi = (self.whisker_percentile or (0, 0))
        return pb.BoxPlotSpec(
            axis=self.axis,
            whisker_method=self.whisker_method,
            whisker_percentile_lo=lo,
            whisker_percentile_hi=hi,
            has_whisker_percentile=has_wp,
            show_outliers=self.show_outliers,
            fill_color=self.fill_color,
            fill_opacity=self.fill_opacity,
            scope=self.scope,
        )

    @classmethod
    def from_proto(cls, m: pb.BoxPlotSpec) -> "BoxPlotSpec":
        wp: Optional[Tuple[int, int]] = None
        if m.has_whisker_percentile:
            wp = (int(m.whisker_percentile_lo), int(m.whisker_percentile_hi))
        return cls(
            axis=m.axis,
            whisker_method=m.whisker_method,
            whisker_percentile=wp,
            show_outliers=bool(m.show_outliers),
            fill_color=m.fill_color,
            fill_opacity=float(m.fill_opacity),
            scope=m.scope,
        )


__all__ = ["BoxPlotSpec"]
