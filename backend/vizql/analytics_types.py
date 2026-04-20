"""Plan 9a — ergonomic dataclasses for analytics-pane specs.

Mirrors the Plan 7a ``spec.py`` pattern: dataclasses 1:1 with the proto
messages, ``to_proto`` / ``from_proto`` as the *only* conversion points.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from vizql.proto import v1_pb2 as pb


_VALID_AGGS = {"constant", "mean", "median", "sum", "min", "max", "percentile"}
_VALID_SCOPES = {"entire", "pane", "cell"}
_VALID_AXES = {"x", "y"}
_VALID_LINE_STYLES = {"solid", "dashed", "dotted"}
_VALID_LABELS = {"value", "computation", "custom", "none"}
_VALID_DIST_STYLES = {"confidence", "quantile", "stddev"}
_VALID_TOTALS_KINDS = {"grand_total", "subtotal", "both"}
_VALID_TOTALS_AXES = {"row", "column", "both"}
_VALID_TOTALS_POS = {"before", "after"}


@dataclass(frozen=True, slots=True)
class ReferenceLineSpec:
    axis: str
    aggregation: str
    value: Optional[float]
    percentile: Optional[int]
    scope: str
    label: str
    custom_label: str
    line_style: str
    color: str
    show_marker: bool

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {_VALID_AXES}, got {self.axis!r}")
        if self.aggregation not in _VALID_AGGS:
            raise ValueError(f"aggregation must be one of {_VALID_AGGS}, got {self.aggregation!r}")
        if self.scope not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {_VALID_SCOPES}, got {self.scope!r}")
        if self.label not in _VALID_LABELS:
            raise ValueError(f"label must be one of {_VALID_LABELS}, got {self.label!r}")
        if self.line_style not in _VALID_LINE_STYLES:
            raise ValueError(f"line_style must be one of {_VALID_LINE_STYLES}, got {self.line_style!r}")
        if self.aggregation == "constant" and self.value is None:
            raise ValueError("aggregation=constant requires a numeric value")
        if self.aggregation == "percentile" and (self.percentile is None or not 1 <= self.percentile <= 99):
            raise ValueError("aggregation=percentile requires percentile in [1,99]")

    def to_proto(self) -> pb.ReferenceLineSpec:
        return pb.ReferenceLineSpec(
            axis=self.axis,
            aggregation=self.aggregation,
            value=float(self.value) if self.value is not None else 0.0,
            has_value=self.value is not None,
            percentile=int(self.percentile) if self.percentile is not None else 0,
            scope=self.scope,
            label=self.label,
            custom_label=self.custom_label,
            line_style=self.line_style,
            color=self.color,
            show_marker=self.show_marker,
        )

    @classmethod
    def from_proto(cls, m: pb.ReferenceLineSpec) -> "ReferenceLineSpec":
        return cls(
            axis=m.axis,
            aggregation=m.aggregation,
            value=m.value if m.has_value else None,
            percentile=m.percentile if m.aggregation == "percentile" else None,
            scope=m.scope,
            label=m.label,
            custom_label=m.custom_label,
            line_style=m.line_style,
            color=m.color,
            show_marker=m.show_marker,
        )


@dataclass(frozen=True, slots=True)
class ReferenceBandSpec:
    axis: str
    from_spec: ReferenceLineSpec
    to_spec: ReferenceLineSpec
    fill: str
    fill_opacity: float

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {_VALID_AXES}, got {self.axis!r}")
        if not 0.0 <= self.fill_opacity <= 1.0:
            raise ValueError("fill_opacity must be in [0,1]")
        self.from_spec.validate()
        self.to_spec.validate()

    def to_proto(self) -> pb.ReferenceBandSpec:
        return pb.ReferenceBandSpec(
            axis=self.axis,
            from_spec=self.from_spec.to_proto(),
            to_spec=self.to_spec.to_proto(),
            fill=self.fill,
            fill_opacity=self.fill_opacity,
        )

    @classmethod
    def from_proto(cls, m: pb.ReferenceBandSpec) -> "ReferenceBandSpec":
        return cls(
            axis=m.axis,
            from_spec=ReferenceLineSpec.from_proto(m.from_spec),
            to_spec=ReferenceLineSpec.from_proto(m.to_spec),
            fill=m.fill,
            fill_opacity=m.fill_opacity,
        )


@dataclass(frozen=True, slots=True)
class ReferenceDistributionSpec:
    axis: str
    percentiles: List[int]
    scope: str
    style: str
    color: str

    def validate(self) -> None:
        if self.axis not in _VALID_AXES:
            raise ValueError(f"axis must be one of {_VALID_AXES}")
        if self.scope not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {_VALID_SCOPES}")
        if self.style not in _VALID_DIST_STYLES:
            raise ValueError(f"style must be one of {_VALID_DIST_STYLES}")
        if not self.percentiles:
            raise ValueError("at least one percentile required")
        for p in self.percentiles:
            if not 1 <= p <= 99:
                raise ValueError(f"percentile out of [1,99]: {p}")

    def to_proto(self) -> pb.ReferenceDistributionSpec:
        m = pb.ReferenceDistributionSpec(
            axis=self.axis, scope=self.scope, style=self.style, color=self.color,
        )
        m.percentiles.extend(self.percentiles)
        return m

    @classmethod
    def from_proto(cls, m: pb.ReferenceDistributionSpec) -> "ReferenceDistributionSpec":
        return cls(
            axis=m.axis,
            percentiles=list(m.percentiles),
            scope=m.scope,
            style=m.style,
            color=m.color,
        )


@dataclass(frozen=True, slots=True)
class TotalsSpec:
    kind: str
    axis: str
    aggregation: str
    position: str
    should_affect_totals: bool

    def validate(self) -> None:
        if self.kind not in _VALID_TOTALS_KINDS:
            raise ValueError(f"kind must be one of {_VALID_TOTALS_KINDS}")
        if self.axis not in _VALID_TOTALS_AXES:
            raise ValueError(f"axis must be one of {_VALID_TOTALS_AXES}")
        if self.position not in _VALID_TOTALS_POS:
            raise ValueError(f"position must be one of {_VALID_TOTALS_POS}")

    def to_proto(self) -> pb.TotalsSpec:
        return pb.TotalsSpec(
            kind=self.kind,
            axis=self.axis,
            aggregation=self.aggregation,
            position=self.position,
            should_affect_totals=self.should_affect_totals,
        )

    @classmethod
    def from_proto(cls, m: pb.TotalsSpec) -> "TotalsSpec":
        return cls(
            kind=m.kind, axis=m.axis, aggregation=m.aggregation,
            position=m.position, should_affect_totals=m.should_affect_totals,
        )


@dataclass(frozen=True, slots=True)
class AnalyticsBundle:
    """The full analytics payload attached to a VisualSpec."""
    reference_lines: List[ReferenceLineSpec] = field(default_factory=list)
    reference_bands: List[ReferenceBandSpec] = field(default_factory=list)
    distributions:   List[ReferenceDistributionSpec] = field(default_factory=list)
    totals:          List[TotalsSpec] = field(default_factory=list)

    def validate(self) -> None:
        for rl in self.reference_lines: rl.validate()
        for rb in self.reference_bands: rb.validate()
        for rd in self.distributions:   rd.validate()
        for t  in self.totals:          t.validate()

    def to_proto(self) -> pb.Analytics:
        m = pb.Analytics()
        m.reference_lines.extend(rl.to_proto() for rl in self.reference_lines)
        m.reference_bands.extend(rb.to_proto() for rb in self.reference_bands)
        m.distributions.extend(rd.to_proto()   for rd in self.distributions)
        m.totals.extend(t.to_proto()           for t  in self.totals)
        return m

    @classmethod
    def from_proto(cls, m: pb.Analytics) -> "AnalyticsBundle":
        return cls(
            reference_lines=[ReferenceLineSpec.from_proto(x) for x in m.reference_lines],
            reference_bands=[ReferenceBandSpec.from_proto(x) for x in m.reference_bands],
            distributions=[ReferenceDistributionSpec.from_proto(x) for x in m.distributions],
            totals=[TotalsSpec.from_proto(x) for x in m.totals],
        )


__all__ = [
    "ReferenceLineSpec",
    "ReferenceBandSpec",
    "ReferenceDistributionSpec",
    "TotalsSpec",
    "AnalyticsBundle",
]
