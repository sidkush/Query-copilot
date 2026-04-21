"""Plan 9b — Trend line dataclasses.

These mirror the editor's wire format and the server's fit output. They
are *not* proto-backed: a trend fit is transient wire data, not persisted
in VisualSpec. Keeping them as simple dataclasses sidesteps a proto regen
for a run-per-request payload.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


_VALID_FITS = {"linear", "logarithmic", "exponential", "power", "polynomial"}
_VALID_LEVELS = {0.90, 0.95, 0.99}


@dataclass(frozen=True, slots=True)
class TrendLineSpec:
    fit_type: str
    degree: Optional[int]
    factor_fields: List[str]
    show_confidence_bands: bool
    confidence_level: float
    color_by_factor: bool
    trend_line_label: bool

    def validate(self) -> None:
        if self.fit_type not in _VALID_FITS:
            raise ValueError(
                f"fit_type must be one of {sorted(_VALID_FITS)}, got {self.fit_type!r}"
            )
        if self.fit_type == "polynomial":
            if self.degree is None or not 2 <= self.degree <= 8:
                raise ValueError("polynomial degree must be in [2, 8]")
        else:
            if self.degree is not None:
                raise ValueError("degree only valid for polynomial fit")
        if self.confidence_level not in _VALID_LEVELS:
            raise ValueError(
                f"confidence_level must be one of {sorted(_VALID_LEVELS)}"
            )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fit_type": self.fit_type,
            "degree": self.degree,
            "factor_fields": list(self.factor_fields),
            "show_confidence_bands": self.show_confidence_bands,
            "confidence_level": self.confidence_level,
            "color_by_factor": self.color_by_factor,
            "trend_line_label": self.trend_line_label,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TrendLineSpec":
        return cls(
            fit_type=d["fit_type"],
            degree=d.get("degree"),
            factor_fields=list(d.get("factor_fields") or []),
            show_confidence_bands=bool(d.get("show_confidence_bands", False)),
            confidence_level=float(d.get("confidence_level", 0.95)),
            color_by_factor=bool(d.get("color_by_factor", False)),
            trend_line_label=bool(d.get("trend_line_label", False)),
        )


@dataclass(frozen=True, slots=True)
class TrendFitResult:
    coefficients: List[float]
    r_squared: float
    p_value: float
    sse: float
    rmse: float
    equation: str
    predictions: List[Dict[str, float]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "coefficients": list(self.coefficients),
            "r_squared": self.r_squared,
            "p_value": self.p_value,
            "sse": self.sse,
            "rmse": self.rmse,
            "equation": self.equation,
            "predictions": [dict(p) for p in self.predictions],
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TrendFitResult":
        return cls(
            coefficients=list(d["coefficients"]),
            r_squared=float(d["r_squared"]),
            p_value=float(d["p_value"]),
            sse=float(d["sse"]),
            rmse=float(d["rmse"]),
            equation=str(d["equation"]),
            predictions=[dict(p) for p in d.get("predictions", [])],
        )


__all__ = ["TrendLineSpec", "TrendFitResult"]
